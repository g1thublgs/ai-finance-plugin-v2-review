import datetime
import re


EPSILON = 0.01


def to_text(value):
    if value is None:
        return ''
    if isinstance(value, (dict, list)):
        return str(value)
    return str(value).strip()


def normalize_text(value):
    return re.sub(r'\s+', '', to_text(value))


def get_nested(data, paths, default=None):
    if isinstance(paths, str):
        paths = [paths]
    for path in paths or []:
        cur = data
        ok = True
        for part in str(path).split('.'):
            if isinstance(cur, dict) and part in cur:
                cur = cur.get(part)
            elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
                cur = cur[int(part)]
            else:
                ok = False
                break
        if ok and cur not in (None, ''):
            return cur
    return default


def to_number(value, default=0):
    if value in (None, ''):
        return default
    if isinstance(value, (int, float)):
        return value
    text = to_text(value).replace(',', '').replace('，', '').replace('￥', '').replace('¥', '').replace('元', '')
    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        return default
    try:
        return float(match.group(0))
    except Exception:
        return default


def to_int(value, default=0):
    try:
        return int(round(to_number(value, default)))
    except Exception:
        return default


def parse_date(value):
    text = to_text(value)
    if not text:
        return None
    text = text.replace('年', '-').replace('月', '-').replace('日', '').replace('/', '-').replace('.', '-')
    match = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', text)
    if not match:
        return None
    try:
        return datetime.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except Exception:
        return None


def date_range(start, end):
    start_date = parse_date(start)
    end_date = parse_date(end) or start_date
    if not start_date:
        return []
    if end_date < start_date:
        return [start_date]
    days = []
    cur = start_date
    while cur <= end_date:
        days.append(cur)
        cur += datetime.timedelta(days=1)
    return days


def date_diff_days(start, end):
    dates = date_range(start, end)
    return len(dates) if dates else 0


def summary(context):
    return context.get('summary') or (context.get('prefillData') or {}).get('summary') or {}


def ocr_items(context):
    items = context.get('ocrItems') or (context.get('prefillData') or {}).get('ocrItems') or []
    return items if isinstance(items, list) else []


def records(context):
    rows = context.get('records') or (context.get('prefillData') or {}).get('records') or []
    return rows if isinstance(rows, list) else []


def payments(context):
    rows = context.get('payments') or context.get('paymentInfoList') or []
    return rows if isinstance(rows, list) else []


def doc_type(item):
    return to_text((item or {}).get('recognizeType') or (item or {}).get('docType') or (item or {}).get('type'))


def has_doc_type(data, doc_types):
    wanted = set(doc_types if isinstance(doc_types, list) else [doc_types])
    if any(doc_type(item) in wanted for item in ocr_items(data)):
        return True
    s = summary(data)
    bool_fields = {
        'meetingNotice': 'hasMeetingNotice',
        'meetingApproval': 'hasMeetingApproval',
        'meetingPlan': 'hasMeetingPlan',
        'attendanceList': 'hasAttendanceList',
        'meetingSettlement': 'hasSettlement',
        'accommodationList': 'hasAccommodationList',
        'normalInvoice': 'hasInvoice',
        'paymentProof': 'hasPaymentProof',
    }
    return any(s.get(bool_fields.get(item, '')) for item in wanted)


def all_text(data, doc_types=None):
    wanted = set(doc_types or [])
    chunks = []
    for item in ocr_items(data):
        if wanted and doc_type(item) not in wanted:
            continue
        chunks.append(to_text(item.get('rawText')))
        chunks.append(to_text(item.get('meetingName')))
        chunks.append(to_text(item.get('location')))
        for key in ['itemsDetail', 'details', 'detailRows']:
            rows = item.get(key) or []
            if isinstance(rows, list):
                for row in rows:
                    chunks.append(' '.join(to_text(v) for v in (row or {}).values()))
    return '\n'.join(chunks)


def find_keywords(text, keywords):
    compact = normalize_text(text)
    return [kw for kw in keywords if normalize_text(kw) in compact]


def get_amount(data, paths, default=0):
    return to_number(get_nested(data, paths, default), default)


def get_summary_amount(data, field, default=0):
    return to_number(summary(data).get(field), default)


def is_zero_or_blank(value):
    return value in (None, '') or abs(to_number(value, 0)) <= EPSILON


def is_positive(value):
    return to_number(value, 0) > EPSILON


def build_evidence(**kwargs):
    return {k: v for k, v in kwargs.items() if v not in (None, '')}


def issue(category, description, suggestion, severity='warning', evidence=None):
    return {
        'category': category,
        'description': description,
        'suggestion': suggestion,
        'severity': severity,
        'evidence': evidence or {},
    }


def result(rule_id, name, passed, summary_text, issues=None):
    tagged = []
    for item in issues or []:
        tagged.append({**item, 'ruleId': rule_id, 'ruleName': name})
    return {'passed': passed, 'issues': tagged, 'summary': summary_text}


def make_pass(rule_id, name, summary_text='未发现明显问题。', evidence=None):
    return result(rule_id, name, True, summary_text, [])


def make_warning(rule_id, name, description, suggestion='请人工复核。', evidence=None, category=None):
    return result(rule_id, name, False, description, [issue(category or name, description, suggestion, 'warning', evidence)])


def make_fail(rule_id, name, description, suggestion='请核实并补充说明。', evidence=None, category=None):
    return result(rule_id, name, False, description, [issue(category or name, description, suggestion, 'error', evidence)])


def make_skip(rule_id, name, missing, evidence=None):
    text = f'缺少{missing}，需人工复核。'
    return result(rule_id, name, False, text, [issue(name, text, '请补充页面字段或附件识别结果后重新审核。', 'warning', evidence)])


def meeting_category(data):
    s = summary(data)
    explicit = to_text(s.get('meetingCategory') or s.get('category'))
    if explicit:
        if '二类' in explicit:
            return '二类'
        if '三类' in explicit:
            return '三类'
        if '四类' in explicit:
            return '四类'
        return explicit
    page = s.get('pageFields') or {}
    unit = normalize_text(page.get('reimbursementUnitName') or get_nested(data, ['unitName', 'departmentName'], ''))
    name = normalize_text(s.get('meetingName') or page.get('meetingName') or all_text(data, ['meetingNotice', 'meetingPlan']))
    attendee_scope = normalize_text(all_text(data, ['meetingNotice']))
    if '国家税务总局' in unit and '全国税务工作会议' in name:
        return '二类'
    if ('国家税务总局' in unit and ('各省' in attendee_scope or '计划单列市' in attendee_scope)) or ('省税务局' in unit and ('年度工作会议' in name or '省税务工作会议' in name)):
        return '三类'
    if name or unit or attendee_scope:
        return '四类'
    return ''


def attendee_count(data):
    s = summary(data)
    if to_int(s.get('pageFields', {}).get('attendeeCount'), 0):
        return to_int(s.get('pageFields', {}).get('attendeeCount'), 0)
    if to_int(s.get('attendeeCount'), 0):
        return to_int(s.get('attendeeCount'), 0)
    for item in ocr_items(data):
        if doc_type(item) == 'attendanceList':
            names = item.get('names') or item.get('attendees') or []
            if isinstance(names, list) and names:
                return len(names)
            count = to_int(item.get('count'), 0)
            if count:
                return count
    return 0


def meeting_days(data):
    s = summary(data)
    page_days = to_number((s.get('pageFields') or {}).get('meetingDays'), 0)
    if page_days:
        return page_days
    explicit = to_number(s.get('meetingDays'), 0)
    if explicit:
        return explicit
    return date_diff_days(s.get('startDate'), s.get('endDate'))


def invoice_amount(data):
    s = summary(data)
    value = to_number(s.get('invoiceAmount'), 0)
    if value:
        return value
    total = 0
    seen = set()
    for idx, item in enumerate(ocr_items(data)):
        if doc_type(item) != 'normalInvoice':
            continue
        key = to_text(item.get('invoiceNumber') or item.get('invoiceNo')) or f'idx:{idx}'
        if key in seen:
            continue
        seen.add(key)
        total += to_number(item.get('totalAmount') or item.get('invoiceAmount') or item.get('amount'), 0)
    return total
