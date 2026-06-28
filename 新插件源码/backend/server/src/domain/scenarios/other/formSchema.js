module.exports = {
    sections: [
        {
            key: 'basic',
            title: '基本信息',
            fields: [
                { key: 'title', label: '报销名称', type: 'text', required: true },
                { key: 'reason', label: '报销事由', type: 'textarea', required: true },
                { key: 'applicantName', label: '报销人员', type: 'text', required: true },
                { key: 'departmentName', label: '所属部门', type: 'text', required: true },
            ],
        },
        {
            key: 'expense',
            title: '报销指标',
            fields: [
                { key: 'economicSubject', label: '经济科目', type: 'text', required: true },
                { key: 'purpose', label: '用途明细', type: 'text', required: true },
                { key: 'invoiceCount', label: '发票数量', type: 'number' },
                { key: 'totalAmount', label: '金额合计', type: 'money', required: true },
                { key: 'buyerName', label: '购买方信息', type: 'text' },
            ],
        },
    ],
};

