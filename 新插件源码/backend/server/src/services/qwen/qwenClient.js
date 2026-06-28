const axios = require('axios');
const config = require('../../config/appConfig');
const { truncateText, writeDebugLog } = require('../../utils/debugLogger');
const dataStore = require('../database/pluginDataStore');

function messageContentText(messageContent) {
    if (typeof messageContent === 'string') return messageContent;
    if (Array.isArray(messageContent)) {
        return messageContent
            .map(part => {
                if (typeof part === 'string') return part;
                return part?.text || part?.content || (part && typeof part === 'object' ? JSON.stringify(part) : '');
            })
            .filter(Boolean)
            .join('\n');
    }
    if (messageContent && typeof messageContent === 'object') {
        return messageContent.text || messageContent.content || JSON.stringify(messageContent);
    }
    return '';
}

function messagesPromptText(messages = []) {
    return (messages || []).map(message => {
        const content = message.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map(part => {
                    if (typeof part === 'string') return part;
                    if (part?.type === 'text') return part.text || '';
                    return '';
                })
                .filter(Boolean)
                .join('\n');
        }
        return messageContentText(content);
    }).filter(Boolean).join('\n\n');
}

function hasImageMessage(messages = []) {
    return (messages || []).some(message => Array.isArray(message.content)
        && message.content.some(part => part?.type === 'image_url'));
}

function persistModelLog({
    model,
    messages,
    payload,
    text = '',
    success = true,
    elapsedMs = 0,
    errorMessage = '',
    debugMeta = null,
}) {
    if (process.env.DB_MODEL_LOGS === 'false') return;
    dataStore.insertModelCallLog({
        caseId: debugMeta?.caseId || debugMeta?.pluginCaseId || '',
        ocrTaskId: debugMeta?.taskId || debugMeta?.ocrTaskId || '',
        modelType: hasImageMessage(messages) ? 'vision' : 'text',
        modelName: model,
        apiUrl: config.qwen.url,
        promptKey: debugMeta?.promptKey || '',
        promptText: messagesPromptText(messages),
        request: {
            ...payload,
            messages,
        },
        responseText: text,
        success,
        elapsedMs,
        errorMessage,
    }).catch(error => {
        console.warn(`[Qwen] 写入模型调用日志失败：${error.message}`);
    });
}

async function chatCompletions({
    model,
    messages,
    maxTokens,
    temperature = 0.01,
    topP = 0.1,
    responseFormat = null,
    disableThinking = false,
    debugMeta = null,
}) {
    if (!config.qwen.url) throw new Error('未配置 Qwen 接口地址');
    const headers = { 'Content-Type': 'application/json' };
    if (config.qwen.apiKey) headers.Authorization = `Bearer ${config.qwen.apiKey}`;

    const payload = {
        model,
        messages,
        temperature,
        top_p: topP,
        stream: false,
    };
    if (responseFormat) payload.response_format = responseFormat;
    if (maxTokens && (!responseFormat || !config.qwen.omitMaxTokensInJsonMode)) payload.max_tokens = maxTokens;
    if (disableThinking) {
        payload.enable_thinking = false;
        payload.chat_template_kwargs = { enable_thinking: false };
    }

    let response;
    const started = Date.now();
    try {
        response = await axios.post(config.qwen.url, payload, {
            headers,
            timeout: config.qwen.requestTimeoutMs,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
    } catch (error) {
        const status = error.response?.status;
        const body = error.response?.data;
        const bodyText = typeof body === 'string' ? body : JSON.stringify(body || {});
        const detail = bodyText || error.message;
        if (debugMeta) {
            writeDebugLog('qwen-call-failed', {
                ...debugMeta,
                elapsedMs: Date.now() - started,
                model,
                responseFormat,
                disableThinking,
                maxTokens,
                error: truncateText(detail, 4000),
            });
        }
        persistModelLog({
            model,
            messages,
            payload,
            success: false,
            elapsedMs: Date.now() - started,
            errorMessage: detail,
            debugMeta,
        });
        if (disableThinking && /enable_thinking|chat_template_kwargs|unsupported|not support|invalid.*parameter/i.test(detail)) {
            console.warn('[Qwen] 当前接口不支持关闭 thinking 参数，已自动回退为普通调用模式。');
            return chatCompletions({ model, messages, maxTokens, temperature, topP, responseFormat, disableThinking: false, debugMeta });
        }
        if (responseFormat && /response_format|json_object|unsupported|not support|invalid.*parameter/i.test(detail)) {
            console.warn('[Qwen] 当前接口不支持 response_format，已自动回退为普通 JSON 提示词模式。');
            return chatCompletions({ model, messages, maxTokens, temperature, topP, responseFormat: null, disableThinking, debugMeta });
        }
        throw new Error(`Qwen接口调用失败${status ? ` HTTP ${status}` : ''}：${(bodyText || error.message).slice(0, 1000)}`);
    }

    const choice = response.data?.choices?.[0];
    const content = choice?.message?.content ?? response.data?.data ?? response.data;
    const text = messageContentText(content);
    if (debugMeta) {
        writeDebugLog('qwen-call-completed', {
            ...debugMeta,
            elapsedMs: Date.now() - started,
            model,
            responseFormatEnabled: Boolean(responseFormat),
            disableThinking,
            maxTokens: payload.max_tokens ?? null,
            contentLength: text.length,
            contentPreview: truncateText(text, 12000),
        });
    }
    persistModelLog({
        model,
        messages,
        payload,
        text,
        success: true,
        elapsedMs: Date.now() - started,
        debugMeta,
    });
    return text;
}

function dataUrlFromBuffer(buffer, mimeType = 'image/jpeg') {
    return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function recognizeImages({ prompt, images, batch = false, imageDetail = null, debugMeta = null }) {
    const imagePart = image => ({
        type: 'image_url',
        image_url: {
            url: image.dataUrl || dataUrlFromBuffer(image.buffer, image.mimeType),
            detail: image.detail || imageDetail || config.qwen.imageDetail,
        },
    });
    const content = [];

    if (!batch && images.length === 1) {
        content.push(imagePart(images[0]));
        content.push({ type: 'text', text: prompt });
    } else {
        content.push({ type: 'text', text: prompt });
        images.forEach((image, index) => {
            content.push({ type: 'text', text: `图片${index + 1}，fileName=${image.fileName || `image_${index + 1}`}` });
            content.push(imagePart(image));
        });
    }

    return chatCompletions({
        model: config.qwen.ocrModel,
        maxTokens: batch ? config.qwen.ocrBatchMaxTokens : config.qwen.ocrMaxTokens,
        temperature: 0,
        topP: 0.1,
        responseFormat: config.qwen.ocrJsonMode ? { type: 'json_object' } : null,
        disableThinking: config.qwen.disableThinkingForOcr,
        debugMeta: {
            event: 'ocr-recognize-images',
            batch,
            imageDetail: imageDetail || config.qwen.imageDetail,
            imageCount: images.length,
            imageNames: images.map(image => image.fileName || ''),
            promptLength: prompt.length,
            ...(debugMeta || {}),
        },
        messages: [{ role: 'user', content }],
    });
}

async function askTextModel({ systemPrompt, userPayload, temperature = 0.01, debugMeta = null }) {
    return chatCompletions({
        model: config.qwen.textModel,
        maxTokens: Math.max(2048, config.qwen.ocrBatchMaxTokens),
        temperature,
        debugMeta,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload, null, 2) },
        ],
    });
}

module.exports = {
    askTextModel,
    chatCompletions,
    dataUrlFromBuffer,
    recognizeImages,
};
