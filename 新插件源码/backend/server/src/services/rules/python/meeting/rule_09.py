import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import attendee_count, get_summary_amount, make_fail, make_pass, make_skip, meeting_category, meeting_days, issue, result, build_evidence

RULE_META = {'id': 'rule_09', 'name': '伙食费住宿费分项标准审核', 'category': '分项标准', 'level': 'warning'}
STANDARDS = {'二类': {'meal': 150, 'accommodation': 400}, '三类': {'meal': 130, 'accommodation': 340}}

def evaluate(context):
    category = meeting_category(context)
    count = attendee_count(context)
    days = meeting_days(context)
    meal = get_summary_amount(context, 'mealAmount')
    accommodation = get_summary_amount(context, 'accommodationAmount')
    if category not in STANDARDS:
        return make_skip('rule_09', RULE_META['name'], '二类或三类会议类别字段（规则清单未给出四类分项标准）', build_evidence(category=category))
    if not count or not days:
        return make_skip('rule_09', RULE_META['name'], '人数或天数字段', build_evidence(category=category, attendeeCount=count, days=days))
    standards = STANDARDS[category]
    issues = []
    meal_limit = count * days * standards['meal']
    accommodation_limit = count * days * standards['accommodation']
    if meal - meal_limit > 0.01:
        issues.append(issue(RULE_META['name'], f'{category}会议伙食费 {meal:.2f} 元大于标准 {meal_limit:.2f} 元。', '请核对伙食费、人天数和会议类别。', 'error', build_evidence(item='meal', amount=meal, limit=meal_limit)))
    if accommodation - accommodation_limit > 0.01:
        issues.append(issue(RULE_META['name'], f'{category}会议住宿费 {accommodation:.2f} 元大于标准 {accommodation_limit:.2f} 元。', '请核对住宿费、人天数和会议类别。', 'error', build_evidence(item='accommodation', amount=accommodation, limit=accommodation_limit)))
    if issues:
        return result('rule_09', RULE_META['name'], False, f'发现 {len(issues)} 个分项标准提示。', issues)
    return make_pass('rule_09', RULE_META['name'], '伙食费、住宿费未超过规则清单给出的分项标准。')
