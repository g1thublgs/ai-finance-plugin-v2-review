@echo off
setlocal
set "TOOL_DIR=%~dp0SQLiteStudio\SQLiteStudio"
set "DB_PATH=%~dp0..\backend\server\data\plugin_finance.sqlite"
if not exist "%TOOL_DIR%\SQLiteStudio.exe" (
  echo 未找到 SQLiteStudio.exe，请确认 tools\SQLiteStudio 文件夹完整。
  pause
  exit /b 1
)
if not exist "%~dp0..\backend\server\data" mkdir "%~dp0..\backend\server\data"
start "" "%TOOL_DIR%\SQLiteStudio.exe" "%DB_PATH%"
endlocal
