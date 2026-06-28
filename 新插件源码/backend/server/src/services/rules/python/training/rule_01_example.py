RULE_META = {
    'id': 'training_example_01',
    'name': '示例规则：材料完整性提示',
    'category': '材料完整性',
    'level': 'warning',
}


def evaluate(context):
    records = context.get('records') or context.get('prefillData', {}).get('records') or []
    issues = []
    if not records:
        issues.append({
            'category': '材料完整性',
            'description': '当前 OCR 与归集结果未形成可审核记录。',
            'suggestion': '请检查 OCR 提示词、单据类型和 prefillModel.js 归集逻辑。',
            'severity': 'warning',
        })
    return {
        'passed': len(issues) == 0,
        'issues': issues,
        'summary': '已形成可审核记录。' if not issues else '未形成可审核记录。',
    }