const { createOcrProfile } = require('../shared/ocrProfileFactory');
const ocrPrompt = require('./ocrPrompt');

module.exports = createOcrProfile({
    scenarioType: 'meeting',
    label: '会议费报销',
    ownerCity: '会议费开发地市',
    documentTypes: ['meetingNotice', 'meetingApproval', 'attendanceList', 'normalInvoice', 'other'],
    keywords: ['会议', '会务', '参会', '会议费', '会议通知', '会议审批', '签到表', '参会名单'],
    promptFocus: '会议费场景 OCR：重点识别审批依据、业务时间、地点或对象、人数、金额、发票和清单明细。',
    outputNote: '本场景只服务 会议费 开发调试；其他事项场景仅作为展示和借鉴。',
    ...ocrPrompt,
});