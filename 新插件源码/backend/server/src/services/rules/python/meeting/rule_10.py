from meeting.holiday_config import HOLIDAYS
from meeting.meeting_common import calculate_meeting_days, issue, iter_dates, meeting_date_range, result, skipped


RULE_META = {
    "id": "meeting_rule_10",
    "name": "节假日或周末开会审核",
    "category": "会议日期",
    "level": "warning",
}

def evaluate(context):
    start, end, source = meeting_date_range(context)
    if not start or not end:
        days, evidence = calculate_meeting_days(context)
        return skipped(RULE_META, "无法识别会议起止日期，节假日或周末开会规则需人工复核。", {"meetingDays": days, **evidence})
    hits = []
    for current in iter_dates(start, end):
        date_text = current.isoformat()
        if current.weekday() >= 5:
            hits.append({"date": date_text, "reason": "周末"})
        if date_text in HOLIDAYS:
            hits.append({"date": date_text, "reason": HOLIDAYS[date_text]})
    issues = [
        issue(
            RULE_META["category"],
            f"会议日期范围包含{hit['reason']}：{hit['date']}。",
            "请核实是否确需在节假日或周末召开会议，并补充审批依据。",
            evidence={"startDate": start.isoformat(), "endDate": end.isoformat(), "source": source, **hit},
        )
        for hit in hits
    ]
    return result(RULE_META, issues, "会议日期范围未命中周末或内置法定节假日。" if not issues else None)
