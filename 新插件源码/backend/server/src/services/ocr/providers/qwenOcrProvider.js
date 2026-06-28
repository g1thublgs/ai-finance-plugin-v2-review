const path = require('path');
const config = require('../../../config/appConfig');
const qwenClient = require('../../qwen/qwenClient');
const { buildBatchOcrPrompt, buildOcrPrompt } = require('../promptBuilder');
const { cleanupFiles, getPdfPageCount, renderPdfPages, writeUploadTempFile } = require('../pdfRenderer');
const { normalizeBatchModelResponse, normalizeSingleModelResponse } = require('../resultNormalizer');
const { extractTextFromBuffer, isTextDocumentFile } = require('../textDocumentExtractor');
const { summarizeItems, truncateText, writeDebugLog } = require('../../../utils/debugLogger');

function mimeTypeForFile(fileName) {
    const ext = path.extname(fileName || '').toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
}

function chunk(items, size) {
    const result = [];
    for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
    return result;
}

function responseHasUsefulData(response = {}) {
    return Array.isArray(response.data) && response.data.length > 0;
}

function profileMeta(profile = {}) {
    return {
        caseId: profile.caseId || '',
        taskId: profile.taskId || '',
        attachmentId: profile.attachmentId || '',
        scenarioType: profile.scenarioType || '',
        promptKey: profile.businessCategory || profile.promptKey || '',
    };
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const output = [];
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
        while (index < items.length) {
            const currentIndex = index++;
            output[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    });
    await Promise.all(workers);
    return output;
}

function combinePdfPageResponses(originalFileName, pageResponses, pageCount = pageResponses.length) {
    const data = [];
    pageResponses.forEach(response => {
        (response?.data || []).forEach(item => data.push({
            ...item,
            sourceFileName: item.sourceFileName || originalFileName,
            sourcePageFileName: response.fileName,
        }));
    });
    return {
        status: 'success',
        fileName: originalFileName,
        fileType: 'pdf',
        data,
        pageCount,
    };
}

async function recognizeImageFile(file, profile) {
    const fileName = file.originalname || file.fileName || file.name || 'attachment';
    const prompt = buildOcrPrompt(profile);
    const image = {
        fileName,
        buffer: file.buffer,
        mimeType: file.mimetype || mimeTypeForFile(fileName),
    };
    const started = Date.now();
    const responseText = await qwenClient.recognizeImages({
        prompt,
        images: [image],
        imageDetail: config.qwen.imageDetail,
        debugMeta: { ...profileMeta(profile), fileName, fileType: file.mimetype || '' },
    });
    let normalized = normalizeSingleModelResponse(responseText, fileName, file.mimetype || '');
    writeDebugLog('ocr-image-normalized', {
        fileName,
        elapsedMs: Date.now() - started,
        rawResponsePreview: truncateText(responseText, 12000),
        ...summarizeItems(normalized.data),
        debug: normalized.debug,
    });
    if (config.ocr.retryEmptyPages && !responseHasUsefulData(normalized)) {
        console.warn(`[OCR][Qwen] 单图返回空结果，重试一次：${fileName}`);
        const retryText = await qwenClient.recognizeImages({
            prompt,
            images: [image],
            imageDetail: config.qwen.imageDetail,
            debugMeta: { ...profileMeta(profile), fileName, fileType: file.mimetype || '', retry: true },
        });
        const retry = normalizeSingleModelResponse(retryText, fileName, file.mimetype || '');
        if (responseHasUsefulData(retry)) normalized = retry;
    }
    return normalized;
}

function buildTextDocumentPrompt(profile, extraction) {
    return `${buildOcrPrompt(profile)}

【当前附件为文本/表格/OFD类文档】
1. 下方“可见文字”是从用户上传的原始附件中抽取出来的页面文字或表格文字。
2. 请仍按上方场景字段模板输出 JSON，不要返回 Markdown，不要解释。
3. 不要根据文件名推断字段，只能根据可见文字填写；看不清或文字中没有的字段填 ""。
4. 如果可见文字能判断是出差审批单、公务出行明细表、普通发票、付款记录等，必须返回对应 recognizeType。
5. 如果没有足够业务文字，返回 {"data":[]}。

【文件名】
${extraction.fileName}

【可见文字】
${truncateText(extraction.text || '', 50000)}
`.trim();
}

async function recognizeEmbeddedDocumentImages(fileName, images = [], profile = {}) {
    const limitedImages = (images || []).slice(0, 20);
    if (!limitedImages.length) return [];
    const prompt = `${buildOcrPrompt(profile)}

【当前图片来自文本/表格/OFD类附件内嵌截图】
1. 请按上方场景模板识别图片内容并返回 JSON。
2. 不要根据原文件名补全字段，只能抄录图片可见内容。
3. 如果图片为空白、图标、装饰图或没有报销业务字段，返回 {"data":[]}。
`.trim();
    const responses = await mapWithConcurrency(limitedImages, Math.min(3, limitedImages.length), async (image, index) => {
        const embeddedFileName = `${fileName}#${image.entryName || image.fileName || `embedded_${index + 1}`}`;
        try {
            const responseText = await qwenClient.recognizeImages({
                prompt,
                images: [{
                    fileName: embeddedFileName,
                    buffer: image.buffer,
                    mimeType: mimeTypeForFile(image.fileName || image.entryName || ''),
                }],
                imageDetail: config.qwen.imageDetail,
                debugMeta: { ...profileMeta(profile), fileName, embeddedFileName, mode: 'text-document-embedded-image' },
            });
            const normalized = normalizeSingleModelResponse(responseText, embeddedFileName, 'embedded-image');
            return (normalized.data || []).map(item => ({
                ...item,
                sourceFileName: item.sourceFileName || fileName,
                embeddedImageName: image.entryName || image.fileName || '',
            }));
        } catch (error) {
            console.error(`[OCR][TextDocument] 内嵌图片识别失败：${embeddedFileName}`, error);
            writeDebugLog('ocr-text-document-embedded-image-failed', {
                fileName,
                embeddedFileName,
                error: error.message,
            });
            return [];
        }
    });
    return responses.flat();
}

async function recognizeTextDocumentFile(file, profile) {
    const fileName = file.originalname || file.fileName || file.name || 'attachment';
    const started = Date.now();
    const extraction = await extractTextFromBuffer({ fileName, buffer: file.buffer });
    writeDebugLog('ocr-text-document-extracted', {
        fileName,
        fileType: extraction.fileType,
        method: extraction.method,
        textLength: extraction.textLength,
        imageCount: extraction.imageCount || 0,
        textPreview: truncateText(extraction.text, 12000),
        scenarioType: profile?.scenarioType || '',
        caseId: profile?.caseId || '',
        taskId: profile?.taskId || '',
    });
    if (!extraction.text && !extraction.imageCount) {
        const empty = { status: 'success', fileName, fileType: extraction.fileType || 'text-document', data: [] };
        if (extraction.method) empty.debug = { mode: 'text-document', extraction };
        return empty;
    }
    let responseText = '';
    let normalized = { status: 'success', fileName, fileType: file.mimetype || extraction.fileType || '', data: [] };
    if (extraction.text) {
        responseText = await qwenClient.chatCompletions({
            model: config.qwen.textModel,
            messages: [{ role: 'user', content: buildTextDocumentPrompt(profile, extraction) }],
            maxTokens: config.qwen.ocrMaxTokens,
            temperature: 0,
            topP: 0.1,
            responseFormat: config.qwen.ocrJsonMode ? { type: 'json_object' } : null,
            disableThinking: config.qwen.disableThinkingForOcr,
            debugMeta: {
                event: 'ocr-recognize-text-document',
                fileName,
                fileType: extraction.fileType,
                ...profileMeta(profile),
                promptTextLength: extraction.textLength,
            },
        });
        normalized = normalizeSingleModelResponse(responseText, fileName, file.mimetype || extraction.fileType || '');
    }
    const embeddedImageItems = await recognizeEmbeddedDocumentImages(fileName, extraction.images || [], profile);
    if (embeddedImageItems.length) {
        normalized.data = [...(normalized.data || []), ...embeddedImageItems];
    }
    normalized.fileType = extraction.fileType || normalized.fileType || 'text-document';
    normalized.debug = {
        ...(normalized.debug || {}),
        mode: 'text-document',
        extractionMethod: extraction.method,
        extractedTextLength: extraction.textLength,
        embeddedImageCount: extraction.imageCount || 0,
        embeddedImageItemCount: embeddedImageItems.length,
        elapsedMs: Date.now() - started,
    };
    writeDebugLog('ocr-text-document-normalized', {
        fileName,
        elapsedMs: Date.now() - started,
        ...summarizeItems(normalized.data),
        rawResponsePreview: truncateText(responseText, 12000),
        debug: normalized.debug,
    });
    return normalized;
}

async function recognizePdfPage(page, profile) {
    const started = Date.now();
    const responseText = await qwenClient.recognizeImages({
        prompt: buildOcrPrompt(profile),
        imageDetail: config.qwen.pdfImageDetail || config.qwen.imageDetail,
        debugMeta: {
            fileName: page.fileName,
            pageNumber: page.pageNumber,
            ...profileMeta(profile),
            mode: 'pdf-single-page',
        },
        images: [{
            fileName: page.fileName,
            buffer: page.buffer,
            mimeType: page.mimeType,
        }],
    });
    const normalized = normalizeSingleModelResponse(responseText, page.fileName, page.fileType);
    writeDebugLog('ocr-pdf-page-normalized', {
        fileName: page.fileName,
        pageNumber: page.pageNumber,
        elapsedMs: Date.now() - started,
        ...summarizeItems(normalized.data),
        debug: normalized.debug,
    });
    return normalized;
}

async function retryEmptyPdfPages(renderedFiles, responses, profile, originalFileName) {
    if (!config.ocr.retryEmptyPages) return responses;
    const byName = new Map((responses || []).map(response => [response.fileName, response]));
    const weakPages = renderedFiles.filter(page => !responseHasUsefulData(byName.get(page.fileName)));
    if (!weakPages.length) return responses;

    const retryPages = config.ocr.retryEmptyPageMaxPages > 0
        ? weakPages.slice(0, config.ocr.retryEmptyPageMaxPages)
        : [];
    if (!retryPages.length) {
        console.warn(`[OCR][PDF] ${originalFileName} 有 ${weakPages.length} 页为空或失败，已跳过空页重试。`);
        return responses;
    }
    console.warn(`[OCR][PDF] ${originalFileName} 有 ${weakPages.length} 页为空或失败，仅重试前 ${retryPages.length} 页。`);
    writeDebugLog('ocr-pdf-retry-empty-pages', {
        originalFileName,
        weakPageCount: weakPages.length,
        retryPageCount: retryPages.length,
        skippedPageNames: weakPages.slice(retryPages.length).map(page => page.fileName),
    });
    const retryResponses = await mapWithConcurrency(
        retryPages,
        config.ocr.retryEmptyPageConcurrency,
        async page => {
            try {
                const retry = await recognizePdfPage(page, profile);
                return retry;
            } catch (error) {
                console.error(`[OCR][PDF] 空结果重试失败：${originalFileName} -> ${page.fileName}`, error);
                return null;
            }
        },
    );
    retryResponses.filter(Boolean).forEach(retry => {
        if (responseHasUsefulData(retry)) byName.set(retry.fileName, retry);
    });
    return renderedFiles.map(page => byName.get(page.fileName)).filter(Boolean);
}

async function recognizePdfFile(file, profile, callbacks = {}) {
    const fileName = file.originalname || file.fileName || file.name || 'attachment.pdf';
    const tempPdf = await writeUploadTempFile(file);
    const cleanup = [tempPdf];
    const totalStarted = Date.now();
    try {
        const pageCount = await getPdfPageCount(tempPdf);
        writeDebugLog('ocr-pdf-started', {
            fileName,
            pageCount,
            ...profileMeta(profile),
            pdfBatchSize: config.ocr.pdfBatchSize,
            pdfBatchConcurrency: config.ocr.pdfBatchConcurrency,
            renderScale: config.ocr.renderScale,
            pdfImageDetail: config.qwen.pdfImageDetail || config.qwen.imageDetail,
            omitMaxTokensInJsonMode: config.qwen.omitMaxTokensInJsonMode,
        });
        const rendered = await renderPdfPages(tempPdf, pageCount);
        cleanup.push(...rendered.files.map(item => item.filePath));
        if (!rendered.files.length) throw new Error('PDF 切片失败，未生成可识别图片');
        if (callbacks.onTotal) callbacks.onTotal(rendered.files.length);
        const batches = chunk(rendered.files, config.ocr.pdfBatchSize);
        const responses = [];
        const pageErrors = [];
        await mapWithConcurrency(batches, config.ocr.pdfBatchConcurrency, async batch => {
            const batchStarted = Date.now();
            const pageNames = batch.map(page => page.fileName).join(', ');
            try {
                let normalized;
                if (batch.length === 1) {
                    normalized = [await recognizePdfPage(batch[0], profile)];
                } else {
                    const prompt = buildBatchOcrPrompt(batch, profile);
                    const responseText = await qwenClient.recognizeImages({
                        prompt,
                        batch: true,
                        imageDetail: config.qwen.pdfImageDetail || config.qwen.imageDetail,
                        debugMeta: {
                            fileName,
                            pageNames: batch.map(page => page.fileName),
                            ...profileMeta(profile),
                            mode: 'pdf-page-batch',
                        },
                        images: batch.map(page => ({
                            fileName: page.fileName,
                            buffer: page.buffer,
                            mimeType: page.mimeType,
                        })),
                    });
                    normalized = normalizeBatchModelResponse(responseText, batch);
                }
                responses.push(...normalized);
                writeDebugLog('ocr-pdf-batch-normalized', {
                    fileName,
                    pageNames: batch.map(page => page.fileName),
                    elapsedMs: Date.now() - batchStarted,
                    resultCounts: normalized.map(item => ({
                        fileName: item.fileName,
                        dataCount: (item.data || []).length,
                        types: summarizeItems(item.data).byType,
                    })),
                });
            } catch (error) {
                pageErrors.push(`${pageNames}: ${error.message}`);
                console.error(`[OCR][PDF] 页面识别失败：${fileName} -> ${pageNames}`, error);
                writeDebugLog('ocr-pdf-batch-failed', {
                    fileName,
                    pageNames,
                    elapsedMs: Date.now() - batchStarted,
                    error: error.message,
                });
            } finally {
                if (callbacks.onProgress) callbacks.onProgress(batch.length);
            }
        });
        responses.sort((left, right) => {
            const lp = Number(String(left.fileName || '').match(/page_(\d+)/)?.[1] || 0);
            const rp = Number(String(right.fileName || '').match(/page_(\d+)/)?.[1] || 0);
            return lp - rp;
        });
        const stableResponses = await retryEmptyPdfPages(rendered.files, responses, profile, fileName);
        const combined = combinePdfPageResponses(fileName, stableResponses, rendered.files.length);
        if (!combined.data.length && pageErrors.length) {
            throw new Error(`PDF 页面 OCR 失败：${pageErrors.slice(0, 3).join('；')}`);
        }
        combined.debug = {
            mode: 'pdf-vision',
            pageCount,
            renderedPageCount: rendered.files.length,
            responsePageCount: stableResponses.length,
            pageErrorCount: pageErrors.length,
            elapsedMs: Date.now() - totalStarted,
        };
        writeDebugLog('ocr-pdf-completed', {
            fileName,
            elapsedMs: Date.now() - totalStarted,
            pageCount,
            renderedPageCount: rendered.files.length,
            responsePageCount: stableResponses.length,
            pageErrors,
            ...summarizeItems(combined.data),
            sample: combined.data.slice(0, 10),
        });
        return combined;
    } finally {
        cleanupFiles(cleanup);
    }
}

async function recognizeFile(file, profile, callbacks = {}) {
    const fileName = file.originalname || file.fileName || file.name || '';
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.pdf' && config.ocr.pageOcrEnabled) {
        return recognizePdfFile(file, profile, callbacks);
    }
    const result = isTextDocumentFile(fileName)
        ? await recognizeTextDocumentFile(file, profile)
        : await recognizeImageFile(file, profile);
    if (callbacks.onTotal) callbacks.onTotal(1);
    if (callbacks.onProgress) callbacks.onProgress(1);
    return result;
}

module.exports = {
    recognizeFile,
};
