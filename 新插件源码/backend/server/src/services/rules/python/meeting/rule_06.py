from meeting.meeting_common import calculate_meeting_days, determine_meeting_category, issue, result, skipped


RULE_META = {
    "id": "meeting_rule_06",
    "name": "会议天数超标审核",
    "category": "会议天数",
    "level": "warning",
}


def evaluate(context):
    days, days_evidence = calculate_meeting_days(context)
    if days <= 0:
        return skipped(RULE_META, "无法识别会议起止日期或明确会议天数，会议天数规则需人工复核。", days_evidence)
    category, reason, category_evidence = determine_meeting_category(context)
    limit = 3 if category in ("二类会议", "三类会议") else 2.5
    issues = []
    if days > limit:
        issues.append(issue(
            RULE_META["category"],
            f"{category}会议天数为 {days:g} 天，超过第一轮限额 {limit:g} 天。",
            "请核实会议通知时间安排及会议类别，必要时补充审批依据。",
            evidence={"meetingDays": days, "limit": limit, "meetingCategory": category, "categoryReason": reason, **days_evidence, **category_evidence},
        ))
    return result(RULE_META, issues, f"会议天数 {days:g} 天未超过 {category} 第一轮限额 {limit:g} 天。" if not issues else None)
