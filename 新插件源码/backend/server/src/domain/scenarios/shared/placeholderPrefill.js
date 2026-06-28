function createPlaceholderPrefill(scenario) {
    return async function buildPrefill({ ocrItems = [] } = {}) {
        return {
            scenarioType: scenario.type,
            expenseType: scenario.type,
            scenarioLabel: scenario.label,
            placeholder: true,
            records: [],
            itinerary: [],
            summary: {
                message: `${scenario.label}场景目录已预留，当前暂未接入具体预填归集逻辑。`,
            },
            sourceStats: {
                ocrItemCount: ocrItems.length,
            },
            ocrItems,
        };
    };
}

function createPlaceholderRuleModel(scenario) {
    return {
        modelType: `${scenario.type}-reserved-rule-model`,
        isolated: true,
        ownerCity: scenario.ownerCity,
        rules: [
            {
                code: `${scenario.type}_placeholder`,
                name: `${scenario.label}指标模型占位`,
                level: 'info',
                enabled: false,
                description: '场景框架已预留，后续由负责地市按一条指标一个文件接入。',
            },
        ],
    };
}

module.exports = {
    createPlaceholderPrefill,
    createPlaceholderRuleModel,
};

