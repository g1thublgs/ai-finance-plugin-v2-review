from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping


MONEY_ZERO = Decimal("0")
DATE_PATTERNS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%Y.%m.%d",
    "%Y年%m月%d日",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y/%m/%d %H:%M:%S",
)


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def get_travel_data(context: Mapping[str, Any]) -> Mapping[str, Any]:
    return (
        context.get("travelData")
        or context.get("travel_data")
        or context.get("travel")
        or {}
    )


def get_people(context: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    travel = get_travel_data(context)
    return [p for p in as_list(travel.get("personal") or context.get("personal")) if isinstance(p, Mapping)]


def get_summary(context: Mapping[str, Any]) -> Mapping[str, Any]:
    travel = get_travel_data(context)
    return travel.get("summary") or context.get("summary") or {}


def get_payments(context: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    for key in ("payments", "paymentData", "paymentInfo", "paymentInfoList", "paymentRows"):
        rows = context.get(key)
        if rows:
            return [r for r in as_list(rows) if isinstance(r, Mapping)]
    return []


def to_decimal(value: Any, default: Decimal = MONEY_ZERO) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        return Decimal(int(value))
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    text = str(value).strip()
    if not text:
        return default
    text = text.replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return default
    try:
        return Decimal(match.group(0))
    except InvalidOperation:
        return default


def to_float(value: Any) -> float:
    return float(to_decimal(value))


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(to_decimal(value))
    except Exception:
        return default


def money(value: Decimal | int | float) -> str:
    return f"{to_decimal(value).quantize(Decimal('0.01'))}"


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, Mapping):
        parts: list[str] = []
        for key, val in value.items():
            if key in {"fileBase64", "ruleBase64", "base64", "fileContent"}:
                continue
            parts.append(safe_text(val))
        return " ".join(p for p in parts if p)
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        return " ".join(safe_text(v) for v in value)
    return str(value)


def contains_any(text: Any, keywords: Iterable[str]) -> bool:
    body = safe_text(text)
    return any(k and k in body for k in keywords)


def normalize_type(item: Mapping[str, Any]) -> str:
    doc_type = item.get("recognizeType") or item.get("docType") or item.get("type") or ""
    mapping = {
        "normalInvoice": "normalInvoice",
        "electronicInvoice": "normalInvoice",
        "vatInvoice": "normalInvoice",
        "invoice": "normalInvoice",
        "normal_invoice": "normalInvoice",
        "planeInvoice": "planeInvoice",
        "air_ticket": "planeInvoice",
        "airTicket": "planeInvoice",
        "plane_ticket": "planeInvoice",
        "flight_ticket": "planeInvoice",
        "flight": "planeInvoice",
        "plane": "planeInvoice",
        "飞机票": "planeInvoice",
        "机票": "planeInvoice",
        "公务机票": "planeInvoice",
        "trainInvoice": "trainInvoice",
        "train_ticket": "trainInvoice",
        "trainTicket": "trainInvoice",
        "railway_ticket": "trainInvoice",
        "train": "trainInvoice",
        "火车票": "trainInvoice",
        "accommodationList": "accommodationList",
        "accommodationlist": "accommodationList",
        "accommodation_list": "accommodationList",
        "hotelList": "accommodationList",
        "hotelInvoice": "accommodationList",
        "hotel_invoice": "accommodationList",
        "hotelBill": "accommodationList",
        "lodgingInvoice": "accommodationList",
        "lodging_invoice": "accommodationList",
        "hotel_list": "accommodationList",
        "accommodation": "accommodationList",
        "accommodationInvoice": "accommodationList",
        "accommodation_invoice": "accommodationList",
        "hotel": "accommodationList",
        "住宿清单": "accommodationList",
        "travel_request": "travelRequest",
        "travelRequest": "travelRequest",
        "TravelRequest": "travelRequest",
        "travelApproval": "travelRequest",
        "travel_approval": "travelRequest",
        "businessTripApproval": "travelRequest",
        "business_trip_approval": "travelRequest",
        "businessTripApplication": "travelRequest",
        "business_trip_application": "travelRequest",
        "approvalForm": "travelRequest",
        "出差审批单": "travelRequest",
    }
    return mapping.get(str(doc_type), str(doc_type))


def _blank_ocr_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, set)):
        return len(value) == 0
    if isinstance(value, Mapping):
        return len(value) == 0
    return False


def merge_ocr_item(target: dict[str, Any], source: Mapping[str, Any]) -> dict[str, Any]:
    for key, value in source.items():
        if key in {"fileBase64", "ruleBase64", "base64", "fileContent"} or str(key).startswith("__"):
            continue
        if _blank_ocr_value(value):
            continue
        current = target.get(key)
        if _blank_ocr_value(current):
            target[key] = value
            continue
        if isinstance(current, dict) and isinstance(value, Mapping):
            merge_ocr_item(current, value)
    return target


def collect_ocr_items(context: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    items: list[Mapping[str, Any]] = []
    seen: set[int] = set()

    def walk(obj: Any) -> None:
        oid = id(obj)
        if oid in seen:
            return
        seen.add(oid)
        if isinstance(obj, Mapping):
            if obj.get("recognizeType") or obj.get("docType"):
                copied = dict(obj)
                copied["recognizeType"] = normalize_type(copied)
                items.append(copied)
                return
            for key, value in obj.items():
                if key in {"fileBase64", "ruleBase64", "base64", "fileContent"}:
                    continue
                if key in {
                    "data",
                    "result",
                    "ocrModels",
                    "ocrModelsData",
                    "partialResults",
                    "results",
                    "attachments",
                    "ocrItems",
                    "items",
                }:
                    walk(value)
                elif isinstance(value, (list, tuple)):
                    walk(value)
        elif isinstance(obj, (list, tuple)):
            for entry in obj:
                walk(entry)

    for key in (
        "ocrItems",
        "ocr_items",
        "ocrResults",
        "ocrModels",
        "uploadResults",
        "attachments",
        "selectedAttachments",
    ):
        if context.get(key) is not None:
            walk(context[key])

    unique: list[dict[str, Any]] = []
    semantic_seen: dict[tuple[Any, ...], dict[str, Any]] = {}
    for item in items:
        key = ocr_item_semantic_key(item)
        if key in semantic_seen:
            merge_ocr_item(semantic_seen[key], item)
            continue
        copied = dict(item)
        semantic_seen[key] = copied
        unique.append(copied)
    return unique


def ocr_item_semantic_key(item: Mapping[str, Any]) -> tuple[Any, ...]:
    doc_type = normalize_type(item)
    number = ""
    for key in (
        "invoiceNumber", "ticketNumber", "ticketNo", "eticketNumber", "eTicketNumber",
        "gpNumber", "gpNo", "gpCode", "gpTicketNo", "gpOrderNo", "gpIdentifier",
        "GP", "gp", "GP标识", "gp标识", "公务机票标识", "政府采购编号", "政府采购机票查验单号",
        "电子客票号", "发票号码", "票号",
    ):
        value = safe_text(item.get(key)).strip()
        if value:
            number = value
            break
    if number:
        return (doc_type, "number", number)
    person = ""
    for key in (
        "passengerName", "passenger_name", "passenger", "guestName", "requesterName",
        "requester", "applicantName", "applicant", "travelerName", "travellerName",
        "traveler", "traveller", "personName", "userName", "employeeName", "staffName",
        "name", "person", "姓名", "出差人", "旅客姓名", "旅客", "乘客", "乘机人",
        "乘车人", "出行人", "入住人", "住宿人", "申请人", "报销人", "经办人",
    ):
        value = safe_text(item.get(key)).strip()
        if value:
            person = value
            break
    dates = tuple(str(d) for d in extract_dates_from_text(item)[:4])
    amount = str(amount_from_item(item))
    source_file = safe_text(item.get("sourceFileName")).strip() if not dates else ""
    if person or dates or amount not in {"0", "0.00"}:
        return (doc_type, person, dates, amount, source_file)
    text_source = dict(item)
    text_source.pop("sourceModelName", None)
    text_source.pop("sourceFileName", None)
    compact_text = re.sub(r"\s+", "", safe_text(text_source))[:120]
    return (doc_type, person, dates, amount, compact_text)


def items_by_type(context: Mapping[str, Any], *types: str) -> list[Mapping[str, Any]]:
    wanted = set(types)
    return [item for item in collect_ocr_items(context) if normalize_type(item) in wanted]


def item_text(item: Mapping[str, Any]) -> str:
    return safe_text(item)


def all_ocr_text(context: Mapping[str, Any]) -> str:
    return " ".join(item_text(item) for item in collect_ocr_items(context))


def person_name(person: Mapping[str, Any]) -> str:
    return str(person.get("name") or person.get("personName") or person.get("userName") or "").strip()


def normalize_person_for_match(value: Any) -> str:
    return re.sub(r"\s+", "", safe_text(value)).replace("圆", "园")


def names_match(left: Any, right: Any) -> bool:
    raw_left = safe_text(left).strip()
    raw_right = safe_text(right).strip()
    if not raw_left or not raw_right:
        return False
    norm_left = normalize_person_for_match(raw_left)
    norm_right = normalize_person_for_match(raw_right)
    return (
        raw_left in raw_right
        or raw_right in raw_left
        or norm_left in norm_right
        or norm_right in norm_left
    )


def item_person_name(item: Mapping[str, Any]) -> str:
    for key in (
        "passengerName", "passenger_name", "passenger", "guestName", "requesterName",
        "requester", "applicantName", "applicant", "travelerName", "travellerName",
        "traveler", "traveller", "personName", "userName", "employeeName", "staffName",
        "name", "person", "姓名", "出差人", "旅客姓名", "旅客", "乘客", "乘机人",
        "乘车人", "出行人", "入住人", "住宿人", "申请人", "报销人", "经办人",
    ):
        value = str(item.get(key) or "").strip()
        if value:
            return value
    return ""


def matches_person(person: Mapping[str, Any], item: Mapping[str, Any], total_people: int = 0) -> bool:
    name = person_name(person)
    if not name:
        return False
    item_name = item_person_name(item)
    if item_name and names_match(name, item_name):
        return True
    if total_people == 1 and not item_name:
        return True
    return name in item_text(item)


def person_items(
    person: Mapping[str, Any],
    items: Iterable[Mapping[str, Any]],
    total_people: int = 0,
) -> list[Mapping[str, Any]]:
    return [item for item in items if matches_person(person, item, total_people)]


def amount_from_item(item: Mapping[str, Any]) -> Decimal:
    for key in ("totalAmount", "amount", "price", "ticketPrice", "fare", "价税合计", "金额", "票价"):
        if item.get(key) not in (None, ""):
            amount = to_decimal(item.get(key))
            if amount:
                return amount
    detail = item.get("accommodationDetail")
    if isinstance(detail, list) and detail:
        total = sum((to_decimal(row.get("amount")) for row in detail if isinstance(row, Mapping)), MONEY_ZERO)
        if total:
            return total
    return MONEY_ZERO


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("至", " ")
    for pattern in DATE_PATTERNS:
        try:
            return datetime.strptime(text[: len(datetime.now().strftime(pattern))], pattern).date()
        except Exception:
            pass
    match = re.search(r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})", text)
    if match:
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            return None
    return None


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text = str(value).strip()
    if not text:
        return None
    for pattern in DATE_PATTERNS:
        try:
            return datetime.strptime(text, pattern)
        except Exception:
            pass
    found = parse_date(text)
    return datetime.combine(found, datetime.min.time()) if found else None


def extract_dates_from_text(text: Any) -> list[date]:
    body = safe_text(text)
    matches = re.findall(r"\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?", body)
    parsed = [parse_date(m) for m in matches]
    return [d for d in parsed if d]


def approved_intervals(items: Iterable[Mapping[str, Any]]) -> list[tuple[date, date]]:
    intervals: list[tuple[date, date]] = []
    for item in items:
        start = parse_date(item.get("startDate") or item.get("startTime") or item.get("外出时间"))
        end = parse_date(item.get("endDate") or item.get("endTime") or item.get("结束时间"))
        if start and not end:
            end = start
        if not start or not end:
            dates = extract_dates_from_text(item)
            if dates:
                start = min(dates)
                end = max(dates)
        if start and end:
            if end < start:
                start, end = end, start
            intervals.append((start, end))
    return intervals


def range_covered(start: date, end: date, intervals: Iterable[tuple[date, date]]) -> bool:
    merged: list[tuple[date, date]] = []
    for left, right in sorted(intervals):
        if not merged or left > merged[-1][1]:
            merged.append((left, right))
        elif right > merged[-1][1]:
            merged[-1] = (merged[-1][0], right)
    current = start
    for left, right in merged:
        if left > current:
            return False
        if right >= end:
            return True
        current = right
    return False


def trip_days(person: Mapping[str, Any]) -> int:
    start = parse_date(person.get("startTime") or person.get("startDate"))
    end = parse_date(person.get("endTime") or person.get("endDate"))
    if start and end:
        return max((end - start).days + 1, 1)
    return max(
        to_int(person.get("mealDays")),
        to_int(person.get("localTransportDays")),
        to_int(person.get("hotelDays")),
        0,
    )


def is_bureau_level(rank: Any) -> bool:
    text = safe_text(rank)
    return any(k in text for k in ("司局", "厅局", "局级", "部级", "相当职务"))


def normalize_place(value: Any) -> str:
    text = safe_text(value)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[，,。；;：:（）()【】\[\]]", "", text)
    text = re.sub(r"^(全国|中国|中华人民共和国)", "", text)

    for marker in ("特别行政区", "自治区", "省"):
        if marker in text:
            text = text.split(marker)[-1]

    had_station_suffix = bool(re.search(r"(火车站|高铁站|动车站|汽车站|机场|车站|东站|西站|南站|北站|站)$", text))
    text = re.sub(r"(火车站|高铁站|动车站|汽车站|机场|车站|东站|西站|南站|北站|站)$", "", text)
    if had_station_suffix and len(text) > 2 and text[-1] in "东西南北":
        text = text[:-1]

    text = re.sub(r"(市|区|县|旗)$", "", text)
    return text


def compact_place(value: Any) -> str:
    text = safe_text(value)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[，,。；;：:（）()【】\[\]、/|\\\-—_]", "", text)
    text = re.sub(r"^(全国|中国|中华人民共和国)", "", text)
    return text


def places_match(left: Any, right: Any) -> bool:
    raw_a = compact_place(left)
    raw_b = compact_place(right)
    if not raw_a or not raw_b:
        return True
    if raw_a == raw_b:
        return True
    if min(len(raw_a), len(raw_b)) >= 2 and (raw_a in raw_b or raw_b in raw_a):
        return True
    a = normalize_place(left)
    b = normalize_place(right)
    if not a or not b:
        return True
    if a in b or b in a:
        return True
    a_tokens = set(re.findall(r"[\u4e00-\u9fa5]{2,}", a))
    b_tokens = set(re.findall(r"[\u4e00-\u9fa5]{2,}", b))
    if a_tokens & b_tokens:
        return True
    a_bigrams = {a[i : i + 2] for i in range(max(len(a) - 1, 0))}
    b_bigrams = {b[i : i + 2] for i in range(max(len(b) - 1, 0))}
    return bool(a_bigrams & b_bigrams)


def make_issue(
    category: str,
    description: str,
    suggestion: str,
    severity: str = "warning",
    evidence: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    issue: dict[str, Any] = {
        "category": category,
        "description": description,
        "suggestion": suggestion,
        "severity": severity,
    }
    if evidence:
        issue["evidence"] = dict(evidence)
    return issue


def build_result(meta: Mapping[str, Any], issues: list[Mapping[str, Any]], skipped: bool = False) -> dict[str, Any]:
    status = "skipped" if skipped else ("pass" if not issues else "warning")
    return {
        "ruleId": meta.get("rule_id"),
        "ruleName": meta.get("rule_name"),
        "scene": meta.get("scene"),
        "auditType": meta.get("audit_type"),
        "promptLevel": meta.get("prompt_level"),
        "passed": not issues,
        "status": status,
        "issues": list(issues),
        "policyBasis": meta.get("policy_basis", ""),
    }
