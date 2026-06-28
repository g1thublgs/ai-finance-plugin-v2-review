const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const asyncHandler = require('../utils/asyncHandler');
const config = require('../config/appConfig');
const scenarios = require('../domain/scenarios');
const ocrService = require('../services/ocr/ocrService');
const prefillService = require('../services/prefill/prefillService');
const auditService = require('../services/audit/auditService');
const refineService = require('../services/ai/refineService');
const dataStore = require('../services/database/pluginDataStore');
const { summarizeItems, writeDebugLog } = require('../utils/debugLogger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadSize } });

function safeText(value) {
    return String(value || '').trim();
}

function resolveScenarioType(body = {}) {
    const explicit = safeText(body.scenarioType || body.expenseType || body.businessType);
    if (explicit && scenarios.getScenario(explicit)) return explicit;

    const text = safeText([
        body.businessCategory,
        body.category,
        body.pageType,
        body.currentPageUrl,
        body.source,
    ].filter(Boolean).join(' '));

    if (/其他事项|其它事项|其他报销|其它报销|other/i.test(text)) return 'other';
    if (/会议|meeting/i.test(text)) return 'meeting';
    if (/培训|training/i.test(text)) return 'training';
    if (/接待|reception/i.test(text)) return 'reception';
    return 'smart';
}

function normalizeTaskSnapshot(snapshot = {}) {
    if (snapshot.success && snapshot.status === 'completed') {
        const ocrModels = (snapshot.ocrModels || []).map(item => ({
            modelName: item.modelName || 'Qwen-VL',
            modelStatus: item.modelStatus || item.status || 'success',
            status: item.status || 'success',
            fileName: item.fileName || (snapshot.data && snapshot.data.fileName) || '',
            fileType: item.fileType || '',
            data: item.data || [],
            pageCount: item.pageCount,
            debug: item.debug || {},
        }));
        return {
            success: true,
            code: 200,
            status: 'completed',
            message: snapshot.message || '识别完成',
            data: snapshot.data || {},
            completedCount: snapshot.completedCount || ocrModels.length,
            totalModels: snapshot.totalModels || ocrModels.length || 1,
            ocrModels,
        };
    }

    return {
        success: false,
        status: snapshot.status || 'processing',
        message: snapshot.message || '正在识别',
        completedCount: snapshot.completedCount || 0,
        totalModels: snapshot.totalModels || 1,
        partialResults: (snapshot.partialResults || []).map(item => ({
            modelName: item.modelName || 'Qwen-VL',
            ...item,
        })),
    };
}

function collectOcrItemsFromBody(body = {}) {
    return ocrService.collectOcrItems({
        ocrItems: body.ocrItems || [],
        ocrModelsData: body.ocrModelsData || [],
        ocrData: body.ocrData || [],
        uploadResults: body.uploadResults || [],
        attachments: body.attachments || [],
        ocrModels: body.ocrModels || [],
        partialResults: body.partialResults || [],
        data: body.data || [],
    });
}

function buildAuditAttachments(body = {}) {
    return Array.isArray(body.attachments) ? body.attachments : [];
}

function normalizeAuditReport(report = {}) {
    return {
        issues: Array.isArray(report.issues) ? report.issues : [],
        summary: report.summary || '',
        ruleResults: Array.isArray(report.ruleResults) ? report.ruleResults : [],
        records: Array.isArray(report.records) ? report.records : [],
        engine: report.engine || '',
        scenarioType: report.scenarioType || '',
        scenarioLabel: report.scenarioLabel || '',
        ownerCity: report.ownerCity || '',
    };
}

router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400).json({ success: false, error: '未接收到上传文件' });
        return;
    }
    const scenarioType = resolveScenarioType(req.body || {});
    const caseId = dataStore.resolveCaseId(req.body || {}) || dataStore.newId('case');
    req.dbCaseId = caseId;
    const attachment = await dataStore.createAttachmentForUpload({
        caseId,
        file: req.file,
        body: req.body || {},
        scenarioType,
    });
    await dataStore.updateApiRequest(req.dbRequestId, {
        caseId,
        scenarioType,
        body: req.body || {},
        files: [dataStore.uploadFileSummary(req.file)],
    });
    const task = ocrService.createTask(req.file, {
        caseId,
        attachmentId: attachment.attachmentId,
        scenarioType,
        businessCategory: req.body && req.body.businessCategory || '',
        fileId: req.body && req.body.fileId || '',
        provider: req.body && (req.body.provider || req.body.ocrProvider) || '',
    });
    await dataStore.createOcrTaskRecord({
        caseId,
        attachmentId: attachment.attachmentId,
        taskId: task.taskId,
        scenarioType,
        provider: task.provider,
        modelName: config.qwen.ocrModel,
        promptKey: req.body && req.body.businessCategory || scenarioType,
    });
    res.status(202).json({
        success: true,
        code: 202,
        ...task,
        caseId,
        attachmentId: attachment.attachmentId,
        message: '文件已接收，正在后台识别',
    });
}));

router.get('/task/:taskId', (req, res) => {
    const snapshot = normalizeTaskSnapshot(ocrService.getTask(req.params.taskId));
    if (snapshot.status === 'completed' || snapshot.status === 'failed') {
        writeDebugLog('ocr-task-polled-final', {
            taskId: req.params.taskId,
            status: snapshot.status,
            success: snapshot.success,
            modelCount: (snapshot.ocrModels || snapshot.partialResults || []).length,
            modelSummaries: (snapshot.ocrModels || snapshot.partialResults || []).map(model => ({
                fileName: model.fileName,
                status: model.status || model.modelStatus,
                dataCount: (model.data || []).length,
                types: summarizeItems(model.data || []).byType,
                debug: model.debug || {},
            })),
        });
    }
    res.json(snapshot);
});

router.post('/api/refinePrefillData', asyncHandler(async (req, res) => {
    const sourcePrefill = req.body && (req.body.prefillData || req.body.data) || {};
    const caseId = dataStore.resolveCaseId(req.body || {}) || dataStore.resolveCaseId(sourcePrefill) || dataStore.newId('case');
    req.dbCaseId = caseId;
    await dataStore.ensureCase({
        ...(req.body || {}),
        caseId,
        scenarioType: sourcePrefill.scenarioType || sourcePrefill.expenseType || 'smart',
        dataSource: 'ai_refine',
        operationType: 'ai_refine',
        status: 'received',
    });
    await dataStore.updateApiRequest(req.dbRequestId, { caseId, scenarioType: sourcePrefill.scenarioType || sourcePrefill.expenseType || '', body: req.body || {} });
    const data = await refineService.refineOrAnswer({
        instruction: req.body && req.body.instruction,
        prefillData: sourcePrefill,
        ocrItems: req.body && req.body.ocrItems || sourcePrefill.ocrItems || [],
        uploadResults: req.body && req.body.uploadResults || sourcePrefill.uploadResults || [],
    });
    if (data && data.responseType !== 'answer') {
        await dataStore.savePrefillResult({
            caseId,
            scenarioType: data.scenarioType || data.expenseType || sourcePrefill.scenarioType || sourcePrefill.expenseType || '',
            sourceType: 'ai_refine',
            prefillData: { ...data, caseId },
        });
    }
    res.json({ success: true, caseId, data: { ...data, caseId } });
}));

router.post('/api/plugin/prefill', asyncHandler(async (req, res) => {
    const caseId = dataStore.resolveCaseId(req.body || {}) || dataStore.newId('case');
    req.dbCaseId = caseId;
    const ocrItems = collectOcrItemsFromBody(req.body || {});
    const scenarioType = req.body && req.body.scenarioType || scenarios.inferScenarioFromOcr(ocrItems).type;
    await dataStore.ensureCase({
        ...(req.body || {}),
        caseId,
        scenarioType,
        dataSource: req.body && req.body.source || 'api',
        operationType: 'prefill',
        status: 'aggregating',
    });
    const data = await prefillService.buildPrefillData({
        scenarioType,
        ocrItems,
        context: { ...(req.body || {}), caseId },
    });
    await dataStore.savePrefillResult({
        caseId,
        scenarioType,
        sourceType: req.body && req.body.source || 'api',
        prefillData: { ...data, caseId },
    });
    res.json({ success: true, caseId, data: { ...data, caseId } });
}));

router.post('/api/plugin/audit', asyncHandler(async (req, res) => {
    const caseId = dataStore.resolveCaseId(req.body || {}) || dataStore.resolveCaseId(req.body && (req.body.prefillData || req.body.data) || {}) || dataStore.newId('case');
    req.dbCaseId = caseId;
    const ocrItems = collectOcrItemsFromBody(req.body || {});
    const scenarioType = req.body && (req.body.scenarioType || req.body.expenseType);
    await dataStore.ensureCase({
        ...(req.body || {}),
        caseId,
        scenarioType,
        dataSource: req.body && req.body.source || 'page_extract',
        operationType: 'audit',
        status: 'auditing',
    });
    await dataStore.updateApiRequest(req.dbRequestId, { caseId, scenarioType, body: req.body || {} });
    const report = await auditService.runPreAudit({
        scenarioType,
        prefillData: { ...(req.body && (req.body.prefillData || req.body.data) || {}), caseId },
        ocrItems,
        attachments: buildAuditAttachments(req.body || {}),
        context: req.body || {},
    });
    const normalized = normalizeAuditReport(report);
    await dataStore.saveAuditResult({
        caseId,
        scenarioType: scenarioType || normalized.scenarioType || '',
        auditType: req.body && req.body.source === 'page-extract-audit-extension' ? 'inaudit' : 'preaudit',
        report: normalized,
        context: { ...(req.body || {}), ocrItems },
    });
    res.json({ success: true, caseId, data: normalized, auditResult: normalized });
}));

router.post('/api/plugin/caseSnapshot', asyncHandler(async (req, res) => {
    const prefillData = req.body && (req.body.prefillData || req.body.data) || {};
    const caseId = dataStore.resolveCaseId(req.body || {}) || dataStore.resolveCaseId(prefillData) || dataStore.newId('case');
    const scenarioType = req.body && req.body.scenarioType || prefillData.scenarioType || prefillData.expenseType || 'smart';
    req.dbCaseId = caseId;
    await dataStore.ensureCase({
        ...(req.body || {}),
        caseId,
        scenarioType,
        dataSource: req.body && req.body.source || prefillData.dataSource || 'snapshot',
        operationType: req.body && req.body.operationType || 'prefill_snapshot',
        status: 'aggregated',
        summary: prefillData.summary || {},
    });
    await dataStore.savePrefillResult({
        caseId,
        scenarioType,
        sourceType: req.body && req.body.source || prefillData.dataSource || 'snapshot',
        prefillData: { ...prefillData, caseId },
    });
    if (prefillData.auditResult) {
        await dataStore.saveAuditResult({
            caseId,
            scenarioType,
            auditType: req.body && req.body.auditType || 'preaudit',
            report: normalizeAuditReport(prefillData.auditResult),
            context: { scenarioType, ocrItems: prefillData.ocrItems || req.body && req.body.ocrItems || [], snapshot: prefillData },
        });
    }
    res.json({ success: true, caseId });
}));

router.get('/api/debug/ocr/latest', (req, res) => {
    const latestFile = path.join(config.projectRoot, 'server', 'logs', 'ocr-debug-latest.json');
    const logFile = path.join(config.projectRoot, 'server', 'logs', 'ocr-debug.log');
    const latest = fs.existsSync(latestFile) ? JSON.parse(fs.readFileSync(latestFile, 'utf8')) : null;
    const tail = fs.existsSync(logFile)
        ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-20).join('\n')
        : '';
    res.json({ success: true, data: { latest, tail, latestFile, logFile } });
});

module.exports = router;