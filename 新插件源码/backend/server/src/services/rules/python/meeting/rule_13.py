from meeting.meeting_common import get_page_expense, has_page_expense, issue, result, skipped, to_decimal


RULE_META = {
    "id": "meeting_rule_13",
    "name": "住宿费为 0 但有场地租金审核",
    "category": "页面费用",
    "level": "warning",
}


def evaluate(context):
    if not has_page_expense(context):
        return skipped(RULE_META, "未读取到页面会议费报销字段，无法审核住宿费与场地租金关系。", {})
    page = get_page_expense(context)
    accommodation = to_decimal(page.get("accommodationAmount"))
    venue = to_decimal(page.get("venueAmount"))
    issues = []
    if accommodation == 0 and venue != 0:
        issues.append(issue(
            RULE_META["category"],
            f"页面住宿费为 0 元，但场地租金为 {venue} 元。",
            "请核实是否存在应填未填的住宿费用，或补充无需住宿但发生场地租金的说明。",
            evidence={"accommodationAmount": str(accommodation), "venueAmount": str(venue)},
        ))
    return result(RULE_META, issues, "住宿费与场地租金页面字段未发现该项异常。" if not issues else None)
