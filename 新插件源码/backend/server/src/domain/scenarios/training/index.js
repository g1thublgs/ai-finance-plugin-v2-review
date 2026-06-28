const formSchema = require('./formSchema');
const ruleModel = require('./ruleModel');
const prefillModel = require('./prefillModel');
const ocrProfile = require('./ocrProfile');

module.exports = {
    type: 'training',
    label: '培训费报销',
    ownerCity: '培训费开发地市',
    description: '培训费场景，负责培训通知、培训审批、参训名单、讲课费、培训费发票等材料的 OCR、归集、预填和规则审核。',
    keywords: ['培训', '培训费', '授课', '讲课费', '师资费', '学习班', '培训通知', '培训审批'],
    status: 'development',
    isolated: true,
    formSchema,
    ruleModel,
    prefillModel,
    ocrProfile,
};