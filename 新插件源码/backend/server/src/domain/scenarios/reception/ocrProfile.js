const { createOcrProfile } = require('../shared/ocrProfileFactory');
const ocrPrompt = require('./ocrPrompt');

module.exports = createOcrProfile({
    scenarioType: 'reception',
    label: '公务接待费报销',
    ownerCity: '公务接待费开发地市',
    documentTypes: ['receptionLetter', 'receptionList', 'menu', 'normalInvoice', 'other'],
    keywords: ['接待', '公务接待', '接待函', '接待清单', '菜单', '餐费', '来访人员'],
    promptFocus: '公务接待费场景 OCR：重点识别审批依据、业务时间、地点或对象、人数、金额、发票和清单明细。',
    outputNote: '本场景只服务 公务接待费 开发调试；其他事项场景仅作为展示和借鉴。',
    ...ocrPrompt,
});