from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
from datetime import date
from typing import Any, Callable, Mapping

ROOT = pathlib.Path(__file__).resolve().parent
ROOT_TEXT = str(ROOT)
if ROOT_TEXT not in sys.path:
    sys.path.insert(0, ROOT_TEXT)

import run_rules


RUN_RULES = ROOT / "run_rules.py"


def meeting_category_fields(category: str) -> tuple[str, str, str]:
    if category == "二类会议":
        return "全国税务工作会议", "国家税务总局", "全国税务系统人员"
    if category == "三类会议":
        return "税收业务工作会议", "国家税务总局", "各省、计划单列市税务局分管局领导"
    return "本地业务专题会议", "某市税务局", "各科室人员"


def inclusive_days(start_date: str, end_date: str) -> int:
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    return (end - start).days + 1


def base_context(
    *,
    category: str = "四类会议",
    attendance: int = 20,
    location: str = "某市税务局会议室",
    start_date: str = "2026-05-06",
    end_date: str | None = None,
    fee_text: str = "会议服务费 100 元",
    accommodation_text: str = "住宿清单：标准间一间。",
    invoice_amount: int | None = 1000,
    include_invoice: bool = True,
    page_fields: bool = True,
    page_accommodation: int = 100,
    page_venue: int = 0,
    payments: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    end_date = end_date or start_date
    meeting_name, unit_name, attendee_scope = meeting_category_fields(category)
    context: dict[str, Any] = {
        "scenarioType": "meeting",
        "prefillData": {
            "summary": {
                "meetingName": meeting_name,
                "reimbursementUnitName": unit_name,
                "attendeeScope": attendee_scope,
                "startDate": start_date,
                "endDate": end_date,
                "attendanceCount": attendance,
            }
        },
        "attachments": [
            {"fileName": "会议计划表.pdf", "attachmentType": "会议计划"},
            {"fileName": "会议通知.pdf", "attachmentType": "会议通知"},
            {"fileName": "参会人员名单.pdf", "attachmentType": "签到表"},
            {"fileName": "会议结算单.pdf", "attachmentType": "结算单"},
        ],
        "payments": list(payments or []),
        "ocrItems": [
            {
                "recognizeType": "meetingNotice",
                "sourceFileName": "会议通知.pdf",
                "meetingName": meeting_name,
                "organizerUnit": unit_name,
                "meetingLocation": location,
                "startDate": start_date,
                "endDate": end_date,
                "attendeeScope": attendee_scope,
                "rawText": f"会议地点：{location}。会议时间：{start_date}至{end_date}。",
            },
            {
                "recognizeType": "meetingPlan",
                "sourceFileName": "会议计划表.pdf",
                "meetingName": meeting_name,
                "organizerUnit": unit_name,
                "approvedDays": str(inclusive_days(start_date, end_date)),
                "rawText": "会议计划审批表。",
            },
            {
                "recognizeType": "attendanceList",
                "sourceFileName": "参会人员名单.pdf",
                "meetingName": meeting_name,
                "count": str(attendance),
                "names": [],
                "rawText": f"参会人员名单，共{attendance}人。",
            },
            {
                "recognizeType": "feeSettlement",
                "sourceFileName": "会议结算单.pdf",
                "meetingName": meeting_name,
                "totalAmount": "100",
                "itemsDetail": [{"name": fee_text, "amount": "100"}],
                "rawText": f"费用明细：{fee_text}。",
            },
            {
                "recognizeType": "accommodationList",
                "sourceFileName": "住宿清单.pdf",
                "hotelName": "测试酒店",
                "totalAmount": "100",
                "roomItems": [{"roomType": accommodation_text, "amount": "100"}],
                "rawText": accommodation_text,
            },
        ],
    }
    if invoice_amount is not None:
        context["prefillData"]["summary"]["invoiceTotalAmount"] = invoice_amount
    if include_invoice:
        context["ocrItems"].append({
            "recognizeType": "normalInvoice",
            "sourceFileName": "发票.pdf",
            "sellerName": "测试服务单位",
            "totalAmount": str(invoice_amount or 0),
            "itemsDetail": [{"name": "会议服务费", "amount": str(invoice_amount or 0)}],
            "rawText": "普通发票：会议服务费。",
        })
    if page_fields:
        context["meetingData"] = {
            "days": inclusive_days(start_date, end_date),
            "peopleCount": attendance,
            "mealAmount": 0,
            "accommodationAmount": page_accommodation,
            "venueAmount": page_venue,
            "otherAmount": 0,
            "totalAmount": invoice_amount or 0,
            "paperAttachmentCount": 4,
            "meetingPlanNo": "TEST-MEETING-001",
            "reimbursementUnitName": unit_name,
            "departmentName": unit_name,
        }
    return context


def raw_notice_context(
    raw_text: str,
    *,
    category: str = "四类会议",
    attendance: int = 20,
) -> dict[str, Any]:
    meeting_name, unit_name, attendee_scope = meeting_category_fields(category)
    return {
        "scenarioType": "meeting",
        "prefillData": {
            "summary": {
                "meetingName": meeting_name,
                "reimbursementUnitName": unit_name,
                "attendeeScope": attendee_scope,
                "attendanceCount": attendance,
                "invoiceTotalAmount": 1000,
            }
        },
        "attachments": [
            {"fileName": "会议通知.pdf", "attachmentType": "会议通知"},
            {"fileName": "参会人员名单.pdf", "attachmentType": "签到表"},
        ],
        "payments": [],
        "ocrItems": [
            {
                "recognizeType": "meetingNotice",
                "sourceFileName": "会议通知.pdf",
                "meetingName": meeting_name,
                "organizerUnit": unit_name,
                "meetingLocation": "某市税务局会议室",
                "attendeeScope": attendee_scope,
                "rawText": raw_text,
            },
            {
                "recognizeType": "attendanceList",
                "sourceFileName": "参会人员名单.pdf",
                "meetingName": meeting_name,
                "count": str(attendance),
                "names": [],
                "rawText": f"参会人员名单，共{attendance}人。",
            },
            {
                "recognizeType": "normalInvoice",
                "sourceFileName": "发票.pdf",
                "sellerName": "测试服务单位",
                "totalAmount": "1000",
                "itemsDetail": [{"name": "会议服务费", "amount": "1000"}],
                "rawText": "普通发票：会议服务费。",
            },
        ],
    }


def run_context(context: Mapping[str, Any]) -> dict[str, Any]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.run(
        [sys.executable, str(RUN_RULES)],
        cwd=str(ROOT),
        input=json.dumps(context, ensure_ascii=False),
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=20,
    )
    if proc.returncode != 0:
        raise AssertionError(f"run_rules.py exited {proc.returncode}: {proc.stderr}")
    return json.loads(proc.stdout)


def rule_result(report: Mapping[str, Any], rule_id: str) -> Mapping[str, Any]:
    for item in report.get("ruleResults") or []:
        if item.get("ruleId") == rule_id:
            return item
    raise AssertionError(f"missing rule result: {rule_id}")


def contains_text(rule: Mapping[str, Any], text: str) -> bool:
    return text in json.dumps(rule, ensure_ascii=False)


def evidence_hit_level(rule: Mapping[str, Any], level: str) -> bool:
    return any(
        ((issue.get("evidence") or {}).get("hitLevel") == level)
        for issue in (rule.get("issues") or [])
    )


def rule_mentions_meeting_days(rule: Mapping[str, Any], expected: float) -> bool:
    expected_text = f"{expected:g}"
    body = json.dumps(rule, ensure_ascii=False)
    if f"会议天数 {expected_text} 天" in body or f"会议天数为 {expected_text} 天" in body:
        return True
    for item in rule.get("issues") or []:
        value = (item.get("evidence") or {}).get("meetingDays")
        if value is not None and abs(float(value) - expected) < 0.0001:
            return True
    return False


def run_case(
    name: str,
    context: Mapping[str, Any],
    rule_id: str,
    expected_status: str,
    *,
    must_contain: list[str] | None = None,
    must_not_contain: list[str] | None = None,
    custom_check: Callable[[Mapping[str, Any]], bool] | None = None,
) -> tuple[bool, str]:
    report = run_context(context)
    rule = rule_result(report, rule_id)
    actual_status = rule.get("status")
    failures: list[str] = []
    if actual_status != expected_status:
        failures.append(f"expected status={expected_status}, actual={actual_status}")
    for text in must_contain or []:
        if not contains_text(rule, text):
            failures.append(f"expected text not found: {text}")
    for text in must_not_contain or []:
        if contains_text(rule, text):
            failures.append(f"unexpected text found: {text}")
    if custom_check and not custom_check(rule):
        failures.append("custom check failed")
    if failures:
        return False, f"FAIL {name} [{rule_id}]: {'; '.join(failures)}\n{json.dumps(rule, ensure_ascii=False)}"
    return True, f"PASS {name} [{rule_id}]: status={actual_status}"


def run_normalize_checks() -> list[tuple[bool, str]]:
    class DummyModule:
        RULE_META = {"id": "dummy_rule", "name": "兼容性测试规则"}

    outputs: list[tuple[bool, str]] = []
    dict_result = run_rules.normalize_rule_result("dummy.py", DummyModule, {"issues": [], "summary": "通过"})
    outputs.append((
        dict_result["status"] == "pass" and dict_result["skipped"] is False,
        f"normalize dict result: status={dict_result.get('status')} skipped={dict_result.get('skipped')}",
    ))
    list_pass = run_rules.normalize_rule_result("dummy.py", DummyModule, [])
    outputs.append((
        list_pass["status"] == "pass" and list_pass["skipped"] is False,
        f"normalize empty list result: status={list_pass.get('status')} skipped={list_pass.get('skipped')}",
    ))
    list_warning = run_rules.normalize_rule_result("dummy.py", DummyModule, [{"description": "问题"}])
    outputs.append((
        list_warning["status"] == "warning" and list_warning["skipped"] is False,
        f"normalize issue list result: status={list_warning.get('status')} skipped={list_warning.get('skipped')}",
    ))
    return outputs


def main() -> int:
    cases: list[tuple[str, Mapping[str, Any], str, str, dict[str, Any]]] = []

    for category, limit in (("四类会议", 50), ("三类会议", 150), ("二类会议", 300)):
        cases.append((f"规则7 {category} 低于阈值不提示", base_context(category=category, attendance=limit - 1), "meeting_rule_07", "pass", {}))
        cases.append((f"规则7 {category} 等于阈值按清单提示", base_context(category=category, attendance=limit), "meeting_rule_07", "warning", {"must_contain": ["达到或超过"]}))
        cases.append((f"规则7 {category} 高于阈值提示", base_context(category=category, attendance=limit + 1), "meeting_rule_07", "warning", {}))

    cases.extend([
        ("普通会议地点不误报风景名胜区", base_context(), "meeting_rule_01", "pass", {}),
        ("三亚市税务局会议室仅弱提示", base_context(location="三亚市税务局会议室"), "meeting_rule_01", "warning", {"custom_check": lambda rule: evidence_hit_level(rule, "weak") and not evidence_hit_level(rule, "strong")}),
        ("黄山市税务局会议室仅弱提示", base_context(location="黄山市税务局会议室"), "meeting_rule_01", "warning", {"custom_check": lambda rule: evidence_hit_level(rule, "weak") and not evidence_hit_level(rule, "strong")}),
        ("太湖路会议室仅弱提示", base_context(location="太湖路会议室"), "meeting_rule_01", "warning", {"custom_check": lambda rule: evidence_hit_level(rule, "weak") and not evidence_hit_level(rule, "strong")}),
        ("武当山风景区强命中", base_context(location="武当山风景区内某酒店"), "meeting_rule_01", "warning", {"custom_check": lambda rule: evidence_hit_level(rule, "strong")}),
        ("四类会议 4 天超过会议天数", base_context(start_date="2026-05-04", end_date="2026-05-07"), "meeting_rule_06", "warning", {}),
        ("日期范围省略年份触发规则6", raw_notice_context("会议时间：2026年4月28日至5月1日"), "meeting_rule_06", "warning", {"custom_check": lambda rule: rule_mentions_meeting_days(rule, 4)}),
        ("报名日期不误扩张会议日期", raw_notice_context("通知日期：2026年4月10日\n报名截止：2026年4月20日\n会议时间：2026年5月6日至5月7日"), "meeting_rule_06", "pass", {"custom_check": lambda rule: rule_mentions_meeting_days(rule, 2)}),
        ("每半天休息不覆盖明确日期", raw_notice_context("会议时间：2026年5月6日至2026年5月7日\n会议期间每半天休息一次"), "meeting_rule_06", "pass", {"custom_check": lambda rule: rule_mentions_meeting_days(rule, 2)}),
        ("明确会期半天可识别", raw_notice_context("会议时间半天"), "meeting_rule_06", "pass", {"custom_check": lambda rule: rule_mentions_meeting_days(rule, 0.5)}),
        ("茅台仅规则12提示", base_context(fee_text="茅台 600 元"), "meeting_rule_03", "pass", {"must_not_contain": ["茅台"]}),
        ("茅台触发规则12", base_context(fee_text="茅台 600 元"), "meeting_rule_12", "warning", {"must_contain": ["茅台"]}),
        ("香烟触发规则12", base_context(fee_text="香烟 50 元"), "meeting_rule_12", "warning", {"must_contain": ["香烟"]}),
        ("鱼翅触发规则12", base_context(fee_text="鱼翅 700 元"), "meeting_rule_12", "warning", {"must_contain": ["鱼翅"]}),
        ("导游服务触发规则3", base_context(fee_text="导游服务 100 元"), "meeting_rule_03", "warning", {"must_contain": ["导游"]}),
        ("会议背景板触发规则3", base_context(fee_text="会议背景板 300 元"), "meeting_rule_03", "warning", {"must_contain": ["背景板"]}),
        ("纪念品触发规则3", base_context(fee_text="纪念品 100 元"), "meeting_rule_03", "warning", {"must_contain": ["纪念品"]}),
        ("料酒不触发规则12", base_context(fee_text="料酒 10 元"), "meeting_rule_12", "pass", {"must_not_contain": ["料酒"]}),
        ("酒店不因酒字触发规则12", base_context(fee_text="酒店服务费 300 元"), "meeting_rule_12", "pass", {"must_not_contain": ["酒店"]}),
        ("周六开会提示", base_context(start_date="2026-05-09"), "meeting_rule_10", "warning", {"must_contain": ["周末"]}),
        ("周日开会提示", base_context(start_date="2026-05-10"), "meeting_rule_10", "warning", {"must_contain": ["周末"]}),
        ("劳动节开会提示", base_context(start_date="2026-05-01"), "meeting_rule_10", "warning", {"must_contain": ["劳动节"]}),
        ("国庆节开会提示", base_context(start_date="2026-10-01"), "meeting_rule_10", "warning", {"must_contain": ["国庆节"]}),
        ("普通工作日不触发节假日规则", base_context(start_date="2026-05-06"), "meeting_rule_10", "pass", {}),
        ("套房触发规则11", base_context(accommodation_text="住宿清单：商务套房一间。"), "meeting_rule_11", "warning", {"must_contain": ["套房"]}),
        ("设备租赁费触发规则14", base_context(fee_text="设备租赁费 500 元"), "meeting_rule_14", "warning", {"must_contain": ["设备租赁费"]}),
        ("住宿费无页面字段时规则13跳过", base_context(page_fields=False), "meeting_rule_13", "skipped", {}),
        ("住宿费为0且场地费非0触发规则13", base_context(page_accommodation=0, page_venue=1000), "meeting_rule_13", "warning", {}),
        ("住宿费和场地费均为0不触发规则13", base_context(page_accommodation=0, page_venue=0), "meeting_rule_13", "pass", {}),
        ("住宿费和场地费均非0不触发规则13", base_context(page_accommodation=100, page_venue=1000), "meeting_rule_13", "pass", {}),
        ("发票缺失但页面金额存在时规则8跳过", base_context(invoice_amount=None, include_invoice=False, page_venue=6000), "meeting_rule_08", "skipped", {"must_contain": ["missingInvoiceAmount"]}),
        ("发票汇总金额超定额触发规则8", base_context(attendance=10, invoice_amount=6000), "meeting_rule_08", "warning", {"must_contain": ["summary.invoiceTotalAmount"]}),
        ("发票汇总金额未超定额不触发规则8", base_context(attendance=10, invoice_amount=5000), "meeting_rule_08", "pass", {}),
        ("四类会议分项标准缺失时规则9跳过", base_context(category="四类会议"), "meeting_rule_09", "skipped", {}),
        ("自然人收款且无公务卡信息触发规则2", base_context(payments=[{"payeeName": "张三", "cardAmount": 0, "cardConsumeTime": ""}]), "meeting_rule_02", "warning", {"must_contain": ["张三"]}),
        ("单位收款人不按自然人提示", base_context(payments=[{"payeeName": "测试服务有限公司", "cardAmount": 0, "cardConsumeTime": ""}]), "meeting_rule_02", "pass", {}),
    ])

    failures: list[str] = []
    for ok, message in run_normalize_checks():
        print(("PASS " if ok else "FAIL ") + message)
        if not ok:
            failures.append(message)

    for name, context, rule_id, expected_status, kwargs in cases:
        ok, message = run_case(name, context, rule_id, expected_status, **kwargs)
        print(message)
        if not ok:
            failures.append(message)

    if failures:
        print(f"\nRegression tests failed: {len(failures)}")
        return 1
    print(f"\nAll regression tests passed: {len(cases) + len(run_normalize_checks())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
