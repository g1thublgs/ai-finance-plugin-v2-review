const { compactText } = require('../../shared/textUtils');

const DEFAULT_BUDGET_INDICATORS = `
710101022104 交通补贴|交通补贴|行政运行公用
710101022304 体检费|体检费|行政运行公用
7101010205 电费|电费|行政运行公用
710102021803 其他委托业务|其他委托业务|税费协同共治
710102022309 其他|应急药品|地方综合社会事务
71010202230902 其他支出|其他支出（法院诉讼受理费）|地方综合社会事务
71010202230904 党建和文化建设|党建和文化建设|地方综合社会事务
710102022307 广告宣传费|税务宣传费|优化营商环境
710101022302 活动费|党建活动|行政运行公用
710101022105 租用费|租车费（党建活动）|行政运行公用
710102020201 办公印刷|其他印刷|优化营商环境
710101022305 离退休人员公用支出|离退休公用经费（离世慰问）|行政运行公用
710101020103 其他办公|其他办公|行政运行公用
710101022001 燃料（充电）费|燃料（充电）费|行政运行公用
710101020801 办公物业|保洁服务|行政运行公用
710101021802 购买服务费用|餐厨保安等后勤服务|其他预算收入
710101022002 维修费|公车维修费|行政运行公用
710101022306 食堂费用|其他饭堂费用|行政运行公用
710101020601 邮寄费|邮寄费|行政运行公用
710101020101 日常办公用品|饮用水|行政运行公用
710101022305 离退休人员公用支出|离退休公用经费（住院慰问）|行政运行公用
710101022006 其他公车运维|其他公车运维|行政运行公用
710101022003 过桥过路费|过路过桥费|行政运行公用
7101010204 水费|水费|行政运行公用
71010102030401 其他手续费|手续费|其他预算收入
710101021101 公房维修|公房维修|行政运行公用
710101021102 设备维修|设备维修|行政运行公用
710101020101 日常办公用品|日常办公用品|行政运行公用
710101022004 保险费|公车保险费|行政运行公用
710101022305 离退休人员公用支出|离退休人员公用支出|行政运行公用
7101010222 税金及附加费用|税金及附加费用|行政运行公用
710101022306 食堂费用|饭堂补助|行政运行公用
71010102060202 有线电视费|有线电视费|行政运行公用
71010102060201 电话费|电话费|行政运行公用
710101020801 办公物业|办公物业|行政运行公用
710102020302 三代手续费|三代手续费|代扣代收代征税款手续费
`.trim().split('\n').map((line, index) => {
    const [economicSubject = '', purpose = '', functionSubject = ''] = line.split('|');
    return {
        id: index + 1,
        scenario_type: 'other',
        economic_subject: economicSubject,
        purpose,
        function_subject: functionSubject,
        keywords: [economicSubject, purpose, functionSubject].join('|'),
        enabled: 1,
    };
});

function scoreBudget(row, keywords) {
    const haystack = compactText([row.economic_subject, row.purpose, row.function_subject, row.keywords].join('|'));
    if (!haystack) return 0;
    let score = 0;
    const text = keywords.map(compactText).join('|');
    const subject = compactText(row.economic_subject);
    const purpose = compactText(row.purpose);
    if (/电费|售电|电网|供电|用电/.test(text) && /电费/.test(haystack)) score += 80;
    if (/交通补贴|出租车|出租汽车|公务出行|出行明细/.test(text) && /交通补贴/.test(haystack)) score += 100;
    if (/水费|供水|自来水|用水/.test(text) && /水费/.test(haystack)) score += 80;
    if (/食材|食堂|饭堂|膳食|餐饮|配送/.test(text) && /食堂|饭堂/.test(haystack)) score += 80;
    if (/设备维修|维修费|检修|维护保养/.test(text) && /设备维修/.test(haystack)) score += 80;
    if (/公房维修|房屋维修|修缮/.test(text) && /公房维修/.test(haystack)) score += 80;
    if (/厨房用品|厨具|餐具|厨房设备|厨房用具/.test(text) && /食堂|饭堂/.test(haystack)) score += 55;
    if (/办公用品|日常办公|文具|耗材|硒鼓|打印纸/.test(text) && /办公用品/.test(haystack)) score += 70;
    if (/物业|保洁|安保|保安|后勤服务/.test(text) && /物业|服务/.test(haystack)) score += 55;
    if (subject && text.includes(subject)) score += 20;
    if (purpose && text.includes(purpose)) score += 20;
    keywords.forEach(keyword => {
        const key = compactText(keyword);
        if (!key) return;
        if (haystack.includes(key)) score += Math.min(8, key.length);
        if (row.purpose && key.includes(compactText(row.purpose))) score += 2;
        if (row.economic_subject && key.includes(compactText(row.economic_subject))) score += 2;
    });
    return score;
}

async function pickBudgetIndicator(keywords = []) {
    const rows = DEFAULT_BUDGET_INDICATORS;
    const scored = rows
        .map(row => ({ row, score: scoreBudget(row, keywords) }))
        .sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0
        ? scored[0].row
        : (rows.find(row => /其他/.test(row.economic_subject || row.purpose || '')) || rows[0] || null);
}

module.exports = {
    DEFAULT_BUDGET_INDICATORS,
    pickBudgetIndicator,
};
