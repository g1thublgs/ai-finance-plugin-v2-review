import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import all_text, keyword_hits, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_12', 'name': '高档菜肴烟酒野生等内容提示', 'category': '费用内容', 'level': 'warning'}
KEYWORDS = ['含酒精', '鱼翅', '燕窝', '茅台', '习酒', '郎酒', '武陵酒', '国台', '钓鱼台', '五粮液', '泸州老窖', '剑南春', '洋河', '古井贡酒', '水井坊', '汾酒', '二锅头', '牛栏山', '啤酒', '黄酒', '香烟', '中华', '云烟', '玉溪', '红塔山', '芙蓉王', '白沙', '黄鹤楼', '雪茄', '野生']

def evaluate(context):
    text = all_text(context, ['normalInvoice', 'meetingSettlement', 'other'])
    if not text:
        return make_warning('rule_12', RULE_META['name'], '未提取到发票或费用原始明细文本，需人工复核高档菜肴、烟酒等内容。', evidence=build_evidence(field='rawText'))
    hits = keyword_hits(context, KEYWORDS, ['normalInvoice', 'meetingSettlement', 'other'])
    if hits:
        words = sorted(set(item['keyword'] for item in hits))
        return make_warning('rule_12', RULE_META['name'], f'费用明细中出现需关注的高档菜肴、烟酒或野生等内容：{"、".join(words)}。', '请核对该费用是否属于会议费合规开支范围。', build_evidence(hits=hits))
    return make_pass('rule_12', RULE_META['name'], '未命中高档菜肴、烟酒或野生等关键词。')
