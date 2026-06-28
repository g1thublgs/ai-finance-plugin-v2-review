const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('../../config/appConfig');
const sqliteService = require('./sqliteService');

const JSON_TEXT_LIMIT = Number(process.env.DB_JSON_TEXT_LIMIT || 120000);
const FIELD_TEXT_LIMIT = Number(process.env.DB_FIELD_TEXT_LIMIT || 60000);

let initPromise = null;

function nowIso() {
    return new Date().toISOString();
}

function newId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function safeText(value) {
    return String(value ?? '').trim();
}

function truncate(value, maxLength = FIELD_TEXT_LIMIT) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...(已截断，原长度 ${text.length})`;
}

function sanitize(value, depth = 0) {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') return truncate(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth > 5) return truncate(value, 4000);
    if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1));
    if (typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, child]) => {
            if (/authorization|token|apiKey|password/i.test(key)) {
                output[key] = '[已脱敏]';
                return;
            }
            if (/base64|buffer|binary|bytes|fileContent|image_url|dataUrl|imageUrl|url/i.test(key)) {
                output[key] = '[已省略大字段]';
                return;
            }
            output[key] = sanitize(child, depth + 1);
        });
        return output;
    }
    return truncate(value);
}

function toJson(value, maxLength = JSON_TEXT_LIMIT) {
    if (value === undefined) return '';
    try {
        return truncate(JSON.stringify(sanitize(value)), maxLength);
    } catch (error) {
        return truncate(String(value ?? ''), maxLength);
    }
}

function firstValue(source = {}, keys = []) {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

function numberValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const matched = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return matched ? Number(matched[0]) : 0;
}

function caseNoFromId(caseId) {
    return `CASE-${String(caseId || '').replace(/^case_/, '').slice(0, 24) || Date.now()}`;
}

function resolveCaseId(payload = {}) {
    return safeText(payload.caseId || payload.case_id || payload.pluginCaseId || payload.batchId || payload.batch_id);
}

function resolveScenarioType(payload = {}) {
    return safeText(payload.scenarioType || payload.expenseType || payload.businessType || payload.businessCategory || 'smart');
}

function inferRequestType(endpoint = '') {
    if (endpoint === '/upload') return 'upload';
    if (/\/task\//.test(endpoint)) return 'task_poll';
    if (/preAudit|prefill/i.test(endpoint)) return 'prefill';
    if (/audit/i.test(endpoint)) return 'audit';
    if (/refine/i.test(endpoint)) return 'ai_refine';
    if (/sqlite/i.test(endpoint)) return 'sqlite';
    return 'api';
}

function insertOperation(tableName, row, prefix = 'INSERT INTO') {
    const entries = Object.entries(row).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => key);
    const placeholders = columns.map(() => '?');
    return {
        sql: `${prefix} ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
        params: entries.map(([, value]) => value),
    };
}

function updateOperation(tableName, row, whereSql, whereParams = []) {
    const entries = Object.entries(row).filter(([, value]) => value !== undefined);
    if (!entries.length) return null;
    return {
        sql: `UPDATE ${tableName} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} ${whereSql}`,
        params: [...entries.map(([, value]) => value), ...whereParams],
    };
}

async function initDatabase() {
    if (!initPromise) {
        initPromise = (async () => {
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await sqliteService.execScript(schema);
        })();
    }
    return initPromise;
}

async function batch(operations = []) {
    const filtered = operations.filter(Boolean);
    if (!filtered.length) return { success: true, changes: 0, results: [] };
    await initDatabase();
    return sqliteService.batch(filtered);
}

async function ensureCase(input = {}) {
    const caseId = resolveCaseId(input) || newId('case');
    const time = nowIso();
    await batch([
        insertOperation('plugin_cases', {
            id: caseId,
            case_no: input.caseNo || input.case_no || caseNoFromId(caseId),
            scenario_type: resolveScenarioType(input),
            data_source: safeText(input.dataSource || input.sourceType || input.source || ''),
            operation_type: safeText(input.operationType || input.operation_type || ''),
            status: safeText(input.status || 'received'),
            applicant_name: safeText(input.applicantName),
            department_name: safeText(input.departmentName),
            unit_name: safeText(input.unitName),
            current_page_url: safeText(input.currentPageUrl || input.pageUrl),
            summary_json: input.summary ? toJson(input.summary) : '',
            error_message: safeText(input.errorMessage),
            created_at: time,
            updated_at: time,
            finished_at: input.finishedAt || '',
        }, 'INSERT OR IGNORE INTO'),
        updateOperation('plugin_cases', {
            scenario_type: resolveScenarioType(input),
            data_source: safeText(input.dataSource || input.sourceType || input.source || undefined),
            operation_type: safeText(input.operationType || input.operation_type || undefined),
            status: safeText(input.status || undefined),
            applicant_name: safeText(input.applicantName || undefined),
            department_name: safeText(input.departmentName || undefined),
            unit_name: safeText(input.unitName || undefined),
            current_page_url: safeText(input.currentPageUrl || input.pageUrl || undefined),
            summary_json: input.summary ? toJson(input.summary) : undefined,
            error_message: safeText(input.errorMessage || undefined),
            updated_at: time,
            finished_at: input.finishedAt || undefined,
        }, 'WHERE id = ?', [caseId]),
    ]);
    return caseId;
}

async function updateCase(caseId, patch = {}) {
    if (!caseId) return null;
    await batch([
        updateOperation('plugin_cases', {
            scenario_type: patch.scenarioType,
            data_source: patch.dataSource,
            operation_type: patch.operationType,
            status: patch.status,
            applicant_name: patch.applicantName,
            department_name: patch.departmentName,
            unit_name: patch.unitName,
            current_page_url: patch.currentPageUrl,
            summary_json: patch.summary ? toJson(patch.summary) : undefined,
            error_message: patch.errorMessage,
            updated_at: nowIso(),
            finished_at: patch.finishedAt,
        }, 'WHERE id = ?', [caseId]),
    ]);
    return caseId;
}

async function insertApiRequest({ req, caseId = '', files = null, body = null } = {}) {
    const id = newId('req');
    const requestBody = body !== null ? body : req?.body;
    const endpoint = req?.originalUrl || req?.url || '';
    await batch([
        insertOperation('api_requests', {
            id,
            case_id: caseId || resolveCaseId(requestBody || req?.query || {}),
            endpoint,
            method: req?.method || '',
            request_type: inferRequestType(endpoint),
            scenario_type: resolveScenarioType(requestBody || req?.query || {}),
            request_headers_json: toJson(req?.headers || {}, 60000),
            request_body_json: toJson(requestBody || {}, JSON_TEXT_LIMIT),
            request_files_json: files ? toJson(files, 80000) : '',
            client_ip: safeText(req?.ip || req?.socket?.remoteAddress || ''),
            received_at: nowIso(),
        }),
    ]);
    return id;
}

async function updateApiRequest(id, patch = {}) {
    if (!id) return;
    await batch([
        updateOperation('api_requests', {
            case_id: patch.caseId,
            scenario_type: patch.scenarioType,
            request_body_json: patch.body !== undefined ? toJson(patch.body, JSON_TEXT_LIMIT) : undefined,
            request_files_json: patch.files !== undefined ? toJson(patch.files, 80000) : undefined,
        }, 'WHERE id = ?', [id]),
    ]);
}

async function insertApiResponse({ requestId, caseId = '', statusCode = 200, body = {}, elapsedMs = 0 } = {}) {
    if (!requestId) return null;
    const success = body?.success === false ? 0 : (statusCode >= 200 && statusCode < 400 ? 1 : 0);
    await batch([
        insertOperation('api_responses', {
            id: newId('res'),
            request_id: requestId,
            case_id: caseId || resolveCaseId(body || {}),
            status_code: statusCode,
            success,
            response_body_json: toJson(body, JSON_TEXT_LIMIT),
            error_message: safeText(body?.error || body?.message || ''),
            elapsed_ms: elapsedMs,
            responded_at: nowIso(),
        }),
    ]);
    return requestId;
}

function uploadFileSummary(file = {}) {
    return {
        originalname: file.originalname || '',
        mimetype: file.mimetype || '',
        size: file.size || file.buffer?.length || 0,
    };
}

async function createAttachmentForUpload({ caseId, file, body = {}, scenarioType = '' }) {
    const id = newId('att');
    const fileName = safeText(file?.originalname || body.fileName || body.name || '');
    const fileId = safeText(body.fileId || body.id || id);
    const buffer = file?.buffer || Buffer.alloc(0);
    const fileHash = buffer.length ? crypto.createHash('sha256').update(buffer).digest('hex') : '';
    await ensureCase({
        caseId,
        scenarioType,
        dataSource: body.dataSource || 'upload',
        operationType: 'ocr_only',
        status: 'recognizing',
        applicantName: body.applicantName,
        departmentName: body.departmentName,
        unitName: body.unitName,
        currentPageUrl: body.currentPageUrl,
    });
    await batch([
        insertOperation('attachments', {
            id,
            case_id: caseId,
            file_id: fileId,
            original_file_name: fileName,
            display_file_name: fileName,
            file_ext: path.extname(fileName).replace('.', '').toLowerCase(),
            mime_type: safeText(file?.mimetype),
            file_size: file?.size || buffer.length || 0,
            file_hash: fileHash,
            attachment_type: safeText(body.attachmentType || ''),
            invoice_number: '',
            status: 'uploaded',
            created_at: nowIso(),
        }, 'INSERT OR IGNORE INTO'),
    ]);
    return { attachmentId: id, fileHash, fileId, fileName };
}

async function createOcrTaskRecord({ caseId, attachmentId, taskId, scenarioType, provider, modelName, promptKey }) {
    await batch([
        insertOperation('ocr_tasks', {
            id: taskId,
            case_id: caseId,
            attachment_id: attachmentId,
            task_id: taskId,
            scenario_type: scenarioType,
            provider,
            model_name: modelName,
            prompt_key: promptKey || '',
            status: 'running',
            page_count: 0,
            recognized_count: 0,
            started_at: nowIso(),
        }, 'INSERT OR IGNORE INTO'),
    ]);
}

async function failOcrTask({ taskId, caseId, attachmentId, error }) {
    const time = nowIso();
    await batch([
        updateOperation('ocr_tasks', {
            status: 'failed',
            finished_at: time,
            error_message: safeText(error?.message || error),
        }, 'WHERE task_id = ?', [taskId]),
        updateOperation('attachments', {
            status: 'failed',
        }, 'WHERE id = ?', [attachmentId]),
        updateOperation('plugin_cases', {
            status: 'failed',
            error_message: safeText(error?.message || error),
            updated_at: time,
        }, 'WHERE id = ?', [caseId]),
    ]);
}

function itemType(item = {}) {
    return safeText(item.recognizeType || item.docType || item.type || 'other');
}

function itemPersonName(item = {}) {
    return safeText(firstValue(item, [
        'personName', 'passengerName', 'guestName', 'requesterName', 'travelerName', 'name',
        'payerName', 'buyerName', 'payeeName',
    ]));
}

function itemInvoiceNumber(item = {}) {
    return safeText(firstValue(item, ['invoiceNumber', 'invoiceNo', 'number', 'ticketNo', 'serialNumber']));
}

function itemInvoiceCode(item = {}) {
    return safeText(firstValue(item, ['invoiceCode', 'invoice_code', 'ticketCode', 'receiptCode', 'fpdm', '发票代码', '票据代码']));
}

function itemAmount(item = {}) {
    return numberValue(firstValue(item, [
        'taxIncludedAmount', 'totalAmount', 'amount', 'fareAmount', 'ticketPrice', 'priceTaxTotal',
        'priceTaxAmount', '合计金额', '价税合计', '金额',
    ]));
}

function itemIssueDate(item = {}) {
    return safeText(firstValue(item, ['issueDate', 'date', 'invoiceDate', 'rideDate']));
}

function itemStartDate(item = {}) {
    return safeText(firstValue(item, ['startDate', 'departureTime', 'departureDate', 'travelDate', 'rideDate']));
}

function itemEndDate(item = {}) {
    return safeText(firstValue(item, ['endDate', 'arrivalTime', 'arrivalDate', 'leavingDate', 'checkOutDate']));
}

function itemFromPlace(item = {}) {
    return safeText(firstValue(item, ['from', 'departureStation', 'departure', 'departurePlace', 'departureAirport', 'startPlace']));
}

function itemToPlace(item = {}) {
    return safeText(firstValue(item, ['to', 'arrivalStation', 'arrival', 'arrivalPlace', 'arrivalAirport', 'destination', 'arrivalAddress', 'city']));
}

function itemTaxAmount(item = {}) {
    return numberValue(firstValue(item, ['taxAmount', 'tax', '税额']));
}

function itemAmountWithoutTax(item = {}) {
    return numberValue(firstValue(item, ['amountWithoutTax', 'amountNoTax', 'netAmount', '金额']));
}

function itemBuyerName(item = {}) {
    return safeText(firstValue(item, ['buyerName', 'payerName', 'purchaserName', 'purchaseName']));
}

function itemSellerName(item = {}) {
    return safeText(firstValue(item, ['sellerName', 'vendorName', 'supplierName', 'payeeName']));
}

function itemPageNo(item = {}) {
    return Number(firstValue(item, ['pageNumber', 'pageNo', 'page', 'sourcePage']) || 0) || null;
}

function ocrDedupeKey(item = {}, attachmentId = '') {
    return [
        itemType(item),
        safeText(item.sourceFileName || item.fileName || ''),
        itemInvoiceCode(item),
        itemInvoiceNumber(item),
        itemPersonName(item),
        itemAmount(item),
        itemStartDate(item),
        itemEndDate(item),
        attachmentId,
    ].join('|');
}

function invoiceTypeFromItem(item = {}) {
    const type = itemType(item);
    if (type === 'guangzhouTaxiInvoice') return 'taxi';
    if (type === 'accommodationList') return 'hotel';
    if (/special|专票|增值税专用/.test(safeText(item.invoiceType || item.rawText))) return 'special';
    return 'normal';
}

function invoiceDedupeKey(item = {}, fallback = '') {
    const type = invoiceTypeFromItem(item);
    const invoiceCode = itemInvoiceCode(item);
    const invoiceNo = itemInvoiceNumber(item);
    if (type === 'taxi' && invoiceCode && invoiceNo) return `taxi:${invoiceCode}:${invoiceNo}`;
    if (invoiceCode && invoiceNo) return `invoice:${invoiceCode}:${invoiceNo}`;
    if (invoiceNo) return `invoice:${invoiceNo}`;
    return [
        'fallback',
        itemSellerName(item),
        itemIssueDate(item),
        itemAmount(item),
        fallback,
    ].join('|');
}

function invoiceDetailRows(item = {}) {
    const rows = item.itemsDetail || item.invoiceItems || item.items || item.details || item.detail || [];
    return Array.isArray(rows) ? rows : [];
}

function isInvoiceLike(item = {}) {
    const type = itemType(item);
    return ['normalInvoice', 'guangzhouTaxiInvoice', 'accommodationList'].includes(type)
        || itemInvoiceNumber(item)
        || itemBuyerName(item)
        || itemSellerName(item);
}

async function saveOcrResult({ caseId, attachmentId, taskId, result = {} }) {
    const time = nowIso();
    const data = Array.isArray(result.data) ? result.data : [];
    const pageCount = Number(result.pageCount || result.debug?.pageCount || result.debug?.renderedPageCount || 0) || 0;
    const operations = [
        updateOperation('ocr_tasks', {
            status: result.status || 'success',
            page_count: pageCount,
            recognized_count: data.length,
            finished_at: time,
            elapsed_ms: Number(result.debug?.elapsedMs || 0) || undefined,
        }, 'WHERE task_id = ?', [taskId]),
        updateOperation('attachments', {
            status: 'recognized',
            attachment_type: data[0] ? itemType(data[0]) : undefined,
            invoice_number: data.map(itemInvoiceNumber).filter(Boolean)[0] || undefined,
        }, 'WHERE id = ?', [attachmentId]),
    ];

    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
        operations.push(insertOperation('ocr_pages', {
            id: newId('page'),
            ocr_task_id: taskId,
            attachment_id: attachmentId,
            page_no: pageNo,
            render_status: 'success',
            ocr_status: 'success',
            model_name: result.modelName || '',
            elapsed_ms: 0,
            error_message: '',
            created_at: time,
        }, 'INSERT OR IGNORE INTO'));
    }

    data.forEach((item, index) => {
        const ocrItemId = newId('ocr');
        const type = itemType(item);
        const dedupeKey = ocrDedupeKey(item, attachmentId || index);
        operations.push(insertOperation('ocr_items', {
            id: ocrItemId,
            case_id: caseId,
            attachment_id: attachmentId,
            ocr_task_id: taskId,
            page_no: itemPageNo(item),
            recognize_type: type,
            person_name: itemPersonName(item),
            invoice_number: itemInvoiceNumber(item),
            amount: itemAmount(item),
            tax_included_amount: itemAmount(item),
            issue_date: itemIssueDate(item),
            start_date: itemStartDate(item),
            end_date: itemEndDate(item),
            from_place: itemFromPlace(item),
            to_place: itemToPlace(item),
            source_file_name: safeText(item.sourceFileName || item.fileName || result.fileName),
            raw_text: truncate(item.rawText || '', FIELD_TEXT_LIMIT),
            structured_json: toJson(item),
            normalized_json: toJson(item),
            valid_flag: 1,
            invalid_reason: '',
            dedupe_key: dedupeKey,
            created_at: time,
        }));

        if (isInvoiceLike(item)) {
            const invoiceId = newId('inv');
            const invoiceDedupe = invoiceDedupeKey(item, `${attachmentId}|${index}`);
            operations.push(insertOperation('invoices', {
                id: invoiceId,
                case_id: caseId,
                attachment_id: attachmentId,
                ocr_item_id: ocrItemId,
                invoice_type: invoiceTypeFromItem(item),
                invoice_code: safeText(firstValue(item, ['invoiceCode', 'invoice_code', 'fpdm'])),
                invoice_number: itemInvoiceNumber(item),
                issue_date: itemIssueDate(item),
                buyer_name: itemBuyerName(item),
                buyer_tax_no: safeText(firstValue(item, ['buyerTaxNo', 'buyerTaxNumber', 'purchaserTaxNo'])),
                seller_name: itemSellerName(item),
                seller_tax_no: safeText(firstValue(item, ['sellerTaxNo', 'sellerTaxNumber', 'vendorTaxNo'])),
                amount_without_tax: itemAmountWithoutTax(item),
                tax_amount: itemTaxAmount(item),
                tax_included_amount: itemAmount(item),
                invoice_status: safeText(firstValue(item, ['invoiceStatus', 'status', '发票状态'])) || 'normal',
                dedupe_key: invoiceDedupe,
                duplicate_of_id: '',
                raw_json: toJson(item),
                created_at: time,
            }));
            invoiceDetailRows(item).forEach(row => {
                operations.push(insertOperation('invoice_items', {
                    id: newId('item'),
                    invoice_id: invoiceId,
                    item_name: safeText(firstValue(row, ['itemName', 'projectName', 'goodsName', 'name'])),
                    specification: safeText(firstValue(row, ['specification', 'model'])),
                    unit: safeText(firstValue(row, ['unit'])),
                    quantity: numberValue(firstValue(row, ['quantity', 'count', 'qty'])),
                    unit_price: numberValue(firstValue(row, ['unitPrice', 'price'])),
                    amount_without_tax: numberValue(firstValue(row, ['amount', 'amountWithoutTax'])),
                    tax_rate: safeText(firstValue(row, ['taxRate'])),
                    tax_amount: numberValue(firstValue(row, ['taxAmount', 'tax'])),
                    tax_included_amount: numberValue(firstValue(row, ['taxIncludedAmount', 'totalAmount'])),
                    created_at: time,
                }));
            });
        }
    });

    await batch(operations);
    return { itemCount: data.length, pageCount };
}

function prefillTotal(records = [], summary = {}) {
    if (summary.totalAll !== undefined) return numberValue(summary.totalAll);
    if (summary.totalAmount !== undefined) return numberValue(summary.totalAmount);
    return records.reduce((sum, record) => sum + numberValue(record.totalAmount), 0);
}

function recordTotal(record = {}) {
    if (record.totalAmount !== undefined) return numberValue(record.totalAmount);
    return numberValue(record.trafficAmount || record.transportAmount)
        + numberValue(record.hotelAmount)
        + numberValue(record.mealAmount)
        + numberValue(record.localTrafficAmount || record.localTransportAmount)
        + numberValue(record.otherAmount);
}

async function savePrefillResult({ caseId, scenarioType, sourceType = '', prefillData = {} }) {
    if (!caseId || !prefillData) return null;
    const time = nowIso();
    const records = Array.isArray(prefillData.records) ? prefillData.records : [];
    const summary = prefillData.summary || {};
    const sessionId = newId('prefill');
    const operations = [
        insertOperation('prefill_sessions', {
            id: sessionId,
            case_id: caseId,
            scenario_type: scenarioType || prefillData.scenarioType || prefillData.expenseType || '',
            source_type: sourceType,
            status: 'generated',
            record_count: records.length,
            total_amount: prefillTotal(records, summary),
            summary_json: toJson(summary),
            created_at: time,
        }),
    ];
    records.forEach((record, index) => {
        const recordId = newId('prefrec');
        const recordKey = safeText(record.recordKey || `${scenarioType || 'record'}|${index}|${Date.now()}`);
        operations.push(insertOperation('prefill_records', {
            id: recordId,
            case_id: caseId,
            session_id: sessionId,
            scenario_type: scenarioType || record.scenarioType || prefillData.scenarioType || prefillData.expenseType || '',
            record_key: recordKey,
            person_name: safeText(record.name || record.personName || record.person || ''),
            start_time: safeText(record.startTime || record.startDate || ''),
            end_time: safeText(record.endTime || record.endDate || ''),
            from_place: safeText(record.from || record.startAddress || record.departurePlace || ''),
            to_place: safeText(record.to || record.endAddress || record.destination || ''),
            route: safeText(record.route || [record.from, record.to].filter(Boolean).join('-')),
            economic_subject: safeText(record.economicSubject || record.economic_subject || ''),
            purpose: safeText(record.purpose || ''),
            invoice_count: Number(record.invoiceCount || record.hotelInvoiceCount || 0) || 0,
            traffic_amount: numberValue(record.trafficAmount || record.transportAmount),
            hotel_amount: numberValue(record.hotelAmount),
            meal_amount: numberValue(record.mealAmount),
            local_traffic_amount: numberValue(record.localTrafficAmount || record.localTransportAmount),
            other_amount: numberValue(record.otherAmount),
            total_amount: recordTotal(record),
            record_json: toJson(record),
            source_summary: safeText(record.sourceSummary || ''),
            created_at: time,
            updated_at: time,
        }));
        (record.sourceItems || []).slice(0, 100).forEach(source => {
            operations.push(insertOperation('prefill_record_sources', {
                id: newId('src'),
                case_id: caseId,
                prefill_record_id: recordId,
                ocr_item_id: '',
                attachment_id: '',
                source_type: safeText(source.recognizeType || source.sourceType || ''),
                match_type: safeText(source.matchType || ''),
                match_score: numberValue(source.matchScore),
                match_basis_json: toJson(source),
                created_at: time,
            }));
        });
        if ((scenarioType || record.scenarioType || prefillData.scenarioType) === 'travel') {
            operations.push(insertOperation('travel_records', {
                id: newId('travel'),
                case_id: caseId,
                prefill_record_id: recordId,
                person_name: safeText(record.name || record.personName || ''),
                start_date: safeText(record.startTime || record.startDate || ''),
                end_date: safeText(record.endTime || record.endDate || ''),
                start_period: safeText(record.startPeriod || ''),
                end_period: safeText(record.endPeriod || ''),
                from_place: safeText(record.from || record.startAddress || ''),
                to_place: safeText(record.to || record.endAddress || record.destination || ''),
                transport_tool: safeText(record.transportTool || record.transportType || ''),
                trip_days: numberValue(record.tripDays),
                hotel_days: numberValue(record.hotelDays),
                meal_days: numberValue(record.mealDays),
                local_traffic_days: numberValue(record.localTrafficDays || record.localTransportDays),
                traffic_amount: numberValue(record.trafficAmount || record.transportAmount),
                hotel_amount: numberValue(record.hotelAmount),
                meal_amount: numberValue(record.mealAmount),
                local_traffic_amount: numberValue(record.localTrafficAmount || record.localTransportAmount),
                total_amount: recordTotal(record),
                source_json: toJson(record.sourceItems || []),
                created_at: time,
            }));
        }
    });
    await batch(operations);
    await updateCase(caseId, {
        scenarioType: scenarioType || prefillData.scenarioType || prefillData.expenseType,
        status: 'aggregated',
        summary,
    });
    return sessionId;
}

function issuePerson(issue = {}) {
    return safeText(issue.personName || issue.person || issue.evidence?.person || issue.evidence?.name || '');
}

async function saveAuditResult({ caseId, scenarioType, auditType = 'preaudit', report = {}, context = {}, startedAt = null }) {
    if (!caseId || !report) return null;
    const time = nowIso();
    const runId = newId('audit');
    const ruleResults = Array.isArray(report.ruleResults) ? report.ruleResults : [];
    const issues = Array.isArray(report.issues) ? report.issues : [];
    const operations = [
        insertOperation('audit_runs', {
            id: runId,
            case_id: caseId,
            scenario_type: scenarioType || report.scenarioType || '',
            audit_type: auditType,
            engine: safeText(report.engine || ''),
            rule_version: safeText(report.ruleVersion || ''),
            status: 'success',
            issue_count: issues.length,
            summary: safeText(report.summary || ''),
            input_context_json: toJson(context),
            output_report_json: toJson(report),
            started_at: startedAt || time,
            finished_at: time,
            elapsed_ms: startedAt ? Date.now() - new Date(startedAt).getTime() : 0,
            error_message: '',
        }),
    ];
    const issueRuleMap = new Map();
    ruleResults.forEach(rule => {
        const ruleResultId = newId('ruleres');
        const ruleIssues = Array.isArray(rule.issues) ? rule.issues : [];
        issueRuleMap.set(rule.ruleId || rule.ruleCode || rule.ruleName, ruleResultId);
        operations.push(insertOperation('audit_rule_results', {
            id: ruleResultId,
            audit_run_id: runId,
            case_id: caseId,
            rule_code: safeText(rule.ruleId || rule.ruleCode || ''),
            rule_name: safeText(rule.ruleName || rule.name || ''),
            audit_category: safeText(rule.auditType || rule.audit_category || ''),
            prompt_level: safeText(rule.promptLevel || ''),
            status: safeText(rule.status || (rule.passed ? 'pass' : 'warning')),
            passed: rule.passed === false ? 0 : 1,
            issue_count: ruleIssues.length,
            result_json: toJson(rule),
        }));
    });
    issues.forEach(issue => {
        const key = issue.ruleId || issue.ruleCode || issue.ruleName || issue.category;
        operations.push(insertOperation('audit_issues', {
            id: newId('issue'),
            audit_run_id: runId,
            rule_result_id: issueRuleMap.get(key) || '',
            case_id: caseId,
            prefill_record_id: '',
            person_name: issuePerson(issue),
            category: safeText(issue.category || issue.ruleName || ''),
            description: safeText(issue.description || issue.message || ''),
            suggestion: safeText(issue.suggestion || ''),
            severity: safeText(issue.severity || 'warning'),
            evidence_json: toJson(issue.evidence || {}),
            status: 'open',
            created_at: time,
        }));
    });
    await batch(operations);
    await updateCase(caseId, {
        scenarioType: scenarioType || report.scenarioType,
        status: 'audited',
        summary: { auditSummary: report.summary, issueCount: issues.length },
        finishedAt: time,
    });
    return runId;
}

async function insertRuntimeLog({ caseId = '', requestId = '', level = 'debug', type = 'system', eventName = '', message = '', data = {}, errorStack = '' } = {}) {
    await batch([
        insertOperation('runtime_logs', {
            id: newId('log'),
            case_id: caseId,
            request_id: requestId,
            log_level: level,
            log_type: type,
            event_name: eventName,
            message: safeText(message),
            data_json: toJson(data),
            error_stack: truncate(errorStack || '', FIELD_TEXT_LIMIT),
            created_at: nowIso(),
        }),
    ]);
}

async function insertModelCallLog({ caseId = '', ocrTaskId = '', modelType = '', modelName = '', apiUrl = '', promptKey = '', promptText = '', request = {}, responseText = '', parsed = null, success = true, elapsedMs = 0, errorMessage = '' } = {}) {
    await batch([
        insertOperation('model_call_logs', {
            id: newId('model'),
            case_id: caseId,
            ocr_task_id: ocrTaskId,
            model_type: modelType,
            model_name: modelName,
            api_url: apiUrl,
            prompt_key: promptKey,
            prompt_text: truncate(promptText, FIELD_TEXT_LIMIT),
            request_json: toJson(request, JSON_TEXT_LIMIT),
            response_text: truncate(responseText, FIELD_TEXT_LIMIT),
            parsed_json: parsed ? toJson(parsed, JSON_TEXT_LIMIT) : '',
            success: success ? 1 : 0,
            elapsed_ms: elapsedMs,
            error_message: safeText(errorMessage),
            created_at: nowIso(),
        }),
    ]);
}

module.exports = {
    createAttachmentForUpload,
    createOcrTaskRecord,
    ensureCase,
    failOcrTask,
    initDatabase,
    insertApiRequest,
    insertApiResponse,
    insertModelCallLog,
    insertRuntimeLog,
    newId,
    resolveCaseId,
    saveAuditResult,
    saveOcrResult,
    savePrefillResult,
    sanitize,
    toJson,
    updateApiRequest,
    updateCase,
    uploadFileSummary,
};
