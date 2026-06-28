# 插件后端场景化架构说明

## 本分发包场景

```text
smart      智能入口，只负责分流
other      其他事项报销，保留展示和借鉴
meeting    会议费
training   培训费
reception  公务接待费
```

## 主要分层

```text
server/src/app.js                    Express 应用、跨域、路由挂载
server/src/routes/                   接口层
server/src/services/ocr/             OCR 任务、提示词、结果归一化
server/src/services/prefill/         预填调度
server/src/services/audit/           规则审核调度
server/src/services/database/        SQLite 落库
server/src/domain/scenarios/         场景模型
server/src/services/rules/python/    Python 指标规则
```

各地市优先修改本场景目录和本场景规则目录。公共服务修改必须在开发文档中说明影响范围。