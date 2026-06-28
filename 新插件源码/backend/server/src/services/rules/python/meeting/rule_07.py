from meeting.meeting_common import attendance_count, determine_meeting_category, issue, result, skipped


RULE_META = {
    "id": "meeting_rule_07",
    "name": "参会人数超标审核",
    "category": "参会人数",
    "level": "warning",
}

LIMITS = {
    "二类会议": 300,
    "三类会议": 150,
    "四类会议": 50,
}


def evaluate(context):
    count, source, count_evidence = attendance_count(context, allow_page_fallback=True)
    if count <= 0:
        return skipped(RULE_META, "无法从签到表 OCR 或页面人数识别参会人数，参会人数规则需人工复核。", count_evidence)
    category, reason, category_evidence = determine_meeting_category(context)
    limit = LIMITS.get(category, 50)
    issues = []
    if count >= limit:
        issues.append(issue(
            RULE_META["category"],
            f"{category}参会人数为 {count} 人，达到或超过第一轮提示阈值 {limit} 人。",
            "请核实签到表人数、会议类别和参会范围。",
            evidence={"attendanceCount": count, "limit": limit, "source": source, "meetingCategory": category, "categoryReason": reason, **count_evidence, **category_evidence},
        ))
    return result(RULE_META, issues, f"参会人数 {count} 人未达到 {category} 第一轮提示阈值 {limit} 人。" if not issues else None)
