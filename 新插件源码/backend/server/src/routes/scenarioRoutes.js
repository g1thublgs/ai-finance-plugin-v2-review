const express = require('express');
const scenarios = require('../domain/scenarios');

const router = express.Router();

router.get('/', (req, res) => {
    res.json({ success: true, data: scenarios.listScenarios() });
});

router.get('/concrete/list', (req, res) => {
    res.json({ success: true, data: scenarios.listConcreteScenarios() });
});

router.get('/:type', (req, res) => {
    const scenario = scenarios.getScenario(req.params.type);
    if (!scenario) return res.status(404).json({ success: false, error: '场景不存在' });
    res.json({
        success: true,
        data: scenarios.listScenarios().find(item => item.type === scenario.type),
    });
});

module.exports = router;
