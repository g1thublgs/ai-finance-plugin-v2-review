from meeting.meeting_common import issue, keyword_hits, result


RULE_META = {
    "id": "meeting_rule_12",
    "name": "酒、高档菜肴、香烟、野生等异常消费审核",
    "category": "异常消费",
    "level": "warning",
}

KEYWORDS = [
    "鱼翅", "燕窝", "野生", "鲍鱼", "海参",
    "酒", "白酒", "红酒", "啤酒", "黄酒", "米酒", "青稞酒",
    "贵州茅台", "茅台", "习酒", "郎酒", "武陵酒", "国台", "钓鱼台", "五粮液", "泸州老窖", "剑南春", "洋河", "古井贡酒", "水井坊", "沱牌舍得", "双沟", "今世缘", "白云边", "稻花香", "汾酒", "二锅头", "牛栏山", "衡水老白干", "宝丰酒", "桂林三花酒", "西凤酒", "董酒", "酒鬼酒", "四特酒", "仰韶", "张裕", "长城", "王朝", "威龙", "贺兰山东麓", "古越龙山", "会稽山", "塔牌", "女儿红", "竹叶青", "劲酒", "椰岛鹿龟酒", "梅见",
    "香烟", "中华", "云烟", "玉溪", "红塔山", "芙蓉王", "白沙", "黄鹤楼", "南京", "利群", "双喜", "红双喜", "黄金叶", "中南海", "黄山", "七匹狼", "泰山", "贵烟", "黄果树", "娇子", "宽窄", "天子", "五叶神", "好日子", "真龙", "金圣", "钻石", "长白山", "好猫", "苏烟", "大重九", "熊猫", "牡丹", "雪茄", "煊赫门", "红河", "紫气东来", "华西村",
]


def remove_cooking_wine(text):
    return text.replace("料酒", "").replace("酒店", "")


def evaluate(context):
    hits = keyword_hits(context, KEYWORDS, ["normalInvoice", "feeSettlement"], text_filter=remove_cooking_wine)
    issues = [
        issue(
            RULE_META["category"],
            f"发票或费用明细命中异常消费关键词“{hit['keyword']}”。",
            "请核实该项是否属于酒、高档菜肴、香烟、野生等不得报销或需重点说明的消费。",
            evidence=hit,
        )
        for hit in hits
    ]
    return result(RULE_META, issues, "未发现酒、高档菜肴、香烟、野生等异常消费关键词。" if not issues else None)
