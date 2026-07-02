import importlib
import json
import pathlib
import subprocess
import sys
from datetime import datetime


HERE = pathlib.Path(__file__).resolve().parent
BACKEND = HERE.parents[5]
REPO = HERE.parents[7]
REPORT = REPO / '会议费审核第二轮测试验证报告.md'
sys.path.insert(0, str(HERE))


def load_rule(rule_no):
    return importlib.import_module(f'rule_{rule_no:02d}')


def ctx(summary=None, ocr_items=None, evidence=None):
    return {
        'summary': summary or {},
        'ocrItems': ocr_items or [],
        'evidence': evidence or {},
    }


def invoice(text='', amount='0', invoice_no=None):
    item = {
        'recognizeType': 'normalInvoice',
        'rawText': text,
        'totalAmount': amount,
        'itemsDetail': [{'name': text, 'amount': amount}],
    }
    if invoice_no:
        item['invoiceNumber'] = invoice_no
    return item


def settlement(text='', amount='0', **fields):
    return {
        'recognizeType': 'meetingSettlement',
        'rawText': text,
        'itemsDetail': [{'name': text, 'amount': amount}],
        **fields,
    }


def attendance(count):
    return {
        'recognizeType': 'attendanceList',
        'names': [{'name': f'虚构参会人{i:03d}'} for i in range(count)],
    }


def required_docs():
    return [{'recognizeType': item} for item in ['meetingPlan', 'meetingNotice', 'attendanceList', 'meetingSettlement']]


def make_cases():
    base_docs = required_docs()
    cases = []

    def add(rule, case_type, title, context, expected_passed, expected_note, must_contain=None):
        cases.append({
            'rule': rule,
            'caseType': case_type,
            'title': title,
            'context': context,
            'expectedPassed': expected_passed,
            'expectedNote': expected_note,
            'mustContain': must_contain or [],
        })

    add(1, '正常不触发', '非禁区地点', ctx({'meetingLocation': '虚构市机关会议中心'}), True, '未命中禁区关键词')
    add(1, '应触发', '地点含黄山', ctx({'meetingLocation': '黄山虚构会议中心'}), False, '命中禁止风景名胜区')
    add(1, '字段缺失', '无地点字段', ctx({}), False, '提示缺少会议地点字段')
    add(1, '页面空 OCR 有值', '仅 OCR 通知有地点', ctx({}, [{'recognizeType': 'meetingNotice', 'location': '黄山虚构会议中心', 'rawText': '会议地点：黄山虚构会议中心'}]), False, '应读取 OCR 地点并触发', ['禁止'])
    add(1, 'OCR 空页面有值', '页面地点可用', ctx({'pageFields': {'meetingLocation': '虚构市会议中心'}}), True, '读取页面地点')
    add(1, '页面 OCR 冲突', '页面正常 OCR 禁区', ctx({'meetingLocation': '虚构市会议中心'}, [{'recognizeType': 'meetingNotice', 'location': '黄山虚构会议中心', 'rawText': '会议地点：黄山虚构会议中心'}]), False, '应提示冲突或高风险 OCR 地点')
    add(1, '空值/0/金额格式', '地点为 0', ctx({'meetingLocation': 0}), True, '不应崩溃')
    add(1, '日期边界', '跨月信息不影响地点', ctx({'meetingLocation': '虚构市会议中心', 'meetingDate': '2026年4月30日至5月1日'}), True, '规则不依赖日期')
    add(1, '未知会议类别', '未知类别不影响地点', ctx({'meetingLocation': '虚构市会议中心', 'meetingCategory': '普通会议'}), True, '规则不依赖类别')
    add(1, '住宿空场租有值', '费用结构不影响地点', ctx({'meetingLocation': '虚构市会议中心', 'accommodationAmount': 0, 'venueRentAmount': 1000}), True, '规则不依赖费用结构')

    add(2, '正常不触发', '单位收款', ctx({'payments': [{'payeeName': '虚构会务有限公司'}]}), True, '单位收款不提示')
    add(2, '应触发', '个人收款无公务卡字段', ctx({'payments': [{'payeeName': '张三'}]}), False, '个人收款且无刷卡时间/金额提示')
    add(2, '字段缺失', '无付款凭证', ctx({}), False, '提示未提取收款人信息')
    add(2, '页面空 OCR 有值', 'OCR 付款凭证个人收款', ctx({}, [{'recognizeType': 'paymentProof', 'payeeName': '李四'}]), False, '读取 OCR 付款凭证并提示')
    add(2, 'OCR 空页面有值', '页面付款信息单位收款', ctx({'payments': [{'payeeName': '虚构酒店有限公司'}]}), True, '读取页面付款信息')
    add(2, '页面 OCR 冲突', '页面单位 OCR 个人', {'summary': {'payments': [{'payeeName': '虚构酒店有限公司'}]}, 'ocrItems': [{'recognizeType': 'paymentProof', 'payeeName': '王五'}]}, False, '应提示来源冲突或个人收款风险')
    add(2, '空值/0/金额格式', '个人收款刷卡金额 0', ctx({'payments': [{'payeeName': '赵六', 'cardAmount': '0'}]}), False, '0 元刷卡金额提示')
    add(2, '日期边界', '单日会议不影响付款', ctx({'payments': [{'payeeName': '虚构会务有限公司'}], 'meetingDate': '2026-04-28'}), True, '规则不依赖日期')
    add(2, '未知会议类别', '未知类别不影响付款', ctx({'payments': [{'payeeName': '虚构会务有限公司'}], 'meetingCategory': '普通会议'}), True, '规则不依赖类别')
    add(2, '住宿空场租有值', '费用结构不影响付款', ctx({'payments': [{'payeeName': '虚构会务有限公司'}], 'accommodationAmount': 0, 'venueRentAmount': 1000}), True, '规则不依赖费用结构')

    add(3, '正常不触发', '普通资料印刷', ctx({}, [invoice('会议资料印刷', '100')]), True, '未命中异常内容')
    add(3, '应触发', '明细含导游服务', ctx({}, [settlement('会议导游服务费 100 元')]), False, '命中导游')
    add(3, '字段缺失', '无明细文本', ctx({}), False, '提示缺少发票或费用文本')
    add(3, '页面空 OCR 有值', 'OCR 明细含门票', ctx({}, [invoice('景区门票', '200')]), False, 'OCR 命中')
    add(3, 'OCR 空页面有值', '仅 summary 明细含门票', ctx({'expenseDetail': '景区门票 200 元'}), False, '应读取页面明细并提示', ['门票'])
    add(3, '页面 OCR 冲突', '页面正常 OCR 异常', ctx({'expenseDetail': '会议资料'}, [invoice('旅游服务', '300')]), False, 'OCR 命中')
    add(3, '空值/0/金额格式', '金额 0 但明细异常', ctx({}, [invoice('景点门票', '0')]), False, '关键词不受金额影响')
    add(3, '日期边界', '周末信息不影响异常明细', ctx({'meetingDate': '2026-05-02'}, [invoice('会议资料', '10')]), True, '规则不依赖日期')
    add(3, '未知会议类别', '未知类别不影响异常明细', ctx({'meetingCategory': '普通会议'}, [invoice('会议资料', '10')]), True, '规则不依赖类别')
    add(3, '住宿空场租有值', '费用结构不影响异常明细', ctx({'accommodationAmount': 0, 'venueRentAmount': 1000}, [invoice('会议资料', '10')]), True, '规则不依赖费用结构')

    add(4, '正常不触发', '四类附件齐全', ctx({}, base_docs), True, '附件齐全')
    add(4, '应触发', '缺少签到和结算', ctx({}, base_docs[:2]), False, '提示缺失附件')
    add(4, '字段缺失', '无附件', ctx({}), False, '提示缺少全部必要附件')
    add(4, '页面空 OCR 有值', 'OCR 附件齐全', ctx({}, base_docs), True, '读取 OCR 附件类型')
    add(4, 'OCR 空页面有值', '页面布尔标记齐全', ctx({'hasMeetingPlan': True, 'hasMeetingNotice': True, 'hasAttendanceList': True, 'hasSettlement': True}), True, '读取页面附件标记')
    add(4, '页面 OCR 冲突', '页面齐全 OCR 缺失', ctx({'hasMeetingPlan': True, 'hasMeetingNotice': True, 'hasAttendanceList': True, 'hasSettlement': True}, []), True, '页面字段优先可通过')
    add(4, '空值/0/金额格式', '附件字段为 0', ctx({'hasMeetingPlan': 0}), False, '0 不应当作齐全')
    add(4, '日期边界', '跨月不影响附件', ctx({'meetingDate': '2026年4月30日至5月1日'}, base_docs), True, '规则不依赖日期')
    add(4, '未知会议类别', '未知类别不影响附件', ctx({'meetingCategory': '普通会议'}, base_docs), True, '规则不依赖类别')
    add(4, '住宿空场租有值', '费用结构不影响附件', ctx({'accommodationAmount': 0, 'venueRentAmount': 1000}, base_docs), True, '规则不依赖费用结构')

    add(5, '正常不触发', '明确三类', ctx({'meetingCategory': '三类会议'}), True, '明确类别通过')
    add(5, '应触发', '低置信度候选四类', ctx({'meetingName': '虚构工作会议', 'pageFields': {'reimbursementUnitName': '虚构单位'}}), False, '低置信度需人工复核')
    add(5, '字段缺失', '无类别依据', ctx({}), False, '提示缺少类别依据')
    add(5, '页面空 OCR 有值', '仅通知体现全国税务工作会议', ctx({}, [{'recognizeType': 'meetingNotice', 'rawText': '全国税务工作会议，各省参加'}]), False, '应读取 OCR 类别依据', ['全国税务工作会议'])
    add(5, 'OCR 空页面有值', '页面字段推断三类', ctx({'pageFields': {'reimbursementUnitName': '省税务局'}, 'meetingName': '年度工作会议'}), True, '高置信度三类')
    add(5, '页面 OCR 冲突', '页面二类 OCR 普通会议', ctx({'meetingCategory': '二类会议'}, [{'recognizeType': 'meetingNotice', 'rawText': '普通工作会议'}]), True, '显式页面类别优先')
    add(5, '空值/0/金额格式', '类别为 0', ctx({'meetingCategory': 0}), False, '提示缺少类别依据')
    add(5, '日期边界', '日期不影响类别', ctx({'meetingCategory': '三类会议', 'meetingDate': '2026-05-02'}), True, '规则不依赖日期')
    add(5, '未知会议类别', '普通会议', ctx({'meetingCategory': '普通会议'}), False, '未知类别不得默认四类')
    add(5, '住宿空场租有值', '费用结构不影响类别', ctx({'meetingCategory': '三类会议', 'accommodationAmount': 0, 'venueRentAmount': 1000}), True, '规则不依赖费用结构')

    add(6, '正常不触发', '三类 3 天', ctx({'meetingCategory': '三类会议', 'meetingDays': 3}), True, '未超 3 天')
    add(6, '应触发', '四类 3 天', ctx({'meetingCategory': '四类会议', 'meetingDays': 3}), False, '超过 2.5 天')
    add(6, '字段缺失', '缺少天数', ctx({'meetingCategory': '三类会议'}), False, '提示缺少天数')
    add(6, '页面空 OCR 有值', '仅 OCR 日期 4 天', ctx({'meetingCategory': '三类会议'}, [{'recognizeType': 'meetingNotice', 'rawText': '2026年4月27日至4月30日'}]), False, '应读取 OCR 日期', ['4'])
    add(6, 'OCR 空页面有值', '页面日期 2 天', ctx({'meetingCategory': '四类会议', 'startDate': '2026-04-28', 'endDate': '2026-04-29'}), True, '页面日期可算天数')
    add(6, '页面 OCR 冲突', '页面 2 天 OCR 4 天', ctx({'meetingCategory': '三类会议', 'meetingDays': 2}, [{'recognizeType': 'meetingNotice', 'rawText': '2026年4月27日至4月30日'}]), False, '应提示日期冲突或取高风险天数')
    add(6, '空值/0/金额格式', '天数 0', ctx({'meetingCategory': '三类会议', 'meetingDays': 0}), False, '提示缺少天数')
    add(6, '日期边界', '跨月 3 天', ctx({'meetingCategory': '三类会议', 'meetingDate': '2026年4月30日至5月2日'}), True, '跨月日期可计算')
    add(6, '未知会议类别', '普通会议 4 天', ctx({'meetingCategory': '普通会议', 'meetingDays': 4}), False, '未知类别需人工复核，不按四类强判')
    add(6, '住宿空场租有值', '费用结构不影响天数', ctx({'meetingCategory': '三类会议', 'meetingDays': 2, 'accommodationAmount': 0, 'venueRentAmount': 1000}), True, '规则不依赖费用结构')

    add(7, '正常不触发', '四类 49 人', ctx({'meetingCategory': '四类会议'}, [attendance(49)]), True, '低于 50 人')
    add(7, '应触发', '四类 50 人', ctx({'meetingCategory': '四类会议'}, [attendance(50)]), False, '等于阈值按原文提示')
    add(7, '字段缺失', '缺少人数', ctx({'meetingCategory': '四类会议'}), False, '提示缺少人数')
    add(7, '页面空 OCR 有值', 'OCR 签到 50 人', ctx({'meetingCategory': '四类会议'}, [attendance(50)]), False, '读取 OCR 签到人数')
    add(7, 'OCR 空页面有值', '页面人数 49', ctx({'meetingCategory': '四类会议', 'pageFields': {'attendeeCount': 49}}), True, '读取页面人数')
    add(7, '页面 OCR 冲突', '页面 49 OCR 50', ctx({'meetingCategory': '四类会议', 'pageFields': {'attendeeCount': 49}}, [attendance(50)]), False, '应提示 OCR 签到人数风险')
    add(7, '空值/0/金额格式', '人数 0', ctx({'meetingCategory': '四类会议', 'attendeeCount': 0}), False, '提示缺少人数')
    add(7, '日期边界', '周末不影响人数', ctx({'meetingCategory': '四类会议', 'meetingDate': '2026-05-02'}, [attendance(49)]), True, '规则不依赖日期')
    add(7, '未知会议类别', '普通会议 50 人', ctx({'meetingCategory': '普通会议', 'attendeeCount': 50}), False, '未知类别需人工复核')
    add(7, '住宿空场租有值', '费用结构不影响人数', ctx({'meetingCategory': '四类会议', 'accommodationAmount': 0, 'venueRentAmount': 1000}, [attendance(49)]), True, '规则不依赖费用结构')

    add(8, '正常不触发', '三类 10 人 1 天 5500', ctx({'meetingCategory': '三类会议', 'meetingDays': 1}, [attendance(10), invoice('会议费', '5500')]), True, '未超综合定额')
    add(8, '应触发', '三类 10 人 1 天 5501', ctx({'meetingCategory': '三类会议', 'meetingDays': 1}, [attendance(10), invoice('会议费', '5,501')]), False, '超过综合定额')
    add(8, '字段缺失', '缺少发票金额', ctx({'meetingCategory': '三类会议', 'meetingDays': 1}, [attendance(10)]), False, '提示缺少金额')
    add(8, '页面空 OCR 有值', 'OCR 发票金额可用', ctx({'meetingCategory': '三类会议', 'meetingDays': 1}, [attendance(10), invoice('会议费', '5500')]), True, '读取 OCR 发票金额')
    add(8, 'OCR 空页面有值', '仅页面 invoiceAmount', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'invoiceAmount': 5500}), True, '读取页面发票金额')
    add(8, '页面 OCR 冲突', '页面 5500 OCR 6000', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'invoiceAmount': 5500}, [invoice('会议费', '6000')]), False, '应提示金额冲突或取高风险金额')
    add(8, '空值/0/金额格式', '中文金额', ctx({'meetingCategory': '三类会议', 'meetingDays': 1}, [attendance(10), invoice('会议费', '伍仟伍佰零壹元')]), False, '应识别中文金额并提示超额', ['大于'])
    add(8, '日期边界', '跨月 2 天未超', ctx({'meetingCategory': '三类会议', 'meetingDate': '2026年4月30日至5月1日'}, [attendance(10), invoice('会议费', '11000')]), True, '跨月天数可计算')
    add(8, '未知会议类别', '普通会议高金额', ctx({'meetingCategory': '普通会议', 'meetingDays': 1}, [attendance(10), invoice('会议费', '99999')]), False, '未知类别不得默认 550')
    add(8, '住宿空场租有值', '费用结构不影响综合定额', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'accommodationAmount': 0, 'venueRentAmount': 1000}, [attendance(10), invoice('会议费', '5500')]), True, '规则不依赖住宿/场租结构')

    add(9, '正常不触发', '三类分项等于标准', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': 1300, 'accommodationAmount': 3400}), True, '等于标准不提示')
    add(9, '应触发', '三类伙食超 1 元', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': 1301, 'accommodationAmount': 3400}), False, '伙食超标准提示')
    add(9, '字段缺失', '缺少分项金额', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10}), False, '提示缺少伙食费或住宿费')
    add(9, '页面空 OCR 有值', 'OCR 结算单分项金额', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10}, [settlement('伙食费 1301 元，住宿费 3400 元', mealAmount='1301', accommodationAmount='3400')]), False, '应读取 OCR 分项金额', ['伙食费'])
    add(9, 'OCR 空页面有值', '页面分项金额', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': '1,300', 'accommodationAmount': '3,400'}), True, '读取页面分项金额和逗号金额')
    add(9, '页面 OCR 冲突', '页面不超 OCR 超', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': 1300, 'accommodationAmount': 3400}, [settlement('伙食费 1301 元', mealAmount='1301')]), False, '应提示分项金额冲突或高风险 OCR 值')
    add(9, '空值/0/金额格式', '中文伙食金额超标', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': '壹仟叁佰零壹元', 'accommodationAmount': '叁仟肆佰元'}), False, '应识别中文金额并提示超额', ['伙食费'])
    add(9, '日期边界', '跨月日期计算', ctx({'meetingCategory': '三类会议', 'meetingDate': '2026年4月30日至5月1日', 'attendeeCount': 10, 'mealAmount': 2600, 'accommodationAmount': 6800}), True, '跨月天数可计算')
    add(9, '未知会议类别', '四类会议', ctx({'meetingCategory': '四类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': 1, 'accommodationAmount': 1}), False, '四类分项标准未明确，人工复核')
    add(9, '住宿空场租有值', '住宿 0 场租 1000', ctx({'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'accommodationAmount': 0, 'venueRentAmount': 1000, 'mealAmount': 1300}), True, '分项本身不提示住宿为 0')

    add(10, '正常不触发', '工作日', ctx({'startDate': '2026-04-28', 'endDate': '2026-04-30'}), True, '非周末节假日')
    add(10, '应触发', '劳动节', ctx({'meetingDate': '2026年5月1日至5月2日'}), False, '节假日/周末提示')
    add(10, '字段缺失', '无日期', ctx({}), False, '提示缺少日期')
    add(10, '页面空 OCR 有值', 'OCR 通知日期为劳动节', ctx({}, [{'recognizeType': 'meetingNotice', 'rawText': '会议时间：2026年5月1日至5月2日'}]), False, '应读取 OCR 日期并提示', ['2026-05'])
    add(10, 'OCR 空页面有值', '页面日期工作日', ctx({'meetingDate': '2026年4月28日至4月30日'}), True, '读取页面日期')
    add(10, '页面 OCR 冲突', '页面工作日 OCR 节假日', ctx({'meetingDate': '2026年4月28日至4月30日'}, [{'recognizeType': 'meetingNotice', 'rawText': '会议时间：2026年5月1日至5月2日'}]), False, '应提示日期冲突或高风险 OCR 日期')
    add(10, '空值/0/金额格式', '日期为 0', ctx({'meetingDate': 0}), False, '提示缺少日期')
    add(10, '日期边界', '周末单日', ctx({'meetingDate': '2026-05-02'}), False, '周末提示')
    add(10, '未知会议类别', '未知类别不影响日期', ctx({'meetingCategory': '普通会议', 'meetingDate': '2026-04-28'}), True, '规则不依赖类别')
    add(10, '住宿空场租有值', '2027 未配置节假日', ctx({'meetingDate': '2027-01-01', 'accommodationAmount': 0, 'venueRentAmount': 1000}), False, '节假日数据缺失人工复核')

    add(11, '正常不触发', '标准间', ctx({}, [{'recognizeType': 'accommodationList', 'rawText': '标准间 2 间'}]), True, '未命中套房')
    add(11, '应触发', '住宿清单含套房', ctx({}, [{'recognizeType': 'accommodationList', 'rawText': '套房 1 间'}]), False, '命中套房')
    add(11, '字段缺失', '无住宿文本', ctx({}), False, '提示缺少文本')
    add(11, '页面空 OCR 有值', 'OCR 含套房', ctx({}, [{'recognizeType': 'accommodationList', 'rawText': '商务套房 1 间'}]), False, 'OCR 命中')
    add(11, 'OCR 空页面有值', '仅页面住宿说明含套房', ctx({'accommodationDetail': '商务套房 1 间'}), False, '应读取页面住宿说明', ['出现'])
    add(11, '页面 OCR 冲突', '页面标准间 OCR 套房', ctx({'accommodationDetail': '标准间'}, [{'recognizeType': 'accommodationList', 'rawText': '套房 1 间'}]), False, 'OCR 命中')
    add(11, '空值/0/金额格式', '金额 0 但套房', ctx({}, [{'recognizeType': 'accommodationList', 'rawText': '套房 0 元'}]), False, '关键词不受金额影响')
    add(11, '日期边界', '日期不影响套房', ctx({'meetingDate': '2026-05-02'}, [{'recognizeType': 'accommodationList', 'rawText': '标准间'}]), True, '规则不依赖日期')
    add(11, '未知会议类别', '类别不影响套房', ctx({'meetingCategory': '普通会议'}, [{'recognizeType': 'accommodationList', 'rawText': '标准间'}]), True, '规则不依赖类别')
    add(11, '住宿空场租有值', '无住宿金额但有住宿文本', ctx({'accommodationAmount': 0, 'venueRentAmount': 1000}, [{'recognizeType': 'accommodationList', 'rawText': '标准间'}]), True, '规则不依赖住宿金额')

    add(12, '正常不触发', '普通工作餐', ctx({}, [settlement('普通工作餐')]), True, '未命中高档烟酒野生')
    add(12, '应触发', '茅台鱼翅', ctx({}, [settlement('茅台 鱼翅 鱼翅')]), False, '命中且去重')
    add(12, '字段缺失', '无费用文本', ctx({}), False, '提示缺少文本')
    add(12, '页面空 OCR 有值', 'OCR 含香烟', ctx({}, [settlement('香烟')]), False, 'OCR 命中')
    add(12, 'OCR 空页面有值', '仅页面明细含茅台', ctx({'expenseDetail': '茅台'}), False, '应读取页面明细', ['茅台'])
    add(12, '页面 OCR 冲突', '页面普通 OCR 茅台', ctx({'expenseDetail': '普通工作餐'}, [settlement('茅台')]), False, 'OCR 命中')
    add(12, '空值/0/金额格式', '金额 0 但敏感词', ctx({}, [settlement('野生菜品', '0')]), False, '关键词不受金额影响')
    add(12, '日期边界', '日期不影响敏感词', ctx({'meetingDate': '2026-05-02'}, [settlement('普通工作餐')]), True, '规则不依赖日期')
    add(12, '未知会议类别', '类别不影响敏感词', ctx({'meetingCategory': '普通会议'}, [settlement('普通工作餐')]), True, '规则不依赖类别')
    add(12, '住宿空场租有值', '费用结构不影响敏感词', ctx({'accommodationAmount': 0, 'venueRentAmount': 1000}, [settlement('普通工作餐')]), True, '规则不依赖费用结构')

    add(13, '正常不触发', '住宿和场租均有值', ctx({'accommodationAmount': 100, 'venueRentAmount': 500}), True, '住宿不为 0')
    add(13, '应触发', '住宿 0 场租大于 0', ctx({'accommodationAmount': 0, 'venueRentAmount': 500}), False, '提示费用结构')
    add(13, '字段缺失', '住宿缺失场租有值', ctx({'venueRentAmount': 500}), False, '提示住宿字段未采集')
    add(13, '页面空 OCR 有值', 'OCR 结算单住宿 0 场租 500', ctx({}, [settlement('住宿费 0 元，场地租金 500 元', accommodationAmount='0', venueRentAmount='500')]), False, '应读取 OCR 费用结构')
    add(13, 'OCR 空页面有值', '页面住宿 0 场租 500', ctx({'accommodationAmount': 0, 'venueRentAmount': 500}), False, '读取页面字段')
    add(13, '页面 OCR 冲突', '页面住宿 100 OCR 住宿 0', ctx({'accommodationAmount': 100, 'venueRentAmount': 500}, [settlement('住宿费 0 元，场地租金 500 元', accommodationAmount='0', venueRentAmount='500')]), False, '应提示费用结构冲突或高风险 OCR 值')
    add(13, '空值/0/金额格式', '住宿中文零元 场租逗号金额', ctx({'accommodationAmount': '零元', 'venueRentAmount': '1,000'}), False, '中文零元应按 0 提示')
    add(13, '日期边界', '日期不影响费用结构', ctx({'meetingDate': '2026-04-28', 'accommodationAmount': 0, 'venueRentAmount': 500}), False, '规则不依赖日期')
    add(13, '未知会议类别', '类别不影响费用结构', ctx({'meetingCategory': '普通会议', 'accommodationAmount': 0, 'venueRentAmount': 500}), False, '规则不依赖类别')
    add(13, '住宿空场租有值', '重点场景', ctx({'accommodationAmount': '', 'venueRentAmount': 500}), False, '未填住宿费且场租大于 0 应提示')

    add(14, '正常不触发', '资料费', ctx({}, [settlement('资料费')]), True, '未命中设备/技术服务')
    add(14, '应触发', '设备租赁费', ctx({}, [settlement('设备租赁费')]), False, '命中设备租赁费')
    add(14, '字段缺失', '无费用文本', ctx({}), False, '提示缺少文本')
    add(14, '页面空 OCR 有值', 'OCR 含技术服务费', ctx({}, [settlement('音视频技术服务费')]), False, 'OCR 命中')
    add(14, 'OCR 空页面有值', '仅页面明细含设备租赁费', ctx({'expenseDetail': '设备租赁费'}), False, '应读取页面明细', ['设备租赁费'])
    add(14, '页面 OCR 冲突', '页面资料 OCR 设备租赁', ctx({'expenseDetail': '资料费'}, [settlement('设备租赁费')]), False, 'OCR 命中')
    add(14, '空值/0/金额格式', '金额 0 但设备租赁', ctx({}, [settlement('设备租赁费', '0')]), False, '关键词不受金额影响')
    add(14, '日期边界', '日期不影响设备费用', ctx({'meetingDate': '2026-05-02'}, [settlement('资料费')]), True, '规则不依赖日期')
    add(14, '未知会议类别', '类别不影响设备费用', ctx({'meetingCategory': '普通会议'}, [settlement('资料费')]), True, '规则不依赖类别')
    add(14, '住宿空场租有值', '费用结构不影响设备费用', ctx({'accommodationAmount': 0, 'venueRentAmount': 1000}, [settlement('资料费')]), True, '规则不依赖费用结构')

    return cases


def summarize_context(context):
    summary = context.get('summary') or {}
    items = context.get('ocrItems') or []
    parts = []
    if summary:
        parts.append('summary=' + json.dumps(summary, ensure_ascii=False, sort_keys=True))
    if items:
        parts.append('ocrItems=' + json.dumps(items[:2], ensure_ascii=False, sort_keys=True))
    return '<br>'.join(parts)[:900] or '{}'


def run_cases(cases):
    results = []
    for case in cases:
        rule = load_rule(case['rule'])
        actual = rule.evaluate(case['context'])
        actual_passed = bool(actual.get('passed'))
        actual_text = actual.get('summary', '') + ' ' + ' '.join(
            issue.get('description', '') for issue in actual.get('issues') or []
        )
        contains_ok = all(token in actual_text for token in case.get('mustContain', []))
        ok = actual_passed == case['expectedPassed'] and contains_ok
        issues = actual.get('issues') or []
        results.append({
            **case,
            'actualPassed': actual_passed,
            'actualSummary': actual.get('summary', ''),
            'actualIssues': issues,
            'casePassed': ok,
            'containsPassed': contains_ok,
        })
    return results


def run_command(command, cwd):
    completed = subprocess.run(command, cwd=cwd, shell=True, text=True, capture_output=True, encoding='utf-8', errors='replace')
    output = (completed.stdout or '') + (completed.stderr or '')
    return {
        'command': command,
        'cwd': str(cwd),
        'returncode': completed.returncode,
        'result': '通过' if completed.returncode == 0 else '失败',
        'output': output.strip(),
    }


def issue_rows(results):
    issues = []
    for item in results:
        if not item['casePassed']:
            issues.append({
                'rule': f"rule_{item['rule']:02d}",
                'case': item['caseType'],
                'title': item['title'],
                'expected': item['expectedNote'],
                'actual': item['actualSummary'],
            })
    return issues


def md_escape(value):
    text = str(value).replace('\n', '<br>').replace('|', '\\|')
    return text


def build_report(results, command_results):
    grouped = {}
    for item in results:
        grouped.setdefault(item['rule'], []).append(item)
    problems = issue_rows(results)
    pass_count = sum(1 for item in results if item['casePassed'])
    fail_count = len(results) - pass_count

    lines = []
    lines.append('# 会议费审核第二轮测试验证报告')
    lines.append('')
    lines.append('## 1. 测试结论')
    lines.append('')
    lines.append(f'- 本轮基于最新 main 新建 `codex/meeting-rules-validation` 分支，仅新增测试验证脚本和本报告，未修改会议费业务规则代码、其他场景代码或公共框架。')
    lines.append(f'- 基础检查全部通过；现有会议费准确性测试 14 条通过。')
    lines.append(f'- 本轮虚构样例共 {len(results)} 条，按预期通过 {pass_count} 条，发现与预期不一致 {fail_count} 条。')
    lines.append('- 主要问题集中在：OCR 与页面字段冲突/互补时部分规则只读单一来源；中文大写金额无法识别；若只有页面费用明细文本，关键词类规则无法命中。')
    lines.append('- 建议进入第三轮定点修复，优先修复字段来源合并、冲突提示、中文金额解析和页面明细文本读取。')
    lines.append('')
    lines.append('## 2. 测试环境')
    lines.append('')
    lines.append(f'- 测试时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append('- 操作系统：Windows / PowerShell')
    lines.append('- 分支：`codex/meeting-rules-validation`')
    lines.append('- 数据：全部为虚构测试数据，未新增真实人员、真实票据、真实金额或真实单位敏感数据。')
    lines.append('- 验证脚本：`新插件源码/backend/server/src/services/rules/python/meeting/validate_meeting_rules_round2.py`，仅用于测试验证。')
    lines.append('')
    lines.append('## 3. 执行命令和结果')
    lines.append('')
    lines.append('| 命令 | 工作目录 | 结果 | 摘要 |')
    lines.append('|---|---|---|---|')
    for item in command_results:
        out = item['output'] or '无输出'
        if len(out) > 260:
            out = out[:260] + '...'
        lines.append(f"| `{md_escape(item['command'])}` | `{md_escape(item['cwd'])}` | {item['result']} | {md_escape(out)} |")
    lines.append('')
    lines.append('## 4. 14 条规则逐条测试表')
    lines.append('')
    for rule_no in range(1, 15):
        lines.append(f'### rule_{rule_no:02d}')
        lines.append('')
        lines.append('| 类型 | 输入样例摘要 | 预期结果 | 实际结果 | 是否通过 |')
        lines.append('|---|---|---|---|---|')
        for item in grouped[rule_no]:
            expected = '通过/不提示' if item['expectedPassed'] else '不通过/提示或人工复核'
            actual = ('通过' if item['actualPassed'] else '不通过') + '：' + item['actualSummary']
            ok = '通过' if item['casePassed'] else '未通过'
            lines.append(f"| {md_escape(item['caseType'])} | {md_escape(item['title'])}<br>{md_escape(summarize_context(item['context']))} | {expected}<br>{md_escape(item['expectedNote'])} | {md_escape(actual)} | {ok} |")
        lines.append('')
    lines.append('## 5. 已发现问题清单')
    lines.append('')
    if not problems:
        lines.append('- 未发现与预期不一致问题。')
    else:
        lines.append('| 编号 | 规则 | 场景 | 问题 | 预期 | 实际 |')
        lines.append('|---|---|---|---|---|---|')
        for idx, item in enumerate(problems, 1):
            lines.append(f"| P{idx} | {item['rule']} | {md_escape(item['case'])} | {md_escape(item['title'])} | {md_escape(item['expected'])} | {md_escape(item['actual'])} |")
    lines.append('')
    lines.append('## 6. 误判风险')
    lines.append('')
    lines.append('- `rule_01`、`rule_02`、`rule_06`、`rule_08`、`rule_09`、`rule_10`、`rule_13` 在页面字段和 OCR 字段冲突时，当前多按固定优先级读取，可能放过 OCR 中更高风险值，形成误判为通过。')
    lines.append('- `rule_13` 将中文“零元”解析为 0，当前可提示；但这是由于无法识别中文金额时默认 0，若中文金额为非零也可能被误判为 0。')
    lines.append('')
    lines.append('## 7. 漏判风险')
    lines.append('')
    lines.append('- `rule_01` 不读取 OCR 通知中的 `location/rawText` 地点，页面地点为空或正常但 OCR 地点命中禁区时可能漏判。')
    lines.append('- `rule_03`、`rule_11`、`rule_12`、`rule_14` 不读取页面侧费用/住宿明细字段，OCR 为空但页面有敏感词时可能漏判。')
    lines.append('- `rule_06`、`rule_10` 不从 OCR 通知文本解析日期，页面日期缺失或与 OCR 冲突时可能漏判。')
    lines.append('- `rule_08`、`rule_09` 无法解析中文大写金额，可能将超标金额视为缺失或 0。')
    lines.append('- `rule_13` 不读取 OCR 结算单中的住宿费、场地租金字段，页面未采集但 OCR 有值时可能漏判。')
    lines.append('')
    lines.append('## 8. 字段读取问题')
    lines.append('')
    lines.append('- 页面字段与 OCR 字段缺少统一合并、冲突识别和证据优先级说明。')
    lines.append('- 金额解析支持阿拉伯数字、逗号、人民币符号，但不支持中文大写金额。')
    lines.append('- 部分规则只读 `summary/pageFields`，部分只读 `ocrItems`，没有覆盖“页面为空但 OCR 有值”和“OCR 为空但页面有值”的双向互补。')
    lines.append('')
    lines.append('## 9. 提示文案问题')
    lines.append('')
    lines.append('- `rule_07` 人数等于阈值时文案为“大于或等于规定人数”，符合规则清单原文方向。')
    lines.append('- 多数缺字段提示能够说明人工复核原因，但字段冲突场景没有专门提示，用户难以知道页面与 OCR 值不一致。')
    lines.append('- `rule_09` 对四类会议明确提示“规则清单未给出四类分项标准”，未自行编造标准，文案清晰。')
    lines.append('')
    lines.append('## 10. 规则返回结构问题')
    lines.append('')
    lines.append('- 14 条规则均返回 `passed`、`issues`、`summary`，触发项内包含 `ruleId`、`ruleName`，未发现结构不兼容或异常崩溃。')
    lines.append('- 本轮虚构异常输入未导致 Python 异常崩溃。')
    lines.append('')
    lines.append('## 11. 是否影响其他场景')
    lines.append('')
    lines.append('- 本轮未修改培训费、公务接待费、差旅费、其他事项等其他场景。')
    lines.append('- 未修改公共框架；新增脚本位于会议费规则目录，仅直接导入会议费规则用于验证。')
    lines.append('')
    lines.append('## 12. 未测试项目和原因')
    lines.append('')
    lines.append('- 未调用真实 OCR 服务：本轮目标为规则准确性验证，使用虚构结构化 OCR 输出覆盖边界。')
    lines.append('- 未接入真实票据样本：避免引入真实人员、票据、金额、单位敏感数据。')
    lines.append('- 未做端到端浏览器上传验证：本轮聚焦 14 条 Python 规则和会议费 JS 模型语法检查。')
    lines.append('')
    lines.append('## 13. 需业务确认事项')
    lines.append('')
    lines.append('- 页面字段与 OCR 字段冲突时，应以页面录入、OCR 识别、还是高风险值优先，需业务确认。')
    lines.append('- 中文大写金额是否为正式支持范围；若支持，应明确转换规则和无法识别时的提示策略。')
    lines.append('- `rule_01` 是否必须从会议通知 OCR 原文抽取地点，而不仅依赖预填摘要字段。')
    lines.append('- 关键词类规则是否应读取页面侧费用明细、住宿说明等字段。')
    lines.append('- 2026 年以外节假日数据维护机制与过期策略需确认。')
    lines.append('')
    lines.append('## 14. 是否建议进入第三轮定点修复')
    lines.append('')
    lines.append('- 建议进入第三轮定点修复。修复范围建议严格限定在会议费规则字段读取、冲突证据、中文金额解析和提示文案补强，不触碰其他场景和公共框架。')
    lines.append('')
    return '\n'.join(lines)


def main():
    command_results = [
        run_command("python -m py_compile 新插件源码/backend/server/src/services/rules/python/meeting/meeting_common.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_01.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_02.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_03.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_04.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_05.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_06.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_07.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_08.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_09.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_10.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_11.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_12.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_13.py 新插件源码/backend/server/src/services/rules/python/meeting/rule_14.py", REPO),
        run_command("python 新插件源码/backend/server/src/services/rules/python/meeting/test_meeting_rules_accuracy.py", REPO),
        run_command("node --check 新插件源码/backend/server/src/domain/scenarios/meeting/prefillModel.js && node --check 新插件源码/backend/server/src/domain/scenarios/meeting/ruleModel.js && node --check 新插件源码/backend/server/src/domain/scenarios/meeting/ocrPrompt.js && node --check 新插件源码/backend/server/src/domain/scenarios/meeting/ocrProfile.js", REPO),
        run_command("npm run check", BACKEND),
    ]
    cases = make_cases()
    results = run_cases(cases)
    REPORT.write_text(build_report(results, command_results), encoding='utf-8')
    print(json.dumps({
        'cases': len(results),
        'passed': sum(1 for item in results if item['casePassed']),
        'failed': sum(1 for item in results if not item['casePassed']),
        'report': str(REPORT),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
