const scenarios = require('../../domain/scenarios');
const { repairObjectEncoding } = require('../../utils/textEncoding');
const { summarizeItems, writeDebugLog } = require('../../utils/debugLogger');

function resolvePrefillScenario(scenarioType, ocrItems) {
    const requested = scenarioType ? scenarios.getScenario(scenarioType) : null;
    if (!requested || requested.autoInferOnly) return scenarios.inferScenarioFromOcr(ocrItems);
    return requested;
}

async function buildPrefillData({ scenarioType, ocrItems = [], context = {}, applicationId = null }) {
    const repairedOcrItems = repairObjectEncoding(ocrItems || []);
    const repairedContext = repairObjectEncoding(context || {});
    const scenario = resolvePrefillScenario(scenarioType, repairedOcrItems);
    if (!scenario) throw new Error(`不支持的报销场景：${scenarioType}`);
    writeDebugLog('prefill-build-started', {
        requestedScenarioType: scenarioType || '',
        resolvedScenarioType: scenario.type,
        ...summarizeItems(repairedOcrItems),
        sample: repairedOcrItems.slice(0, 10),
    });

    const result = await scenario.prefillModel.buildPrefill({
        ocrItems: repairedOcrItems,
        context: {
            ...repairedContext,
            requestedScenarioType: scenarioType,
            resolvedScenarioType: scenario.type,
        },
    });
    result.scenarioType = scenario.type;
    result.expenseType = result.expenseType || scenario.type;
    result.scenarioLabel = scenario.label;
    result.ownerCity = scenario.ownerCity;
    result.requestedScenarioType = scenarioType || '';
    writeDebugLog('prefill-build-completed', {
        requestedScenarioType: scenarioType || '',
        resolvedScenarioType: scenario.type,
        expenseType: result.expenseType || scenario.type,
        recordCount: (result.records || []).length,
        itineraryCount: (result.itinerary || []).length,
        summary: result.summary || {},
        sourceStats: result.sourceStats || {},
        recordSample: (result.records || []).slice(0, 8),
    });

    return result;
}

module.exports = {
    buildPrefillData,
    resolvePrefillScenario,
};
