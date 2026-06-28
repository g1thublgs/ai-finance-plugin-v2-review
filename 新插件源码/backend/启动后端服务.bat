@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
if exist "%~dp0node-win7\node.exe" set "NODE_EXE=%~dp0node-win7\node.exe"
if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"
set "PUBLIC_HOST=150.72.128.228"

echo Starting backend service...
echo Working directory: %CD%
echo Local URL: http://127.0.0.1:3000
echo LAN URL: http://%PUBLIC_HOST%:3000
echo.

"%NODE_EXE%" -v >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo.
    echo Please install Node.js for Windows 7 x64, or put node.exe in one of these folders:
    echo   %~dp0node-win7\node.exe
    echo   %~dp0node\node.exe
    echo.
    echo Recommended for Windows 7: Node.js 12.22.12 x64.
    pause
    exit /b 1
)

echo Node version:
"%NODE_EXE%" -v
echo.

"%NODE_EXE%" server.js
pause
