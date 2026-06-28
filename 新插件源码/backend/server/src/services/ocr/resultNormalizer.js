const { canonicalDocType, DOCUMENT_SCHEMAS } = require('./documentSchemas');
const { parseJsonWithCommonRepair } = require('./jsonRepair');
const { repairObjectEncoding, repairText } = require('../../utils/textEncoding');
const { truncateText } = require('../../utils/debugLogger');

const FIELD_ALIASES = {
    invoiceNumber: ['invoiceNo', 'ticketNumber', 'ticketNo', 'eTicketNumber', 'eticketNumber', 'number', '发票号码', '发票号', '票号', '电子客票号'],
    issueDate: ['date', 'invoiceDate', 'billingDate', '开票日期', '出票日期', '日期'],
    payerName: ['buyerName', 'purchaserName', 'buyer', '购买方名称', '购买方', '付款方', '付款人'],
    sellerName: ['vendorName', 'supplierName', 'seller', '销售方名称', '销售方', '收款方', '商户名称'],
    totalAmount: ['taxIncludedAmount', 'amountWithTax', 'priceTaxAmount', 'priceTaxTotal', '价税合计', '合计金额', '小写金额', 'total', 'invoiceAmount', 'amount', 'fareAmount', 'ticketPrice', 'fare', 'price', 'actualAmount', 'paidAmount', '金额', '票价', '实付金额', '房费', '总金额'],
    taxAmount: ['tax', '税额'],
    comment: ['remark', 'remarks', 'note', '备注'],
    itemsDetail: ['items', 'details', 'itemDetails', 'invoiceItems', '项目明细', '明细', '商品明细'],

    invoiceCode: ['invoicePrefix', 'ticketCode', 'ticketPrefix', '发票代码', '票据代码', '票据抬头号'],
    buyerTaxNo: ['buyerTaxNumber', 'purchaserTaxNo', 'buyerTaxId', '购买方识别号', '购买方纳税人识别号', '购方税号'],
    sellerTaxNo: ['sellerTaxNumber', 'vendorTaxNo', 'sellerTaxId', '销售方识别号', '销售方纳税人识别号', '销方税号', '纳税人识别号'],
    serialNumber: ['serialNo', 'serial', 'receiptNo', 'receiptNumber', 'ticketSerialNo', 'ticketSerial', '流水号', '票据流水号', '红色票号', '短票号'],
    rideDate: ['ride_date', 'tripDate', 'travelDate', 'taxiDate', '乘车日期', '用车日期', '日期'],
    startTime: ['boardingTime', 'onTime', 'pickupTime', 'startTimeText', '上车时间', '上车', '起程时间'],
    endTime: ['alightingTime', 'offTime', 'dropoffTime', 'endTimeText', '下车时间', '下车', '到达时间'],
    phoneNumber: ['phone', 'tel', 'telephone', '监督电话', '电话'],
    carPlate: ['plateNo', 'plateNumber', 'licensePlate', 'carNo', 'vehicleNo', '车牌号', '车号', '车号粤'],
    certificateNumber: ['certificateNo', 'certNo', 'driverCertificateNo', '证号', '驾驶员证号'],
    unitPrice: ['unitFare', 'pricePerKm', '单价'],
    distanceKm: ['distance', 'mileage', 'mileageKm', 'kilometers', 'km', '里程'],
    waitingTime: ['waitTime', 'waitDuration', '候时', '等待时间'],
    cardNumber: ['cardNo', 'card', 'bankCardNo', 'bankCard', '交易卡号', '卡号'],

    department: ['dept', 'departmentName', 'unitName', '部门', '所属部门'],
    monthlyLimit: ['limitAmount', 'limitStandard', 'monthlyStandard', 'monthlyQuota', '限额标准', '月限额', '报销限额'],
    detailRows: ['detailRows', 'tripRows', 'travelRows', 'rows', 'list', 'items', '出行明细', '公务出行明细', '明细'],
    sequence: ['seq', 'index', 'no', '序号'],
    travelDate: ['date', 'tripDate', 'rideDate', 'travelTime', '公务出行时间', '出行时间', '出行日期', '日期'],
    claimAmount: ['claimAmount', 'reimburseAmount', 'reimbursementAmount', '报销金额', '金额'],
    remark: ['remarks', 'note', '说明', '备注'],

    transactionTime: ['transactionDate', 'tradeTime', 'tradeDateTime', 'transactionDateTime', '交易时间', '交易日期'],
    accountTime: ['postingTime', 'bookTime', '记账时间'],
    summary: ['businessSummary', 'bizSummary', '摘要', '业务摘要'],
    countryOrRegion: ['country', 'region', '交易国家或地区简称', '交易国家或地区'],
    payeeName: ['merchantName', 'counterparty', 'transactionPlace', 'transactionLocation', 'sellerName', '交易场所', '商户名称', '收款人名称', '收款方'],
    currency: ['currencyName', '记账币种', '币种'],
    balance: ['cardBalance', 'accountBalance', '交易卡余额', '余额'],

    passengerName: ['passenger', 'passenger_name', 'travelerName', 'travellerName', 'traveler', 'personName', 'name', '姓名', '旅客姓名', '旅客', '乘客', '乘车人', '乘机人', '出行人', '出差人'],
    seatClass: ['seat', 'seatType', 'cabinClass', 'class', 'seatLevel', '舱位', '舱位等级', '座位等级', '坐席', '席别', '座席'],
    departureStation: ['departure', 'departurePlace', 'from', 'startPlace', 'origin', 'fromStation', '出发站', '始发站', '出发地', '出发地点'],
    arrivalStation: ['arrival', 'arrivalPlace', 'to', 'destination', 'endPlace', 'toStation', '到达站', '目的站', '到达地', '到达地点', '目的地'],
    trainNumber: ['trainNo', 'trainCode', '车次', '列车号'],
    departureTime: ['departureDate', 'departureDateTime', 'startTime', 'startDate', 'takeoffTime', 'flightTime', '乘车时间', '出发时间', '起飞时间', '出发日期'],
    arrivalTime: ['arrivalDate', 'arrivalDateTime', 'endTime', 'endDate', '到达时间', '抵达时间'],

    gpNumber: ['gpNo', 'gpCode', 'gpTicketNo', 'gpOrderNo', 'gpIdentifier', 'GP', 'gp', 'GP标识', 'gp标识', '公务机票标识', '政府采购编号', '政府采购机票查验单号'],
    flightNumber: ['flightNo', 'flightCode', '航班号', '航班'],
    departure: ['departureStation', 'departurePlace', 'from', 'startPlace', 'origin', '出发地', '出发地点', '出发机场'],
    arrival: ['arrivalStation', 'arrivalPlace', 'to', 'destination', 'endPlace', '到达地', '到达地点', '目的地', '到达机场'],
    amount: ['totalAmount', 'ticketPrice', 'fare', 'price', 'actualAmount', 'paidAmount', 'fareAmount', '价税合计', '合计金额', '金额', '票价', '实付金额', '房费'],
    insurance: ['insuranceAmount', '保险费'],

    creditcardNumber: ['cardNumber', 'creditCardNo', '公务卡号', '卡号'],
    guestName: ['guest', 'guest_name', 'personName', 'travelerName', 'name', '姓名', '入住人', '住宿人', '客人姓名', '出差人'],
    city: ['place', 'location', 'address', 'hotelAddress', '住宿城市', '城市', '地点', '地址'],
    hotelName: ['hotel', 'hotel_name', 'hotelTitle', '酒店', '酒店名称', '宾馆名称'],
    leavingDate: ['leaveDate', 'checkOutDate', 'checkoutDate', 'endDate', '离店日期', '退房日期'],
    accommodationDetail: ['accommodationDetails', 'details', 'detail', 'rows', 'list', 'items', '住宿明细', '住宿详情', '每日明细', '明细'],
    accommodationDate: ['date', 'stayDate', '住宿日期', '入住日期', '日期'],

    requesterName: ['applicantName', 'requester', 'applicant', 'personName', 'travelerName', 'name', '申请人', '报销人', '出差人', '姓名'],
    startDate: ['startTime', 'beginDate', 'departureDate', '出发日期', '开始日期', '出差开始时间', '开始时间'],
    endDate: ['endTime', 'finishDate', 'returnDate', 'arrivalDate', '结束日期', '返回日期', '出差结束时间', '结束时间'],
    startPeriod: ['startHalfDay', 'startAmPm', 'departurePeriod', 'beginPeriod', '出发时段', '开始时段', '起始时段', '上午下午', '上下午', '开始上午下午'],
    endPeriod: ['endHalfDay', 'endAmPm', 'returnPeriod', 'finishPeriod', '返回时段', '结束时段', '到达时段', '结束上午下午'],
    arrivalAddress: ['destination', 'arrivalPlace', 'endAddress', 'to', 'place', 'location', '出差地点', '目的地', '到达地点', '到达地'],
    reception: ['isReception', '接待情况', '是否接待'],
    transportation: ['transportType', 'vehicle', 'trafficTool', '交通工具', '交通方式'],
    reason: ['purpose', 'subject', 'tripReason', '事由', '出差事由', '原因'],
    rank: ['level', 'position', '职级', '人员级别', '级别'],
    hotelStandard: ['accommodationStandard', 'lodgingStandard', '住宿标准', '住宿费标准'],
    travelDetail: ['travelDetails', 'details', 'detail', 'rows', 'list', 'people', 'travelers', '出差明细', '人员明细', '明细'],
    personName: ['person', 'travelerName', 'travellerName', 'name', '姓名', '出差人', '人员姓名', '申请人'],
    destination: ['arrivalAddress', 'arrivalPlace', 'to', 'endAddress', 'place', 'location', '目的地', '到达地点', '出差地点'],
    transportType: ['transportation', 'vehicle', 'trafficTool', '交通工具', '交通方式'],

    name: ['itemName', 'goodsName', 'serviceName', '项目名称', '货物或应税劳务名称', '商品名称', '服务名称'],
    specification: ['model', '规格型号', '规格'],
    unit: ['单位'],
    quantity: ['count', 'qty', '数量'],
    rawText: ['text', 'content', 'ocrText', '识别文本', '原文'],
};

function valuePresent(value) {
    if (Array.isArray(value)) return value.some(valuePresent);
    if (value && typeof value === 'object') return Object.values(value).some(valuePresent);
    return String(value ?? '').trim() !== '';
}

function cleanScalar(value) {
    if (value === null || value === undefined) return '';
    const text = repairText(String(value).trim());
    if (/^(null|undefined|未知|未识别|无|不详|N\/A)$/i.test(text)) return '';
    return text;
}

function getAliasedValue(item, key) {
    if (!item || typeof item !== 'object') return undefined;
    const keys = [key, ...(FIELD_ALIASES[key] || [])];
    for (const candidate of keys) {
        if (Object.prototype.hasOwnProperty.call(item, candidate) && valuePresent(item[candidate])) return item[candidate];
    }
    return undefined;
}

function itemRawText(item = {}) {
    return cleanScalar(getAliasedValue(item, 'rawText') ?? item.rawText ?? item.text ?? item.content ?? item.ocrText ?? '');
}

function rawTextLooksLikeInvoice(rawText = '') {
    const text = cleanScalar(rawText);
    if (!text) return false;
    const evidenceCount = [
        /发票号码|数电票号码|电子发票|增值税.{0,4}发票|普通发票|专用发票|全电发票/.test(text),
        /购买方|销售方|购方名称|销方名称|购\s*买\s*名\s*称|销\s*售\s*名\s*称/.test(text),
        /价税合计|开票日期|小写金额|合计金额|税额/.test(text),
    ].filter(Boolean).length;
    return evidenceCount >= 2;
}

function firstRawMatch(text = '', patterns = []) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return cleanScalar(match[1]);
    }
    return '';
}

function cleanInvoiceName(value = '') {
    return cleanScalar(value)
        .split(/统一社会信用代码|纳税人识别号|地址|电话|开户行|账号|银行|销售方|购买方|密码区|项目名称|货物或应税劳务|规格型号|价税合计|合计金额|小写金额|开票日期|税额/)[0]
        .replace(/^[：:\s]+|[：:\s]+$/g, '')
        .trim();
}

function fillInvoiceFieldsFromRawText(output = {}, rawText = '') {
    const text = cleanScalar(rawText);
    if (!text) return output;
    const flatText = text.replace(/\s+/g, ' ');
    const matchAny = patterns => firstRawMatch(text, patterns) || firstRawMatch(flatText, patterns);
    const moneyValues = value => [...String(value || '').matchAll(/[￥¥]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)]
        .map(match => cleanScalar(match[1]).replace(/,/g, ''))
        .filter(Boolean);
    if (!output.invoiceNumber) {
        output.invoiceNumber = matchAny([
            /(?:发票号码|数电票号码|发票号|票号)[：:\s]*([A-Z0-9]{6,32})/i,
        ]);
    }
    if (!output.issueDate) {
        output.issueDate = matchAny([
            /(?:开票日期|出票日期|日期)[：:\s]*([0-9]{4}[年\-/.][0-9]{1,2}[月\-/.][0-9]{1,2}日?)/,
        ]);
    }
    if (!output.payerName) {
        output.payerName = cleanInvoiceName(matchAny([
            /(?:购买方名称|购买方|购方名称)[：:\s]*([^\n\r]+)/,
            /购\s*买\s*(?:方)?\s*名\s*称[：:\s]*([^\n\r]+)/,
            /买\s*方\s*信\s*息[\s\S]{0,80}?名\s*称[：:\s]*([^\n\r]+)/,
        ]));
    }
    if (!output.sellerName) {
        output.sellerName = cleanInvoiceName(matchAny([
            /(?:销售方名称|销售方|销方名称|收款方)[：:\s]*([^\n\r]+)/,
            /销\s*售\s*(?:方)?\s*名\s*称[：:\s]*([^\n\r]+)/,
            /销售方信息[\s\S]{0,80}?名\s*称[：:\s]*([^\n\r]+)/,
        ]));
    }
    if (!output.buyerTaxNo) {
        output.buyerTaxNo = matchAny([
            /(?:购买方|买方|购方)[\s\S]{0,80}?(?:统一社会信用代码|纳税人识别号|税号)[：:\s]*([0-9A-Z]{12,24})/i,
        ]);
    }
    if (!output.sellerTaxNo) {
        output.sellerTaxNo = matchAny([
            /(?:销售方|销方)[\s\S]{0,80}?(?:统一社会信用代码|纳税人识别号|税号)[：:\s]*([0-9A-Z]{12,24})/i,
        ]);
    }
    if (!output.totalAmount) {
        output.totalAmount = matchAny([
            /本次实收[：:\s]*([0-9,]+(?:\.\d{1,2})?)/,
            /(?:价税合计(?:[（(]小写[）)])?|小写金额|合计金额)[^0-9\-￥¥]{0,30}[￥¥]?\s*([0-9,]+(?:\.\d{1,2})?)/,
        ]).replace(/,/g, '');
        if (!output.totalAmount) {
            const taxTotalIndex = text.search(/价税合计|小写金额|合计金额/);
            const segment = taxTotalIndex >= 0 ? text.slice(taxTotalIndex, taxTotalIndex + 700) : '';
            const amounts = moneyValues(segment);
            if (amounts.length) output.totalAmount = amounts[amounts.length - 1];
        }
    }
    if (!output.taxAmount) {
        output.taxAmount = matchAny([
            /(?:税\s*额)[^0-9\-]{0,30}([0-9,]+(?:\.\d{1,2})?)/,
        ]).replace(/,/g, '');
    }
    if ((!output.itemsDetail || !output.itemsDetail.length) && /\*[^*\r\n]+?\*/.test(text)) {
        output.itemsDetail = [...text.matchAll(/(\*[^*\r\n]+?\*[^\r\n]+)/g)]
            .slice(0, 12)
            .map(match => ({ name: cleanScalar(match[1]), specification: '', unit: '', quantity: '', amount: '', taxAmount: '' }))
            .filter(row => row.name);
    }
    return output;
}

function fillTaxiFieldsFromRawText(output = {}, rawText = '') {
    const text = cleanScalar(rawText);
    if (!text) return output;
    const flatText = text.replace(/\s+/g, ' ');
    const matchAny = patterns => firstRawMatch(text, patterns) || firstRawMatch(flatText, patterns);
    if (!output.invoiceCode) {
        output.invoiceCode = matchAny([
            /(?:发票代码|票据代码|代码)[：:\s]*([0-9]{8,20})/,
        ]);
    }
    if (!output.invoiceNumber) {
        output.invoiceNumber = matchAny([
            /(?:发票号码|票据号码|票号|号码)[：:\s]*([0-9]{6,24})/,
        ]);
    }
    if (!output.serialNumber) {
        output.serialNumber = matchAny([
            /(?:流水号|红色票号|机打号码|序列号)[：:\s]*([0-9]{4,16})/,
        ]);
    }
    if (!output.rideDate) {
        output.rideDate = matchAny([
            /(?:日期|乘车日期)[：:\s]*([0-9]{4}[年\-/.][0-9]{1,2}[月\-/.][0-9]{1,2}日?)/,
        ]);
    }
    if (!output.carPlate) {
        output.carPlate = matchAny([
            /(?:车号|车牌号)[：:\s]*([粤A-Z0-9]{5,12})/i,
        ]);
    }
    if (!output.amount) {
        output.amount = matchAny([
            /(?:金额|合计|实收)[^0-9]{0,10}([0-9]+(?:\.\d{1,2})?)/,
        ]);
    }
    return output;
}

function inferRecognizeType(item = {}) {
    const explicit = canonicalDocType(item.recognizeType || item.docType || item.type);
    if (explicit && explicit !== 'other') return explicit;
    if (valuePresent(item.serialNumber) || valuePresent(item.carPlate) || valuePresent(item.distanceKm) || valuePresent(item.rideDate)) return 'guangzhouTaxiInvoice';
    if (valuePresent(item.detailRows) || valuePresent(item.monthlyLimit) || /公务出行明细表|出行明细表/.test(itemRawText(item))) return 'tripDetailList';
    if (valuePresent(item.transactionTime) || valuePresent(item.accountTime) || valuePresent(item.payeeName) || /交易时间|记账时间|交易场所|交易金额|业务摘要/.test(itemRawText(item))) return 'paymentRecord';
    if (valuePresent(item.flightNumber) || valuePresent(item.gpNumber) || valuePresent(item.departure) || valuePresent(item.arrival)) return 'planeInvoice';
    if (valuePresent(item.trainNumber) || valuePresent(item.departureStation) || valuePresent(item.arrivalStation)) return 'trainInvoice';
    if (valuePresent(item.accommodationDetail) || valuePresent(item.guestName) || valuePresent(item.hotelName) || valuePresent(item.leavingDate)) return 'accommodationList';
    if (valuePresent(item.travelDetail) || valuePresent(item.requesterName) || valuePresent(item.arrivalAddress) || valuePresent(item.hotelStandard)) return 'travelRequest';
    if (valuePresent(item.invoiceNumber) || valuePresent(item.payerName) || valuePresent(item.sellerName) || valuePresent(item.totalAmount) || valuePresent(item.taxAmount) || valuePresent(item.itemsDetail)) return 'normalInvoice';
    if (rawTextLooksLikeInvoice(itemRawText(item))) return 'normalInvoice';
    return explicit || 'other';
}

function normalizeArrayRows(value, rowTemplate, parent = {}) {
    const rows = Array.isArray(value)
        ? value
        : (value && typeof value === 'object' ? [value] : []);
    return rows
        .filter(row => row && typeof row === 'object')
        .map(row => {
            const output = {};
            Object.keys(rowTemplate || {}).forEach(key => {
                output[key] = cleanScalar(getAliasedValue(row, key) ?? getAliasedValue(parent, key));
            });
            return output;
        })
        .filter(row => valuePresent(row));
}

function normalizeOcrItem(item = {}, fileName = '') {
    const type = inferRecognizeType(item);
    const schema = DOCUMENT_SCHEMAS[type] || DOCUMENT_SCHEMAS.other;
    const output = {};
    Object.entries(schema.template).forEach(([key, templateValue]) => {
        if (key === 'recognizeType') {
            output.recognizeType = type;
        } else if (Array.isArray(templateValue)) {
            output[key] = normalizeArrayRows(getAliasedValue(item, key), templateValue[0] || {}, item);
        } else {
            output[key] = cleanScalar(getAliasedValue(item, key));
        }
    });
    output.sourceFileName = cleanScalar(item.sourceFileName || item.fileName || fileName);
    const rawText = itemRawText(item);
    if (!output.rawText && rawText) output.rawText = rawText;
    if (type === 'normalInvoice') fillInvoiceFieldsFromRawText(output, rawText);
    if (type === 'guangzhouTaxiInvoice') fillTaxiFieldsFromRawText(output, rawText);
    return output;
}

function itemHasMinimumEvidence(item = {}) {
    const type = canonicalDocType(item.recognizeType);
    const schema = DOCUMENT_SCHEMAS[type] || DOCUMENT_SCHEMAS.other;
    const score = (schema.keyFields || []).reduce((count, field) => count + (valuePresent(item[field]) ? 1 : 0), 0);
    if (type === 'other') return valuePresent(item.rawText);
    if (type === 'normalInvoice' && rawTextLooksLikeInvoice(item.rawText)) return true;
    return score >= 1;
}

function normalizeOcrItems(items = [], fileName = '') {
    return repairObjectEncoding((Array.isArray(items) ? items : [])
        .map(item => normalizeOcrItem(item, fileName))
        .filter(itemHasMinimumEvidence));
}

function rowsFromContainer(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        const text = value.trim();
        if (!/^[\[{]/.test(text)) return [];
        try {
            return rowsFromContainer(parseJsonWithCommonRepair(text));
        } catch (error) {
            return [];
        }
    }
    if (typeof value !== 'object') return [];
    for (const key of ['data', 'items', 'ocrItems', 'results', 'result', 'output', 'response']) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            const nestedRows = rowsFromContainer(value[key]);
            if (nestedRows.length || Array.isArray(value[key])) return nestedRows;
        }
    }
    if (value.recognizeType || value.docType || value.type) return [value];
    if (Object.values(value).some(valuePresent)) return [value];
    return [];
}

function extractRowsFromParsed(parsed) {
    if (!parsed) return [];
    if (Array.isArray(parsed?.files)) {
        return parsed.files.flatMap(file => rowsFromContainer(file).map(item => ({
            ...item,
            sourceFileName: item.sourceFileName || file.fileName || file.name || file.imageName || '',
        })));
    }
    return rowsFromContainer(parsed);
}

function buildResponseDebug(raw, rows, data, extra = {}) {
    return {
        rawResponseLength: typeof raw === 'string' ? raw.length : JSON.stringify(raw || '').length,
        rawResponsePreview: truncateText(raw, 12000),
        extractedRowCount: Array.isArray(rows) ? rows.length : 0,
        normalizedItemCount: Array.isArray(data) ? data.length : 0,
        normalizedTypes: (Array.isArray(data) ? data : []).reduce((acc, item) => {
            const type = item?.recognizeType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {}),
        ...extra,
    };
}

function normalizeSingleModelResponse(raw, fileName, fileType = '') {
    const parsed = typeof raw === 'string' ? parseJsonWithCommonRepair(raw) : raw;
    const rows = extractRowsFromParsed(parsed);
    const data = normalizeOcrItems(rows, fileName);
    return {
        status: 'success',
        fileName,
        fileType,
        data,
        debug: buildResponseDebug(raw, rows, data, { mode: 'single', fileName }),
    };
}

function batchRowFileName(row = {}) {
    return cleanScalar(row.fileName || row.sourceFileName || row.imageName || row.name || '');
}

function batchRowData(row = {}) {
    if (Array.isArray(row.data)) return row.data;
    if (Array.isArray(row.items)) return row.items;
    if (Array.isArray(row.ocrItems)) return row.ocrItems;
    if (Array.isArray(row.results)) return row.results;
    if (row.result) return rowsFromContainer(row.result);
    if (row.recognizeType || row.docType || row.type) return [row];
    return [];
}

function normalizeBatchModelResponse(raw, files = []) {
    const parsed = typeof raw === 'string' ? parseJsonWithCommonRepair(raw) : raw;
    const rows = Array.isArray(parsed?.files)
        ? parsed.files
        : (Array.isArray(parsed?.results)
            ? parsed.results
            : (Array.isArray(parsed) ? parsed : []));
    if (!rows.length && Array.isArray(parsed?.data)) {
        const grouped = new Map((files || []).map(file => [file.fileName, []]));
        parsed.data.forEach(item => {
            const explicitName = cleanScalar(item?.sourceFileName || item?.fileName || '');
            const pageIndex = Number(item?.sourceImageIndex || item?.imageIndex || item?.pageIndex || item?.pageNumber || 0);
            const fileName = grouped.has(explicitName)
                ? explicitName
                : (pageIndex > 0 && files[pageIndex - 1] ? files[pageIndex - 1].fileName : (files.length === 1 ? files[0].fileName : ''));
            if (fileName && grouped.has(fileName)) grouped.get(fileName).push(item);
        });
        return files.map(file => {
            const fileRows = grouped.get(file.fileName) || [];
            const data = normalizeOcrItems(fileRows, file.fileName);
            return {
                status: 'success',
                fileName: file.fileName,
                fileType: file.fileType || '',
                data,
                debug: buildResponseDebug(raw, fileRows, data, {
                    mode: 'batch-flat-data',
                    fileName: file.fileName,
                    batchFileNames: files.map(item => item.fileName),
                }),
            };
        });
    }
    if (!rows.length && files.length === 1) return [normalizeSingleModelResponse(parsed, files[0].fileName, files[0].fileType)];
    return files.map((file, index) => {
        const row = rows.find(item => batchRowFileName(item) === file.fileName) || rows[index] || {};
        const fileRows = batchRowData(row);
        const data = normalizeOcrItems(fileRows, file.fileName);
        return {
            status: 'success',
            fileName: file.fileName,
            fileType: file.fileType || '',
            data,
            debug: buildResponseDebug(raw, fileRows, data, {
                mode: 'batch-files',
                fileName: file.fileName,
                matchedRowFileName: batchRowFileName(row),
                batchFileNames: files.map(item => item.fileName),
            }),
        };
    });
}

function collectOcrItems(payload = {}) {
    const collected = [];
    const visit = value => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object') return;
        if (value.recognizeType || value.docType) {
            collected.push(value);
            return;
        }
        [
            'ocrItems',
            'ocrModelsData',
            'ocrData',
            'data',
            'items',
            'result',
            'results',
            'ocrModels',
            'uploadResults',
            'attachments',
            'partialResults',
        ].forEach(key => visit(value[key]));
    };
    visit(payload);

    const seen = new Set();
    return normalizeOcrItems(collected).filter(item => {
        const key = [
            item.recognizeType,
            item.sourceFileName,
            item.invoiceNumber,
            item.passengerName,
            item.guestName,
            item.requesterName,
            item.totalAmount || item.amount,
            item.departureTime || item.startDate,
        ].filter(Boolean).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = {
    cleanScalar,
    collectOcrItems,
    extractRowsFromParsed,
    inferRecognizeType,
    itemHasMinimumEvidence,
    normalizeBatchModelResponse,
    normalizeOcrItem,
    normalizeOcrItems,
    normalizeSingleModelResponse,
};
