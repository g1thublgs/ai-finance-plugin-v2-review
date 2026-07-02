import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import attendee_count_info, make_fail, make_pass, make_skip, recognized_meeting_category, category_evidence, build_evidence

RULE_META = {'id': 'rule_07', 'name': '会议人数超标准提示', 'category': '会议人数', 'level': 'warning'}
LIMITS = {'二类': 300, '三类': 150, '四类': 50}

def evaluate(context):
    category = recognized_meeting_category(context)
    count_info = attendee_count_info(context)
    count = count_info.get('count')
    if not category:
        return make_skip('rule_07', RULE_META['name'], '会议类别字段', build_evidence(attendeeCount=count, categoryEvidence=category_evidence(context)))
    if not count:
        return make_skip('rule_07', RULE_META['name'], '签到人数或参会人数字段', build_evidence(category=category))
    limit = LIMITS.get(category)
    if not limit:
        return make_skip('rule_07', RULE_META['name'], '可识别的二类、三类或四类会议类别字段', build_evidence(category=category, attendeeCount=count))
    if count >= limit:
        return make_fail('rule_07', RULE_META['name'], f'{category}会议参会人员 {count} 人，大于或等于规定人数 {limit} 人。', '请核对签到表人数和会议类别。', build_evidence(category=category, attendeeCount=count, source=count_info.get('source'), limit=limit))
    return make_pass('rule_07', RULE_META['name'], f'{category}会议参会人数 {count} 人未达到提示阈值 {limit} 人。')
