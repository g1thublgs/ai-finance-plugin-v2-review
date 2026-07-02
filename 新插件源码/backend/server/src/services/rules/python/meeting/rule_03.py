import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import all_text, keyword_hits, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_03', 'name': '发票及费用明细异常内容提示', 'category': '费用内容', 'level': 'warning'}
KEYWORDS = ['景点', '景区', '门票', '导游', '花草', '水果', '背景板', '展板', '烟', '酒', '屏幕', '音响', '电脑', '复印机', '打印机', '传真机', '旅游', '娱乐', '健身', '纪念品', '洗漱用品', '会议背景']

def evaluate(context):
    text = all_text(context, ['normalInvoice', 'meetingSettlement', 'other'])
    if not text:
        return make_warning('rule_03', RULE_META['name'], '未提取到发票或费用原始明细文本，需人工复核异常费用内容。', evidence=build_evidence(field='rawText'))
    hits = keyword_hits(context, KEYWORDS, ['normalInvoice', 'meetingSettlement', 'other'], ['背景材料', '背景介绍'])
    if hits:
        words = sorted(set(item['keyword'] for item in hits))
        return make_warning('rule_03', RULE_META['name'], f'发票或费用明细中出现需关注内容：{"、".join(words)}', '请核对该费用是否属于会议费合规开支范围。', build_evidence(hits=hits))
    return make_pass('rule_03', RULE_META['name'], '发票和费用明细未命中异常内容关键词。')
