const { createOcrProfile } = require('../shared/ocrProfileFactory');
const ocrPrompt = require('./ocrPrompt');

module.exports = createOcrProfile({
    scenarioType: 'smart',
    label: '智能报销',
    ownerCity: '统一入口',
    documentTypes: [
        'normalInvoice',
        'guangzhouTaxiInvoice',
        'tripDetailList',
        'paymentRecord',
        'meetingNotice',
        'meetingApproval',
        'trainingNotice',
        'trainingApproval',
        'receptionLetter',
        'receptionList',
        'attendanceList',
        'menu',
        'other',
    ],
    keywords: ['其他事项', '发票', '付款记录', '会议', '培训', '公务接待', '接待清单', '菜单'],
    promptFocus: '作为地市场景开发入口，识别其他事项、会议费、培训费、公务接待费相关材料，便于后端自动分流。',
    outputNote: '智能报销只负责识别和分流，后端会根据 OCR 结果进入其他事项、会议费、培训费或公务接待费场景。',
    autoInferOnly: true,
    ...ocrPrompt,
});