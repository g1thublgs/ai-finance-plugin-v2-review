const { createOcrProfile } = require('../shared/ocrProfileFactory');
const ocrPrompt = require('./ocrPrompt');

module.exports = createOcrProfile({
    scenarioType: 'training',
    label: '培训费报销',
    ownerCity: '培训费开发地市',
    documentTypes: ['trainingNotice', 'trainingApproval', 'attendanceList', 'normalInvoice', 'other'],
    keywords: ['培训', '培训费', '授课', '讲课费', '师资费', '学习班', '培训通知', '培训审批'],
    promptFocus: '培训费场景 OCR：重点识别审批依据、业务时间、地点或对象、人数、金额、发票和清单明细。',
    outputNote: '本场景只服务 培训费 开发调试；其他事项场景仅作为展示和借鉴。',
    ...ocrPrompt,
});