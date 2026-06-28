const SCENARIO_TYPES = {
    smart: 'smart',
    travel: 'travel',
    other: 'other',
    meeting: 'meeting',
    training: 'training',
    reception: 'reception',
};

const ACTIVE_SCENARIOS = [
    SCENARIO_TYPES.travel,
    SCENARIO_TYPES.other,
];

const RESERVED_SCENARIOS = [
    SCENARIO_TYPES.meeting,
    SCENARIO_TYPES.training,
    SCENARIO_TYPES.reception,
];

function isSmartScenario(type) {
    return type === SCENARIO_TYPES.smart;
}

module.exports = {
    SCENARIO_TYPES,
    ACTIVE_SCENARIOS,
    RESERVED_SCENARIOS,
    isSmartScenario,
};

