const formSchema = require('./formSchema');
const ruleModel = require('./ruleModel');
const prefillModel = require('./prefillModel');
const ocrProfile = require('./ocrProfile');

module.exports = {
    type: 'meeting',
    label: '会议费报销',
    ownerCity: '会议费开发地市',
    description: '会议费场景，负责会议通知、会议审批、参会名单、会议费发票等材料的 OCR、归集、预填和规则审核。',
    keywords: ['会议', '会务', '参会', '会议费', '会议通知', '会议审批', '签到表', '参会名单'],
    status: 'development',
    isolated: true,
    formSchema,
    ruleModel,
    prefillModel,
    ocrProfile,
};