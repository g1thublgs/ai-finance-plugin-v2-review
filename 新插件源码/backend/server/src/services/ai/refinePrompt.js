const { safeText } = require('../../domain/scenarios/shared/textUtils');

const TRAVEL_EDITABLE_FIELDS = [
    'recordKey',
    'scenarioType',
    'name',
    'rank',
    'startTime',
    'endTime',
    'from',
    'to',
    'route',
    'transportTool',
    'trafficAmount',
    'hotelDays',
    'hotelInvoiceCount',
    'hotelAmount',
    'hotelStandard',
    'mealDays',
    'mealStandard',
    'mealAmount',
    'localTrafficDays',
    'localTrafficStandard',
    'localTrafficAmount',
    'otherAmount',
    'totalAmount',
    'reason',
    'remark',
];

const OTHER_EDITABLE_FIELDS = [
    'recordKey',
    'scenarioType',
    'title',
    'reason',
    'economicSubject',
    'purpose',
    'buyerName',
    'invoiceCount',
    'totalAmount',
    'invoiceNumbers',
    'matchedBudgetIndicatorId',
    'matched',
    'projectNames',
    'remark',
];

function truncate(value, maxLength = 600) {
    const text = safeText(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function stripHeavyFields(value, depth = 0) {
    if (depth > 4) return truncate(value, 200);
    if (Array.isArray(value)) return value.slice(0, 20).map(item => stripHeavyFields(item, depth + 1));
    if (value && typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, val]) => {
            if (/base64|buffer|content|image|bytes/i.test(key)) return;
            output[key] = stripHeavyFields(val, depth + 1);
        });
        return output;
    }
    return typeof value === 'string' ? truncate(value, 500) : value;
}

function editableFieldsForScenario(scenarioType) {
    if (scenarioType === 'travel') return TRAVEL_EDITABLE_FIELDS;
    if (scenarioType === 'other') return OTHER_EDITABLE_FIELDS;
    return [...new Set([...TRAVEL_EDITABLE_FIELDS, ...OTHER_EDITABLE_FIELDS])];
}

function compactRecord(record = {}, fields) {
    const output = {};
    fields.forEach(key => {
        if (record[key] !== undefined) output[key] = record[key];
    });
    return output;
}

function compactOcrItem(item = {}, index) {
    const output = stripHeavyFields(item);
    return {
        ocrIndex: index,
        ocrId: item.ocrId || item.id || item.sourceId || `ocr-${index + 1}`,
        recognizeType: item.recognizeType || item.docType || item.type || '',
        sourceFileName: item.sourceFileName || item.fileName || item.originalFileName || '',
        pageNumber: item.pageNumber || item.page || '',
        ...output,
    };
}

function compactUploadResult(item = {}, index) {
    return {
        index,
        taskId: item.taskId || '',
        fileId: item.fileId || '',
        fileName: item.fileName || item.name || item.originalName || '',
        status: item.status || '',
        success: !!item.success,
        completedCount: item.completedCount || item.ocrCompletedCount || 0,
        totalModels: item.totalModels || item.totalOcrModels || 0,
    };
}

function buildModelPayload({ instruction, prefillData = {}, ocrItems = [], uploadResults = [] }) {
    const scenarioType = prefillData.scenarioType || prefillData.expenseType || '';
    const fields = editableFieldsForScenario(scenarioType);
    return {
        instruction,
        scenarioType,
        editableFields: fields,
        prefillData: {
            scenarioType,
            expenseType: prefillData.expenseType || scenarioType,
            records: (prefillData.records || []).map(record => compactRecord(record, fields)),
            summary: stripHeavyFields(prefillData.summary || {}),
            itinerary: Array.isArray(prefillData.itinerary)
                ? prefillData.itinerary.map(item => stripHeavyFields(item))
                : [],
        },
        ocrItems: (ocrItems.length ? ocrItems : (prefillData.ocrItems || [])).map(compactOcrItem),
        uploadResults: (uploadResults.length ? uploadResults : (prefillData.uploadResults || [])).map(compactUploadResult),
    };
}

function buildSystemPrompt() {
    return [
        '你是 AI 财务系统的智能调整与问答助手，只处理用户已识别、已归集的报销数据。',
        '必须只返回一个合法 JSON 对象，不要 Markdown，不要解释 JSON 之外的任何内容。',
        '如果用户要求修改、删除、新增、清空、重构行程、重新归集、按上限调整等会改变数据的动作，responseType 必须为 "adjust"。',
        '如果用户只是查询、询问来源、解释、统计、分析或建议，responseType 必须为 "answer"，operations 和 ocrOperations 必须为空数组。',
        '不得编造 OCR 中不存在的人员、地点、日期、金额、票号、文件来源。证据不足时保持原数据，并在 answer 或 changeLog 说明。',
        '优先通过 recordKey 定位预填明细；没有 recordKey 时可用 index、name、startTime、endTime、from、to 组合定位。',
        '预填数据只能通过 operations 返回补丁，不要整段返回超大原始文件或图片内容。',
        '支持的预填 operations：update、add、delete、clear、rebuild。update 需要 fields；add 需要 record；delete 需要 target；rebuild 需要 records。',
        '支持的 OCR ocrOperations：update、add、delete。只有用户明确要求修改 OCR 结果时才返回。',
        '差旅费中 mealAmount 必须等于 mealDays×mealStandard；localTrafficAmount 必须等于 localTrafficDays×localTrafficStandard；如果调整标准或天数，要返回对应标准和天数字段，系统会重新计算金额。',
        '如果用户要求“市内交通费每月上限 500”等限制，应按人按可识别月份压减 localTrafficDays/localTrafficStandard 或 localTrafficAmount 相关字段，并在 changeLog 说明。',
        '返回结构固定为：{"responseType":"adjust|answer","answer":"","operations":[],"ocrOperations":[],"changeLog":[]}。',
        'operation 示例：{"op":"update","target":{"recordKey":"travel|张三|2026-01-01|2026-01-03|A|B"},"fields":{"mealDays":0,"mealStandard":0}}。',
        'answer 示例：{"responseType":"answer","answer":"张三住宿费来源于 XX.pdf 第 2 页的 accommodationList 记录。","operations":[],"ocrOperations":[],"changeLog":[]}。',
    ].join('\n');
}

module.exports = {
    buildModelPayload,
    buildSystemPrompt,
    editableFieldsForScenario,
};
