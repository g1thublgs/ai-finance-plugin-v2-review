from meeting.meeting_common import issue, keyword_hits, result


RULE_META = {
    "id": "meeting_rule_14",
    "name": "设备租赁费等异常支出审核",
    "category": "异常支出",
    "level": "warning",
}

KEYWORDS = ["设备租赁费", "线路费", "电视电话会议通话费", "技术服务费", "软件应用费", "音视频制作费"]


def evaluate(context):
    hits = keyword_hits(context, KEYWORDS, ["normalInvoice", "feeSettlement"])
    issues = [
        issue(
            RULE_META["category"],
            f"发票或费用明细命中异常支出关键词“{hit['keyword']}”。",
            "请核实该项支出是否可在会议费中列支，必要时调整科目或补充依据。",
            evidence=hit,
        )
        for hit in hits
    ]
    return result(RULE_META, issues, "未发现设备租赁费等异常支出关键词。" if not issues else None)
