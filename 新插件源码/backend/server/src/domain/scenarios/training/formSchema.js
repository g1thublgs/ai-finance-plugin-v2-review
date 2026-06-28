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
            key: 'training',
            title: '培训费信息',
            fields: [
                { key: 'trainingName', label: '培训名称', type: 'text', required: true },
                { key: 'trainingDate', label: '培训时间', type: 'date' },
                { key: 'traineeCount', label: '参训人数', type: 'number' },
                { key: 'totalAmount', label: '金额合计', type: 'money' },
                { key: 'remark', label: '备注', type: 'textarea' },
            ],
        },
    ],
};