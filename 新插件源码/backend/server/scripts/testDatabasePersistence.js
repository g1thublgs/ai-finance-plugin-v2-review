const assert = require('assert');

const sqliteService = require('../src/services/database/sqliteService');
const dataStore = require('../src/services/database/pluginDataStore');

async function cleanupTestData() {
    await sqliteService.exec("DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE case_id LIKE 'case_test_%')");
    await sqliteService.exec("DELETE FROM ocr_pages WHERE ocr_task_id IN (SELECT task_id FROM ocr_tasks WHERE case_id LIKE 'case_test_%')");
    const caseTables = [
        'model_call_logs',
        'runtime_logs',
        'audit_issues',
        'audit_rule_results',
        'audit_runs',
        'travel_records',
        'prefill_record_sources',
        'prefill_records',
        'prefill_sessions',
        'invoices',
        'ocr_items',
        'ocr_tasks',
        'attachments',
        'api_responses',
        'api_requests',
    ];
    for (const table of caseTables) {
        await sqliteService.exec(`DELETE FROM ${table} WHERE case_id LIKE 'case_test_%'`).catch(() => {});
    }
    await sqliteService.exec("DELETE FROM plugin_cases WHERE id LIKE 'case_test_%'");
}

(async () => {
    await dataStore.initDatabase();
    await cleanupTestData();
    const caseId = dataStore.newId('case_test');
    const taskId = dataStore.newId('task_test');
    const attachmentId = dataStore.newId('att_test');
    await dataStore.ensureCase({
        caseId,
        scenarioType: 'travel',
        dataSource: 'test',
        operationType: 'preaudit',
        status: 'recognizing',
        applicantName: '张三',
        departmentName: '塘厦分局',
        unitName: '测试单位',
    });

    await dataStore.insertRuntimeLog({
        caseId,
        level: 'info',
        type: 'system',
        eventName: 'database-test-started',
        message: '数据库持久化测试',
        data: { caseId },
    });

    await dataStore.createOcrTaskRecord({
        caseId,
        attachmentId,
        taskId,
        scenarioType: 'travel',
        provider: 'mock',
        modelName: 'qwen35-35b-a3b',
        promptKey: 'travel',
    });

    await dataStore.saveOcrResult({
        caseId,
        attachmentId,
        taskId,
        result: {
            status: 'success',
            fileName: '测试发票.pdf',
            fileType: 'pdf',
            pageCount: 1,
            data: [
                {
                    recognizeType: 'normalInvoice',
                    sourceFileName: '测试发票.pdf',
                    invoiceNumber: '12345678901234567890',
                    issueDate: '2026-01-02',
                    buyerName: '测试单位',
                    sellerName: '测试酒店',
                    taxIncludedAmount: 500,
                    totalAmount: 500,
                    itemsDetail: [
                        { itemName: '住宿服务', quantity: 1, unitPrice: 500, taxIncludedAmount: 500 },
                    ],
                },
            ],
            debug: { elapsedMs: 12, pageCount: 1 },
        },
    });

    await dataStore.savePrefillResult({
        caseId,
        scenarioType: 'travel',
        sourceType: 'test',
        prefillData: {
            scenarioType: 'travel',
            records: [
                {
                    recordKey: '张三|2026-01-01|2026-01-02|东莞|广州',
                    name: '张三',
                    startTime: '2026-01-01',
                    endTime: '2026-01-02',
                    from: '东莞',
                    to: '广州',
                    transportTool: '火车',
                    trafficAmount: 100,
                    hotelAmount: 500,
                    mealDays: 2,
                    mealStandard: 100,
                    mealAmount: 200,
                    localTrafficDays: 2,
                    localTrafficStandard: 80,
                    localTrafficAmount: 160,
                    totalAmount: 960,
                    sourceItems: [{ recognizeType: 'normalInvoice', sourceFileName: '测试发票.pdf', amount: 500 }],
                },
            ],
            summary: { recordCount: 1, totalAll: 960 },
        },
    });

    await dataStore.saveAuditResult({
        caseId,
        scenarioType: 'travel',
        auditType: 'preaudit',
        report: {
            engine: 'test-rule-engine',
            summary: '测试审核完成',
            issues: [
                {
                    ruleId: 'TEST-01',
                    ruleName: '测试规则',
                    category: '测试问题',
                    description: '测试问题描述',
                    suggestion: '测试建议',
                    severity: 'warning',
                    evidence: { person: '张三' },
                },
            ],
            ruleResults: [
                {
                    ruleId: 'TEST-01',
                    ruleName: '测试规则',
                    auditType: '测试审核',
                    promptLevel: '提示（标黄）',
                    status: 'warning',
                    passed: false,
                    issues: [{ category: '测试问题' }],
                },
            ],
        },
        context: { caseId, travelData: { personal: [] } },
    });

    await dataStore.insertModelCallLog({
        caseId,
        modelType: 'text',
        modelName: 'qwen3-32b',
        apiUrl: 'mock',
        promptText: '测试提示词',
        request: { model: 'qwen3-32b' },
        responseText: '{"data":[]}',
        success: true,
        elapsedMs: 1,
    });

    const tables = [
        'plugin_cases',
        'ocr_tasks',
        'ocr_items',
        'invoices',
        'invoice_items',
        'prefill_sessions',
        'prefill_records',
        'prefill_record_sources',
        'audit_runs',
        'audit_rule_results',
        'audit_issues',
        'runtime_logs',
        'model_call_logs',
    ];
    for (const table of tables) {
        const rows = await sqliteService.query(`SELECT COUNT(*) AS count FROM ${table} WHERE case_id = ?`, [caseId])
            .catch(async () => sqliteService.query(`SELECT COUNT(*) AS count FROM ${table}`));
        assert.ok(Number(rows[0].count) >= 1, `${table} 没有写入测试数据`);
    }

    await cleanupTestData();
    console.log('数据库持久化链路测试通过');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
