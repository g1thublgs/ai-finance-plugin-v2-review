const { writeDebugLog } = require('../utils/debugLogger');

function notFound(req, res) {
    res.status(404).json({
        success: false,
        error: `接口不存在：${req.method} ${req.originalUrl}`,
    });
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    console.error('[AI Finance Error]', error);
    writeDebugLog('http-error', {
        caseId: req.dbCaseId || req.body?.caseId || '',
        requestId: req.dbRequestId || '',
        method: req.method,
        url: req.originalUrl,
        message: error.message,
        stack: error.stack,
    });
    res.status(error.status || 500).json({
        success: false,
        error: error.message || '系统内部错误',
        details: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    });
}

module.exports = {
    notFound,
    errorHandler,
};
