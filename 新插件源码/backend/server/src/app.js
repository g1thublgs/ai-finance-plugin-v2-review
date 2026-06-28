const express = require('express');
const config = require('./config/appConfig');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const databaseRequestLogger = require('./middleware/databaseRequestLogger');

const scenarioRoutes = require('./routes/scenarioRoutes');
const pluginCompatRoutes = require('./routes/pluginCompatRoutes');
const sqliteRoutes = require('./routes/sqliteRoutes');

function createApp() {
    const app = express();

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Auth-Token');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    app.use(express.json({ limit: '100mb' }));
    app.use(express.urlencoded({ extended: true, limit: '100mb' }));
    app.use(databaseRequestLogger);

    app.get('/', (req, res) => {
        res.json({
            success: true,
            service: '地市场景化财务插件后端服务',
            version: '2.0.0-city-dev',
            status: 'ok',
            endpoints: {
                health: '/api/health',
                upload: '/upload',
                task: '/task/:taskId',
                pluginPrefill: '/api/plugin/prefill',
                pluginAudit: '/api/plugin/audit',
                refinePrefillData: '/api/refinePrefillData',
                scenarios: '/api/scenarios',
                sqliteStatus: '/api/sqlite/status',
            },
        });
    });

    app.get('/api/health', (req, res) => {
        res.json({
            success: true,
            service: '地市场景化财务插件后端服务',
            status: 'ok',
            time: new Date().toISOString(),
            port: config.port,
        });
    });

    app.use('/', pluginCompatRoutes);
    app.use('/api/scenarios', scenarioRoutes);
    app.use('/api/sqlite', sqliteRoutes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = {
    createApp,
};