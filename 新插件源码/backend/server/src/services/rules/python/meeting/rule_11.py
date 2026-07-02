import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import all_text, keyword_hits, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_11', 'name': '住宿清单套房提示', 'category': '住宿清单', 'level': 'warning'}

def evaluate(context):
    text = all_text(context, ['normalInvoice', 'accommodationList', 'meetingSettlement', 'other'])
    hits = keyword_hits(context, ['套房'], ['normalInvoice', 'accommodationList', 'meetingSettlement'])
    if hits:
        return make_warning('rule_11', RULE_META['name'], '发票或住宿清单中出现“套房”字眼。', '请核对住宿房型是否符合会议费管理要求。', build_evidence(hits=hits))
    if not text:
        return make_warning('rule_11', RULE_META['name'], '未提取到发票或住宿清单文本，需人工复核是否存在套房。', evidence=build_evidence(field='rawText'))
    return make_pass('rule_11', RULE_META['name'], '未发现“套房”字眼。')
