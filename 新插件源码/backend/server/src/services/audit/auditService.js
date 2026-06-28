const scenarios = require('../../domain/scenarios');
const ruleEngine = require('./ruleEngine');
const { repairObjectEncoding } = require('../../utils/textEncoding');
const { auditTrafficSubsidy, hasTrafficSubsidyEvidence } = require('../../domain/scenarios/other/aggregation/trafficExtractor');

function numberValue(value) {
    const n = Number(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function issue(category, description, suggestion, severity = 'warning', evidence = {}) {
    return { category, description, suggestion, severity, evidence };
}

function otherAudit(prefillData = {}, body = {}, ocrItems = []) {
    const record = (prefillData.records || [])[0] || {};
    const issues = [];
    const ruleResults = [];

    if (!record.matchedBudgetIndicatorId) {
        issues.push(issue('预算指标匹配', '未能根据发票项目匹配到明确预算指标。', '请人工选择经济科目和用途明细，或维护更多预算指标关键词。', 'warning', { recordKey: record.recordKey || '' }));
    }

    const invoiceTotal = numberValue((prefillData.summary && (prefillData.summary.totalAll || prefillData.summary.totalAmount)) || record.totalAmount);
    const pageAmount = numberValue(body.pageAmount || body.totalAmount || record.totalAmount);
    if (pageAmount && Math.abs(invoiceTotal - pageAmount) > 0.01) {
        issues.push(issue('金额一致性', `页面金额 ${pageAmount} 元与附件归集金额 ${invoiceTotal} 元不一致。`, '请核对页面填写金额、附件发票金额和付款金额。', 'warning', { pageAmount, invoiceTotal, recordKey: record.recordKey || '' }));
    }

    if (hasTrafficSubsidyEvidence(ocrItems, record)) {
        const trafficRule = auditTrafficSubsidy(ocrItems, prefillData, body);
        const trafficIssues = (trafficRule.issues || []).map(item => ({
            ...item,
            ruleId: trafficRule.ruleId,
            ruleName: trafficRule.ruleName,
            recordKey: record.recordKey || item.recordKey || '',
            evidence: { ...(item.evidence || {}), recordKey: record.recordKey || (item.evidence && item.evidence.recordKey) || '' },
        }));
        issues.push(...trafficIssues);
        ruleResults.push({ id: trafficRule.ruleId, ruleId: trafficRule.ruleId, ruleName: trafficRule.ruleName, status: trafficRule.status, passed: trafficRule.passed, issues: trafficIssues, summary: trafficRule.summary });
    }

    return {
        issues,
        summary: issues.length ? `发现 ${issues.length} 个其他事项预审提示。` : '其他事项预审未发现明显问题。',
        records: prefillData.records || [],
        ruleResults: [...ruleResults, ...issues.filter(item => !item.ruleId).map((item, index) => ({ id: index + 1, status: 'warning', issues: [item] }))],
        engine: 'other-expense-local-rules',
    };
}

function placeholderAudit(scenario, prefillData = {}) {
    return {
        issues: [],
        summary: `${scenario.label} 规则目录已预留。当前示例规则未命中问题，请继续补充本场景指标逻辑。`,
        records: prefillData.records || [],
        ruleResults: [],
        engine: `${scenario.type}-reserved-rules`,
        placeholder: true,
    };
}

function resolveAuditScenario(scenarioType, prefillData = {}, ocrItems = []) {
    const requested = scenarioType ? scenarios.getScenario(scenarioType) : null;
    if (requested && !requested.autoInferOnly) return requested;
    const fromPrefill = scenarios.getConcreteScenario(prefillData.scenarioType || prefillData.expenseType);
    return fromPrefill || scenarios.inferScenarioFromOcr(ocrItems);
}

async function runPreAudit({ scenarioType, prefillData = {}, ocrItems = [], attachments = [], context = {} }) {
    const repairedPrefill = repairObjectEncoding(prefillData || {});
    const repairedOcrItems = repairObjectEncoding(ocrItems || []);
    const repairedAttachments = repairObjectEncoding(attachments || []);
    const repairedContext = repairObjectEncoding(context || {});
    const scenario = resolveAuditScenario(scenarioType, repairedPrefill, repairedOcrItems);
    if (!scenario) throw new Error(`不支持的报销场景：${scenarioType || '未识别'}`);

    let report;
    if (scenario.type === 'other') {
        report = otherAudit(repairedPrefill, repairedContext, repairedOcrItems);
    } else if (ruleEngine.hasScenarioRuleDirectory(scenario.type)) {
        const ruleContext = ruleEngine.buildRuleContext({ ...repairedContext, scenarioType: scenario.type, prefillData: repairedPrefill, records: repairedPrefill.records || [], summary: repairedPrefill.summary || {}, ocrItems: repairedOcrItems, attachments: repairedAttachments, uploadResults: repairedContext.uploadResults || [] });
        try {
            report = await ruleEngine.runPythonRules(ruleContext);
        } catch (error) {
            report = ruleEngine.failure(error);
        }
    } else {
        report = placeholderAudit(scenario, repairedPrefill);
    }

    report.scenarioType = scenario.type;
    report.scenarioLabel = scenario.label;
    report.ownerCity = scenario.ownerCity;
    return report;
}

module.exports = { runPreAudit, otherAudit };