from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping


MONEY_ZERO = Decimal("0")


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, Mapping):
        parts: list[str] = []
        for key, val in value.items():
            if key in {"fileBase64", "ruleBase64", "base64", "fileContent", "buffer"}:
                continue
            parts.append(safe_text(val))
        return " ".join(part for part in parts if part)
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        return " ".join(safe_text(item) for item in value)
    return str(value).strip()


def to_decimal(value: Any, default: Decimal = MONEY_ZERO) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        return Decimal(int(value))
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    text = safe_text(value).replace(",", "")
    if not text:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return default
    try:
        return Decimal(match.group(0))
    except InvalidOperation:
        return default


def to_float(value: Any) -> float:
    return float(to_decimal(value))


def normalize_type(item: Mapping[str, Any]) -> str:
    raw = safe_text(item.get("recognizeType") or item.get("docType") or item.get("type"))
    mapping = {
        "meeting_notice": "meetingNotice",
        "会议通知": "meetingNotice",
        "meetingApproval": "meetingPlan",
        "meeting_approval": "meetingPlan",
        "会议审批单": "meetingPlan",
        "会议审批文件": "meetingPlan",
        "meetingPlan": "meetingPlan",
        "meeting_plan": "meetingPlan",
        "会议计划": "meetingPlan",
        "会议计划表": "meetingPlan",
        "会议计划审批表": "meetingPlan",
        "attendance_list": "attendanceList",
        "attendanceList": "attendanceList",
        "签到表": "attendanceList",
        "参会人员名单": "attendanceList",
        "人员名单": "attendanceList",
        "fee_settlement": "feeSettlement",
        "feeSettlement": "feeSettlement",
        "会议结算单": "feeSettlement",
        "费用明细": "feeSettlement",
        "费用原始明细": "feeSettlement",
        "accommodation_list": "accommodationList",
        "accommodationList": "accommodationList",
        "住宿清单": "accommodationList",
        "normal_invoice": "normalInvoice",
        "invoice": "normalInvoice",
        "normalInvoice": "normalInvoice",
        "发票": "normalInvoice",
    }
    return mapping.get(raw, raw or "other")


def get_prefill_data(context: Mapping[str, Any]) -> Mapping[str, Any]:
    data = context.get("prefillData") or context.get("data") or {}
    return data if isinstance(data, Mapping) else {}


def get_summary(context: Mapping[str, Any]) -> Mapping[str, Any]:
    prefill = get_prefill_data(context)
    summary = prefill.get("summary") or context.get("summary") or {}
    return summary if isinstance(summary, Mapping) else {}


def get_page_expense(context: Mapping[str, Any]) -> dict[str, Any]:
    summary = get_summary(context)
    page = summary.get("pageExpense") if isinstance(summary.get("pageExpense"), Mapping) else {}
    meeting_data = context.get("meetingData") or get_prefill_data(context).get("meetingData") or {}
    if not isinstance(meeting_data, Mapping):
        meeting_data = {}
    return {**page, **meeting_data}


def has_page_expense(context: Mapping[str, Any]) -> bool:
    page = get_page_expense(context)
    keys = (
        "days",
        "peopleCount",
        "mealAmount",
        "accommodationAmount",
        "venueAmount",
        "otherAmount",
        "totalAmount",
        "paperAttachmentCount",
    )
    return any(key in page for key in keys)


def get_payments(context: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    prefill = get_prefill_data(context)
    for key in ("payments", "paymentInfoList", "paymentRows"):
        rows = context.get(key) or prefill.get(key)
        if rows:
            return [row for row in as_list(rows) if isinstance(row, Mapping)]
    return []


def collect_ocr_items(context: Mapping[str, Any]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    seen: set[int] = set()

    def walk(value: Any) -> None:
        oid = id(value)
        if oid in seen:
            return
        seen.add(oid)
        if isinstance(value, Mapping):
            if value.get("recognizeType") or value.get("docType") or value.get("type"):
                copied = dict(value)
                copied["recognizeType"] = normalize_type(copied)
                found.append(copied)
                return
            for key, val in value.items():
                if key in {"fileBase64", "ruleBase64", "base64", "fileContent", "buffer"}:
                    continue
                if key in {"ocrItems", "data", "result", "results", "ocrModels", "ocrModelsData", "uploadResults", "attachments", "items", "partialResults"}:
                    walk(val)
                elif isinstance(val, (list, tuple)):
                    walk(val)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    for key in ("ocrItems", "uploadResults", "attachments"):
        if key in context:
            walk(context.get(key))
    prefill = get_prefill_data(context)
    for key in ("ocrItems", "uploadResults", "attachments"):
        if key in prefill:
            walk(prefill.get(key))

    unique: list[dict[str, Any]] = []
    semantic_seen: set[tuple[str, str, str, str]] = set()
    for item in found:
        semantic_key = (
            item.get("recognizeType") or "",
            safe_text(item.get("invoiceNumber") or item.get("meetingName") or item.get("sellerName")),
            safe_text(item.get("totalAmount") or item.get("amount")),
            safe_text(item.get("sourceFileName") or item.get("fileName") or item.get("name")),
        )
        if semantic_key in semantic_seen:
            continue
        semantic_seen.add(semantic_key)
        unique.append(item)
    return unique


def items_by_type(context: Mapping[str, Any], *types: str) -> list[Mapping[str, Any]]:
    wanted = set(types)
    return [item for item in collect_ocr_items(context) if normalize_type(item) in wanted]


def item_source(item: Mapping[str, Any], index: int = 0) -> str:
    return safe_text(
        item.get("sourceFileName")
        or item.get("fileName")
        or item.get("name")
        or item.get("attachmentName")
        or f"OCR材料{index + 1}"
    )


def item_text(item: Mapping[str, Any]) -> str:
    copied = dict(item)
    for key in ("fileBase64", "ruleBase64", "base64", "fileContent", "buffer"):
        copied.pop(key, None)
    return safe_text(copied)


def attachment_names(context: Mapping[str, Any]) -> list[str]:
    names: list[str] = []
    for item in as_list(context.get("attachments") or get_prefill_data(context).get("attachments")):
        if not isinstance(item, Mapping):
            continue
        text = safe_text([item.get("fileName"), item.get("name"), item.get("attachmentType"), item.get("type")])
        if text:
            names.append(text)
    for item in collect_ocr_items(context):
        text = safe_text([item.get("sourceFileName"), item.get("fileName"), item.get("name")])
        if text:
            names.append(text)
    return names


def snippet(text: str, keyword: str, size: int = 28) -> str:
    idx = text.find(keyword)
    if idx < 0:
        return text[: size * 2]
    return text[max(0, idx - size): idx + len(keyword) + size]


def keyword_hits(
    context: Mapping[str, Any],
    keywords: Iterable[str],
    types: Iterable[str] | None = None,
    text_filter=None,
) -> list[dict[str, Any]]:
    wanted = set(types or [])
    hits: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for index, item in enumerate(collect_ocr_items(context)):
        doc_type = normalize_type(item)
        if wanted and doc_type not in wanted:
            continue
        text = item_text(item)
        searchable = text_filter(text) if text_filter else text
        for keyword in keywords:
            if not keyword or keyword not in searchable:
                continue
            key = (doc_type, item_source(item, index), keyword)
            if key in seen:
                continue
            seen.add(key)
            hits.append({
                "keyword": keyword,
                "recognizeType": doc_type,
                "source": item_source(item, index),
                "snippet": snippet(text, keyword),
            })
    return hits


def issue(category: str, description: str, suggestion: str, severity: str = "warning", evidence: Mapping[str, Any] | None = None) -> dict[str, Any]:
    output = {
        "category": category,
        "description": description,
        "suggestion": suggestion,
        "severity": severity,
    }
    if evidence:
        output["evidence"] = dict(evidence)
    return output


def result(meta: Mapping[str, Any], issues: list[Mapping[str, Any]], summary: str | None = None, skipped: bool = False) -> dict[str, Any]:
    if summary is None:
        if skipped:
            summary = "skipped：关键数据不足，需人工复核。"
        else:
            summary = "通过" if not issues else f"发现 {len(issues)} 个问题"
    return {
        "passed": not issues and not skipped,
        "status": "skipped" if skipped else ("pass" if not issues else "warning"),
        "skipped": skipped,
        "issues": issues,
        "summary": summary,
    }


def skipped(meta: Mapping[str, Any], description: str, evidence: Mapping[str, Any] | None = None) -> dict[str, Any]:
    return result(
        meta,
        [issue(meta.get("category", "人工复核"), description, "请补充或核实相关材料后人工复核。", "warning", evidence or {})],
        f"skipped：{description}",
        skipped=True,
    )


DATE_TOKEN_RE = re.compile(
    r"(?:(?P<year>\d{4})\s*(?:年|[-/.])\s*)?"
    r"(?P<month>\d{1,2})\s*(?:月|[-/.])\s*"
    r"(?P<day>\d{1,2})\s*(?:日)?\s*(?:上午|下午|晚上|晚间|全天)?"
)
RANGE_SEPARATOR_RE = re.compile(r"(?:至|到|起止|起至|[-—–－~～])")
MEETING_DATE_KEYWORDS = ("会议时间", "会期", "召开时间", "会议日期")
EXCLUDED_DATE_KEYWORDS = ("培训时间",)
HALF_DAY_POSITIVE_PATTERNS = (
    re.compile(r"0\.5\s*天"),
    re.compile(r"会期\s*(?:为|共|[:：])?\s*半天"),
    re.compile(r"会议时间\s*(?:为|共|[:：])?\s*半天"),
    re.compile(r"会议\s*半天"),
    re.compile(r"共\s*半天"),
)
HALF_DAY_NEGATIVE_PATTERNS = (
    re.compile(r"每\s*半天\s*休息"),
    re.compile(r"半天\s*报到"),
    re.compile(r"提前\s*半天\s*报到"),
    re.compile(r"半天\s*返程"),
    re.compile(r"半天\s*会议\s*准备"),
    re.compile(r"上午\s*半天\s*安排\s*报到"),
)


def _date_from_parts(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _date_tokens(value: Any) -> list[dict[str, Any]]:
    body = safe_text(value)
    tokens: list[dict[str, Any]] = []
    for match in DATE_TOKEN_RE.finditer(body):
        year_text = match.group("year")
        month_text = match.group("month")
        day_text = match.group("day")
        if not month_text or not day_text:
            continue
        month = int(month_text)
        day = int(day_text)
        if month < 1 or month > 12 or day < 1 or day > 31:
            continue
        tokens.append({
            "year": int(year_text) if year_text else None,
            "month": month,
            "day": day,
            "start": match.start(),
            "end": match.end(),
            "text": match.group(0),
        })
    return tokens


def _token_to_date(token: Mapping[str, Any], inherited_year: int | None = None) -> date | None:
    year = token.get("year") or inherited_year
    if not year:
        return None
    return _date_from_parts(int(year), int(token["month"]), int(token["day"]))


def _ordered_date_range(start: date, end: date) -> tuple[date, date]:
    if end < start:
        return end, start
    return start, end


def _looks_like_range_gap(gap: str, end_has_year: bool) -> bool:
    compact = re.sub(r"\s+", "", gap)
    if not compact:
        return not end_has_year
    if len(compact) > 16:
        return False
    return bool(RANGE_SEPARATOR_RE.search(compact))


def parse_date(value: Any) -> date | None:
    text = safe_text(value)
    if not text:
        return None
    match = re.search(r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?", text)
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def extract_dates(text: Any) -> list[date]:
    body = safe_text(text)
    dates: list[date] = []
    for token in _date_tokens(body):
        if not token.get("year"):
            continue
        parsed = _token_to_date(token)
        if parsed:
            dates.append(parsed)
    return dates


def extract_meeting_date_range_from_text(text: Any) -> tuple[date | None, date | None]:
    body = safe_text(text)
    tokens = _date_tokens(body)
    for index in range(len(tokens) - 1):
        start_token = tokens[index]
        end_token = tokens[index + 1]
        if not start_token.get("year"):
            continue
        gap = body[start_token["end"]: end_token["start"]]
        if not _looks_like_range_gap(gap, bool(end_token.get("year"))):
            continue
        start = _token_to_date(start_token)
        end = _token_to_date(end_token, int(start_token["year"]))
        if start and end:
            return _ordered_date_range(start, end)
    return None, None


def _unique_dates(dates: Iterable[date]) -> list[date]:
    output: list[date] = []
    seen: set[date] = set()
    for item in dates:
        if item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


def _keyword_date_lines(text: Any) -> list[str]:
    body = safe_text(text)
    if not body:
        return []
    lines = [line.strip() for line in re.split(r"[\r\n]+", body) if line.strip()]
    return [
        line
        for line in lines
        if any(keyword in line for keyword in MEETING_DATE_KEYWORDS)
        and not any(keyword in line for keyword in EXCLUDED_DATE_KEYWORDS)
    ]


def _date_range_from_keyword_lines(text: Any) -> tuple[date | None, date | None, str]:
    for line in _keyword_date_lines(text):
        start, end = extract_meeting_date_range_from_text(line)
        if start and end:
            return start, end, line[:80]
        start, end, _source = _fallback_date_range_from_text(line, "keywordLine")
        if start and end:
            return start, end, line[:80]
    return None, None, ""


def _fallback_date_range_from_text(text: Any, source: str) -> tuple[date | None, date | None, str]:
    dates = _unique_dates(extract_dates(text))
    if len(dates) > 2:
        return None, None, f"{source}:multipleDates"
    start, end = extract_meeting_date_range_from_text(text)
    if start and end:
        return start, end, source
    if len(dates) == 1:
        return dates[0], dates[0], source
    if len(dates) == 2:
        start, end = _ordered_date_range(dates[0], dates[1])
        return start, end, source
    return None, None, ""


def _item_date_texts(item: Mapping[str, Any]) -> list[str]:
    return [
        safe_text(item.get("meetingTimeText")),
        safe_text(item.get("timeText")),
        safe_text(item.get("rawText")),
        item_text(item),
    ]


def _structured_time_texts(item: Mapping[str, Any]) -> list[str]:
    start_end_text = safe_text([item.get("startTimeText"), "至", item.get("endTimeText")])
    return [
        safe_text(item.get("meetingTimeText")),
        start_end_text,
        safe_text(item.get("timeText")),
    ]


def explicit_half_day(context: Mapping[str, Any]) -> bool:
    summary = get_summary(context)
    body = safe_text([summary, collect_ocr_items(context)])
    for pattern in HALF_DAY_POSITIVE_PATTERNS:
        for match in pattern.finditer(body):
            window = body[max(0, match.start() - 12): match.end() + 12]
            if any(negative.search(window) for negative in HALF_DAY_NEGATIVE_PATTERNS):
                continue
            return True
    return False


def meeting_date_range(context: Mapping[str, Any]) -> tuple[date | None, date | None, str]:
    summary = get_summary(context)
    start = parse_date(summary.get("startDate"))
    end = parse_date(summary.get("endDate"))
    if start and end:
        if end < start:
            start, end = end, start
        return start, end, "summary.startDate/endDate"

    for item in items_by_type(context, "meetingNotice"):
        start = parse_date(item.get("startDate") or item.get("startTimeText"))
        end = parse_date(item.get("endDate") or item.get("endTimeText"))
        if start and end:
            start, end = _ordered_date_range(start, end)
            return start, end, f"{normalize_type(item)}.startDate/endDate"
        for text in _structured_time_texts(item):
            start, end = extract_meeting_date_range_from_text(text)
            if not start or not end:
                start, end, _source = _fallback_date_range_from_text(text, f"{normalize_type(item)}.meetingTimeText")
            if start and end:
                return start, end, f"{normalize_type(item)}.meetingTimeText"

    for item in items_by_type(context, "meetingPlan"):
        start = parse_date(item.get("startDate") or item.get("startTimeText"))
        end = parse_date(item.get("endDate") or item.get("endTimeText"))
        if start and end:
            start, end = _ordered_date_range(start, end)
            return start, end, f"{normalize_type(item)}.startDate/endDate"
        for text in _structured_time_texts(item):
            start, end = extract_meeting_date_range_from_text(text)
            if not start or not end:
                start, end, _source = _fallback_date_range_from_text(text, f"{normalize_type(item)}.meetingTimeText")
            if start and end:
                return start, end, f"{normalize_type(item)}.meetingTimeText"

    for index, item in enumerate(collect_ocr_items(context)):
        for text in _item_date_texts(item):
            start, end, line = _date_range_from_keyword_lines(text)
            if start and end:
                source = f"{normalize_type(item)}.keywordLine"
                return start, end, f"{source}: {line}"

    ocr_text = "\n".join(item_text(item) for item in collect_ocr_items(context))
    start, end, source = _fallback_date_range_from_text(ocr_text, "ocrText")
    if start and end:
        return start, end, source
    return None, None, source


def calculate_meeting_days(context: Mapping[str, Any]) -> tuple[float, dict[str, Any]]:
    start, end, source = meeting_date_range(context)
    if start and end:
        days = (end - start).days + 1
        return float(max(days, 1)), {
            "source": source,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
        }
    summary = get_summary(context)
    explicit = to_decimal(summary.get("meetingDays") or summary.get("approvedDays"))
    if explicit:
        return float(explicit), {"source": "summary.meetingDays"}
    for item in items_by_type(context, "meetingPlan", "meetingNotice"):
        explicit = to_decimal(item.get("approvedDays") or item.get("meetingDays"))
        if explicit:
            return float(explicit), {"source": f"{normalize_type(item)}.approvedDays"}
    if explicit_half_day(context):
        return 0.5, {"source": "explicitHalfDay"}
    return 0.0, {"source": source or "unrecognized"}


def determine_meeting_category(context: Mapping[str, Any]) -> tuple[str, str, dict[str, Any]]:
    summary = get_summary(context)
    meeting_name = safe_text(summary.get("meetingName"))
    unit_name = safe_text(summary.get("reimbursementUnitName") or summary.get("departmentName"))
    attendee_scope = safe_text(summary.get("attendeeScope"))
    for item in items_by_type(context, "meetingNotice", "meetingPlan"):
        meeting_name = meeting_name or safe_text(item.get("meetingName"))
        unit_name = unit_name or safe_text(item.get("organizerUnit"))
        attendee_scope = attendee_scope or safe_text(item.get("attendeeScope"))

    evidence = {"meetingName": meeting_name, "unitName": unit_name, "attendeeScope": attendee_scope}
    central_unit = is_central_tax_administration(unit_name)
    if central_unit and "全国税务工作会议" in meeting_name:
        return "二类会议", "报销单位判定为国家税务总局总局机关或内设机构，且会议名称包含“全国税务工作会议”。", evidence
    if central_unit and any(k in attendee_scope for k in ("各省", "计划单列市", "分管局领导", "部门主要负责人")):
        return "三类会议", "报销单位判定为国家税务总局总局机关或内设机构，且会议通知参会范围命中三类会议关键词。", evidence
    if unit_name and "省税务局" in unit_name and ("年度工作会议" in meeting_name or "省税务工作会议" in meeting_name):
        return "三类会议", "报销单位名称包含“省税务局”，且会议名称命中三类会议关键词。", evidence
    return "四类会议", "第一轮保守口径：未明确满足二类或三类会议条件，默认按四类会议处理。", evidence


def is_central_tax_administration(unit_name: Any) -> bool:
    text = re.sub(r"\s+", "", safe_text(unit_name))
    if text == "国家税务总局":
        return True
    if not text.startswith("国家税务总局"):
        return False
    if re.search(r"(省|市|县|区|旗|自治州|地区).{0,12}税务局", text):
        return False
    return bool(re.search(r"国家税务总局(机关|办公厅|.+司|.+局|.+中心)", text))


def attendance_count(context: Mapping[str, Any], allow_page_fallback: bool = False) -> tuple[int, str, dict[str, Any]]:
    summary = get_summary(context)
    count = int(to_decimal(summary.get("attendanceCount")))
    if count > 0:
        return count, safe_text(summary.get("attendanceCountSource") or "summary.attendanceCount"), {"count": count}
    for item in items_by_type(context, "attendanceList"):
        direct = int(to_decimal(item.get("count") or item.get("attendeeCount")))
        if direct > 0:
            return direct, "attendanceList.count", {"count": direct}
        names = sorted({safe_text(name) for name in as_list(item.get("names")) if safe_text(name)})
        if names:
            return len(names), "attendanceList.names 去空去重计数", {"count": len(names), "namesCount": len(names)}
    if allow_page_fallback:
        page_count = int(to_decimal(get_page_expense(context).get("peopleCount")))
        if page_count > 0:
            return page_count, "因签到表人数无法稳定识别，暂以页面人数辅助判断", {"count": page_count, "fallback": "pageExpense.peopleCount"}
    return 0, "未能识别签到表人数", {}


def invoice_total(context: Mapping[str, Any]) -> Decimal:
    total, _source = invoice_total_with_source(context)
    return total


def invoice_total_with_source(context: Mapping[str, Any]) -> tuple[Decimal, str]:
    summary_total = to_decimal(get_summary(context).get("invoiceTotalAmount"))
    if summary_total:
        return summary_total, "summary.invoiceTotalAmount"
    total = MONEY_ZERO
    for item in items_by_type(context, "normalInvoice"):
        total += to_decimal(item.get("totalAmount") or item.get("amount") or item.get("invoiceAmount"))
    if total:
        return total, "normalInvoice.totalAmount"
    return MONEY_ZERO, "missingInvoiceAmount"


def payment_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return ""


def iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)
