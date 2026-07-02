import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import attendee_count_info, invoice_amount, make_fail, make_pass, make_skip, meeting_days_info, recognized_meeting_category, category_evidence, build_evidence

RULE_META = {'id': 'rule_08', 'name': '会议费综合定额超标准提示', 'category': '综合定额', 'level': 'warning'}
STANDARDS = {'二类': 650, '三类': 550, '四类': 550}

def evaluate(context):
    category = recognized_meeting_category(context)
    count_info = attendee_count_info(context)
    day_info = meeting_days_info(context)
    count = count_info.get('count')
    days = day_info.get('days')
    amount = invoice_amount(context)
    if not category:
        return make_skip('rule_08', RULE_META['name'], '可识别的会议类别字段，无法判断会议费综合定额标准', build_evidence(attendeeCount=count, days=days, invoiceAmount=amount, categoryEvidence=category_evidence(context)))
    if not count or not days or not amount:
        return make_skip('rule_08', RULE_META['name'], '签到人数、会议天数或发票汇总金额字段', build_evidence(category=category, attendeeCount=count, days=days, invoiceAmount=amount))
    standard = STANDARDS[category]
    limit = count * days * standard
    if amount - limit > 0.01:
        return make_fail('rule_08', RULE_META['name'], f'发票汇总金额 {amount:.2f} 元大于定额标准 {limit:.2f} 元。', '请核对发票金额、签到人数、会议天数和会议类别。', build_evidence(category=category, attendeeCount=count, attendeeSource=count_info.get('source'), days=days, daySource=day_info.get('source'), standard=standard, formula='签到人数×会议天数×标准', limit=limit, invoiceAmount=amount))
    return make_pass('rule_08', RULE_META['name'], f'发票汇总金额未超过定额标准 {limit:.2f} 元。')
