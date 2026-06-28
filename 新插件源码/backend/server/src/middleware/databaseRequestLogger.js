const dataStore = require('../services/database/pluginDataStore');

function shouldSkip(req) {
    const url = req.originalUrl || req.url || '';
    return url === '/'
        || url.startsWith('/api/health')
        || url.startsWith('/api/sqlite')
        || req.method === 'OPTIONS';
}

async function databaseRequestLogger(req, res, next) {
    if (shouldSkip(req)) return next();
    const started = Date.now();
    try {
        req.dbRequestId = await dataStore.insertApiRequest({ req });
    } catch (error) {
        console.warn(`[DB] 保存请求日志失败：${req.method} ${req.originalUrl} ${error.message}`);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        const result = originalJson(body);
        if (req.dbRequestId) {
            dataStore.insertApiResponse({
                requestId: req.dbRequestId,
                caseId: req.dbCaseId || body?.caseId || body?.data?.caseId || '',
                statusCode: res.statusCode,
                body,
                elapsedMs: Date.now() - started,
            }).catch(error => {
                console.warn(`[DB] 保存响应日志失败：${req.method} ${req.originalUrl} ${error.message}`);
            });
        }
        return result;
    };
    return next();
}

module.exports = databaseRequestLogger;
