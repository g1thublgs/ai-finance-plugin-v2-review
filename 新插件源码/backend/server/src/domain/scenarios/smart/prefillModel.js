async function buildPrefill() {
    return {
        scenarioType: 'smart',
        expenseType: 'smart',
        placeholder: true,
        records: [],
        itinerary: [],
        summary: {
            message: '智能报销仅作为上传识别入口，预填时会自动切换到识别出的具体报销场景。',
        },
        sourceStats: {},
        ocrItems: [],
    };
}

module.exports = {
    buildPrefill,
};

