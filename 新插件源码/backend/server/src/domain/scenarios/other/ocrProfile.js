const { createOcrProfile } = require('../shared/ocrProfileFactory');
const ocrPrompt = require('./ocrPrompt');

module.exports = createOcrProfile({
    scenarioType: 'other',
    label: '其他事项报销',
    ownerCity: 'D市',
    documentTypes: [
        'normalInvoice',
        'guangzhouTaxiInvoice',
        'tripDetailList',
        'paymentRecord',
        'other',
    ],
    keywords: [
        '普通发票',
        '数电票',
        '增值税发票',
        '购买方',
        '销售方',
        '价税合计',
        '项目名称',
        '电费',
        '办公用品',
        '维修',
        '交通补贴',
        '出租车',
        '广州出租汽车统一车票',
        '公务出行明细表',
        '付款截图',
    ],
    promptFocus: '仅围绕其他事项报销识别。优先识别普通发票、广州出租汽车统一车票、公务出行明细表和付款记录截图；普通发票必须保留发票号码、购买方、销售方、价税合计、开票日期和项目明细。',
    outputNote: '其他事项 OCR 结果用于预算指标匹配、发票金额汇总、交通补贴票据与出行明细表比对。不需要识别差旅行程、会议安排、培训安排或公务接待清单。',
    ...ocrPrompt,
});
