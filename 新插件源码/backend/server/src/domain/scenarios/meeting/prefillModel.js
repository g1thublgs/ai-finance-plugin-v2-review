function cleanText(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function parseAmount(value, defaultValue = 0) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const text = String(value).replace(/[,，人民币￥¥元\s]/g, '');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return defaultValue;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : defaultValue;
}

function parseNumber(value, defaultValue = 0) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const match = String(value).replace(/[,，\s]/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return defaultValue;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : defaultValue;
}

function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function parseDate(value) {
    const text = cleanText(value);
    if (!text) return '';
    const normalized = text
        .replace(/[年月.\/]/g, '-')
        .replace(/日/g, '')
        .replace(/--+/g, '-');
    const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return text;
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseDateRange(value) {
    const text = cleanText(value);
    if (!text) return { startDate: '', endDate: '' };
    const fullRange = text.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?\s*(?:至|到|—|~)\s*(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/);
    if (fullRange) {
        return {
            startDate: `${fullRange[1]}-${fullRange[2].padStart(2, '0')}-${fullRange[3].padStart(2, '0')}`,
            endDate: `${fullRange[4]}-${fullRange[5].padStart(2, '0')}-${fullRange[6].padStart(2, '0')}`,
        };
    }
    const partial = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?\s*(?:至|到|-|—|~)\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日?/);
    if (partial) {
        const year = partial[1];
        const endYear = partial[4] || year;
        const endMonth = partial[5] || partial[2];
        return {
            startDate: `${year}-${partial[2].padStart(2, '0')}-${partial[3].padStart(2, '0')}`,
            endDate: `${endYear}-${endMonth.padStart(2, '0')}-${partial[6].padStart(2, '0')}`,
        };
    }
    const full = [...text.matchAll(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/g)];
    if (full.length >= 2) {
        const first = full[0];
        const last = full[full.length - 1];
        return {
            startDate: `${first[1]}-${first[2].padStart(2, '0')}-${first[3].padStart(2, '0')}`,
            endDate: `${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`,
        };
    }
    if (full.length === 1) {
        const first = full[0];
        const single = `${first[1]}-${first[2].padStart(2, '0')}-${first[3].padStart(2, '0')}`;
        return { startDate: single, endDate: single };
    }
    return { startDate: parseDate(text), endDate: '' };
}

function safeArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
}

function firstValue(source = {}, keys = []) {
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

function docType(item = {}) {
    return cleanText(item.recognizeType || item.docType || item.type);
}

function addEvidence(evidence, field, source) {
    if (!evidence[field]) evidence[field] = [];
    evidence[field].push(source);
}

function chooseCandidate(candidates = [], field, evidence, warnings) {
    const valid = candidates.filter(item => item.value !== undefined && item.value !== null && String(item.value).trim() !== '');
    if (!valid.length) return '';
    const first = valid[0];
    const unique = [...new Set(valid.map(item => cleanText(item.value)).filter(Boolean))];
    addEvidence(evidence, field, {
        value: first.value,
        source: first.source,
        fileName: first.fileName || '',
        recognizeType: first.recognizeType || '',
    });
    if (unique.length > 1) {
        warnings.push({
            field,
            message: `${field} 存在多个来源值，请人工核对。`,
            values: valid.map(item => ({ value: item.value, source: item.source, fileName: item.fileName || '' })),
        });
    }
    return first.value;
}

function itemText(item = {}) {
    return cleanText([
        item.rawText,
        item.meetingName,
        item.location,
        item.sellerName,
        item.payeeName,
        JSON.stringify(item.itemsDetail || []),
        JSON.stringify(item.details || []),
    ].filter(Boolean).join(' '));
}

function hasDoc(ocrItems, types) {
    const set = new Set(types);
    return ocrItems.some(item => set.has(docType(item)));
}

function amountFromDetails(item = {}, keys = []) {
    const details = [
        ...safeArray(item.itemsDetail),
        ...safeArray(item.details),
        ...safeArray(item.detailRows),
    ];
    return details.reduce((sum, row) => {
        const text = cleanText([row.name, row.projectName, row.itemName, row.remark].filter(Boolean).join(' '));
        if (!keys.some(key => text.includes(key))) return sum;
        return sum + parseAmount(firstValue(row, ['amount', 'totalAmount', '金额', '小计']), 0);
    }, 0);
}

function invoiceKey(item = {}, index = 0) {
    const number = cleanText(firstValue(item, ['invoiceNumber', 'invoiceNo', 'number', '发票号码'])).replace(/[^0-9a-zA-Z]/g, '');
    if (number) return `no:${number}`;
    const seller = cleanText(firstValue(item, ['sellerName', '销售方名称', '销售方']));
    const issueDate = cleanText(firstValue(item, ['issueDate', 'date', '开票日期']));
    const amount = parseAmount(firstValue(item, ['totalAmount', 'invoiceAmount', 'amount', '价税合计', '合计金额']), 0);
    if (seller || issueDate || amount) return `fallback:${seller}|${issueDate}|${amount}`;
    return `unknown:${index}`;
}

function normalizePageFields(context = {}) {
    const pageFields = context.pageFields || context.meetingData || context.pageExtractData?.meetingData || {};
    return {
        title: cleanText(firstValue(pageFields, ['title', 'reportName', 'reimbursementName', 'SQ_MC'])),
        applicantName: cleanText(firstValue(pageFields, ['applicantName', 'JBR_MC', 'SQ_JBR'])),
        departmentName: cleanText(firstValue(pageFields, ['departmentName', 'SSBM_MC', 'SQ_SSBM'])),
        reason: cleanText(firstValue(pageFields, ['reason', 'SQ_SY'])),
        reimbursementUnitName: cleanText(firstValue(pageFields, ['reimbursementUnitName', 'unitName', '报销单位名称'])),
        meetingName: cleanText(firstValue(pageFields, ['meetingName', 'SQ_MC'])),
        meetingCategory: cleanText(firstValue(pageFields, ['meetingCategory', 'HYLB'])),
        meetingLocation: cleanText(firstValue(pageFields, ['meetingLocation', 'HYDD', 'HYSJDD', 'meetingAddress'])),
        meetingPlanNo: cleanText(firstValue(pageFields, ['meetingPlanNo', 'HYPXBH'])),
        approvalNo: cleanText(firstValue(pageFields, ['approvalNo', 'approvalName', 'HYJYBH'])),
        meetingDays: parseNumber(firstValue(pageFields, ['meetingDays', 'HYTS']), 0),
        attendeeCount: parseNumber(firstValue(pageFields, ['attendeeCount', 'HYRS']), 0),
        staffCount: parseNumber(firstValue(pageFields, ['staffCount', 'GZRYRS']), 0),
        accommodationAmount: parseAmount(firstValue(pageFields, ['accommodationAmount', 'ZSF']), 0),
        mealAmount: parseAmount(firstValue(pageFields, ['mealAmount', 'HSF']), 0),
        venueRentAmount: parseAmount(firstValue(pageFields, ['venueRentAmount', 'venueAmount', 'venueRent', 'CDF']), 0),
        materialAmount: parseAmount(firstValue(pageFields, ['materialAmount', 'ZLF']), 0),
        transportAmount: parseAmount(firstValue(pageFields, ['transportAmount', 'JTF']), 0),
        otherAmount: parseAmount(firstValue(pageFields, ['otherAmount', 'QTFY']), 0),
        applyAmount: parseAmount(firstValue(pageFields, ['applyAmount', 'SQ_JE', 'pageAmount']), 0),
        paymentAmount: parseAmount(firstValue(pageFields, ['paymentAmount', 'ZFJE', 'ZFJEHJ']), 0),
        totalAmount: parseAmount(firstValue(pageFields, ['totalAmount', 'SQ_JE', 'pageAmount']), 0),
        attachmentCount: parseNumber(firstValue(pageFields, ['attachmentCount', 'paperAttachmentCount', 'PJZS']), 0),
        remark: cleanText(firstValue(pageFields, ['remark', 'BZ'])),
        raw: pageFields,
    };
}

function buildRecordFromOcr(item = {}, index = 0) {
    const type = docType(item);
    const amount = parseAmount(firstValue(item, ['totalAmount', 'amount', 'invoiceAmount', 'paymentAmount', '价税合计', '金额合计']), 0);
    return {
        recordKey: `meeting|${type || 'ocr'}|${index}`,
        scenarioType: 'meeting',
        sourceRecognizeType: type,
        sourceFileName: cleanText(item.sourceFileName || item.fileName),
        meetingName: cleanText(firstValue(item, ['meetingName', 'title', 'subject', 'name', '项目名称'])),
        startDate: parseDate(firstValue(item, ['startDate', 'meetingStartDate'])),
        endDate: parseDate(firstValue(item, ['endDate', 'meetingEndDate'])),
        meetingDate: cleanText(firstValue(item, ['meetingDate', 'date', 'issueDate', '日期'])),
        meetingLocation: cleanText(firstValue(item, ['location', 'meetingLocation', '地点'])),
        attendeeCount: parseNumber(firstValue(item, ['attendeeCount', 'personCount', 'participantCount', 'count', '人数']), 0),
        staffCount: parseNumber(firstValue(item, ['staffCount', '工作人员人数']), 0),
        accommodationAmount: parseAmount(firstValue(item, ['accommodationAmount', '住宿费']), 0),
        mealAmount: parseAmount(firstValue(item, ['mealAmount', '餐费预算', '伙食费']), 0),
        venueRentAmount: parseAmount(firstValue(item, ['venueRentAmount', 'venueAmount', '场地租金', '会场费']), 0),
        materialAmount: parseAmount(firstValue(item, ['materialAmount', '资料费']), 0),
        transportAmount: parseAmount(firstValue(item, ['transportAmount', '交通费']), 0),
        otherAmount: parseAmount(firstValue(item, ['otherAmount', '其他费用']), 0),
        totalAmount: amount,
        raw: item,
    };
}

async function buildPrefill({ ocrItems = [], context = {} }) {
    const repairedItems = safeArray(ocrItems).filter(item => item && typeof item === 'object');
    const page = normalizePageFields(context);
    const records = repairedItems.map(buildRecordFromOcr);
    const evidence = {};
    const warnings = [];
    const uploadResults = safeArray(context.uploadResults);

    const candidates = keyList => repairedItems.map(item => ({
        value: firstValue(item, keyList),
        source: 'ocr',
        fileName: item.sourceFileName || item.fileName,
        recognizeType: docType(item),
    }));

    const meetingName = cleanText(chooseCandidate([
        { value: page.meetingName, source: 'page' },
        ...candidates(['meetingName', 'title', 'subject']),
    ], 'meetingName', evidence, warnings));
    let startDate = parseDate(chooseCandidate([
        ...candidates(['startDate', 'meetingStartDate']),
    ], 'startDate', evidence, warnings));
    let endDate = parseDate(chooseCandidate([
        ...candidates(['endDate', 'meetingEndDate']),
    ], 'endDate', evidence, warnings));
    const meetingDate = cleanText(chooseCandidate([
        ...candidates(['meetingDate', 'date']),
    ], 'meetingDate', evidence, warnings));
    if ((!startDate || !endDate) && meetingDate) {
        const range = parseDateRange(meetingDate);
        startDate = startDate || range.startDate;
        endDate = endDate || range.endDate;
        if (range.startDate || range.endDate) {
            addEvidence(evidence, 'meetingDateRange', { value: range, source: 'ocr.meetingDate' });
        }
    }
    const meetingLocation = cleanText(chooseCandidate([
        { value: page.meetingLocation, source: 'page' },
        ...candidates(['location', 'meetingLocation', '地点']),
    ], 'meetingLocation', evidence, warnings));
    const meetingCategory = cleanText(chooseCandidate([
        { value: page.meetingCategory, source: 'page' },
        ...candidates(['meetingCategory', 'category']),
    ], 'meetingCategory', evidence, warnings));
    const meetingPlanNo = cleanText(chooseCandidate([
        { value: page.meetingPlanNo, source: 'page' },
        ...candidates(['meetingPlanNo', 'planNo']),
    ], 'meetingPlanNo', evidence, warnings));
    const approvalNo = cleanText(chooseCandidate([
        { value: page.approvalNo, source: 'page' },
        ...candidates(['approvalNo', 'approvalTitle']),
    ], 'approvalNo', evidence, warnings));
    const attendeeCount = parseNumber(chooseCandidate([
        { value: hasValue(page.raw?.attendeeCount) || hasValue(page.raw?.HYRS) ? page.attendeeCount : '', source: 'page' },
        ...candidates(['attendeeCount', 'participantCount', 'personCount', 'count']),
    ], 'attendeeCount', evidence, warnings), 0);
    const staffCount = parseNumber(chooseCandidate([
        { value: hasValue(page.raw?.staffCount) || hasValue(page.raw?.GZRYRS) ? page.staffCount : '', source: 'page' },
        ...candidates(['staffCount']),
    ], 'staffCount', evidence, warnings), 0);
    const meetingDays = parseNumber(chooseCandidate([
        { value: hasValue(page.raw?.meetingDays) || hasValue(page.raw?.HYTS) ? page.meetingDays : '', source: 'page' },
        ...candidates(['meetingDays', 'days', 'plannedDays', 'approvedDays']),
    ], 'meetingDays', evidence, warnings), 0);

    const invoices = [];
    const seenInvoices = new Set();
    repairedItems.forEach((item, index) => {
        if (docType(item) !== 'normalInvoice') return;
        const key = invoiceKey(item, index);
        if (seenInvoices.has(key)) {
            warnings.push({ field: 'invoiceAmount', message: '发现疑似重复发票，已从发票合计中去重。', invoiceKey: key });
            return;
        }
        seenInvoices.add(key);
        invoices.push(item);
    });

    const sumItemAmounts = (fieldKeys, detailKeys = [], allowedTypes = []) => repairedItems.reduce((sum, item) => {
        if (allowedTypes.length && !allowedTypes.includes(docType(item))) return sum;
        const direct = parseAmount(firstValue(item, fieldKeys), 0);
        const detail = detailKeys.length ? amountFromDetails(item, detailKeys) : 0;
        return sum + direct + detail;
    }, 0);

    const chooseAmount = (field, pageValue, pageKeys, ocrKeys, detailKeys = [], allowedTypes = []) => {
        const ocrValue = sumItemAmounts(ocrKeys, detailKeys, allowedTypes);
        return parseAmount(chooseCandidate([
            { value: pageKeys.some(key => hasValue(page.raw?.[key])) ? pageValue : '', source: 'page' },
            { value: ocrValue > 0 ? ocrValue : '', source: 'ocr' },
        ], field, evidence, warnings), 0);
    };
    const accommodationAmount = chooseAmount('accommodationAmount', page.accommodationAmount, ['accommodationAmount', 'ZSF'], ['accommodationAmount', '住宿费', 'amount', 'totalAmount'], ['住宿', '房费'], ['meetingSettlement', 'accommodationList']);
    const mealAmount = chooseAmount('mealAmount', page.mealAmount, ['mealAmount', 'HSF'], ['mealAmount', '伙食费', '餐费预算'], ['餐', '伙食'], ['meetingSettlement']);
    const venueRentAmount = chooseAmount('venueRentAmount', page.venueRentAmount, ['venueRentAmount', 'CDF'], ['venueRentAmount', 'venueAmount', '场地租金', '会场费'], ['场地', '会场', '会议室'], ['meetingSettlement']);
    const materialAmount = chooseAmount('materialAmount', page.materialAmount, ['materialAmount', 'ZLF'], ['materialAmount', '资料费'], ['资料'], ['meetingSettlement']);
    const transportAmount = chooseAmount('transportAmount', page.transportAmount, ['transportAmount', 'JTF'], ['transportAmount', '交通费'], ['交通'], ['meetingSettlement']);
    const otherAmount = chooseAmount('otherAmount', page.otherAmount, ['otherAmount', 'QTFY'], ['otherAmount', '其他费用'], ['其他'], ['meetingSettlement']);
    const invoiceAmount = invoices.reduce((sum, item) => sum + parseAmount(firstValue(item, ['totalAmount', 'invoiceAmount', 'amount', '价税合计', '合计金额']), 0), 0);
    const paymentAmount = chooseAmount('paymentAmount', page.paymentAmount, ['paymentAmount', 'ZFJE', 'ZFJEHJ'], ['paymentAmount', 'payAmount', '支付金额'], [], ['paymentProof']);
    const applyAmount = chooseAmount('applyAmount', page.applyAmount || parseAmount(context.pageAmount, 0), ['applyAmount', 'SQ_JE', 'pageAmount'], ['approvedAmount'], [], ['meetingApproval']);
    const totalAmount = page.totalAmount || parseAmount(firstValue({ invoiceAmount }, ['invoiceAmount']), 0) || (
        accommodationAmount + mealAmount + venueRentAmount + materialAmount + transportAmount + otherAmount
    );

    [
        ['hasMeetingNotice', hasDoc(repairedItems, ['meetingNotice'])],
        ['hasMeetingApproval', hasDoc(repairedItems, ['meetingApproval'])],
        ['hasMeetingPlan', hasDoc(repairedItems, ['meetingPlan'])],
        ['hasAttendanceList', hasDoc(repairedItems, ['attendanceList'])],
        ['hasSettlement', hasDoc(repairedItems, ['meetingSettlement'])],
        ['hasAccommodationList', hasDoc(repairedItems, ['accommodationList'])],
        ['hasInvoice', invoices.length > 0],
        ['hasPaymentProof', hasDoc(repairedItems, ['paymentProof'])],
    ].forEach(([field, value]) => addEvidence(evidence, field, { value, source: 'ocrRecognizeType' }));

    const paymentRows = repairedItems
        .filter(item => docType(item) === 'paymentProof')
        .map(item => ({
            payeeName: cleanText(firstValue(item, ['payeeName', 'payee', '收款人名称'])),
            payerName: cleanText(firstValue(item, ['payerName', '付款人名称'])),
            paymentMethod: cleanText(firstValue(item, ['paymentMethod', '支付方式'])),
            paymentAmount: parseAmount(firstValue(item, ['paymentAmount', 'payAmount', '支付金额']), 0),
            cardAmount: parseAmount(firstValue(item, ['cardAmount', '刷卡金额']), 0),
            cardTime: cleanText(firstValue(item, ['cardTime', '刷卡时间'])),
            fileName: cleanText(item.sourceFileName || item.fileName),
        }));

    const summary = {
        meetingName,
        startDate,
        endDate,
        meetingDate,
        meetingDays,
        meetingLocation,
        meetingCategory,
        meetingPlanNo,
        approvalNo,
        attendeeCount,
        staffCount,
        totalPeopleCount: attendeeCount + staffCount,
        hasMeetingNotice: hasDoc(repairedItems, ['meetingNotice']),
        hasMeetingApproval: hasDoc(repairedItems, ['meetingApproval']),
        hasMeetingPlan: hasDoc(repairedItems, ['meetingPlan']),
        hasAttendanceList: hasDoc(repairedItems, ['attendanceList']),
        hasSettlement: hasDoc(repairedItems, ['meetingSettlement']),
        hasAccommodationList: hasDoc(repairedItems, ['accommodationList']),
        hasInvoice: invoices.length > 0,
        hasPaymentProof: hasDoc(repairedItems, ['paymentProof']),
        accommodationAmount,
        mealAmount,
        venueRentAmount,
        materialAmount,
        transportAmount,
        otherAmount,
        invoiceAmount,
        paymentAmount,
        payments: paymentRows,
        applyAmount,
        totalAmount,
        totalAll: totalAmount,
        attachmentCount: page.attachmentCount || uploadResults.length || repairedItems.length,
        sourceDocumentCount: repairedItems.length,
        recordCount: records.length,
        pageFields: page,
    };

    ['meetingName', 'startDate', 'endDate', 'meetingLocation'].forEach(field => {
        if (!summary[field]) warnings.push({ field, message: `未归集到 ${field}，相关规则将提示人工复核。` });
    });

    return {
        scenarioType: 'meeting',
        scenarioLabel: '会议费报销',
        expenseType: 'meeting',
        records,
        summary,
        evidence,
        warnings,
        ocrItems: repairedItems,
        uploadResults,
        sourceStats: {
            ocrItemCount: repairedItems.length,
            uploadCount: uploadResults.length,
            invoiceCount: invoices.length,
            pageFieldCount: Object.values(page.raw || {}).filter(value => value !== undefined && value !== null && String(value).trim() !== '').length,
        },
    };
}

module.exports = {
    buildPrefill,
    cleanText,
    parseAmount,
    parseNumber,
    parseDate,
    firstValue,
    safeArray,
};
