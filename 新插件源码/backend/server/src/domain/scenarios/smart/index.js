const formSchema = require('./formSchema');
const ruleModel = require('./ruleModel');
const prefillModel = require('./prefillModel');
const ocrProfile = require('./ocrProfile');

module.exports = {
    type: 'smart',
    label: '智能报销',
    ownerCity: '统一入口',
    description: '统一入口场景，OCR 识别后根据票据类型和关键词自动判断为其他事项、会议费、培训费或公务接待费。',
    keywords: ['智能报销', '自动识别', '自动匹配', 'AI报销'],
    status: 'active',
    isolated: true,
    autoInferOnly: true,
    formSchema,
    ruleModel,
    prefillModel,
    ocrProfile,
};