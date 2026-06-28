import importlib.util
import json
import pathlib
import sys
import traceback


ROOT = pathlib.Path(__file__).resolve().parent
ROOT_TEXT = str(ROOT)
if ROOT_TEXT not in sys.path:
    sys.path.insert(0, ROOT_TEXT)


def load_json_stdin():
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def safe_scenario_name(value):
    text = str(value or '').strip()
    if not text.replace('_', '').replace('-', '').isalnum():
        return ''
    return text


def load_rule_module(path):
    spec = importlib.util.spec_from_file_location(path.stem, str(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_rule_result(file_name, module, result):
    meta = getattr(module, 'RULE_META', {}) or {}
    if result is None:
        result = {}
    if isinstance(result, list):
        issues = result
        skipped = False
        passed = len(issues) == 0
        status = 'pass' if passed else 'warning'
        summary = '通过' if passed else f'发现 {len(issues)} 个问题'
    else:
        issues = result.get('issues') or []
        skipped = bool(result.get('skipped')) or result.get('status') == 'skipped'
        passed = bool(result.get('passed', len(issues) == 0)) and not skipped
        summary = result.get('summary') or ('通过' if passed else f'发现 {len(issues)} 个问题')
        status = result.get('status') or ('skipped' if skipped else ('pass' if passed else 'warning'))
    return {
        'id': meta.get('id') or file_name,
        'ruleId': meta.get('id') or file_name,
        'ruleName': meta.get('name') or file_name,
        'status': status,
        'skipped': skipped,
        'passed': passed,
        'issues': issues,
        'summary': summary,
        'fileName': file_name,
        'meta': meta,
    }


def main():
    context = load_json_stdin()
    scenario_type = safe_scenario_name(context.get('scenarioType'))
    rule_dir = ROOT / scenario_type
    if not scenario_type or not rule_dir.exists():
        print(json.dumps({
            'issues': [],
            'summary': f'未找到场景规则目录：{scenario_type or "空"}',
            'ruleResults': [],
            'engine': 'python-rule-functions',
        }, ensure_ascii=False))
        return

    rule_results = []
    issues = []
    for path in sorted(rule_dir.glob('rule_*.py')):
        try:
            module = load_rule_module(path)
            evaluator = getattr(module, 'evaluate', None) or getattr(module, 'run', None)
            if evaluator is None:
                continue
            item = normalize_rule_result(path.name, module, evaluator(context))
            rule_results.append(item)
            issues.extend(item.get('issues') or [])
        except Exception as exc:
            issue = {
                'category': '规则执行异常',
                'description': f'{path.name}: {exc}',
                'suggestion': '请检查该规则文件的字段读取、类型转换和返回结构。',
                'severity': 'error',
                'traceback': traceback.format_exc(limit=5),
            }
            issues.append(issue)
            rule_results.append({
                'id': path.name,
                'ruleId': path.name,
                'ruleName': path.name,
                'status': 'error',
                'passed': False,
                'issues': [issue],
                'summary': '规则执行异常',
                'fileName': path.name,
            })

    print(json.dumps({
        'issues': issues,
        'summary': '未发现规则问题。' if not issues else f'发现 {len(issues)} 个规则问题。',
        'ruleResults': rule_results,
        'engine': 'python-rule-functions',
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
