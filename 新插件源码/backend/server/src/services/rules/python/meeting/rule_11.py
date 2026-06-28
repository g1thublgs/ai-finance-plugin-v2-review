from meeting.meeting_common import issue, keyword_hits, result


RULE_META = {
    "id": "meeting_rule_11",
    "name": "套房审核",
    "category": "住宿清单",
    "level": "warning",
}


def evaluate(context):
    hits = keyword_hits(context, ["套房"], ["normalInvoice", "accommodationList"])
    issues = [
        issue(
            RULE_META["category"],
            "发票或住宿清单中出现“套房”字样。",
            "请核实住宿房型是否符合会议费报销规定。",
            evidence=hit,
        )
        for hit in hits
    ]
    return result(RULE_META, issues, "未发现套房相关字样。" if not issues else None)
