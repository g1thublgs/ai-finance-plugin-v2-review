from decimal import Decimal

from meeting.meeting_common import attendance_count, calculate_meeting_days, determine_meeting_category, invoice_total_with_source, issue, result, skipped


RULE_META = {
    "id": "meeting_rule_08",
    "name": "发票汇总金额超过定额标准审核",
    "category": "定额标准",
    "level": "warning",
}


def evaluate(context):
    days, days_evidence = calculate_meeting_days(context)
    count, count_source, count_evidence = attendance_count(context, allow_page_fallback=False)
    total, amount_source = invoice_total_with_source(context)
    if days <= 0 or count <= 0 or total <= 0:
        return skipped(RULE_META, "会议天数、签到人数或发票汇总金额缺失/为 0，定额标准规则需人工复核；当前规则 8 仅按规则清单使用发票汇总金额。", {
            "meetingDays": days,
            "attendanceCount": count,
            "invoiceTotalAmount": str(total),
            "amountSource": amount_source,
            "attendanceCountSource": count_source,
            **days_evidence,
            **count_evidence,
        })
    category, reason, category_evidence = determine_meeting_category(context)
    standard = Decimal("650") if category == "二类会议" else Decimal("550")
    limit = Decimal(str(days)) * Decimal(count) * standard
    issues = []
    if total > limit:
        issues.append(issue(
            RULE_META["category"],
            f"发票汇总金额 {total} 元超过 {category} 定额标准 {limit} 元。",
            "请核实发票金额、会议天数、签到人数和会议类别。",
            evidence={"invoiceTotalAmount": str(total), "amountSource": amount_source, "limit": str(limit), "standardPerPersonDay": str(standard), "meetingDays": days, "attendanceCount": count, "meetingCategory": category, "categoryReason": reason, **category_evidence},
        ))
    return result(RULE_META, issues, f"发票汇总金额 {total} 元未超过定额标准 {limit} 元；金额来源：{amount_source}。" if not issues else None)
