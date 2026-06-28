const { createOcrProfile } = require('../shared/ocrProfileFactory');
const ocrPrompt = require('./ocrPrompt');

module.exports = createOcrProfile({
    scenarioType: 'meeting',
    label: '会议费报销',
    ownerCity: '汕尾市',
    documentTypes: [
        'meetingNotice',
        'meetingPlan',
        'attendanceList',
        'feeSettlement',
        'accommodationList',
        'normalInvoice',
        'other',
    ],
    keywords: [
        '会议',
        '会务',
        '参会',
        '会议费',
        '会议通知',
        '会议计划',
        '会议计划审批表',
        '签到表',
        '参会人员名单',
        '费用明细',
        '会议结算单',
        '住宿清单',
    ],
    promptFocus: '会议费场景 OCR：重点识别会议通知、会议计划、签到名单、费用明细、结算单、住宿清单、发票金额和原始明细文字。',
    outputNote: '本场景只服务会议费开发调试；规则判断由后端 meeting 场景 Python 规则执行。',
    ...ocrPrompt,
});
