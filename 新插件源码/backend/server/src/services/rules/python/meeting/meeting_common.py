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


def parse_amount(value):
    if value in (None, ''):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = to_text(value).replace(',', '').replace('，', '').replace('￥', '').replace('¥', '')
    text = text.replace('人民币', '').replace('元', '').replace('圆', '')
    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except Exception:
        return None


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


def parse_date_range_text(value, year_hint=None):
    text = to_text(value)
    if not text:
        return (None, None)
    explicit = re.findall(r'(\d{4})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})日?', text)
    if len(explicit) > 1:
        start = datetime.date(int(explicit[0][0]), int(explicit[0][1]), int(explicit[0][2]))
        last = explicit[-1]
        return (start, datetime.date(int(last[0]), int(last[1]), int(last[2])))
    match = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日?\s*(?:至|到|-|—|~)\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日?', text)
    if match:
        year = int(match.group(1))
        start = datetime.date(year, int(match.group(2)), int(match.group(3)))
        end_year = int(match.group(4) or year)
        end_month = int(match.group(5) or match.group(2))
        end = datetime.date(end_year, end_month, int(match.group(6)))
        return (start, end)
    match = re.search(r'(\d{1,2})月(\d{1,2})日?\s*(?:至|到|-|—|~)\s*(\d{1,2})月(\d{1,2})日?', text)
    if match and year_hint:
        start = datetime.date(int(year_hint), int(match.group(1)), int(match.group(2)))
        end = datetime.date(int(year_hint), int(match.group(3)), int(match.group(4)))
        return (start, end)
    single = parse_date(text)
    return (single, single)


def date_range(start, end):
    if start and not end and re.search(r'(至|到|-|—|~)', to_text(start)):
        start_date, end_date = parse_date_range_text(start)
    else:
        start_date = parse_date(start)
        end_date = parse_date(end) or start_date
    if not start_date and start:
        start_date, end_date = parse_date_range_text(start)
    if start_date and not end_date:
        end_date = start_date
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


def get_summary(context):
    return summary(context)


def get_page_fields(context):
    s = summary(context)
    page = s.get('pageFields') or {}
    return page if isinstance(page, dict) else {}


def get_page_expense(context):
    page = get_page_fields(context)
    return {
        'mealAmount': page.get('mealAmount'),
        'accommodationAmount': page.get('accommodationAmount'),
        'venueRentAmount': page.get('venueRentAmount'),
        'applyAmount': page.get('applyAmount'),
        'totalAmount': page.get('totalAmount'),
    }


def ocr_items(context):
    items = context.get('ocrItems') or (context.get('prefillData') or {}).get('ocrItems') or []
    return items if isinstance(items, list) else []


def collect_ocr_items(context):
    return ocr_items(context)


def records(context):
    rows = context.get('records') or (context.get('prefillData') or {}).get('records') or []
    return rows if isinstance(rows, list) else []


def evidence_map(context):
    value = context.get('evidence') or (context.get('prefillData') or {}).get('evidence') or {}
    return value if isinstance(value, dict) else {}


def payments(context):
    rows = context.get('payments') or context.get('paymentInfoList') or summary(context).get('payments') or []
    if not rows:
        rows = [item for item in ocr_items(context) if doc_type(item) == 'paymentProof']
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


def get_bool_doc_flag(context, doc_type_name):
    return has_doc_type(context, doc_type_name)


def items_by_type(context, *types):
    wanted = set(types)
    return [item for item in ocr_items(context) if doc_type(item) in wanted]


def get_first_value(context, candidate_paths):
    roots = {
        'summary': summary(context),
        'pageFields': get_page_fields(context),
        'context': context,
    }
    for path in candidate_paths or []:
        path = to_text(path)
        if not path:
            continue
        parts = path.split('.')
        root = roots.get(parts[0])
        if root is not None:
            value = get_nested(root, '.'.join(parts[1:]), None) if len(parts) > 1 else root
        else:
            value = get_nested(context, path, None)
        if value not in (None, ''):
            return {'value': value, 'source': path}
    return {'value': '', 'source': ''}


def get_amount_with_source(context, candidate_paths):
    found = get_first_value(context, candidate_paths)
    amount = parse_amount(found.get('value'))
    if amount is None:
        return {'value': 0, 'hasValue': False, 'source': found.get('source'), 'raw': found.get('value')}
    return {'value': amount, 'hasValue': True, 'source': found.get('source'), 'raw': found.get('value')}


def get_text_with_source(context, candidate_paths):
    found = get_first_value(context, candidate_paths)
    return {'value': to_text(found.get('value')), 'source': found.get('source'), 'raw': found.get('value')}


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


def text_sources(data, doc_types=None):
    wanted = set(doc_types or [])
    sources = []
    for idx, item in enumerate(ocr_items(data)):
        dtype = doc_type(item)
        if wanted and dtype not in wanted:
            continue
        file_name = to_text(item.get('sourceFileName') or item.get('fileName'))
        chunks = [item.get('rawText'), item.get('meetingName'), item.get('location'), item.get('sellerName'), item.get('payeeName')]
        for key in ['itemsDetail', 'details', 'detailRows']:
            rows = item.get(key) or []
            if isinstance(rows, list):
                for row in rows:
                    chunks.append(' '.join(to_text(v) for v in (row or {}).values()))
        text = '\n'.join(to_text(part) for part in chunks if to_text(part))
        if text:
            sources.append({'index': idx, 'docType': dtype, 'fileName': file_name, 'text': text})
    return sources


def find_keywords(text, keywords):
    compact = normalize_text(text)
    return [kw for kw in keywords if normalize_text(kw) in compact]


def keyword_hits(data, keywords, doc_types=None, exclude_contexts=None):
    hits = []
    seen = set()
    excludes = [normalize_text(item) for item in (exclude_contexts or [])]
    for source in text_sources(data, doc_types):
        compact = normalize_text(source['text'])
        for kw in keywords:
            nkw = normalize_text(kw)
            if not nkw or nkw not in compact:
                continue
            raw_text = source['text']
            pos = normalize_text(raw_text).find(nkw)
            context = raw_text[:120] if pos < 0 else raw_text[max(0, pos - 30):pos + len(kw) + 30]
            if any(ex in normalize_text(context) for ex in excludes):
                continue
            key = (source['docType'], source['fileName'], kw, normalize_text(context))
            if key in seen:
                continue
            seen.add(key)
            hits.append({**source, 'keyword': kw, 'context': context})
    return hits


def get_amount(data, paths, default=0):
    return to_number(get_nested(data, paths, default), default)


def get_summary_amount(data, field, default=0):
    return to_number(summary(data).get(field), default)


def get_summary_amount_info(data, field):
    s = summary(data)
    if field in s:
        value = parse_amount(s.get(field))
        has_evidence = bool(evidence_map(data).get(field))
        has_value = value is not None and (abs(value) > EPSILON or has_evidence)
        return {'value': value if value is not None else 0, 'hasValue': has_value, 'source': f'summary.{field}', 'raw': s.get(field)}
    page = get_page_fields(data)
    if field in page:
        value = parse_amount(page.get(field))
        return {'value': value if value is not None else 0, 'hasValue': value is not None, 'source': f'summary.pageFields.{field}', 'raw': page.get(field)}
    return {'value': 0, 'hasValue': False, 'source': '', 'raw': ''}


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
    info = meeting_category_info(data)
    return info.get('category', '')


def recognized_meeting_category(data):
    info = meeting_category_info(data)
    if info.get('confidence') in ('explicit', 'high'):
        return info.get('category', '')
    return ''


def category_evidence(data):
    return meeting_category_info(data).get('evidence', {})


def category_confidence(data):
    return meeting_category_info(data).get('confidence', '')


def meeting_category_info(data):
    s = summary(data)
    explicit = to_text(s.get('meetingCategory') or s.get('category'))
    if explicit:
        if '二类' in explicit:
            return {'category': '二类', 'confidence': 'explicit', 'evidence': build_evidence(source='summary.meetingCategory', text=explicit)}
        if '三类' in explicit:
            return {'category': '三类', 'confidence': 'explicit', 'evidence': build_evidence(source='summary.meetingCategory', text=explicit)}
        if '四类' in explicit:
            return {'category': '四类', 'confidence': 'explicit', 'evidence': build_evidence(source='summary.meetingCategory', text=explicit)}
        return {'category': '', 'confidence': 'none', 'evidence': build_evidence(source='summary.meetingCategory', text=explicit)}
    page = get_page_fields(data)
    unit = normalize_text(page.get('reimbursementUnitName') or get_nested(data, ['unitName', 'departmentName'], ''))
    name = normalize_text(s.get('meetingName') or page.get('meetingName') or all_text(data, ['meetingNotice', 'meetingPlan']))
    attendee_scope = normalize_text(all_text(data, ['meetingNotice']))
    evidence = build_evidence(unit=unit, meetingName=name, attendeeScope=attendee_scope[:120])
    if '国家税务总局' in unit and '全国税务工作会议' in name:
        return {'category': '二类', 'confidence': 'high', 'evidence': evidence}
    if ('国家税务总局' in unit and ('各省' in attendee_scope or '计划单列市' in attendee_scope)) or ('省税务局' in unit and ('年度工作会议' in name or '省税务工作会议' in name)):
        return {'category': '三类', 'confidence': 'high', 'evidence': evidence}
    if name or unit or attendee_scope:
        return {'category': '四类', 'confidence': 'low', 'evidence': evidence}
    return {'category': '', 'confidence': 'none', 'evidence': evidence}


def attendee_count(data):
    info = attendee_count_info(data)
    return info.get('count', 0)


def attendee_count_info(data):
    s = summary(data)
    for item in ocr_items(data):
        if doc_type(item) == 'attendanceList':
            names = item.get('names') or item.get('attendees') or []
            if isinstance(names, list) and names:
                normalized = set()
                for row in names:
                    name = row.get('name') if isinstance(row, dict) else row
                    name = normalize_text(name)
                    if name:
                        normalized.add(name)
                if normalized:
                    return {'count': len(normalized), 'source': 'ocr.attendanceList.names', 'evidence': build_evidence(count=len(normalized), source='attendanceList')}
            count = to_int(item.get('count'), 0)
            if count:
                return {'count': count, 'source': 'ocr.attendanceList.count', 'evidence': build_evidence(count=count, source='attendanceList')}
    page_count = to_int(get_page_fields(data).get('attendeeCount'), 0)
    if page_count:
        return {'count': page_count, 'source': 'summary.pageFields.attendeeCount', 'evidence': build_evidence(count=page_count)}
    if to_int(s.get('attendeeCount'), 0):
        return {'count': to_int(s.get('attendeeCount'), 0), 'source': 'summary.attendeeCount', 'evidence': build_evidence(count=to_int(s.get('attendeeCount'), 0))}
    return {'count': 0, 'source': '', 'evidence': {}}


def meeting_days(data):
    info = meeting_days_info(data)
    return info.get('days', 0)


def meeting_days_info(data):
    s = summary(data)
    page_days = to_number(get_page_fields(data).get('meetingDays'), 0)
    if page_days:
        return {'days': page_days, 'source': 'summary.pageFields.meetingDays', 'evidence': build_evidence(days=page_days)}
    explicit = to_number(s.get('meetingDays'), 0)
    if explicit:
        calculated = date_diff_days(s.get('startDate'), s.get('endDate'))
        evidence = build_evidence(days=explicit, calculatedDays=calculated, startDate=s.get('startDate'), endDate=s.get('endDate'))
        return {'days': explicit, 'source': 'summary.meetingDays', 'evidence': evidence}
    days = date_diff_days(s.get('startDate') or s.get('meetingDate'), s.get('endDate'))
    if days:
        return {'days': days, 'source': 'summary.startDate/endDate', 'evidence': build_evidence(days=days, startDate=s.get('startDate'), endDate=s.get('endDate'), meetingDate=s.get('meetingDate'))}
    start, end = parse_date_range_text(s.get('meetingDate'))
    days = len(date_range(start.isoformat(), end.isoformat())) if start and end else 0
    return {'days': days, 'source': 'summary.meetingDate' if days else '', 'evidence': build_evidence(days=days, meetingDate=s.get('meetingDate'))}


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
