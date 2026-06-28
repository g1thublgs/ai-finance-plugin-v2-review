from decimal import Decimal

from meeting.meeting_common import determine_meeting_category, get_page_expense, has_page_expense, issue, result, skipped, to_decimal


RULE_META = {
    "id": "meeting_rule_09",
    "name": "伙食费、住宿费超标准审核",
    "category": "分项标准",
    "level": "warning",
}

STANDARDS = {
    "二类会议": {"mealAmount": Decimal("150"), "accommodationAmount": Decimal("400")},
    "三类会议": {"mealAmount": Decimal("130"), "accommodationAmount": Decimal("340")},
}


def evaluate(context):
    category, reason, category_evidence = determine_meeting_category(context)
    if category == "四类会议":
        return skipped(RULE_META, "第一轮暂未配置四类会议伙食费、住宿费标准，待补充口径。", {"meetingCategory": category, "categoryReason": reason})
    if not has_page_expense(context):
        return skipped(RULE_META, "未读取到页面会议费报销字段，伙食费/住宿费标准规则需人工复核。", {})
    page = get_page_expense(context)
    days = to_decimal(page.get("days"))
    people = to_decimal(page.get("peopleCount"))
    if days <= 0 or people <= 0:
        return skipped(RULE_META, "页面天数或人数缺失/为 0，伙食费/住宿费标准规则需人工复核。", {"days": str(days), "peopleCount": str(people)})

    standards = STANDARDS[category]
    issues = []
    meal = to_decimal(page.get("mealAmount"))
    meal_limit = days * people * standards["mealAmount"]
    if meal > meal_limit:
        issues.append(issue(
            RULE_META["category"],
            f"{category}伙食费 {meal} 元超过标准上限 {meal_limit} 元。",
            "请核实页面伙食费、会议天数、人数和会议类别。",
            evidence={"mealAmount": str(meal), "limit": str(meal_limit), "standard": str(standards["mealAmount"]), "days": str(days), "peopleCount": str(people), **category_evidence},
        ))

    accommodation = to_decimal(page.get("accommodationAmount"))
    accommodation_limit = days * people * standards["accommodationAmount"]
    if accommodation > accommodation_limit:
        issues.append(issue(
            RULE_META["category"],
            f"{category}住宿费 {accommodation} 元超过标准上限 {accommodation_limit} 元。",
            "请核实页面住宿费、会议天数、人数和会议类别。",
            evidence={"accommodationAmount": str(accommodation), "limit": str(accommodation_limit), "standard": str(standards["accommodationAmount"]), "days": str(days), "peopleCount": str(people), **category_evidence},
        ))

    return result(RULE_META, issues, "页面伙食费、住宿费未超过第一轮已配置标准。" if not issues else None)
