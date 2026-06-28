# SQLiteStudio 使用说明

1. 先启动新插件后端服务，访问 `http://服务器IP:3000/api/sqlite/status` 会自动创建空库。
2. 双击本目录下的 `打开SQLiteStudio.bat`。
3. 默认打开数据库：`backend/server/data/plugin_finance.sqlite`。
4. 当前只打通空库与通用 SQL 接口，表结构后续按发票、票价、住宿标准等业务数据再逐步设计。

后端接口：

- `GET /api/sqlite/status`
- `POST /api/sqlite/query`，请求体：`{"sql":"SELECT * FROM 表名","params":[]}`
- `POST /api/sqlite/exec`，请求体：`{"sql":"CREATE TABLE ...","params":[]}`
