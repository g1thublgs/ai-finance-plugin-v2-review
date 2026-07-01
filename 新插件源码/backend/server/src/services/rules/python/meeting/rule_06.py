import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import make_fail, make_pass, make_skip, meeting_category, meeting_days, build_evidence

RULE_META = {'id': 'rule_06', 'name': '会议天数超标准提示', 'category': '会议天数', 'level': 'warning'}

def evaluate(context):
    category = meeting_category(context)
    days = meeting_days(context)
    if not category:
        return make_skip('rule_06', RULE_META['name'], '会议类别字段', build_evidence(days=days))
    if not days:
        return make_skip('rule_06', RULE_META['name'], '会议天数字段', build_evidence(category=category))
    limit = 3 if category in ['二类', '三类'] else 2.5
    if days > limit:
        return make_fail('rule_06', RULE_META['name'], f'{category}会议天数 {days} 天，大于规定上限 {limit} 天。', '请核对会议通知时间、报到返程安排及天数计算口径。', build_evidence(category=category, days=days, limit=limit))
    return make_pass('rule_06', RULE_META['name'], f'{category}会议天数 {days} 天未超过上限 {limit} 天。')
