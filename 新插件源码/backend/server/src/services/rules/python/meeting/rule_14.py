import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import all_text, keyword_hits, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_14', 'name': '设备租赁及音视频技术服务类费用提示', 'category': '费用内容', 'level': 'warning'}
KEYWORDS = ['设备租赁费', '线路费', '电视电话会议通话费', '技术服务费', '软件应用费', '音视频制作费']

def evaluate(context):
    text = all_text(context, ['normalInvoice', 'meetingSettlement', 'other'])
    if not text:
        return make_warning('rule_14', RULE_META['name'], '未提取到发票或费用原始明细文本，需人工复核设备租赁及音视频技术服务类费用。', evidence=build_evidence(field='rawText'))
    hits = keyword_hits(context, KEYWORDS, ['normalInvoice', 'meetingSettlement', 'other'])
    if hits:
        words = sorted(set(item['keyword'] for item in hits))
        return make_warning('rule_14', RULE_META['name'], f'费用明细中出现设备租赁或技术服务类内容：{"、".join(words)}。', '请核对该费用是否符合会议费列支范围。', build_evidence(hits=hits))
    return make_pass('rule_14', RULE_META['name'], '未命中设备租赁及音视频技术服务类关键词。')
