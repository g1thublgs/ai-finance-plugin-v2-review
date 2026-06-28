const DOCUMENT_SCHEMAS = {
    normalInvoice: {
        label: '普通发票/数电票/增值税发票',
        template: { recognizeType: 'normalInvoice', invoiceNumber: '', invoiceCode: '', issueDate: '', payerName: '', buyerTaxNo: '', sellerName: '', sellerTaxNo: '', totalAmount: '', taxAmount: '', comment: '', itemsDetail: [{ name: '', specification: '', unit: '', quantity: '', amount: '', taxAmount: '' }], rawText: '' },
        keyFields: ['invoiceNumber', 'payerName', 'sellerName', 'totalAmount', 'itemsDetail'],
    },
    guangzhouTaxiInvoice: {
        label: '出租车票',
        template: { recognizeType: 'guangzhouTaxiInvoice', invoiceNumber: '', invoiceCode: '', serialNumber: '', issueDate: '', rideDate: '', startTime: '', endTime: '', carPlate: '', distanceKm: '', amount: '', rawText: '' },
        keyFields: ['invoiceCode', 'invoiceNumber', 'serialNumber', 'rideDate', 'carPlate', 'amount'],
    },
    tripDetailList: {
        label: '公务出行明细表',
        template: { recognizeType: 'tripDetailList', department: '', personName: '', rank: '', monthlyLimit: '', totalAmount: '', detailRows: [{ sequence: '', travelDate: '', reason: '', transportType: '', claimAmount: '', remark: '' }], rawText: '' },
        keyFields: ['personName', 'monthlyLimit', 'totalAmount', 'detailRows'],
    },
    paymentRecord: {
        label: '付款截图/付款记录',
        template: { recognizeType: 'paymentRecord', transactionTime: '', accountTime: '', cardNumber: '', summary: '', payeeName: '', amount: '', currency: '', balance: '', rawText: '' },
        keyFields: ['transactionTime', 'payeeName', 'amount'],
    },
    meetingNotice: {
        label: '会议通知',
        template: { recognizeType: 'meetingNotice', meetingName: '', startDate: '', endDate: '', location: '', organizer: '', participantCount: '', rawText: '' },
        keyFields: ['meetingName', 'startDate', 'location', 'rawText'],
    },
    meetingApproval: {
        label: '会议审批单',
        template: { recognizeType: 'meetingApproval', meetingName: '', approvalDate: '', startDate: '', endDate: '', location: '', budgetAmount: '', rawText: '' },
        keyFields: ['meetingName', 'approvalDate', 'budgetAmount', 'rawText'],
    },
    trainingNotice: {
        label: '培训通知',
        template: { recognizeType: 'trainingNotice', trainingName: '', startDate: '', endDate: '', location: '', organizer: '', traineeCount: '', rawText: '' },
        keyFields: ['trainingName', 'startDate', 'location', 'rawText'],
    },
    trainingApproval: {
        label: '培训审批单',
        template: { recognizeType: 'trainingApproval', trainingName: '', approvalDate: '', startDate: '', endDate: '', location: '', budgetAmount: '', rawText: '' },
        keyFields: ['trainingName', 'approvalDate', 'budgetAmount', 'rawText'],
    },
    receptionLetter: {
        label: '公务接待函',
        template: { recognizeType: 'receptionLetter', visitorUnit: '', visitorNames: [], receptionDate: '', receptionPlace: '', receptionReason: '', rawText: '' },
        keyFields: ['visitorUnit', 'receptionDate', 'receptionReason', 'rawText'],
    },
    receptionList: {
        label: '公务接待清单',
        template: { recognizeType: 'receptionList', receptionDate: '', receptionPlace: '', visitorCount: '', staffCount: '', totalAmount: '', rawText: '' },
        keyFields: ['receptionDate', 'visitorCount', 'totalAmount', 'rawText'],
    },
    attendanceList: {
        label: '参会/参训人员名单',
        template: { recognizeType: 'attendanceList', names: [], unit: '', count: '', rawText: '' },
        keyFields: ['names', 'count', 'rawText'],
    },
    menu: {
        label: '菜单/餐饮明细',
        template: { recognizeType: 'menu', mealDate: '', restaurantName: '', totalAmount: '', itemsDetail: [{ name: '', amount: '' }], rawText: '' },
        keyFields: ['restaurantName', 'totalAmount', 'itemsDetail', 'rawText'],
    },
    other: {
        label: '其他可读材料',
        template: { recognizeType: 'other', rawText: '' },
        keyFields: ['rawText'],
    },
};

const DOC_TYPE_ALIASES = {
    invoice: 'normalInvoice',
    normal_invoice: 'normalInvoice',
    normalInvoice: 'normalInvoice',
    发票: 'normalInvoice',
    普通发票: 'normalInvoice',
    增值税发票: 'normalInvoice',
    taxiInvoice: 'guangzhouTaxiInvoice',
    guangzhouTaxiInvoice: 'guangzhouTaxiInvoice',
    出租车票: 'guangzhouTaxiInvoice',
    tripDetailList: 'tripDetailList',
    trip_detail_list: 'tripDetailList',
    公务出行明细表: 'tripDetailList',
    paymentRecord: 'paymentRecord',
    payment_record: 'paymentRecord',
    付款记录: 'paymentRecord',
    meeting_notice: 'meetingNotice',
    meetingNotice: 'meetingNotice',
    会议通知: 'meetingNotice',
    meeting_approval: 'meetingApproval',
    meetingApproval: 'meetingApproval',
    会议审批单: 'meetingApproval',
    training_notice: 'trainingNotice',
    trainingNotice: 'trainingNotice',
    培训通知: 'trainingNotice',
    training_approval: 'trainingApproval',
    trainingApproval: 'trainingApproval',
    培训审批单: 'trainingApproval',
    reception_letter: 'receptionLetter',
    receptionLetter: 'receptionLetter',
    公务接待函: 'receptionLetter',
    reception_list: 'receptionList',
    receptionList: 'receptionList',
    公务接待清单: 'receptionList',
    menu: 'menu',
    菜单: 'menu',
};

function canonicalDocType(value) {
    const key = String(value || '').trim();
    if (DOCUMENT_SCHEMAS[key]) return key;
    return DOC_TYPE_ALIASES[key] || DOC_TYPE_ALIASES[key.replace(/\s+/g, '')] || DOC_TYPE_ALIASES[key.toLowerCase()] || 'other';
}

module.exports = {
    DOCUMENT_SCHEMAS,
    DOC_TYPE_ALIASES,
    canonicalDocType,
};