const {
    buyerName,
    collectProjectKeywords,
    dedupeInvoiceItems,
    invoiceAmount,
    invoiceNumber,
} = require('./aggregation/invoiceExtractor');
const {
    TRAFFIC_SUBSIDY_BUDGET,
    buildTrafficSummary,
    collectTrafficKeywords,
    hasTrafficSubsidyEvidence,
} = require('./aggregation/trafficExtractor');
const { pickBudgetIndicator } = require('./aggregation/budgetMatcher');
const { roundMoney } = require('../shared/textUtils');

async function buildPrefill({ ocrItems = [], context = {} }) {
    const dedupeResult = dedupeInvoiceItems(ocrItems);
    const invoices = dedupeResult.invoices;
    const trafficSummary = buildTrafficSummary(ocrItems);
    const isTrafficSubsidy = hasTrafficSubsidyEvidence(ocrItems);
    const keywords = isTrafficSubsidy
        ? collectTrafficKeywords(ocrItems)
        : collectProjectKeywords(invoices);
    const budget = isTrafficSubsidy ? TRAFFIC_SUBSIDY_BUDGET : await pickBudgetIndicator(keywords);
    const totalAmount = isTrafficSubsidy
        ? trafficSummary.totalTaxiAmount
        : roundMoney(invoices.reduce((sum, item) => sum + invoiceAmount(item), 0));
    const buyerNames = [...new Set(invoices.map(buyerName).filter(Boolean))];
    const invoiceNumbers = [...new Set(invoices.map(invoiceNumber).filter(Boolean))];
    const purpose = budget?.purpose || keywords[0] || '其他事项报销';
    const economicSubject = budget?.economic_subject || '其他商品和服务支出';
    const titlePrefix = buyerNames[0] || context.applicantName || trafficSummary.tripLists[0]?.personName || '其他事项';
    const title = `${titlePrefix}${purpose}报销单`;
    const record = {
        recordKey: `other|${Date.now()}`,
        scenarioType: 'other',
        title,
        reportName: title,
        reason: purpose,
        economicSubject,
        purpose,
        buyerName: buyerNames.join('、'),
        invoiceCount: isTrafficSubsidy ? trafficSummary.taxiCount : (invoiceNumbers.length || invoices.length),
        totalAmount,
        invoiceNumbers,
        matchedBudgetIndicatorId: budget?.id || null,
        matched: !!budget,
        projectNames: keywords,
        trafficSummary: isTrafficSubsidy ? {
            taxiCount: trafficSummary.taxiCount,
            tripRowCount: trafficSummary.tripRowCount,
            paymentCount: trafficSummary.paymentCount,
            duplicateTaxiInvoiceCount: trafficSummary.duplicateTaxiInvoiceCount,
            duplicateTaxiInvoiceNumbers: trafficSummary.duplicateTaxiInvoiceNumbers,
            totalTaxiAmount: trafficSummary.totalTaxiAmount,
            totalTripAmount: trafficSummary.totalTripAmount,
        } : null,
    };
    return {
        scenarioType: 'other',
        expenseType: 'other',
        records: [record],
        summary: {
            economicSubject,
            purpose,
            invoiceCount: record.invoiceCount,
            duplicateInvoiceCount: dedupeResult.duplicateInvoiceCount + trafficSummary.duplicateTaxiInvoiceCount,
            duplicateInvoiceNumbers: [...new Set([
                ...dedupeResult.duplicateInvoiceNumbers,
                ...trafficSummary.duplicateTaxiInvoiceNumbers,
            ].filter(Boolean))],
            totalAll: record.totalAmount,
            totalAmount: record.totalAmount,
            buyerNames,
            projectNames: keywords,
            trafficSummary: isTrafficSubsidy ? record.trafficSummary : null,
        },
        sourceStats: {
            ocrItemCount: ocrItems.length,
            invoiceCount: invoices.length,
            taxiInvoiceCount: trafficSummary.taxiCount,
            tripDetailRowCount: trafficSummary.tripRowCount,
            paymentRecordCount: trafficSummary.paymentCount,
            duplicateInvoiceCount: dedupeResult.duplicateInvoiceCount + trafficSummary.duplicateTaxiInvoiceCount,
            duplicateInvoiceNumbers: [...new Set([
                ...dedupeResult.duplicateInvoiceNumbers,
                ...trafficSummary.duplicateTaxiInvoiceNumbers,
            ].filter(Boolean))],
        },
        ocrItems,
    };
}

module.exports = {
    buildPrefill,
};
