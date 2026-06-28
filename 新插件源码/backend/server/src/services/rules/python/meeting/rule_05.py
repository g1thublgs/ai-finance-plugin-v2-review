from meeting.meeting_common import determine_meeting_category, result, skipped


RULE_META = {
    "id": "meeting_rule_05",
    "name": "会议类别判定",
    "category": "会议类别",
    "level": "warning",
}


def evaluate(context):
    category, reason, evidence = determine_meeting_category(context)
    if not evidence.get("meetingName") and not evidence.get("unitName"):
        return skipped(RULE_META, "缺少会议名称和报销单位信息，无法稳定判定会议类别。", evidence)
    return result(
        RULE_META,
        [],
        f"会议类别判定为{category}；依据：{reason}",
    )
