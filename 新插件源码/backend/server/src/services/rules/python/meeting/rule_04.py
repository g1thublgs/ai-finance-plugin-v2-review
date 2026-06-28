from meeting.meeting_common import as_list, attachment_names, collect_ocr_items, issue, normalize_type, result, safe_text


RULE_META = {
    "id": "meeting_rule_04",
    "name": "附件完整性审核",
    "category": "附件完整性",
    "level": "warning",
}


def has_type(context, doc_type):
    return any(normalize_type(item) == doc_type for item in collect_ocr_items(context))


def has_fee_detail(context):
    for item in collect_ocr_items(context):
        if normalize_type(item) == "feeSettlement" and as_list(item.get("itemsDetail")):
            return True
    return False


def evaluate(context):
    text = " ".join(attachment_names(context) + [safe_text(collect_ocr_items(context))])
    checks = [
        ("会议计划", ("会议计划", "计划表", "会议计划审批表"), has_type(context, "meetingPlan")),
        ("会议通知", ("会议通知",), has_type(context, "meetingNotice")),
        ("签到表/参会人员名单", ("签到表", "参会人员名单", "人员名单"), has_type(context, "attendanceList")),
        ("费用明细", ("费用明细", "费用原始明细", "明细单"), has_fee_detail(context)),
        ("结算单", ("结算单", "会议结算单"), has_type(context, "feeSettlement")),
    ]
    issues = []
    for label, keywords, by_type in checks:
        if by_type or any(keyword in text for keyword in keywords):
            continue
        issues.append(issue(
            RULE_META["category"],
            f"缺少会议费报销必备材料：{label}。",
            "请补充对应附件，或确认 OCR 类型/附件名称是否识别正确。",
            evidence={"missing": label, "requiredKeywords": list(keywords)},
        ))
    return result(RULE_META, issues, "会议费必备附件已齐备。" if not issues else None)
