# 新场景开发说明

会议费、培训费、公务接待费均按同一结构开发：

```text
server/src/domain/scenarios/<scenario>/index.js
server/src/domain/scenarios/<scenario>/ocrPrompt.js
server/src/domain/scenarios/<scenario>/ocrProfile.js
server/src/domain/scenarios/<scenario>/prefillModel.js
server/src/domain/scenarios/<scenario>/ruleModel.js
server/src/domain/scenarios/<scenario>/formSchema.js
server/src/services/rules/python/<scenario>/rule_*.py
```

提交时必须同步提交场景开发文档，写清数据结构、规则审核逻辑、归集逻辑和测试结果。