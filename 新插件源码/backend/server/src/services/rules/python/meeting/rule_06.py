import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import make_fail, make_pass, make_skip, meeting_days_info, recognized_meeting_category, category_evidence, build_evidence

RULE_META = {'id': 'rule_06', 'name': '会议天数超标准提示', 'category': '会议天数', 'level': 'warning'}
LIMITS = {'二类': 3, '三类': 3, '四类': 2.5}

def evaluate(context):
    category = recognized_meeting_category(context)
    day_info = meeting_days_info(context)
    days = day_info.get('days')
    if not category:
        return make_skip('rule_06', RULE_META['name'], '可识别的会议类别字段，无法判断会议天数标准', build_evidence(days=days, categoryEvidence=category_evidence(context)))
    if not days:
        return make_skip('rule_06', RULE_META['name'], '会议天数字段', build_evidence(category=category))
    limit = LIMITS[category]
    if days > limit:
        return make_fail('rule_06', RULE_META['name'], f'{category}会议天数 {days} 天，大于规定上限 {limit} 天。', '请核对会议通知时间、报到返程安排及天数计算口径。', build_evidence(category=category, days=days, source=day_info.get('source'), limit=limit, dayEvidence=day_info.get('evidence')))
    return make_pass('rule_06', RULE_META['name'], f'{category}会议天数 {days} 天未超过上限 {limit} 天。')
