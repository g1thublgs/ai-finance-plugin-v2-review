function safeText(value) {
    return String(value || '').trim();
}

function numberValue(value) {
    const n = Number(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function firstValue(item = {}, keys = []) {
    for (const key of keys) {
        if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') return item[key];
    }
    return '';
}

function buildRecordFromOcr(item = {}, index = 0) {
    const amount = numberValue(firstValue(item, ['totalAmount', 'amount', 'invoiceAmount', '价税合计', '金额合计']));
    return {
        recordKey: `reception|${Date.now()}|${index}`,
        scenarioType: 'reception',
        sourceRecognizeType: safeText(item.recognizeType || item.docType || item.type),
        title: safeText(firstValue(item, ['receptionSubject', 'title', 'subject', 'name', '项目名称'])),
        applicantName: safeText(firstValue(item, ['applicantName', 'requesterName', 'personName', 'name', '报销人'])),
        departmentName: safeText(firstValue(item, ['departmentName', 'department', 'dept', '部门'])),
        businessDate: safeText(firstValue(item, ['receptionDate', 'startDate', 'date', 'issueDate', '日期'])),
        participantCount: safeText(firstValue(item, ['guestCount', 'personCount', 'attendeeCount', 'traineeCount', 'guestCount', '人数'])),
        totalAmount: amount,
        remark: safeText(firstValue(item, ['remark', 'note', '摘要', '备注'])),
        raw: item,
    };
}

async function buildPrefill({ ocrItems = [], context = {} }) {
    const records = (ocrItems || []).map(buildRecordFromOcr);
    const totalAmount = records.reduce((sum, item) => sum + numberValue(item.totalAmount), 0);
    return {
        scenarioType: 'reception',
        scenarioLabel: '公务接待费报销',
        expenseType: 'reception',
        records,
        summary: {
            recordCount: records.length,
            totalAmount,
            sourceDocumentCount: (ocrItems || []).length,
        },
        ocrItems,
        uploadResults: context.uploadResults || [],
        developmentNote: '请结合本地市政策继续完善字段归集、分组汇总和规则审核逻辑。',
    };
}

module.exports = {
    buildPrefill,
};