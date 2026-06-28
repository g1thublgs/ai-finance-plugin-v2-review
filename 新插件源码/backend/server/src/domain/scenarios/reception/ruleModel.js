module.exports = {
    modelType: 'reception-rule-model',
    scenarioType: 'reception',
    scenarioLabel: '公务接待费报销',
    ownerCity: '公务接待费开发地市',
    status: 'development',
    rules: [
        {
            code: 'reception_approval_required',
            name: '审批材料完整性审核',
            level: 'warning',
            description: '核对本场景是否上传必要审批、通知、清单或说明材料。',
        },
        {
            code: 'reception_amount_consistency',
            name: '金额一致性审核',
            level: 'warning',
            description: '核对申请金额、发票金额、支付金额和归集金额是否一致。',
        },
        {
            code: 'reception_standard_limit',
            name: '标准限额审核',
            level: 'warning',
            description: '根据本地市政策标准核对人数、天数、单价、总额等是否超标准。',
        },
    ],
};