module.exports = {
    sections: [
        {
            key: 'basic',
            title: '基本信息',
            fields: [
                { key: 'title', label: '报销名称', type: 'text', required: true },
                { key: 'applicantName', label: '报销人员', type: 'text', required: true },
                { key: 'departmentName', label: '所属部门', type: 'text', required: true },
                { key: 'reason', label: '事由说明', type: 'textarea', required: true },
            ],
        },
        {
            key: 'reception',
            title: '公务接待费信息',
            fields: [
                { key: 'receptionSubject', label: '接待事项', type: 'text', required: true },
                { key: 'receptionDate', label: '接待时间', type: 'date' },
                { key: 'guestCount', label: '来宾人数', type: 'number' },
                { key: 'totalAmount', label: '金额合计', type: 'money' },
                { key: 'remark', label: '备注', type: 'textarea' },
            ],
        },
    ],
};