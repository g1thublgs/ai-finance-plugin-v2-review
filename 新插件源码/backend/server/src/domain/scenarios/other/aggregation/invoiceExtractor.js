const { compactText, firstValue, numberValue } = require('../../shared/textUtils');

function looksInvoice(item = {}) {
    const text = JSON.stringify(item);
    const type = item.recognizeType || item.docType || item.type || '';
    if (['guangzhouTaxiInvoice', 'tripDetailList', 'paymentRecord'].includes(type)) return false;
    return type === 'normalInvoice' || /发票|invoice|数电票|电子票|增值税|购买方|销售方/i.test(text);
}

function collectInvoiceItems(ocrItems = []) {
    return dedupeInvoiceItems(ocrItems).invoices;
}

function invoiceAmount(item = {}) {
    return numberValue(firstValue(item, [
        'taxIncludedAmount',
        'amountWithTax',
        'priceTaxAmount',
        'priceTaxTotal',
        '价税合计',
        '合计金额',
        '小写金额',
        'totalAmount',
        'amount',
        'total',
        'invoiceAmount',
    ]));
}

function invoiceNumber(item = {}) {
    return normalizeInvoiceNo(firstValue(item, ['invoiceNumber', 'invoiceNo', 'invoiceCode', 'number', 'no', 'fpdm', 'fphm', '发票号码', '数电票号码', '发票号', '票号']));
}

function normalizeInvoiceNo(value = '') {
    return compactText(value).replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

function invoiceKey(item = {}, fallbackIndex = 0) {
    const number = invoiceNumber(item);
    if (number) return `number:${number}`;
    const seller = compactText(firstValue(item, ['sellerName', 'vendorName', 'supplierName', '销售方名称', '销售方']));
    const issueDate = compactText(firstValue(item, ['issueDate', '开票日期', 'date']));
    const amount = invoiceAmount(item);
    if (seller && issueDate && amount) return `fallback:${seller}|${issueDate}|${amount}`;
    return `unknown:${fallbackIndex}`;
}

function dedupeInvoiceItems(ocrItems = []) {
    const seen = new Set();
    const invoices = [];
    const duplicates = [];
    ocrItems.forEach((item, index) => {
        if (!looksInvoice(item)) return;
        const key = invoiceKey(item, index);
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
        duplicateInvoiceNumbers: [...new Set(duplicates.map(invoiceNumber).filter(Boolean))],
    };
}

function buyerName(item = {}) {
    return firstValue(item, ['buyerName', 'payerName', 'purchaseName', 'purchaserName']);
}

function keywordHintsFromText(value = '') {
    const text = String(value || '');
    const hints = [];
    const push = (...items) => items.forEach(item => hints.push(item));
    if (/电费|售电|电网|供电|用电|电力/i.test(text)) push('电费', '售电', '电网');
    if (/水费|供水|自来水|用水/i.test(text)) push('水费');
    if (/食材|食堂|饭堂|膳食|餐饮|配送费|农产|蔬菜|肉类|禽蛋|米面/i.test(text)) push('食堂费用', '饭堂补助', '食材配送');
    if (/设备维修|维修费|维修服务|修理|维护保养|检修/i.test(text)) push('设备维修', '维修费');
    if (/公房维修|房屋维修|房屋修缮|修缮/i.test(text)) push('公房维修');
    if (/厨房用品|厨具|餐具|厨房设备|厨房用具/i.test(text)) push('厨房用品', '食堂费用');
    if (/办公用品|日常办公|文具|耗材|硒鼓|打印纸/i.test(text)) push('日常办公用品');
    if (/物业|保洁|安保|保安|后勤服务/i.test(text)) push('办公物业', '购买服务费用');
    return hints;
}

function collectProjectKeywords(invoices = []) {
    const values = [];
    for (const item of invoices) {
        values.push(firstValue(item, ['itemName', 'projectName', 'goodsName', 'purpose', 'economicSubject']));
        values.push(...keywordHintsFromText([
            item.rawText,
            item.sourceFileName,
            item.fileName,
            item.comment,
            item.sellerName,
            item.vendorName,
            item.supplierName,
        ].filter(Boolean).join(' ')));
        const details = item.itemsDetail || item.invoiceItems || item.items || [];
        if (Array.isArray(details)) {
            details.forEach(row => {
                values.push(firstValue(row, ['itemName', 'projectName', 'goodsName', 'name']));
                values.push(...keywordHintsFromText(JSON.stringify(row)));
            });
        }
    }
    return [...new Set(values.map(compactText).filter(Boolean))];
}

module.exports = {
    collectInvoiceItems,
    collectProjectKeywords,
    dedupeInvoiceItems,
    invoiceAmount,
    invoiceNumber,
    buyerName,
};
