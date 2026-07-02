import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import has_doc_type, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_04', 'name': '会议附件完整性审核', 'category': '材料完整性', 'level': 'warning'}
REQUIRED = [('meetingPlan', '会议计划'), ('meetingNotice', '会议通知'), ('attendanceList', '签到表/参会名单'), ('meetingSettlement', '费用明细/结算单')]

def evaluate(context):
    recognized = [label for doc_type, label in REQUIRED if has_doc_type(context, doc_type)]
    missing = [label for doc_type, label in REQUIRED if not has_doc_type(context, doc_type)]
    if missing:
        return make_warning('rule_04', RULE_META['name'], f'会议附件疑似不齐全，缺少：{"、".join(missing)}。', '请补充对应附件，或确认 OCR 材料类型识别是否准确。', build_evidence(recognized=recognized, missing=missing))
    return make_pass('rule_04', RULE_META['name'], '会议计划、会议通知、签到表/参会名单、费用明细/结算单均已识别。', build_evidence(recognized=recognized))
