const config = require('../../config/appConfig');
const { askTextModel } = require('../qwen/qwenClient');
const { buildModelPayload, buildSystemPrompt } = require('./refinePrompt');
const { normalizeModelResult } = require('./refineNormalizer');

async function refineOrAnswer({ instruction, prefillData, ocrItems = [], uploadResults = [] }) {
    const text = String(instruction || '').trim();
    if (!text) throw new Error('请输入智能调整或查询问题');

    const sourcePrefill = {
        ...(prefillData || {}),
        records: Array.isArray(prefillData?.records) ? prefillData.records : [],
        ocrItems: ocrItems.length ? ocrItems : (prefillData?.ocrItems || []),
        uploadResults: uploadResults.length ? uploadResults : (prefillData?.uploadResults || []),
    };
    const modelPayload = buildModelPayload({
        instruction: text,
        prefillData: sourcePrefill,
        ocrItems,
        uploadResults,
    });
    const modelText = await askTextModel({
        systemPrompt: buildSystemPrompt(),
        userPayload: modelPayload,
        temperature: 0.01,
        debugMeta: {
            event: 'ai-refine-prefill',
            caseId: prefillData?.caseId || prefillData?.pluginCaseId || '',
            scenarioType: sourcePrefill.scenarioType || sourcePrefill.expenseType || '',
        },
    });

    return normalizeModelResult({
        originalPrefill: sourcePrefill,
        originalOcrItems: sourcePrefill.ocrItems,
        modelText,
        instruction: text,
        modelName: config.qwen.textModel,
    });
}

module.exports = {
    refineOrAnswer,
};
