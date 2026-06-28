from meeting.meeting_common import issue, keyword_hits, result


RULE_META = {
    "id": "meeting_rule_03",
    "name": "发票及费用明细异常关键词审核",
    "category": "费用明细",
    "level": "warning",
}

KEYWORDS = ["景点", "景区", "门票", "导游", "花草", "水果", "背景板", "展板", "屏幕", "音响", "电脑", "复印机", "打印机", "传真机", "旅游", "娱乐", "健身", "纪念品", "洗漱用品"]


def normalize_text(text):
    return text


def evaluate(context):
    hits = keyword_hits(context, KEYWORDS, ["normalInvoice", "feeSettlement", "accommodationList"], text_filter=normalize_text)
    issues = [
        issue(
            RULE_META["category"],
            f"发票或费用明细命中异常关键词“{hit['keyword']}”。",
            "请核实该项支出是否属于会议费合规开支范围。",
            evidence=hit,
        )
        for hit in hits
    ]
    return result(RULE_META, issues, "未发现发票及费用明细异常关键词。" if not issues else None)
