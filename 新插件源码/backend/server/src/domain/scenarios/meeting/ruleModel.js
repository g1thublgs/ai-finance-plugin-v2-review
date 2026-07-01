const rules = [
    ['rule_01', '会议地点是否位于明令禁止风景名胜区', '识别会议通知的会议地点，判断是否在党中央、国务院明令禁止的 21 个风景名胜区内。', ['meetingLocation', 'meetingNotice']],
    ['rule_02', '未使用公务卡结算提示', '识别财务信息-收款人信息，收款方疑似个人且无刷卡时间及刷卡金额时提示。', ['payments.payeeName', 'payments.cardAmount', 'payments.cardTime']],
    ['rule_03', '发票及费用明细异常内容提示', '发票、费用原始明细单据出现景点、景区、门票、导游、花草、背景板等内容时提示。', ['ocrItems.rawText', 'itemsDetail', 'details']],
    ['rule_04', '会议附件完整性审核', '通过会议计划、会议通知、签到表、费用明细、结算单等字眼判断附件是否上传齐全。', ['hasMeetingPlan', 'hasMeetingNotice', 'hasAttendanceList', 'hasSettlement']],
    ['rule_05', '会议类别判定', '根据报销单位名称、会议通知会议名称、参会人员和会议计划审批表判定二类、三类、四类会议。', ['reimbursementUnitName', 'meetingName', 'attendeeScope']],
    ['rule_06', '会议天数超标准提示', '二、三类会议大于 3 天，四类会议大于 2.5 天时提示。', ['meetingCategory', 'meetingDays', 'startDate', 'endDate']],
    ['rule_07', '会议人数超标准提示', '二类会议参会人员大于等于 300 人、三类大于等于 150 人、四类大于等于 50 人时提示。', ['meetingCategory', 'attendeeCount']],
    ['rule_08', '会议费综合定额超标准提示', '二类按签到人数×会议天数×650 元/人/天，三、四类按签到人数×会议天数×550 元/人/天核对发票汇总金额。', ['meetingCategory', 'attendeeCount', 'meetingDays', 'invoiceAmount']],
    ['rule_09', '伙食费住宿费分项标准审核', '二类会议伙食费、住宿费分别按 150、400 元/人/天；三类会议分别按 130、340 元/人/天核对。', ['meetingCategory', 'attendeeCount', 'meetingDays', 'mealAmount', 'accommodationAmount']],
    ['rule_10', '会议时间是否为节假日或周末', '识别会议通知会议时间，判断是否在国家法定节假日或周末。', ['startDate', 'endDate', 'meetingDate']],
    ['rule_11', '住宿清单套房提示', '发票、住宿清单中出现“套房”字眼时提示。', ['ocrItems.rawText', 'accommodationList']],
    ['rule_12', '高档菜肴烟酒野生等内容提示', '费用明细出现含酒精饮料、鱼翅、燕窝、酒、香烟、野生等内容时提示。', ['ocrItems.rawText', 'itemsDetail', 'details']],
    ['rule_13', '住宿费为零但存在场地租金提示', '申请信息中住宿费为 0 且场地租金不为 0 时提示。', ['accommodationAmount', 'venueRentAmount']],
    ['rule_14', '设备租赁及音视频技术服务类费用提示', '发票、费用明细出现设备租赁费、线路费、电视电话会议通话费、技术服务费、软件应用费、音视频制作费时提示。', ['ocrItems.rawText', 'itemsDetail', 'details']],
];

module.exports = {
    modelType: 'meeting-rule-model',
    scenarioType: 'meeting',
    scenarioLabel: '会议费报销',
    ownerCity: '会议费开发地市',
    status: 'development',
    rules: rules.map(([code, name, description, requiredFields], index) => ({
        code,
        name,
        level: 'warning',
        description,
        requiredFields,
        pythonFile: `${code}.py`,
        sourceRuleNo: String(index + 1),
        implementationStatus: ['rule_05', 'rule_06', 'rule_10'].includes(code) ? 'partial' : 'implemented-first-round',
    })),
};
