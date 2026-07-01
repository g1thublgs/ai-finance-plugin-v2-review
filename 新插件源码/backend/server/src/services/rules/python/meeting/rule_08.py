import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import attendee_count, invoice_amount, make_fail, make_pass, make_skip, meeting_category, meeting_days, build_evidence

RULE_META = {'id': 'rule_08', 'name': '会议费综合定额超标准提示', 'category': '综合定额', 'level': 'warning'}

def evaluate(context):
    category = meeting_category(context)
    count = attendee_count(context)
    days = meeting_days(context)
    amount = invoice_amount(context)
    if not category:
        return make_skip('rule_08', RULE_META['name'], '会议类别字段', build_evidence(attendeeCount=count, days=days, invoiceAmount=amount))
    if not count or not days or not amount:
        return make_skip('rule_08', RULE_META['name'], '签到人数、会议天数或发票汇总金额字段', build_evidence(category=category, attendeeCount=count, days=days, invoiceAmount=amount))
    standard = 650 if category == '二类' else 550
    limit = count * days * standard
    if amount - limit > 0.01:
        return make_fail('rule_08', RULE_META['name'], f'发票汇总金额 {amount:.2f} 元大于定额标准 {limit:.2f} 元。', '请核对发票金额、签到人数、会议天数和会议类别。', build_evidence(category=category, attendeeCount=count, days=days, standard=standard, limit=limit, invoiceAmount=amount))
    return make_pass('rule_08', RULE_META['name'], f'发票汇总金额未超过定额标准 {limit:.2f} 元。')
