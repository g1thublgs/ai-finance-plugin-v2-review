const smart = require('./smart');
const other = require('./other');
const meeting = require('./meeting');
const training = require('./training');
const reception = require('./reception');

const scenarios = [smart, other, meeting, training, reception];
const concreteScenarios = scenarios.filter(item => !item.autoInferOnly);
const scenarioMap = new Map(scenarios.map(item => [item.type, item]));

function publicScenario(item) {
    return {
        type: item.type,
        label: item.label,
        ownerCity: item.ownerCity,
        description: item.description,
        keywords: item.keywords,
        status: item.status,
        isolated: item.isolated !== false,
        autoInferOnly: !!item.autoInferOnly,
        formSchema: item.formSchema,
        ruleModel: item.ruleModel,
        ocrProfile: item.ocrProfile,
    };
}

function listScenarios() {
    return scenarios.map(publicScenario);
}

function listConcreteScenarios() {
    return concreteScenarios.map(publicScenario);
}

function getScenario(type) {
    return scenarioMap.get(type) || null;
}

function getConcreteScenario(type) {
    const scenario = getScenario(type);
    return scenario && !scenario.autoInferOnly ? scenario : null;
}

function scoreScenario(scenario, text) {
    const normalized = String(text || '');
    const keywordScore = (scenario.keywords || []).reduce((sum, keyword) => (
        normalized.includes(keyword) ? sum + Math.max(2, keyword.length) : sum
    ), 0);
    const ocrKeywordScore = ((scenario.ocrProfile && scenario.ocrProfile.keywords) || []).reduce((sum, keyword) => (
        normalized.includes(keyword) ? sum + Math.max(2, keyword.length) : sum
    ), 0);
    return keywordScore + ocrKeywordScore;
}

function inferScenarioFromText(text) {
    const scored = concreteScenarios
        .map(scenario => ({ scenario, score: scoreScenario(scenario, text) }))
        .sort((a, b) => b.score - a.score);
    return scored[0] && scored[0].score > 0 ? scored[0].scenario : other;
}

function normalizedDocType(value) {
    const text = String(value || '').trim();
    const compact = text.replace(/\s+/g, '');
    const mapping = {
        normalInvoice: 'normalInvoice',
        normal_invoice: 'normalInvoice',
        invoice: 'normalInvoice',
        发票: 'normalInvoice',
        普通发票: 'normalInvoice',
        增值税发票: 'normalInvoice',
        guangzhouTaxiInvoice: 'guangzhouTaxiInvoice',
        taxiInvoice: 'guangzhouTaxiInvoice',
        出租车票: 'guangzhouTaxiInvoice',
        tripDetailList: 'tripDetailList',
        trip_detail_list: 'tripDetailList',
        公务出行明细表: 'tripDetailList',
        paymentRecord: 'paymentRecord',
        payment_record: 'paymentRecord',
        付款记录: 'paymentRecord',
        meetingNotice: 'meetingNotice',
        meeting_notice: 'meetingNotice',
        会议通知: 'meetingNotice',
        meetingApproval: 'meetingApproval',
        meeting_approval: 'meetingApproval',
        会议审批单: 'meetingApproval',
        meetingPlan: 'meetingPlan',
        meeting_plan: 'meetingPlan',
        会议计划: 'meetingPlan',
        会议计划表: 'meetingPlan',
        会议计划审批表: 'meetingPlan',
        feeSettlement: 'feeSettlement',
        fee_settlement: 'feeSettlement',
        会议结算单: 'feeSettlement',
        费用明细: 'feeSettlement',
        accommodationList: 'accommodationList',
        accommodation_list: 'accommodationList',
        住宿清单: 'accommodationList',
        trainingNotice: 'trainingNotice',
        training_notice: 'trainingNotice',
        培训通知: 'trainingNotice',
        trainingApproval: 'trainingApproval',
        training_approval: 'trainingApproval',
        培训审批单: 'trainingApproval',
        receptionLetter: 'receptionLetter',
        reception_letter: 'receptionLetter',
        公务接待函: 'receptionLetter',
        receptionList: 'receptionList',
        reception_list: 'receptionList',
        公务接待清单: 'receptionList',
        menu: 'menu',
        菜单: 'menu',
    };
    return mapping[text] || mapping[compact] || text;
}

function inferScenarioFromOcr(ocrItems = []) {
    const types = new Set((ocrItems || [])
        .map(item => normalizedDocType(item && (item.recognizeType || item.docType || item.type)))
        .filter(Boolean));
    if ([...types].some(type => ['meetingNotice', 'meetingApproval', 'meetingPlan', 'attendanceList', 'feeSettlement'].includes(type))) return meeting;
    if ([...types].some(type => ['trainingNotice', 'trainingApproval'].includes(type))) return training;
    if ([...types].some(type => ['receptionLetter', 'receptionList', 'menu'].includes(type))) return reception;
    if ([...types].some(type => ['tripDetailList', 'guangzhouTaxiInvoice', 'paymentRecord', 'normalInvoice'].includes(type))) return other;
    return inferScenarioFromText(JSON.stringify(ocrItems || []));
}

function getOcrProfile(type) {
    return (getScenario(type) || smart).ocrProfile;
}

function getOcrBusinessCategory(type) {
    return getOcrProfile(type).businessCategory;
}

module.exports = {
    scenarios,
    concreteScenarios,
    listScenarios,
    listConcreteScenarios,
    getScenario,
    getConcreteScenario,
    inferScenarioFromText,
    inferScenarioFromOcr,
    getOcrProfile,
    getOcrBusinessCategory,
};
