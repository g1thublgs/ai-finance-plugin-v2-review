const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const sqliteService = require('../services/database/sqliteService');

const router = express.Router();

router.get('/status', asyncHandler(async (req, res) => {
    res.json({ success: true, data: await sqliteService.getStatus() });
}));

router.post('/query', asyncHandler(async (req, res) => {
    const rows = await sqliteService.query(req.body?.sql || '', Array.isArray(req.body?.params) ? req.body.params : []);
    res.json({ success: true, data: { rows, rowCount: rows.length } });
}));

router.post('/exec', asyncHandler(async (req, res) => {
    const result = await sqliteService.exec(req.body?.sql || '', Array.isArray(req.body?.params) ? req.body.params : []);
    res.json({ success: true, data: result });
}));

module.exports = router;
