module.exports = {
    sections: [
        {
            key: 'basic',
            title: '基本信息',
            fields: [
                { key: 'title', label: '报销名称', type: 'text' },
                { key: 'reason', label: '报销事由', type: 'textarea' },
                { key: 'applicantName', label: '报销人员', type: 'text', required: true },
                { key: 'departmentName', label: '所属部门', type: 'text', required: true },
            ],
        },
    ],
};

