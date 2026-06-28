import re

from meeting.meeting_common import get_payments, issue, payment_value, result, safe_text, to_decimal


RULE_META = {
    "id": "meeting_rule_02",
    "name": "未使用公务卡结算提示",
    "category": "公务卡结算",
    "level": "warning",
}

ORG_WORDS = ["公司", "有限", "集团", "中心", "酒店", "宾馆", "饭店", "服务部", "商行", "合作社", "税务局", "财政局", "机关", "单位", "银行", "协会", "事务所", "学校", "医院"]


def looks_like_person_name(name):
    text = safe_text(name)
    return bool(re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", text)) and not any(word in text for word in ORG_WORDS)


def evaluate(context):
    issues = []
    for row in get_payments(context):
        payee = safe_text(payment_value(row, "payeeName", "payee", "skrmc", "SKRMC"))
        card_amount = to_decimal(payment_value(row, "cardAmount", "BX_JE", "bxJe"))
        card_time = safe_text(payment_value(row, "cardConsumeTime", "GWKHKSJ", "gwkhksj"))
        if payee and looks_like_person_name(payee) and not card_time and card_amount == 0:
            issues.append(issue(
                RULE_META["category"],
                f"收款人“{payee}”疑似自然人，且未读取到公务卡刷卡金额或公务卡消费时间。",
                "请核实该笔会议费是否应使用公务卡结算，或补充未使用公务卡的合规说明。",
                evidence={"payeeName": payee, "cardAmount": str(card_amount), "cardConsumeTime": card_time, "rowindex": row.get("rowindex", "")},
            ))
    return result(RULE_META, issues, "页面收款人信息未发现明显未使用公务卡结算提示。" if not issues else None)
