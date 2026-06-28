PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plugin_cases (
    id TEXT PRIMARY KEY,
    case_no TEXT UNIQUE,
    scenario_type TEXT,
    data_source TEXT,
    operation_type TEXT,
    status TEXT,
    applicant_name TEXT,
    department_name TEXT,
    unit_name TEXT,
    current_page_url TEXT,
    summary_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS api_requests (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    endpoint TEXT,
    method TEXT,
    request_type TEXT,
    scenario_type TEXT,
    request_headers_json TEXT,
    request_body_json TEXT,
    request_files_json TEXT,
    client_ip TEXT,
    received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_responses (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    case_id TEXT,
    status_code INTEGER,
    success INTEGER,
    response_body_json TEXT,
    error_message TEXT,
    elapsed_ms INTEGER,
    responded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    file_id TEXT,
    original_file_name TEXT,
    display_file_name TEXT,
    file_ext TEXT,
    mime_type TEXT,
    file_size INTEGER,
    file_hash TEXT,
    attachment_type TEXT,
    invoice_number TEXT,
    status TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(case_id, file_id)
);

CREATE TABLE IF NOT EXISTS ocr_tasks (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    attachment_id TEXT,
    task_id TEXT UNIQUE,
    scenario_type TEXT,
    provider TEXT,
    model_name TEXT,
    prompt_key TEXT,
    status TEXT,
    page_count INTEGER,
    recognized_count INTEGER,
    started_at TEXT,
    finished_at TEXT,
    elapsed_ms INTEGER,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS ocr_pages (
    id TEXT PRIMARY KEY,
    ocr_task_id TEXT,
    attachment_id TEXT,
    page_no INTEGER,
    render_status TEXT,
    ocr_status TEXT,
    model_name TEXT,
    elapsed_ms INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(ocr_task_id, page_no)
);

CREATE TABLE IF NOT EXISTS ocr_items (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    attachment_id TEXT,
    ocr_task_id TEXT,
    page_no INTEGER,
    recognize_type TEXT,
    person_name TEXT,
    invoice_number TEXT,
    amount NUMERIC,
    tax_included_amount NUMERIC,
    issue_date TEXT,
    start_date TEXT,
    end_date TEXT,
    from_place TEXT,
    to_place TEXT,
    source_file_name TEXT,
    raw_text TEXT,
    structured_json TEXT,
    normalized_json TEXT,
    valid_flag INTEGER DEFAULT 1,
    invalid_reason TEXT,
    dedupe_key TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    attachment_id TEXT,
    ocr_item_id TEXT,
    invoice_type TEXT,
    invoice_code TEXT,
    invoice_number TEXT,
    issue_date TEXT,
    buyer_name TEXT,
    buyer_tax_no TEXT,
    seller_name TEXT,
    seller_tax_no TEXT,
    amount_without_tax NUMERIC,
    tax_amount NUMERIC,
    tax_included_amount NUMERIC,
    invoice_status TEXT,
    dedupe_key TEXT,
    duplicate_of_id TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT,
    item_name TEXT,
    specification TEXT,
    unit TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    amount_without_tax NUMERIC,
    tax_rate TEXT,
    tax_amount NUMERIC,
    tax_included_amount NUMERIC,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prefill_sessions (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    scenario_type TEXT,
    source_type TEXT,
    status TEXT,
    record_count INTEGER,
    total_amount NUMERIC,
    summary_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prefill_records (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    session_id TEXT,
    scenario_type TEXT,
    record_key TEXT,
    person_name TEXT,
    start_time TEXT,
    end_time TEXT,
    from_place TEXT,
    to_place TEXT,
    route TEXT,
    economic_subject TEXT,
    purpose TEXT,
    invoice_count INTEGER,
    traffic_amount NUMERIC,
    hotel_amount NUMERIC,
    meal_amount NUMERIC,
    local_traffic_amount NUMERIC,
    other_amount NUMERIC,
    total_amount NUMERIC,
    record_json TEXT,
    source_summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS prefill_record_sources (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    prefill_record_id TEXT,
    ocr_item_id TEXT,
    attachment_id TEXT,
    source_type TEXT,
    match_type TEXT,
    match_score NUMERIC,
    match_basis_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS travel_records (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    prefill_record_id TEXT,
    person_name TEXT,
    start_date TEXT,
    end_date TEXT,
    start_period TEXT,
    end_period TEXT,
    from_place TEXT,
    to_place TEXT,
    transport_tool TEXT,
    trip_days NUMERIC,
    hotel_days NUMERIC,
    meal_days NUMERIC,
    local_traffic_days NUMERIC,
    traffic_amount NUMERIC,
    hotel_amount NUMERIC,
    meal_amount NUMERIC,
    local_traffic_amount NUMERIC,
    total_amount NUMERIC,
    source_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_runs (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    scenario_type TEXT,
    audit_type TEXT,
    engine TEXT,
    rule_version TEXT,
    status TEXT,
    issue_count INTEGER,
    summary TEXT,
    input_context_json TEXT,
    output_report_json TEXT,
    started_at TEXT,
    finished_at TEXT,
    elapsed_ms INTEGER,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS audit_rule_results (
    id TEXT PRIMARY KEY,
    audit_run_id TEXT,
    case_id TEXT,
    rule_code TEXT,
    rule_name TEXT,
    audit_category TEXT,
    prompt_level TEXT,
    status TEXT,
    passed INTEGER,
    issue_count INTEGER,
    result_json TEXT
);

CREATE TABLE IF NOT EXISTS audit_issues (
    id TEXT PRIMARY KEY,
    audit_run_id TEXT,
    rule_result_id TEXT,
    case_id TEXT,
    prefill_record_id TEXT,
    person_name TEXT,
    category TEXT,
    description TEXT,
    suggestion TEXT,
    severity TEXT,
    evidence_json TEXT,
    status TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_logs (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    request_id TEXT,
    log_level TEXT,
    log_type TEXT,
    event_name TEXT,
    message TEXT,
    data_json TEXT,
    error_stack TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_call_logs (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    ocr_task_id TEXT,
    model_type TEXT,
    model_name TEXT,
    api_url TEXT,
    prompt_key TEXT,
    prompt_text TEXT,
    request_json TEXT,
    response_text TEXT,
    parsed_json TEXT,
    success INTEGER,
    elapsed_ms INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_created ON plugin_cases(created_at);
CREATE INDEX IF NOT EXISTS idx_cases_scenario ON plugin_cases(scenario_type, operation_type, status);
CREATE INDEX IF NOT EXISTS idx_api_requests_case ON api_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_api_responses_request ON api_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_attachments_case ON attachments(case_id);
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(file_hash);
CREATE INDEX IF NOT EXISTS idx_ocr_tasks_case ON ocr_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_ocr_tasks_task_id ON ocr_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_ocr_items_case_type ON ocr_items(case_id, recognize_type);
CREATE INDEX IF NOT EXISTS idx_ocr_items_person ON ocr_items(person_name);
CREATE INDEX IF NOT EXISTS idx_ocr_items_invoice ON ocr_items(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_case ON invoices(case_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_dedupe ON invoices(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_prefill_records_case ON prefill_records(case_id);
CREATE INDEX IF NOT EXISTS idx_prefill_records_key ON prefill_records(record_key);
CREATE INDEX IF NOT EXISTS idx_audit_runs_case ON audit_runs(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_issues_case ON audit_issues(case_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_runtime_logs_case ON runtime_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_runtime_logs_type_time ON runtime_logs(log_type, created_at);
CREATE INDEX IF NOT EXISTS idx_model_logs_case ON model_call_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_model_logs_model_time ON model_call_logs(model_name, created_at);
