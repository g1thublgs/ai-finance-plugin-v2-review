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
            key: 'meeting',
            title: '会议费信息',
            fields: [
                { key: 'meetingName', label: '会议名称', type: 'text', required: true },
                { key: 'meetingDate', label: '会议时间', type: 'date' },
                { key: 'attendeeCount', label: '参会人数', type: 'number' },
                { key: 'totalAmount', label: '金额合计', type: 'money' },
                { key: 'remark', label: '备注', type: 'textarea' },
            ],
        },
    ],
};