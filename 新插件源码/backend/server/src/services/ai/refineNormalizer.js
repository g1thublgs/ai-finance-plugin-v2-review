const { parseJsonWithCommonRepair } = require('../ocr/jsonRepair');
const { numberValue, roundMoney, safeText } = require('../../domain/scenarios/shared/textUtils');

function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return [value];
    return [];
}

function normalizeOperationList(parsed = {}, key = 'operations') {
    const raw = parsed[key] || parsed.changes || [];
    return asArray(raw)
        .map(item => {
            if (!item || typeof item !== 'object') return null;
            return {
                op: safeText(item.op || item.action || item.type).toLowerCase(),
                target: item.target || item.where || {},
                fields: item.fields || item.patch || item.values || {},
                record: item.record || item.item || null,
                records: Array.isArray(item.records) ? item.records : null,
                reason: safeText(item.reason || item.message),
            };
        })
        .filter(item => item && item.op);
}

function findByTarget(items = [], target = {}) {
    if (!items.length) return -1;
    if (target.recordKey) {
        const index = items.findIndex(item => String(item.recordKey || '') === String(target.recordKey));
        if (index >= 0) return index;
    }
    if (target.ocrId) {
        const index = items.findIndex(item => String(item.ocrId || item.id || item.sourceId || '') === String(target.ocrId));
        if (index >= 0) return index;
    }
    if (target.index !== undefined && items[Number(target.index)]) return Number(target.index);
    if (target.ocrIndex !== undefined && items[Number(target.ocrIndex)]) return Number(target.ocrIndex);

    const name = target.name || target.person || target.personName;
    const startTime = target.startTime || target.startDate;
    const endTime = target.endTime || target.endDate;
    const from = target.from || target.departurePlace || target.startPlace;
    const to = target.to || target.destination || target.arrivalPlace;
    const sourceFileName = target.sourceFileName || target.fileName;

    return items.findIndex(item => {
        if (name && String(item.name || item.person || item.personName || '').trim() !== String(name).trim()) return false;
        if (startTime && String(item.startTime || item.startDate || '').slice(0, 10) !== String(startTime).slice(0, 10)) return false;
        if (endTime && String(item.endTime || item.endDate || '').slice(0, 10) !== String(endTime).slice(0, 10)) return false;
        if (from && String(item.from || item.departurePlace || item.startPlace || '').trim() !== String(from).trim()) return false;
        if (to && String(item.to || item.destination || item.arrivalPlace || '').trim() !== String(to).trim()) return false;
        if (sourceFileName && String(item.sourceFileName || item.fileName || '').trim() !== String(sourceFileName).trim()) return false;
        return true;
    });
}

function moneyKeys() {
    return new Set([
        'trafficAmount',
        'hotelAmount',
        'hotelStandard',
        'mealStandard',
        'mealAmount',
        'localTrafficStandard',
        'localTrafficAmount',
        'otherAmount',
        'totalAmount',
        'totalAll',
    ]);
}

function dayKeys() {
    return new Set(['hotelDays', 'hotelInvoiceCount', 'mealDays', 'localTrafficDays', 'invoiceCount']);
}

function normalizeFieldValue(key, value) {
    if (moneyKeys().has(key)) return roundMoney(numberValue(value));
    if (dayKeys().has(key)) return numberValue(value);
    return value;
}

function applyFields(record, fields = {}) {
    const blocked = new Set(['sourceItems', 'sourceSummary', 'fileBase64', 'buffer', 'base64']);
    Object.entries(fields || {}).forEach(([key, value]) => {
        if (blocked.has(key)) return;
        record[key] = normalizeFieldValue(key, value);
    });
}

function recomputeTravelRecord(record = {}) {
    record.mealAmount = roundMoney(numberValue(record.mealDays) * numberValue(record.mealStandard));
    record.localTrafficAmount = roundMoney(numberValue(record.localTrafficDays) * numberValue(record.localTrafficStandard));
    record.trafficAmount = roundMoney(numberValue(record.trafficAmount));
    record.hotelAmount = roundMoney(numberValue(record.hotelAmount));
    record.otherAmount = roundMoney(numberValue(record.otherAmount));
    record.totalAmount = roundMoney(
        numberValue(record.trafficAmount)
        + numberValue(record.hotelAmount)
        + numberValue(record.mealAmount)
        + numberValue(record.localTrafficAmount)
        + numberValue(record.otherAmount),
    );
    record.route = record.route || [record.from, record.to].filter(Boolean).join('-');
    return record;
}

function recomputeOtherRecord(record = {}) {
    record.invoiceCount = numberValue(record.invoiceCount);
    record.totalAmount = roundMoney(numberValue(record.totalAmount));
    return record;
}

function recomputeRecord(record = {}, scenarioType = '') {
    if (scenarioType === 'travel' || record.scenarioType === 'travel') return recomputeTravelRecord(record);
    if (scenarioType === 'other' || record.scenarioType === 'other') return recomputeOtherRecord(record);
    return record;
}

function total(records = [], key) {
    return roundMoney(records.reduce((sum, row) => sum + numberValue(row[key]), 0));
}

function travelSummary(records = [], original = {}) {
    return {
        ...original,
        recordCount: records.length,
        personCount: new Set(records.map(row => row.name).filter(Boolean)).size,
        trafficAmountTotal: total(records, 'trafficAmount'),
        transportAmountTotal: total(records, 'trafficAmount'),
        hotelAmountTotal: total(records, 'hotelAmount'),
        mealAmountTotal: total(records, 'mealAmount'),
        localTrafficAmountTotal: total(records, 'localTrafficAmount'),
        localTransportAmountTotal: total(records, 'localTrafficAmount'),
        otherAmountTotal: total(records, 'otherAmount'),
        totalAll: roundMoney(records.reduce((sum, row) => sum + numberValue(row.totalAmount), 0)),
    };
}

function otherSummary(records = [], original = {}) {
    const first = records[0] || {};
    return {
        ...original,
        economicSubject: first.economicSubject || original.economicSubject || '',
        purpose: first.purpose || original.purpose || '',
        invoiceCount: records.reduce((sum, row) => sum + numberValue(row.invoiceCount), 0),
        totalAmount: total(records, 'totalAmount'),
        totalAll: total(records, 'totalAmount'),
    };
}

function buildItinerary(records = []) {
    return records.map(row => ({
        recordKey: row.recordKey,
        name: row.name,
        person: row.name,
        startTime: row.startTime,
        endTime: row.endTime,
        from: row.from,
        to: row.to,
        route: [row.from, row.to].filter(Boolean).join('-'),
        routeText: [row.from, row.to].filter(Boolean).join('-'),
        tripDays: row.mealDays,
        trafficAmount: row.trafficAmount,
        hotelAmount: row.hotelAmount,
        mealAmount: row.mealAmount,
        localTrafficAmount: row.localTrafficAmount,
    }));
}

function recomputePrefill(prefill = {}) {
    const scenarioType = prefill.scenarioType || prefill.expenseType || '';
    const records = (prefill.records || []).map(row => recomputeRecord(row, scenarioType));
    prefill.records = records;
    if (scenarioType === 'travel') {
        prefill.summary = travelSummary(records, prefill.summary || {});
        prefill.itinerary = buildItinerary(records);
        prefill.travelData = {
            ...(prefill.travelData || {}),
            personal: records,
            summary: prefill.summary,
        };
    } else if (scenarioType === 'other') {
        prefill.summary = otherSummary(records, prefill.summary || {});
    }
    return prefill;
}

function applyPrefillOperations(prefill, operations = []) {
    const logs = [];
    for (const operation of operations) {
        if (operation.op === 'rebuild' && Array.isArray(operation.records)) {
            prefill.records = operation.records.map((record, index) => ({
                recordKey: record.recordKey || `${prefill.scenarioType || 'record'}|ai|${Date.now()}|${index}`,
                scenarioType: record.scenarioType || prefill.scenarioType || prefill.expenseType || '',
                ...record,
            }));
            logs.push(operation.reason || `已重构 ${prefill.records.length} 条预填明细。`);
            continue;
        }
        if (operation.op === 'clear') {
            prefill.records = [];
            logs.push(operation.reason || '已清空预填明细。');
            continue;
        }
        if (operation.op === 'add') {
            const record = {
                recordKey: operation.record?.recordKey || `${prefill.scenarioType || 'record'}|ai|${Date.now()}|${prefill.records.length}`,
                scenarioType: operation.record?.scenarioType || prefill.scenarioType || prefill.expenseType || '',
                ...(operation.record || operation.fields || {}),
            };
            prefill.records.push(record);
            logs.push(operation.reason || `已新增 1 条预填明细。`);
            continue;
        }
        const index = findByTarget(prefill.records, operation.target);
        if (index < 0) {
            logs.push(operation.reason || `未能定位预填明细，已跳过 ${operation.op} 操作。`);
            continue;
        }
        if (operation.op === 'delete') {
            const removed = prefill.records.splice(index, 1)[0];
            logs.push(operation.reason || `已删除 ${removed.name || removed.recordKey || `第 ${index + 1} 条`} 预填明细。`);
            continue;
        }
        if (operation.op === 'update') {
            applyFields(prefill.records[index], operation.fields);
            logs.push(operation.reason || `已更新 ${prefill.records[index].name || prefill.records[index].recordKey || `第 ${index + 1} 条`} 预填明细。`);
        }
    }
    return logs;
}

function applyOcrOperations(ocrItems = [], operations = []) {
    const next = clone(ocrItems);
    const logs = [];
    for (const operation of operations) {
        if (operation.op === 'add') {
            next.push(operation.record || operation.fields || {});
            logs.push(operation.reason || '已新增 1 条 OCR 识别数据。');
            continue;
        }
        const index = findByTarget(next, operation.target);
        if (index < 0) {
            logs.push(operation.reason || `未能定位 OCR 识别数据，已跳过 ${operation.op} 操作。`);
            continue;
        }
        if (operation.op === 'delete') {
            next.splice(index, 1);
            logs.push(operation.reason || '已删除 1 条 OCR 识别数据。');
            continue;
        }
        if (operation.op === 'update') {
            Object.assign(next[index], operation.fields || {});
            logs.push(operation.reason || '已更新 1 条 OCR 识别数据。');
        }
    }
    return { ocrItems: next, logs };
}

function parseModelJson(text) {
    const parsed = parseJsonWithCommonRepair(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('模型未返回 JSON 对象。');
    }
    return parsed;
}

function normalizeModelResult({ originalPrefill = {}, originalOcrItems = [], modelText = '', instruction = '', modelName = '' }) {
    const parsed = parseModelJson(modelText);
    const responseType = safeText(parsed.responseType || parsed.mode || parsed.intent).toLowerCase();
    const answer = safeText(parsed.answer || parsed.response || parsed.message || parsed.content);
    const changeLog = asArray(parsed.changeLog).map(safeText).filter(Boolean);
    const operations = normalizeOperationList(parsed, 'operations');
    const ocrOperations = normalizeOperationList(parsed, 'ocrOperations');

    if (responseType === 'answer' && !operations.length && !ocrOperations.length) {
        return {
            ...clone(originalPrefill),
            responseType: 'answer',
            answer,
            operations: [],
            ocrOperations: [],
            changeLog,
            aiModel: modelName,
            engine: 'qwen-text-model',
            refinedAt: new Date().toISOString(),
        };
    }

    const next = clone(originalPrefill);
    next.records = Array.isArray(next.records) ? next.records : [];

    let logs = [];
    if (!operations.length && Array.isArray(parsed.records)) {
        next.records = parsed.records;
        logs.push(`模型返回完整 records，已按 ${parsed.records.length} 条明细更新。`);
    } else {
        logs = applyPrefillOperations(next, operations);
    }

    let ocrResult = { ocrItems: Array.isArray(originalOcrItems) ? clone(originalOcrItems) : [], logs: [] };
    if (ocrOperations.length) ocrResult = applyOcrOperations(originalOcrItems, ocrOperations);
    if (Array.isArray(parsed.ocrItems) && parsed.ocrItems.length) {
        ocrResult.ocrItems = parsed.ocrItems;
        ocrResult.logs.push(`模型返回完整 OCR 数据，已更新为 ${parsed.ocrItems.length} 条。`);
    }

    recomputePrefill(next);

    return {
        ...next,
        responseType: 'adjust',
        answer,
        operations,
        ocrOperations,
        ocrItems: ocrResult.ocrItems,
        changeLog: [...changeLog, ...logs, ...ocrResult.logs].filter(Boolean).length
            ? [...changeLog, ...logs, ...ocrResult.logs].filter(Boolean)
            : [`模型未返回可应用的修改操作，原预填数据保持不变：${instruction}`],
        aiModel: modelName,
        engine: 'qwen-text-model',
        refinedAt: new Date().toISOString(),
    };
}

module.exports = {
    normalizeModelResult,
    parseModelJson,
    recomputePrefill,
};
