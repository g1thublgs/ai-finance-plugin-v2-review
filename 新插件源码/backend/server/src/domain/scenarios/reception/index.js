const formSchema = require('./formSchema');
const ruleModel = require('./ruleModel');
const prefillModel = require('./prefillModel');
const ocrProfile = require('./ocrProfile');

module.exports = {
    type: 'reception',
    label: '公务接待费报销',
    ownerCity: '公务接待费开发地市',
    description: '公务接待费场景，负责接待函、接待审批、接待清单、菜单、发票、来访人员名单等材料的 OCR、归集、预填和规则审核。',
    keywords: ['接待', '公务接待', '接待函', '接待清单', '菜单', '餐费', '来访人员'],
    status: 'development',
    isolated: true,
    formSchema,
    ruleModel,
    prefillModel,
    ocrProfile,
};