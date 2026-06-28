# Python 规则目录说明

本目录用于放置会议费、培训费、公务接待费规则。分发包已经删除差旅费规则目录，仅保留通用执行器和三个新场景规则模板。

目录：

```text
meeting/
training/
reception/
```

新增规则时，在对应目录下新增 `rule_*.py`。建议一条指标一个文件，并在文件中暴露 `RULE_META` 和 `evaluate(context)`。