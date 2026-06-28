# 地市场景统一开发包

本包用于三个地市在同一套新插件框架内分别开发：

| 场景 | 目录 | 规则目录 |
|---|---|---|
| 会议费 | `新插件源码/backend/server/src/domain/scenarios/meeting/` | `新插件源码/backend/server/src/services/rules/python/meeting/` |
| 培训费 | `新插件源码/backend/server/src/domain/scenarios/training/` | `新插件源码/backend/server/src/services/rules/python/training/` |
| 公务接待费 | `新插件源码/backend/server/src/domain/scenarios/reception/` | `新插件源码/backend/server/src/services/rules/python/reception/` |

本包保留现有插件样式、前端工作台、后端框架、OCR、预填、审核、SQLite 记录能力，并保留 `other` 其他事项报销场景用于展示和借鉴。

## 前端界面说明

前端界面按现有重构后插件保留，不要求各地市先改界面。  
本包后端已保证 `other` 其他事项报销、会议费、培训费、公务接待费场景接口可用；演示其它事项报销审批时，选择“其他事项报销”或走智能入口自动识别即可。

## 已删除的差旅费资料

```text
server/src/domain/scenarios/travel/
server/src/services/rules/python/travel_20260531/
server/logs/
server/data/ 中的既有数据库和调试残留
差旅标准管理和差旅规则管理入口
```

## 开发原则

三个地市共用同一套包，但各自只改自己负责的场景目录和规则目录；不要互相改目录，不要修改平台主干。