const { compactText, firstValue, numberValue, roundMoney, safeText } = require('../../shared/textUtils');

const TRAFFIC_SUBSIDY_BUDGET = {
    id: '710101022104',
    economic_subject: '710101022104 交通补贴',
    purpose: '交通补贴',
    function_subject: '行政运行公用',
};

function normalizeType(item = {}) {
    return safeText(item.recognizeType || item.docType || item.type);
}

function isTaxiInvoice(item = {}) {
    const type = normalizeType(item);
    const text = safeText(item);
    return type === 'guangzhouTaxiInvoice'
        || /广州出租汽车统一车票|GUANGZHOU\s*TAXI\s*RECEIPT|出租汽车统一车票|出租车机打发票/i.test(text);
}

function isTripDetailList(item = {}) {
    const type = normalizeType(item);
    const text = safeText(item);
    return type === 'tripDetailList' || /公务出行明细表|出行明细表/.test(text);
}

function isPaymentRecord(item = {}) {
    const type = normalizeType(item);
    const text = safeText(item);
    return type === 'paymentRecord' || /交易时间|记账时间|交易金额|交易场所/.test(text);
}

function taxiAmount(item = {}) {
    return numberValue(firstValue(item, ['amount', 'totalAmount', 'fare', 'fareAmount', '金额', '合计金额']));
}

function taxiRideDate(item = {}) {
    return normalizeDate(firstValue(item, ['rideDate', 'travelDate', 'date', 'issueDate', '乘车日期', '日期']));
}

function taxiStartTime(item = {}) {
    return normalizeTime(firstValue(item, ['startTime', '上车时间', '上车']));
}

function taxiEndTime(item = {}) {
    return normalizeTime(firstValue(item, ['endTime', '下车时间', '下车']));
}

function taxiDistance(item = {}) {
    return numberValue(firstValue(item, ['distanceKm', 'distance', 'mileage', '里程']));
}

function taxiCarPlate(item = {}) {
    return compactText(firstValue(item, ['carPlate', 'plateNo', 'licensePlate', '车牌号', '车号', '车号粤'])).toUpperCase();
}

function taxiInvoiceNumber(item = {}, fallbackIndex = 0) {
    const code = compactText(firstValue(item, ['invoiceCode', 'ticketCode', 'receiptCode', '发票代码', '票据代码'])).toUpperCase();
    const number = compactText(firstValue(item, ['invoiceNumber', 'ticketNumber', 'receiptNumber', '票号', '发票号码']));
    const serial = compactText(firstValue(item, ['serialNumber', 'serialNo', '流水号', '红色票号']));
    if (code && number) return `${code}:${number.toUpperCase()}`;
    if (number && serial && !number.includes(serial)) return `${number}${serial}`.toUpperCase();
    if (number) return number.toUpperCase();
    if (code && serial) return `${code}:SERIAL:${serial.toUpperCase()}`;
    if (serial) return `serial:${serial.toUpperCase()}`;
    const rideDate = taxiRideDate(item);
    const carPlate = taxiCarPlate(item);
    const amount = taxiAmount(item);
    if (rideDate && carPlate && amount) return `fallback:${rideDate}|${carPlate}|${amount}`;
    return `unknown:${fallbackIndex}`;
}

function taxiSerialNumber(item = {}) {
    return compactText(firstValue(item, ['serialNumber', 'serialNo', 'receiptNo', '流水号', '红色票号'])).toUpperCase();
}

function normalizeDate(value = '') {
    const text = safeText(value).replace(/[年月./]/g, '-').replace(/日/g, '').replace(/\s+/g, '');
    if (!text) return '';
    const match = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (!match) return text;
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function normalizeTime(value = '') {
    const text = safeText(value).replace(/[：]/g, ':');
    const match = text.match(/(\d{1,2})[:：](\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function isWeekend(dateText = '') {
    const normalized = normalizeDate(dateText);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
    const day = new Date(`${normalized}T00:00:00+08:00`).getDay();
    return day === 0 || day === 6;
}

function timeMinutes(value = '') {
    const time = normalizeTime(value);
    if (!time) return null;
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
}

function dedupeTaxiInvoices(ocrItems = []) {
    const seen = new Set();
    const invoices = [];
    const duplicates = [];
    (ocrItems || []).forEach((item, index) => {
        if (!isTaxiInvoice(item)) return;
        const key = taxiInvoiceNumber(item, index);
        if (seen.has(key)) {
            duplicates.push({ ...item, duplicateKey: key });
            return;
        }
        seen.add(key);
        invoices.push(item);
    });
    return {
        invoices,
        duplicates,
        duplicateInvoiceCount: duplicates.length,
        duplicateInvoiceNumbers: [...new Set(duplicates.map(item => taxiInvoiceNumber(item)).filter(Boolean))],
    };
}

function tripRows(item = {}) {
    const rows = firstValue(item, ['detailRows', 'tripRows', 'travelRows', 'rows', 'items', 'list', '出行明细', '明细']);
    return Array.isArray(rows) ? rows : [];
}

function collectTripDetailLists(ocrItems = []) {
    return (ocrItems || []).filter(isTripDetailList).map(item => ({
        raw: item,
        department: safeText(firstValue(item, ['department', 'departmentName', '部门'])),
        personName: safeText(firstValue(item, ['personName', 'name', '姓名'])),
        rank: safeText(firstValue(item, ['rank', 'level', '级别'])),
        monthlyLimit: numberValue(firstValue(item, ['monthlyLimit', 'limitAmount', '限额标准'])),
        totalAmount: numberValue(firstValue(item, ['totalAmount', '合计金额', '合计'])),
        rows: tripRows(item).map(row => ({
            sequence: safeText(firstValue(row, ['sequence', 'seq', '序号'])),
            travelDate: normalizeDate(firstValue(row, ['travelDate', 'tripDate', 'date', '公务出行时间', '出行时间', '日期'])),
            reason: safeText(firstValue(row, ['reason', 'purpose', '出行事由', '事由'])),
            transportType: safeText(firstValue(row, ['transportType', 'trafficTool', '出行方式', '交通方式'])),
            claimAmount: numberValue(firstValue(row, ['claimAmount', 'amount', '报销金额', '金额'])),
            remark: safeText(firstValue(row, ['remark', 'remarks', 'note', '备注', '说明'])),
            raw: row,
        })).filter(row => row.travelDate || row.claimAmount || row.reason),
    }));
}

function collectPaymentRecords(ocrItems = []) {
    return (ocrItems || []).filter(isPaymentRecord);
}

function collectTrafficKeywords(ocrItems = []) {
    const keywords = [];
    if ((ocrItems || []).some(isTaxiInvoice)) keywords.push('交通补贴', '出租车', '广州出租汽车统一车票');
    if ((ocrItems || []).some(isTripDetailList)) keywords.push('公务出行明细表');
    return keywords;
}

function hasTrafficSubsidyEvidence(ocrItems = [], record = {}) {
    const text = compactText([
        record.economicSubject,
        record.purpose,
        record.reason,
        record.title,
        record.reportName,
        ...(record.projectNames || []),
        safeText(ocrItems),
    ].join('|'));
    return /710101022104|交通补贴|出租车|出租汽车|公务出行明细表/.test(text)
        || (ocrItems || []).some(item => isTaxiInvoice(item) || isTripDetailList(item));
}

function buildTrafficSummary(ocrItems = []) {
    const taxiDedupe = dedupeTaxiInvoices(ocrItems);
    const tripLists = collectTripDetailLists(ocrItems);
    const payments = collectPaymentRecords(ocrItems);
    const totalTaxiAmount = roundMoney(taxiDedupe.invoices.reduce((sum, item) => sum + taxiAmount(item), 0));
    const totalTripAmount = roundMoney(tripLists.reduce((sum, list) => sum + (
        list.rows.length
            ? list.rows.reduce((rowSum, row) => rowSum + row.claimAmount, 0)
            : list.totalAmount
    ), 0));
    return {
        taxiInvoices: taxiDedupe.invoices,
        duplicateTaxiInvoices: taxiDedupe.duplicates,
        duplicateTaxiInvoiceCount: taxiDedupe.duplicateInvoiceCount,
        duplicateTaxiInvoiceNumbers: taxiDedupe.duplicateInvoiceNumbers,
        tripLists,
        payments,
        totalTaxiAmount,
        totalTripAmount,
        taxiCount: taxiDedupe.invoices.length,
        tripRowCount: tripLists.reduce((sum, item) => sum + item.rows.length, 0),
        paymentCount: payments.length,
    };
}

function findMatchingTripRows(taxi = {}, tripLists = []) {
    const rideDate = taxiRideDate(taxi);
    const amount = taxiAmount(taxi);
    return tripLists.flatMap(list => list.rows.map(row => ({ list, row })))
        .filter(({ row }) => {
            const dateMatched = rideDate && row.travelDate && row.travelDate === rideDate;
            const amountMatched = amount && row.claimAmount && Math.abs(row.claimAmount - amount) < 0.01;
            return dateMatched && amountMatched;
        });
}

function numericSerial(value = '') {
    const digits = safeText(value).replace(/\D/g, '');
    return digits ? Number(digits) : null;
}

function buildIssue(category, description, suggestion, evidence = {}, severity = 'warning') {
    return { category, description, suggestion, severity, evidence };
}

function auditTrafficSubsidy(ocrItems = [], prefillData = {}, context = {}) {
    const summary = buildTrafficSummary(ocrItems);
    const issues = [];

    summary.tripLists.forEach((list, listIndex) => {
        const missing = [];
        if (!list.department) missing.push('部门');
        if (!list.personName) missing.push('姓名');
        if (!list.rank) missing.push('级别');
        if (!list.monthlyLimit) missing.push('限额标准');
        if (missing.length) {
            issues.push(buildIssue('交通补贴-明细表完整性', `第 ${listIndex + 1} 份公务出行明细表缺少：${missing.join('、')}。`, '请补充完整公务出行明细表基础字段。', { sourceFileName: list.raw.sourceFileName || list.raw.fileName || '' }));
        }
        list.rows.forEach((row, rowIndex) => {
            const rowMissing = [];
            if (!row.travelDate) rowMissing.push('公务出行时间');
            if (!row.reason) rowMissing.push('出行事由');
            if (!row.transportType) rowMissing.push('出行方式');
            if (!row.claimAmount) rowMissing.push('报销金额');
            if (rowMissing.length) {
                issues.push(buildIssue('交通补贴-明细行完整性', `公务出行明细表第 ${row.sequence || rowIndex + 1} 行缺少：${rowMissing.join('、')}。`, '请补充完整后再审核。', { row }));
            }
            if (isWeekend(row.travelDate) && !row.remark) {
                issues.push(buildIssue('交通补贴-节假日说明', `${row.travelDate} 为周末或节假日口径日期，但明细表备注栏为空。`, '请补充说明或提供审批文件。', { row }));
            }
        });
        if (list.monthlyLimit && (list.totalAmount || summary.totalTripAmount) > list.monthlyLimit + 0.01) {
            issues.push(buildIssue('交通补贴-月度限额', `公务出行明细表合计金额 ${list.totalAmount || summary.totalTripAmount} 元超过限额标准 ${list.monthlyLimit} 元。`, '请核对交通补贴月度限额或调整报销金额。', { monthlyLimit: list.monthlyLimit, totalAmount: list.totalAmount || summary.totalTripAmount }));
        }
    });

    summary.taxiInvoices.forEach((taxi, index) => {
        const matchedRows = findMatchingTripRows(taxi, summary.tripLists);
        if (summary.tripLists.length && !matchedRows.length) {
            issues.push(buildIssue('交通补贴-票据明细比对', `出租车票 ${taxiSerialNumber(taxi) || taxiInvoiceNumber(taxi, index)} 的日期 ${taxiRideDate(taxi) || '-'}、金额 ${taxiAmount(taxi) || 0} 元未匹配到公务出行明细表。`, '请核对票据日期、金额是否属于本次公务出行。', { taxi }));
        }
        const start = timeMinutes(taxiStartTime(taxi));
        const end = timeMinutes(taxiEndTime(taxi));
        const rideDate = taxiRideDate(taxi);
        const remark = matchedRows.map(({ row }) => row.remark).filter(Boolean).join('；');
        const weekdayOffHour = rideDate && !isWeekend(rideDate) && (
            (end !== null && end < 8 * 60 + 30) || (start !== null && start > 17 * 60 + 30)
        );
        if (weekdayOffHour && !remark) {
            issues.push(buildIssue('交通补贴-非工作时间乘车', `出租车票 ${rideDate} ${taxiStartTime(taxi) || '-'}-${taxiEndTime(taxi) || '-'} 处于非工作时间，明细表备注为空。`, '请核实是否属于公务出行并补充说明。', { taxi }));
        }
    });

    const serials = summary.taxiInvoices
        .map(item => ({ item, serial: numericSerial(taxiSerialNumber(item)) }))
        .filter(row => row.serial !== null)
        .sort((a, b) => a.serial - b.serial);
    const consecutive = [];
    for (let i = 1; i < serials.length; i += 1) {
        if (serials[i].serial - serials[i - 1].serial === 1) consecutive.push([serials[i - 1], serials[i]]);
    }
    if (consecutive.length) {
        issues.push(buildIssue('交通补贴-发票连号', `存在 ${consecutive.length} 组出租车票流水号连号。`, '连号票据可能存在集中取得或虚假报销风险，请人工核验。', { serials: consecutive.slice(0, 5).map(pair => pair.map(row => taxiSerialNumber(row.item))) }));
    }

    const byPlateMonth = new Map();
    summary.taxiInvoices.forEach(item => {
        const plate = taxiCarPlate(item);
        const month = taxiRideDate(item).slice(0, 7);
        if (!plate || !month) return;
        const key = `${plate}|${month}`;
        if (!byPlateMonth.has(key)) byPlateMonth.set(key, []);
        byPlateMonth.get(key).push(item);
    });
    byPlateMonth.forEach((items, key) => {
        if (items.length >= 2) {
            const [plate, month] = key.split('|');
            issues.push(buildIssue('交通补贴-车牌号重复', `车牌号 ${plate} 在 ${month} 出现 ${items.length} 次。`, '请核实是否同一车辆多次使用或存在虚假填报。', { plate, month, count: items.length }));
        }
    });

    const byReason = new Map();
    summary.tripLists.forEach(list => {
        list.rows.forEach(row => {
            const key = compactText(row.reason);
            if (!key) return;
            const matched = summary.taxiInvoices.filter(taxi => findMatchingTripRows(taxi, [list]).some(match => match.row === row));
            matched.forEach(taxi => {
                if (!byReason.has(key)) byReason.set(key, []);
                byReason.get(key).push({ row, taxi, distance: taxiDistance(taxi) });
            });
        });
    });
    byReason.forEach((rows, key) => {
        const distances = rows.map(row => row.distance).filter(value => value > 0);
        if (distances.length >= 2 && Math.max(...distances) - Math.min(...distances) > 10) {
            issues.push(buildIssue('交通补贴-同一地点里程差异', `同一出行地点“${key}”对应出租车里程差异超过 10km。`, '请核实行程地点和票据是否匹配。', { reason: key, distances }));
        }
    });

    if (summary.totalTripAmount && Math.abs(summary.totalTaxiAmount - summary.totalTripAmount) > 0.01) {
        issues.push(buildIssue('交通补贴-汇总金额比对', `出租车票金额合计 ${summary.totalTaxiAmount} 元与公务出行明细表合计 ${summary.totalTripAmount} 元不一致。`, '请核对是否漏传票据或明细金额填写错误。', { taxiTotal: summary.totalTaxiAmount, tripTotal: summary.totalTripAmount }));
    }

    const pageAmount = numberValue(context.pageAmount || context.totalAmount || prefillData.summary?.totalAll);
    if (pageAmount && Math.abs(pageAmount - summary.totalTaxiAmount) > 0.01) {
        issues.push(buildIssue('交通补贴-页面金额比对', `页面报销金额 ${pageAmount} 元与出租车票去重合计 ${summary.totalTaxiAmount} 元不一致。`, '请核对页面填写金额与出租车票金额。', { pageAmount, taxiTotal: summary.totalTaxiAmount }));
    }

    return {
        ruleId: 'other_transport_subsidy',
        ruleName: '其他事项报销-交通补贴审核',
        status: issues.length ? 'warning' : 'pass',
        passed: !issues.length,
        issues,
        summary,
    };
}

module.exports = {
    TRAFFIC_SUBSIDY_BUDGET,
    auditTrafficSubsidy,
    buildTrafficSummary,
    collectPaymentRecords,
    collectTrafficKeywords,
    collectTripDetailLists,
    dedupeTaxiInvoices,
    hasTrafficSubsidyEvidence,
    isPaymentRecord,
    isTaxiInvoice,
    isTripDetailList,
    taxiAmount,
    taxiInvoiceNumber,
    taxiRideDate,
};
