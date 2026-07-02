import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import make_pass, make_warning, make_skip, meeting_category_info, summary, build_evidence

RULE_META = {'id': 'rule_05', 'name': '会议类别判定', 'category': '会议类别', 'level': 'warning'}

def evaluate(context):
    info = meeting_category_info(context)
    category = info.get('category')
    s = summary(context)
    if not category:
        return make_skip('rule_05', RULE_META['name'], '报销单位名称、会议名称或参会人员范围字段', build_evidence(meetingName=s.get('meetingName')))
    evidence = info.get('evidence') or {}
    if info.get('confidence') == 'low':
        return make_warning('rule_05', RULE_META['name'], f'按现有字段仅可低置信度候选为{category}会议，需人工复核会议类别。', '请结合会议通知、会议计划审批表和参会范围确认类别；低置信度类别不应用于金额、人数、天数标准强判断。', evidence)
    return make_pass('rule_05', RULE_META['name'], f'按现有字段判定为{category}会议。', evidence)
