module.exports = {
    sections: [
        {
            key: 'basic',
            title: '基本信息',
            fields: [
                { key: 'title', label: '报销名称', type: 'text' },
                { key: 'reimbursementUnitName', label: '报销单位', type: 'text' },
                { key: 'departmentName', label: '所属部门', type: 'text' },
                { key: 'applicantName', label: '报销人员', type: 'text' },
            ],
        },
        {
            key: 'meeting',
            title: '会议费信息',
            fields: [
                { key: 'meetingName', label: '会议名称', type: 'text' },
                { key: 'meetingPlanNo', label: '会议计划序号', type: 'text' },
                { key: 'meetingCategory', label: '会议类别', type: 'text' },
                { key: 'meetingLocation', label: '会议地点', type: 'text' },
                { key: 'startDate', label: '开始日期', type: 'date' },
                { key: 'endDate', label: '结束日期', type: 'date' },
                { key: 'meetingDays', label: '会议天数', type: 'number' },
                { key: 'attendanceCount', label: '参会人数', type: 'number' },
                { key: 'invoiceTotalAmount', label: '发票汇总金额', type: 'money' },
                { key: 'settlementTotalAmount', label: '结算/明细汇总金额', type: 'money' },
            ],
        },
        {
            key: 'pageExpense',
            title: '页面报销信息',
            fields: [
                { key: 'days', label: '页面天数 HYTS', type: 'number' },
                { key: 'peopleCount', label: '页面人数 HYRS', type: 'number' },
                { key: 'mealAmount', label: '伙食费 HSF', type: 'money' },
                { key: 'accommodationAmount', label: '住宿费 ZSF', type: 'money' },
                { key: 'venueAmount', label: '场地租金 CDF', type: 'money' },
                { key: 'otherAmount', label: '其他费用 QTFY', type: 'money' },
                { key: 'totalAmount', label: '合计金额 SQ_JE', type: 'money' },
                { key: 'paperAttachmentCount', label: '纸质附件张数 PJZS', type: 'number' },
            ],
        },
    ],
};
