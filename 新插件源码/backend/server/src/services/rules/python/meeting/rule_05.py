import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import make_pass, make_skip, meeting_category, summary, build_evidence

RULE_META = {'id': 'rule_05', 'name': '会议类别判定', 'category': '会议类别', 'level': 'warning'}

def evaluate(context):
    category = meeting_category(context)
    s = summary(context)
    if not category:
        return make_skip('rule_05', RULE_META['name'], '报销单位名称、会议名称或参会人员范围字段', build_evidence(meetingName=s.get('meetingName')))
    return make_pass('rule_05', RULE_META['name'], f'按现有字段初步判定为{category}会议。')
