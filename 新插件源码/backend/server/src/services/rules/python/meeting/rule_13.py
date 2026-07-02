import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import get_summary_amount_info, make_pass, make_warning, build_evidence

RULE_META = {'id': 'rule_13', 'name': '住宿费为零但存在场地租金提示', 'category': '费用结构', 'level': 'warning'}

def evaluate(context):
    accommodation_info = get_summary_amount_info(context, 'accommodationAmount')
    venue_info = get_summary_amount_info(context, 'venueRentAmount')
    accommodation = accommodation_info.get('value')
    venue = venue_info.get('value')
    if not accommodation_info.get('hasValue') and venue_info.get('hasValue') and venue > 0.01:
        return make_warning('rule_13', RULE_META['name'], f'未采集到住宿费字段，场地租金为 {venue:.2f} 元。', '请人工复核住宿费是否确为 0 或未填，避免因字段缺失误判。', build_evidence(accommodationSource=accommodation_info.get('source'), venueRentAmount=venue, venueSource=venue_info.get('source')))
    if accommodation <= 0.01 and venue > 0.01:
        return make_warning('rule_13', RULE_META['name'], f'住宿费为 0 元，场地租金为 {venue:.2f} 元。', '请核对会议是否实际发生住宿、场地租金填报是否合理。', build_evidence(accommodationAmount=accommodation, accommodationSource=accommodation_info.get('source'), venueRentAmount=venue, venueSource=venue_info.get('source')))
    return make_pass('rule_13', RULE_META['name'], '未发现住宿费为 0 且场地租金不为 0 的情况。')
