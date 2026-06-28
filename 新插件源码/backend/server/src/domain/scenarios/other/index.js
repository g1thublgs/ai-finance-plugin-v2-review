const formSchema = require('./formSchema');
const ruleModel = require('./ruleModel');
const prefillModel = require('./prefillModel');
const ocrProfile = require('./ocrProfile');

module.exports = {
    type: 'other',
    label: '其他事项报销',
    ownerCity: 'D市',
    description: 'D市负责场景，支持普通发票识别、预算指标匹配、发票金额汇总、购买方和用途明细回显。',
    keywords: ['其他事项', '发票', '电费', '水费', '办公', '维修', '服务', '购买方', '销售方', '耗材'],
    status: 'active',
    isolated: true,
    formSchema,
    ruleModel,
    prefillModel,
    ocrProfile,
};

