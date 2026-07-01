require('./server/src/server').start().catch(error => {
    console.error('场景化财务插件后端服务启动失败：', error);
    process.exit(1);
});
