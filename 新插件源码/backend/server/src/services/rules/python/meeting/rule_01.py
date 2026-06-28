from meeting.meeting_common import item_source, items_by_type, issue, result


RULE_META = {
    "id": "meeting_rule_01",
    "name": "风景名胜区会议地点审核",
    "category": "会议地点",
    "level": "warning",
}

STRONG_KEYWORDS = [
    "八达岭-十三陵", "八达岭十三陵", "承德避暑山庄外八庙", "承德避暑山庄", "外八庙", "五台山风景名胜区",
    "普陀山风景名胜区", "九华山风景名胜区", "武夷山风景名胜区", "嵩山风景名胜区", "武陵源", "张家界武陵源",
    "桂林漓江", "三亚热带海滨", "峨眉山-乐山大佛", "峨眉山乐山大佛", "九寨沟-黄龙", "九寨沟黄龙",
    "黄果树风景名胜区", "西双版纳风景名胜区", "黄山风景区", "黄山风景名胜区", "庐山风景区",
    "庐山风景名胜区", "武当山风景区", "武当山风景名胜区", "太湖风景名胜区", "泰山风景名胜区",
    "华山风景名胜区", "白云山风景名胜区",
]

WEAK_KEYWORDS = [
    "八达岭", "十三陵", "五台山", "太湖", "普陀山", "黄山", "九华山", "武夷山", "庐山", "泰山",
    "嵩山", "武当山", "张家界", "白云山", "漓江", "三亚", "峨眉山", "乐山大佛", "九寨沟", "黄龙",
    "黄果树", "西双版纳", "华山",
]


def build_location_text(item):
    return " ".join([
        str(item.get("meetingLocation") or ""),
        str(item.get("venueName") or ""),
        str(item.get("rawText") or ""),
    ]).strip()


def evaluate(context):
    issues = []
    for index, item in enumerate(items_by_type(context, "meetingNotice")):
        location_text = build_location_text(item)
        strong_hits = [keyword for keyword in STRONG_KEYWORDS if keyword in location_text]
        weak_hits = [keyword for keyword in WEAK_KEYWORDS if keyword in location_text and keyword not in "".join(strong_hits)]
        for keyword in strong_hits:
            issues.append(issue(
                RULE_META["category"],
                f"会议地点命中明令禁止召开会议的风景名胜区关键词：{keyword}。",
                "请核实会议通知中的会议地点，必要时补充说明或调整会议地点。",
                evidence={"hitLevel": "strong", "keyword": keyword, "source": item_source(item, index), "locationText": location_text[:200]},
            ))
        for keyword in weak_hits:
            issues.append(issue(
                RULE_META["category"],
                f"会议地点命中地名短词“{keyword}”，疑似位于相关地区，请人工核实是否属于禁止召开会议的风景名胜区范围。",
                "请人工核实会议地点具体范围，避免将普通市区、道路或单位会议室误判为风景名胜区。",
                evidence={"hitLevel": "weak", "keyword": keyword, "source": item_source(item, index), "locationText": location_text[:200]},
            ))
    return result(RULE_META, issues, "未发现会议地点命中禁止召开会议的风景名胜区关键词。" if not issues else None)
