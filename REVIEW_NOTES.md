# Review Notes

This repository contains the review-friendly v2 source and documentation.

The local deployment folder also contains Win7 runtime binaries, dependency folders, and packaged zip files. Those are intentionally excluded from GitHub because they are generated/vendor artifacts or exceed normal GitHub source-review limits.

Important v2 source changes to review:

- `新插件源码/backend/server/src/domain/scenarios/meeting/`
- `新插件源码/backend/server/src/services/rules/python/meeting/`
- `新插件源码/backend/server/src/services/rules/python/run_rules.py`
- `新插件源码/backend/server/src/services/audit/ruleEngine.js`
- `新插件源码/backend/server/src/services/database/sqliteService.js`
- `新插件源码/预填预审事中审核一体化插件/content.js`
- `新插件源码/预填预审事中审核一体化插件/popup.js`
- `README_v2_Win7合成说明.md`

Validation already run locally:

- Node 12.22.12 loaded backend modules through the Babel entrypoint.
- Python 3.8.10 compiled the Python rule files.
- Meeting fee regression tests passed: 48 tests.
- Backend rule engine returned 14 meeting rules and 15 sample issues for `meeting_test_context.json`.
