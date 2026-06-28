module.exports = {
    modelType: 'other-invoice-budget-payment-audit',
    ownerCity: 'D市',
    isolated: true,
    rules: [
        { code: 'other_budget_match', name: '预算指标匹配审核', level: 'warning' },
        { code: 'other_invoice_amount', name: '发票金额合计审核', level: 'warning' },
        { code: 'other_payment_match', name: '付款信息匹配审核', level: 'warning' },
        { code: 'other_sensitive_items', name: '发票项目敏感词审核', level: 'warning' },
    ],
};

