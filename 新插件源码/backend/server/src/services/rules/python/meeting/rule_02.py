import pathlib
import re
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import make_pass, make_warning, payments, parse_amount, to_text, build_evidence

RULE_META = {'id': 'rule_02', 'name': '未使用公务卡结算提示', 'category': '公务卡结算', 'level': 'warning'}

def looks_person_name(name):
    text = re.sub(r'\s+', '', to_text(name))
    org_words = ['公司', '酒店', '宾馆', '税务局', '中心', '单位', '服务部', '有限公司', '学校', '学院', '饭店', '餐厅', '会务', '会议']
    return bool(re.match(r'^[\u4e00-\u9fa5]{2,4}$', text)) and not any(k in text for k in org_words)

def evaluate(context):
    rows = payments(context)
    if not rows:
        return make_warning('rule_02', RULE_META['name'], '未提取到财务信息-收款人信息，需人工复核是否使用公务卡结算。', evidence=build_evidence(field='payments'))
    issues = []
    for row in rows:
        payee = to_text(row.get('payee') or row.get('skrmc') or row.get('payeeName') or row.get('收款人名称'))
        card_raw = row.get('cardAmount') or row.get('BX_JE') or row.get('刷卡金额')
        card_amount = parse_amount(card_raw)
        card_time = to_text(row.get('cardTime') or row.get('GWKHKSJ') or row.get('刷卡时间'))
        if payee and looks_person_name(payee) and not card_time and (card_amount is None or card_amount <= 0):
            issues.append(payee)
    if issues:
        return make_warning('rule_02', RULE_META['name'], f'收款人疑似个人且无刷卡时间及刷卡金额：{"、".join(issues)}', '请核对是否应使用公务卡结算或补充公务卡消费明细。', build_evidence(payees=issues))
    return make_pass('rule_02', RULE_META['name'], '未发现疑似个人收款且缺少公务卡信息的记录。')
