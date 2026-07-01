import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import get_summary_amount, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_13', 'name': '住宿费为零但存在场地租金提示', 'category': '费用结构', 'level': 'warning'}

def evaluate(context):
    accommodation = get_summary_amount(context, 'accommodationAmount')
    venue = get_summary_amount(context, 'venueRentAmount')
    if accommodation <= 0.01 and venue > 0.01:
        return make_warning('rule_13', RULE_META['name'], f'住宿费为 0 元，场地租金为 {venue:.2f} 元。', '请核对会议是否实际发生住宿、场地租金填报是否合理。', build_evidence(accommodationAmount=accommodation, venueRentAmount=venue))
    return make_pass('rule_13', RULE_META['name'], '未发现住宿费为 0 且场地租金不为 0 的情况。')
