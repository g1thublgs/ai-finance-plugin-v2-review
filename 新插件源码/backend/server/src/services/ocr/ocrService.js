const config = require('../../config/appConfig');
const scenarios = require('../../domain/scenarios');
const { repairText, repairObjectEncoding } = require('../../utils/textEncoding');
const mockOcrProvider = require('./providers/mockOcrProvider');
const qwenOcrProvider = require('./providers/qwenOcrProvider');
const taskStore = require('./taskStore');
const { collectOcrItems: collectItemsFromPayload } = require('./resultNormalizer');
const { summarizeItems, writeDebugLog } = require('../../utils/debugLogger');
const dataStore = require('../database/pluginDataStore');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function limitConcurrency(items, limit, mapper) {
    const output = [];
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
        while (index < items.length) {
            const currentIndex = index++;
            output[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    });
    await Promise.all(workers);
    return output;
}

function normalizeFile(file) {
    if (!file) return file;
    return {
        ...file,
        originalname: repairText(file.originalname || file.fileName || file.name || ''),
    };
}

function buildOcrOptions(options = {}) {
    const scenarioType = options.scenarioType || options.businessCategory || 'smart';
    const ocrProfile = scenarios.getOcrProfile(scenarioType);
    return {
        ...options,
        scenarioType,
        provider: String(options.provider || options.ocrProvider || config.ocr.provider || 'qwen').toLowerCase(),
        ocrProfile: {
            ...(ocrProfile || {}),
            scenarioType,
            caseId: options.caseId || '',
            attachmentId: options.attachmentId || '',
            taskId: options.taskId || '',
        },
        caseId: options.caseId || '',
        attachmentId: options.attachmentId || '',
    };
}

async function processTask(taskId, file, options) {
    try {
        const provider = options.provider === 'mock' ? mockOcrProvider : qwenOcrProvider;
        const fileName = file.originalname || file.fileName || file.name || '';
        console.log(`[OCR] 开始识别：task=${taskId} file=${fileName} scenario=${options.scenarioType} provider=${options.provider}`);
        const result = await provider.recognizeFile(file, options.ocrProfile, {
            onTotal: total => taskStore.setTaskTotal(taskId, total),
            onProgress: count => taskStore.addResult(taskId, null, count),
        });
        console.log(`[OCR] 识别完成：task=${taskId} file=${fileName} items=${(result?.data || []).length}`);
        try {
            await dataStore.saveOcrResult({
                caseId: options.caseId || '',
                attachmentId: options.attachmentId || '',
                taskId,
                result,
            });
        } catch (dbError) {
            console.warn(`[OCR] 保存识别结果到数据库失败：task=${taskId} file=${fileName} ${dbError.message}`);
        }
        writeDebugLog('ocr-task-completed', {
            caseId: options.caseId || '',
            taskId,
            fileName,
            scenarioType: options.scenarioType,
            provider: options.provider,
            fileType: result?.fileType || '',
            pageCount: result?.pageCount,
            ...summarizeItems(result?.data || []),
            sample: (result?.data || []).slice(0, 10),
            providerDebug: result?.debug || {},
        });
        taskStore.addResult(taskId, result, 0);
    } catch (error) {
        const fileName = file?.originalname || file?.fileName || file?.name || '';
        console.error(`[OCR] 识别失败：task=${taskId} file=${fileName}`, error);
        try {
            await dataStore.failOcrTask({
                taskId,
                caseId: options.caseId || '',
                attachmentId: options.attachmentId || '',
                error,
            });
        } catch (dbError) {
            console.warn(`[OCR] 保存识别失败状态到数据库失败：task=${taskId} file=${fileName} ${dbError.message}`);
        }
        writeDebugLog('ocr-task-failed', {
            caseId: options.caseId || '',
            taskId,
            fileName,
            scenarioType: options.scenarioType,
            provider: options.provider,
            error: error.message,
            stack: error.stack,
        });
        taskStore.failTask(taskId, error);
    }
}

function createTask(file, options = {}) {
    const normalizedFile = normalizeFile(file);
    if (!normalizedFile?.buffer) throw new Error('缺少待识别文件内容');
    const ocrOptions = buildOcrOptions(options);
    const fileName = normalizedFile.originalname || normalizedFile.fileName || normalizedFile.name || `attachment_${Date.now()}`;
    const task = taskStore.createTaskRecord({
        fileId: ocrOptions.fileId || normalizedFile.fileId || `ocr_${Date.now()}`,
        fileName,
        fileSize: normalizedFile.size || normalizedFile.buffer.length,
    });
    ocrOptions.taskId = task.taskId;
    ocrOptions.ocrProfile.taskId = task.taskId;
    processTask(task.taskId, normalizedFile, ocrOptions);
    return {
        taskId: task.taskId,
        fileId: task.fileInfo.fileId,
        fileName,
        status: 'processing',
        scenarioType: ocrOptions.scenarioType,
        provider: ocrOptions.provider,
        caseId: ocrOptions.caseId || '',
        attachmentId: ocrOptions.attachmentId || '',
    };
}

function getTask(taskId) {
    return repairObjectEncoding(taskStore.getSnapshot(taskId));
}

async function waitForTask(taskId, timeoutMs = config.ocr.pollTimeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const snapshot = getTask(taskId);
        if (snapshot.success || snapshot.status === 'failed' || snapshot.status === 'not_found') return snapshot;
        await sleep(config.ocr.pollIntervalMs);
    }
    return { success: false, status: 'timeout', message: 'OCR识别超时', taskId };
}

async function recognizeFiles(files = [], options = {}) {
    const normalized = files.filter(file => file && file.buffer);
    const ocrOptions = buildOcrOptions(options);
    return limitConcurrency(normalized, Math.min(config.ocr.maxConcurrentFiles, normalized.length || 1), async (file, index) => {
        const task = createTask(file, {
            ...ocrOptions,
            fileId: file.fileId || `ocr_${Date.now()}_${index}`,
        });
        const result = await waitForTask(task.taskId, options.timeoutMs || config.ocr.pollTimeoutMs);
        return repairObjectEncoding({
            ...task,
            ...result,
            originalName: repairText(file.originalname || file.fileName || file.name),
            fileSize: file.size || file.buffer.length,
        });
    });
}

function collectOcrItems(payload = {}) {
    return repairObjectEncoding(collectItemsFromPayload(payload));
}

module.exports = {
    buildOcrOptions,
    createTask,
    getTask,
    waitForTask,
    recognizeFiles,
    collectOcrItems,
};
