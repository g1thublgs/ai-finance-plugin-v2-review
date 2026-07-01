@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo 正在启动场景化财务插件后端服务...
echo 默认地址：http://127.0.0.1:3000
echo.
node server.js
pause
