const config = require('./config/appConfig');
const { createApp } = require('./app');
const dataStore = require('./services/database/pluginDataStore');

async function start() {
    await dataStore.initDatabase();
    const app = createApp();
    app.listen(config.port, config.host, () => {
        console.log(`地市场景化财务插件后端已启动：http://${config.publicHost}:${config.port}`);
        console.log(`本机访问：http://127.0.0.1:${config.port}`);
        console.log('统一上传接口：POST /upload，查询任务：GET /task/:taskId');
        console.log('统一预填接口：POST /api/plugin/prefill');
        console.log('统一审核接口：POST /api/plugin/audit');
        console.log('场景清单接口：GET /api/scenarios');
    });
}

module.exports = {
    start,
};