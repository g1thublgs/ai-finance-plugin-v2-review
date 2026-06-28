const { asArray, firstValue, numberValue, roundMoney, safeText } = require('../shared/textUtils');

function normalizeType(item = {}) {
    const raw = safeText(item.recognizeType || item.docType || item.type);
    const mapping = {
        meeting_notice: 'meetingNotice',
        会议通知: 'meetingNotice',
        meetingApproval: 'meetingPlan',
        meeting_approval: 'meetingPlan',
        meetingPlan: 'meetingPlan',
        meeting_plan: 'meetingPlan',
        会议审批单: 'meetingPlan',
        会议审批文件: 'meetingPlan',
        会议计划: 'meetingPlan',
        会议计划表: 'meetingPlan',
        会议计划审批表: 'meetingPlan',
        attendance_list: 'attendanceList',
        attendanceList: 'attendanceList',
        签到表: 'attendanceList',
        参会人员名单: 'attendanceList',
        人员名单: 'attendanceList',
        fee_settlement: 'feeSettlement',
        feeSettlement: 'feeSettlement',
        会议结算单: 'feeSettlement',
        费用明细: 'feeSettlement',
        费用原始明细: 'feeSettlement',
        accommodation_list: 'accommodationList',
        accommodationList: 'accommodationList',
        住宿清单: 'accommodationList',
        normal_invoice: 'normalInvoice',
        invoice: 'normalInvoice',
        normalInvoice: 'normalInvoice',
        发票: 'normalInvoice',
    };
    return mapping[raw] || raw || 'other';
}

function normalizeOcrItems(ocrItems = []) {
    return asArray(ocrItems).filter(item => item && typeof item === 'object').map(item => ({
        ...item,
        recognizeType: normalizeType(item),
    }));
}

function textOf(item = {}) {
    const clone = { ...item };
    delete clone.fileBase64;
    delete clone.base64;
    delete clone.fileContent;
    return [
        item.rawText,
        item.meetingName,
        item.organizerUnit,
        item.meetingLocation,
        item.venueName,
        item.attendeeScope,
        item.sellerName,
        JSON.stringify(clone),
    ].filter(Boolean).join(' ');
}

function firstItem(items, type) {
    return items.find(item => item.recognizeType === type) || {};
}

function itemsByType(items, type) {
    return items.filter(item => item.recognizeType === type);
}

function amountFromDetails(rows = []) {
    return asArray(rows).reduce((sum, row) => sum + numberValue(row && row.amount), 0);
}

function amountFromDocument(item = {}) {
    const direct = numberValue(firstValue(item, ['totalAmount', 'amount', 'invoiceAmount', '价税合计', '金额合计']));
    if (direct) return direct;
    const detailTotal = amountFromDetails(item.itemsDetail);
    if (detailTotal) return detailTotal;
    return amountFromDetails(item.roomItems);
}

function classifyFeeName(name) {
    const text = safeText(name);
    if (/伙食|餐费|餐饮|用餐|饭|菜/.test(text)) return 'mealAmount';
    if (/住宿|房费|客房|房型|酒店|宾馆|套房/.test(text)) return 'accommodationAmount';
    if (/场地|会场|会议室|租金|场租/.test(text)) return 'venueAmount';
    return 'otherAmount';
}

function collectFeeBreakdown(items = []) {
    const feeBreakdown = {
        mealAmount: 0,
        accommodationAmount: 0,
        venueAmount: 0,
        otherAmount: 0,
    };

    itemsByType(items, 'feeSettlement').forEach(item => {
        asArray(item.itemsDetail).forEach(row => {
            const amount = numberValue(row && row.amount);
            if (!amount) return;
            const key = classifyFeeName([row.name, row.remark].filter(Boolean).join(' '));
            feeBreakdown[key] = roundMoney(feeBreakdown[key] + amount);
        });
    });

    itemsByType(items, 'accommodationList').forEach(item => {
        const roomTotal = amountFromDetails(item.roomItems);
        const directTotal = numberValue(item.totalAmount);
        const amount = roomTotal || directTotal;
        if (amount) feeBreakdown.accommodationAmount = roundMoney(feeBreakdown.accommodationAmount + amount);
    });

    return feeBreakdown;
}

function extractDateText(value) {
    const match = safeText(value).match(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/);
    return match ? match[0].replace(/年|月/g, '-').replace(/日/g, '').replace(/\./g, '-').replace(/\//g, '-') : '';
}

function parseDate(value) {
    const text = extractDateText(value);
    if (!text) return null;
    const parts = text.split('-').map(part => Number(part));
    if (parts.length < 3 || parts.some(part => !Number.isFinite(part))) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function isoDate(value) {
    const date = parseDate(value);
    return date ? date.toISOString().slice(0, 10) : '';
}

function isoFromParts(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) return '';
    return date.toISOString().slice(0, 10);
}

function dateTokens(text) {
    const pattern = /(?:(\d{4})\s*(?:年|[-/.])\s*)?(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*(?:日)?\s*(?:上午|下午|晚上|晚间|全天)?/g;
    return [...safeText(text).matchAll(pattern)]
        .map(match => ({
            year: match[1] ? Number(match[1]) : null,
            month: Number(match[2]),
            day: Number(match[3]),
            start: match.index,
            end: match.index + match[0].length,
        }))
        .filter(token => token.month >= 1 && token.month <= 12 && token.day >= 1 && token.day <= 31);
}

function tokenToIso(token, inheritedYear = null) {
    const year = token.year || inheritedYear;
    if (!year) return '';
    return isoFromParts(year, token.month, token.day);
}

function orderedRange(startDate, endDate) {
    if (!startDate || !endDate) return { startDate: '', endDate: '' };
    return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

function hasRangeSeparator(gap, endHasYear) {
    const compact = safeText(gap).replace(/\s+/g, '');
    if (!compact) return !endHasYear;
    if (compact.length > 16) return false;
    return /至|到|起止|起至|[-—–－~～]/.test(compact);
}

function extractExplicitDateRange(text) {
    const body = safeText(text);
    const tokens = dateTokens(body);
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const startToken = tokens[index];
        const endToken = tokens[index + 1];
        if (!startToken.year) continue;
        const gap = body.slice(startToken.end, endToken.start);
        if (!hasRangeSeparator(gap, Boolean(endToken.year))) continue;
        const startDate = tokenToIso(startToken);
        const endDate = tokenToIso(endToken, startToken.year);
        if (startDate && endDate) return orderedRange(startDate, endDate);
    }
    return { startDate: '', endDate: '' };
}

function unique(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function fallbackDateRangeFromText(text) {
    const fullDates = unique(dateTokens(text).filter(token => token.year).map(token => tokenToIso(token)));
    if (fullDates.length > 2) return { startDate: '', endDate: '' };
    const explicit = extractExplicitDateRange(text);
    if (explicit.startDate && explicit.endDate) return explicit;
    if (fullDates.length === 1) return { startDate: fullDates[0], endDate: fullDates[0] };
    if (fullDates.length === 2) return orderedRange(fullDates[0], fullDates[1]);
    return { startDate: '', endDate: '' };
}

function extractDateRangeFromText(text) {
    const body = safeText(text);
    const keywordLines = body
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => ['会议时间', '会期', '召开时间', '会议日期'].some(keyword => line.includes(keyword)))
        .filter(line => !line.includes('培训时间'));
    for (const line of keywordLines) {
        const range = extractExplicitDateRange(line);
        if (range.startDate && range.endDate) return range;
        const fallback = fallbackDateRangeFromText(line);
        if (fallback.startDate && fallback.endDate) return fallback;
    }
    return fallbackDateRangeFromText(body);
}

function calculateMeetingDays(summary = {}) {
    const start = parseDate(summary.startDate);
    const end = parseDate(summary.endDate);
    if (start && end) {
        const left = start <= end ? start : end;
        const right = start <= end ? end : start;
        return {
            meetingDays: Math.max(Math.round((right - left) / 86400000) + 1, 1),
            startDate: left.toISOString().slice(0, 10),
            endDate: right.toISOString().slice(0, 10),
            source: 'meetingNoticeDateRange',
        };
    }
    const explicit = numberValue(summary.meetingDays || summary.approvedDays);
    if (explicit) return { meetingDays: explicit, startDate: summary.startDate || '', endDate: summary.endDate || '', source: 'explicitDays' };
    return { meetingDays: 0, startDate: summary.startDate || '', endDate: summary.endDate || '', source: 'unrecognized' };
}

function uniqueNames(names = []) {
    return [...new Set(asArray(names).map(safeText).filter(Boolean))];
}

function resolveAttendance(items = []) {
    const attendance = firstItem(items, 'attendanceList');
    if (!attendance.recognizeType) {
        return { attendanceCount: 0, attendanceCountSource: '未发现签到表或参会人员名单 OCR。' };
    }
    const count = numberValue(attendance.count || attendance.attendeeCount || attendance.attendeeCountText);
    if (count) return { attendanceCount: count, attendanceCountSource: 'attendanceList.count' };
    const names = uniqueNames(attendance.names);
    if (names.length) return { attendanceCount: names.length, attendanceCountSource: 'attendanceList.names 去空去重计数' };
    return { attendanceCount: 0, attendanceCountSource: '签到表 OCR 未能稳定识别人数。' };
}

function normalizePageExpense(context = {}) {
    const raw = context.meetingData
        || (context.pageSnapshot && context.pageSnapshot.meetingData)
        || (context.pageExtractData && context.pageExtractData.meetingData)
        || {};
    return {
        days: numberValue(raw.days),
        peopleCount: numberValue(raw.peopleCount),
        mealAmount: numberValue(raw.mealAmount),
        accommodationAmount: numberValue(raw.accommodationAmount),
        venueAmount: numberValue(raw.venueAmount),
        otherAmount: numberValue(raw.otherAmount),
        totalAmount: numberValue(raw.totalAmount),
        paperAttachmentCount: numberValue(raw.paperAttachmentCount),
        meetingPlanNo: safeText(raw.meetingPlanNo),
        reimbursementUnitName: safeText(raw.reimbursementUnitName),
        departmentName: safeText(raw.departmentName),
    };
}

function attachmentText(context = {}, items = []) {
    const attachmentNames = asArray(context.attachments).map(item => [
        item.fileName,
        item.name,
        item.attachmentType,
        item.type,
    ].filter(Boolean).join(' '));
    return [...attachmentNames, ...items.map(textOf)].join(' ');
}

function hasAny(text, keywords = []) {
    return keywords.some(keyword => safeText(text).includes(keyword));
}

function isCentralTaxAdministration(unitName) {
    const text = safeText(unitName).replace(/\s+/g, '');
    if (text === '国家税务总局') return true;
    if (!text.startsWith('国家税务总局')) return false;
    if (/(省|市|县|区|旗|自治州|地区).{0,12}税务局/.test(text)) return false;
    return /国家税务总局(机关|办公厅|.+司|.+局|.+中心)/.test(text);
}

function buildAttachmentChecklist(context = {}, items = []) {
    const allText = attachmentText(context, items);
    const hasFeeDetailByType = itemsByType(items, 'feeSettlement').some(item => asArray(item.itemsDetail).length > 0);
    return {
        hasMeetingPlan: hasAny(allText, ['会议计划', '计划表', '会议计划审批表']) || itemsByType(items, 'meetingPlan').length > 0,
        hasMeetingNotice: hasAny(allText, ['会议通知']) || itemsByType(items, 'meetingNotice').length > 0,
        hasAttendanceList: hasAny(allText, ['签到表', '参会人员名单', '人员名单']) || itemsByType(items, 'attendanceList').length > 0,
        hasFeeDetail: hasAny(allText, ['费用明细', '费用原始明细', '明细单']) || hasFeeDetailByType,
        hasSettlement: hasAny(allText, ['结算单', '会议结算单']) || itemsByType(items, 'feeSettlement').length > 0,
    };
}

function determineMeetingCategory(summary = {}) {
    const unitName = safeText(summary.reimbursementUnitName || summary.departmentName);
    const meetingName = safeText(summary.meetingName);
    const attendeeScope = safeText(summary.attendeeScope);
    const isCentralUnit = isCentralTaxAdministration(unitName);
    if (isCentralUnit && meetingName.includes('全国税务工作会议')) {
        return {
            meetingCategory: '二类会议',
            meetingCategoryReason: '报销单位判定为国家税务总局总局机关或内设机构，且会议名称包含“全国税务工作会议”。',
        };
    }
    if (
        isCentralUnit
        && ['各省', '计划单列市', '分管局领导', '部门主要负责人'].some(keyword => attendeeScope.includes(keyword))
    ) {
        return {
            meetingCategory: '三类会议',
            meetingCategoryReason: '报销单位判定为国家税务总局总局机关或内设机构，且会议通知参会范围命中三类会议关键词。',
        };
    }
    if (unitName.includes('省税务局') && (meetingName.includes('年度工作会议') || meetingName.includes('省税务工作会议'))) {
        return {
            meetingCategory: '三类会议',
            meetingCategoryReason: '报销单位名称包含“省税务局”，且会议名称命中“年度工作会议/省税务工作会议”。',
        };
    }
    return {
        meetingCategory: '四类会议',
        meetingCategoryReason: '第一轮保守口径：未明确满足二类或三类会议条件，默认按四类会议处理。',
    };
}

function buildSummary(items = [], context = {}) {
    const notice = firstItem(items, 'meetingNotice');
    const plan = firstItem(items, 'meetingPlan');
    const pageExpense = normalizePageExpense(context);
    const range = {
        startDate: isoDate(notice.startDate) || isoDate(plan.startDate),
        endDate: isoDate(notice.endDate) || isoDate(plan.endDate),
    };
    if (!range.startDate || !range.endDate) {
        const extracted = extractDateRangeFromText([textOf(notice), textOf(plan), items.map(textOf).join(' ')].join(' '));
        range.startDate = range.startDate || extracted.startDate;
        range.endDate = range.endDate || extracted.endDate;
    }

    const attendance = resolveAttendance(items);
    const feeBreakdown = collectFeeBreakdown(items);
    const invoiceTotalAmount = roundMoney(itemsByType(items, 'normalInvoice').reduce((sum, item) => sum + amountFromDocument(item), 0));
    const settlementTotalAmount = roundMoney(
        [...itemsByType(items, 'feeSettlement'), ...itemsByType(items, 'accommodationList')]
            .reduce((sum, item) => sum + amountFromDocument(item), 0),
    );
    const summary = {
        meetingName: safeText(firstValue(notice, ['meetingName', 'title']) || firstValue(plan, ['meetingName', 'title'])),
        reimbursementUnitName: safeText(pageExpense.reimbursementUnitName || context.reimbursementUnitName || context.unitName || context.pageBasics?.unitName || firstValue(plan, ['organizerUnit']) || firstValue(notice, ['organizerUnit'])),
        departmentName: safeText(pageExpense.departmentName || context.departmentName || context.pageBasics?.departmentName || context.pageBasics?.unitName || ''),
        meetingCategory: '',
        meetingCategoryReason: '',
        meetingLocation: safeText(firstValue(notice, ['meetingLocation', 'venueName', 'place', 'address'])),
        attendeeScope: safeText(firstValue(notice, ['attendeeScope', 'attendees', 'scope'])),
        startDate: range.startDate,
        endDate: range.endDate,
        meetingDays: 0,
        attendanceCount: attendance.attendanceCount,
        attendanceCountSource: attendance.attendanceCountSource,
        invoiceTotalAmount,
        settlementTotalAmount,
        feeBreakdown,
        pageExpense,
        attachmentChecklist: buildAttachmentChecklist(context, items),
        keywordHits: [],
    };
    const days = calculateMeetingDays({
        ...summary,
        approvedDays: plan.approvedDays,
    });
    summary.startDate = days.startDate || summary.startDate;
    summary.endDate = days.endDate || summary.endDate;
    summary.meetingDays = days.meetingDays;
    summary.meetingDaysSource = days.source;
    const category = determineMeetingCategory(summary);
    summary.meetingCategory = category.meetingCategory;
    summary.meetingCategoryReason = category.meetingCategoryReason;
    return summary;
}

function buildRecords(summary = {}, context = {}) {
    if (!summary.meetingName && !summary.invoiceTotalAmount && !summary.pageExpense.totalAmount) return [];
    return [{
        recordKey: `meeting|${context.caseId || Date.now()}`,
        scenarioType: 'meeting',
        title: summary.meetingName || '会议费报销',
        meetingName: summary.meetingName,
        reimbursementUnitName: summary.reimbursementUnitName,
        departmentName: summary.departmentName,
        meetingCategory: summary.meetingCategory,
        meetingLocation: summary.meetingLocation,
        startDate: summary.startDate,
        endDate: summary.endDate,
        meetingDays: summary.meetingDays,
        attendanceCount: summary.attendanceCount,
        totalAmount: summary.pageExpense.totalAmount || summary.invoiceTotalAmount || summary.settlementTotalAmount,
        meetingPlanNo: summary.pageExpense.meetingPlanNo,
    }];
}

async function buildPrefill({ ocrItems = [], context = {} }) {
    const normalizedItems = normalizeOcrItems(ocrItems);
    const summary = buildSummary(normalizedItems, context);
    const records = buildRecords(summary, context);
    const typeCounts = normalizedItems.reduce((acc, item) => {
        acc[item.recognizeType] = (acc[item.recognizeType] || 0) + 1;
        return acc;
    }, {});
    return {
        scenarioType: 'meeting',
        scenarioLabel: '会议费报销',
        expenseType: 'meeting',
        records,
        summary,
        ocrItems: normalizedItems,
        uploadResults: context.uploadResults || [],
        meetingData: context.meetingData || context.pageSnapshot?.meetingData || {},
        payments: context.payments || [],
        attachments: context.attachments || [],
        sourceStats: {
            ocrItemCount: normalizedItems.length,
            uploadCount: asArray(context.uploadResults).length,
            attachmentCount: asArray(context.attachments).length,
            typeCounts,
        },
        developmentNote: '第一轮会议费归集已接入统一预填和审核；口径不完整的规则由规则层返回 skipped/人工复核提示。',
    };
}

module.exports = {
    buildPrefill,
    calculateMeetingDays,
    determineMeetingCategory,
};
