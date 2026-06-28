const fs = require('fs');
const path = require('path');

const prefillService = require('../src/services/prefill/prefillService');
const auditService = require('../src/services/audit/auditService');
const { normalizeOcrItems } = require('../src/services/ocr/resultNormalizer');

const REPORT_PATH = path.join(__dirname, '..', 'logs', 'local-regression-report.json');
const TRAVEL_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'travel_ocr_manual_cases.json');

function findWorkspaceRoot(startDir) {
    let cursor = startDir;
    for (let i = 0; i < 10; i += 1) {
        if (fs.existsSync(path.join(cursor, '资料', '测试数据'))) return cursor;
        const next = path.dirname(cursor);
        if (next === cursor) break;
        cursor = next;
    }
    return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

const WORKSPACE_ROOT = findWorkspaceRoot(__dirname);
const TEST_DATA_ROOT = path.join(WORKSPACE_ROOT, '资料', '测试数据');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkFiles(dir, output = []) {
    if (!fs.existsSync(dir)) return output;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '_pdftotext') continue;
            walkFiles(fullPath, output);
        } else {
            output.push(fullPath);
        }
    }
    return output;
}

function leafCaseDirs(rootDir) {
    const dirs = [];
    function visit(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const childDirs = entries.filter(item => item.isDirectory() && item.name !== '_pdftotext');
        const files = entries.filter(item => item.isFile());
        if (files.length) dirs.push(dir);
        childDirs.forEach(item => visit(path.join(dir, item.name)));
    }
    visit(rootDir);
    return [...new Set(dirs)];
}

function relative(filePath) {
    return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function numberValue(value) {
    const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    const num = match ? Number(match[0]) : 0;
    return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function parseAmounts(text = '') {
    return [...String(text).matchAll(/([0-9][0-9,]*(?:\.\d{1,2})?)\s*元/g)]
        .map(match => numberValue(match[1]))
        .filter(value => value > 0);
}

function inferOtherCategory(text = '') {
    if (/电费|售电|电网|供电/.test(text)) return { name: '*售电*电费', expectedBudget: '电费' };
    if (/食材|食堂|饭堂|膳食|餐饮|配送/.test(text)) return { name: '*餐饮服务*食材配送费', expectedBudget: '食堂' };
    if (/设备维修|维修|检修/.test(text)) return { name: '*维修服务*设备维修费', expectedBudget: '设备维修' };
    if (/厨房|厨具|餐具/.test(text)) return { name: '厨房用品', expectedBudget: '食堂' };
    if (/办公用品|文具|耗材/.test(text)) return { name: '办公用品', expectedBudget: '办公用品' };
    return { name: '报销项目', expectedBudget: '' };
}

function inferSeller(text = '') {
    const transfer = text.match(/转(.+?)(?:20\d{2}|[0-9]+(?:\.\d+)?元|$)/);
    if (transfer?.[1]) return transfer[1].replace(/[\\/_-]+$/g, '').trim();
    if (/广东电网/.test(text)) return '广东电网有限责任公司东莞供电局';
    if (/绿芳园/.test(text)) return '广东绿芳园农业集团有限公司';
    if (/食唯鲜/.test(text)) return '广东食唯鲜膳食管理服务有限公司';
    return '测试供应商';
}

function buildOtherSyntheticCases() {
    const root = path.join(TEST_DATA_ROOT, '其他事项');
    return leafCaseDirs(root).map((dir, index) => {
        const files = fs.readdirSync(dir, { withFileTypes: true }).filter(item => item.isFile()).map(item => path.join(dir, item.name));
        const title = path.basename(dir);
        const text = `${relative(dir)} ${files.map(file => path.basename(file)).join(' ')}`;
        const seller = inferSeller(text);
        let amounts = parseAmounts(text);
        if (!amounts.length && /^\d+(?:\.\d+)?$/.test(title)) amounts = [Number(title)];
        if (!amounts.length) amounts = [0];
        const fileAmountRows = files
            .map(file => ({ file, amounts: parseAmounts(path.basename(file)) }))
            .filter(row => row.amounts.length);
        const rows = fileAmountRows.length
            ? fileAmountRows.flatMap(row => row.amounts.map(amount => ({ file: row.file, amount })))
            : [{ file: files[0] || path.join(dir, `${title}.pdf`), amount: amounts[amounts.length - 1] }];
        const rowCategories = rows.map(row => inferOtherCategory(path.basename(row.file)));
        const expectedBudgetSet = new Set(rowCategories.map(item => item.expectedBudget).filter(Boolean));
        const expectedAmount = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
        return {
            id: `other-folder-${index + 1}`,
            caseName: relative(dir),
            scenarioType: 'other',
            expectedAmount,
            expectedBudget: expectedBudgetSet.size === 1 ? [...expectedBudgetSet][0] : '',
            ocrItems: rows.map((row, rowIndex) => {
                const category = rowCategories[rowIndex] || inferOtherCategory(text);
                return ({
                recognizeType: 'normalInvoice',
                invoiceNumber: `TEST${index + 1}${rowIndex + 1}`,
                issueDate: '2026-01-31',
                payerName: '国家税务总局东莞市税务局塘厦税务分局',
                sellerName: seller,
                totalAmount: String(row.amount),
                taxAmount: '',
                comment: title,
                sourceFileName: path.basename(row.file),
                itemsDetail: [{
                    name: category.name,
                    specification: '',
                    unit: '',
                    quantity: '',
                    amount: String(row.amount),
                    taxAmount: '',
                }],
            });
            }),
        };
    });
}

function buildOtherRawTextCase() {
    const rawText = [
        '电子发票（普通发票）',
        '发票号码：26447000000364089671',
        '开票日期：2026年02月09日',
        '购买方 名称：国家税务总局东莞市税务局塘厦税务分局',
        '销售方 名称：广东电网有限责任公司东莞供电局',
        '*售电*电费（计费时段：20260101-20260131） 千瓦时 21980 金额 12763.99 税额 1659.32',
        '价税合计（小写） ¥15031.47',
        '本次实收：15031.47 元',
    ].join('\n');
    return {
        id: 'other-rawtext-electric-invoice',
        caseName: '其他事项/电费发票 other+rawText 纠偏',
        scenarioType: 'other',
        expectedAmount: 15031.47,
        expectedBudget: '电费',
        ocrItems: normalizeOcrItems([{ recognizeType: 'other', rawText, sourceFileName: '1111.pdf' }]),
    };
}

function buildTravelSyntheticCases() {
    return [
        {
            id: 'travel-multi-city-split',
            caseName: '差旅费/同一人多地按交通票分段并按住宿日期匹配',
            scenarioType: 'travel',
            context: { defaultStartPlace: '广东省东莞市塘厦' },
            expected: {
                recordCount: 4,
                hotelAmountTotal: 3200,
                transportAmountTotal: 2500,
                localTransportAmountTotal: 500,
                totalAll: 7000,
            },
            ocrItems: [
                { recognizeType: 'travelRequest', sourceFileName: '审批单.pdf', requesterName: '张三', startDate: '2026-01-01', endDate: '2026-01-08', arrivalAddress: '北京市、上海市、广州市', reason: '多地调研', travelDetail: [{ personName: '张三', startDate: '2026-01-01', endDate: '2026-01-08', destination: '北京市、上海市、广州市', reason: '多地调研' }] },
                { recognizeType: 'planeInvoice', sourceFileName: '机票1.pdf', passengerName: '张三', departure: '广州白云', arrival: '北京首都', departureTime: '2026-01-01 08:00', flightNumber: 'CZ1001', gpNumber: 'GP001', amount: '1000' },
                { recognizeType: 'trainInvoice', sourceFileName: '高铁1.pdf', passengerName: '张三', departureStation: '北京南站', arrivalStation: '上海虹桥站', departureTime: '2026-01-04 09:00', trainNumber: 'G1', totalAmount: '500' },
                { recognizeType: 'planeInvoice', sourceFileName: '机票2.pdf', passengerName: '张三', departure: '上海虹桥', arrival: '广州白云', departureTime: '2026-01-06 10:00', flightNumber: 'CZ1002', gpNumber: 'GP002', amount: '700' },
                { recognizeType: 'trainInvoice', sourceFileName: '高铁2.pdf', passengerName: '张三', departureStation: '广州南站', arrivalStation: '东莞站', departureTime: '2026-01-08 18:00', trainNumber: 'G2', totalAmount: '300' },
                { recognizeType: 'accommodationList', sourceFileName: '北京住宿清单.pdf', guestName: '张三', city: '北京市海淀区', hotelName: '北京酒店', leavingDate: '2026-01-04', totalAmount: '1500', accommodationDetail: [
                    { guestName: '张三', accommodationDate: '2026-01-01', city: '北京市海淀区', hotelName: '北京酒店', amount: '500' },
                    { guestName: '张三', accommodationDate: '2026-01-02', city: '北京市海淀区', hotelName: '北京酒店', amount: '500' },
                    { guestName: '张三', accommodationDate: '2026-01-03', city: '北京市海淀区', hotelName: '北京酒店', amount: '500' },
                ] },
                { recognizeType: 'accommodationList', sourceFileName: '上海住宿清单.pdf', guestName: '张三', city: '上海市闵行区', hotelName: '上海酒店', leavingDate: '2026-01-06', totalAmount: '900', accommodationDetail: [
                    { guestName: '张三', accommodationDate: '2026-01-04', city: '上海市闵行区', hotelName: '上海酒店', amount: '450' },
                    { guestName: '张三', accommodationDate: '2026-01-05', city: '上海市闵行区', hotelName: '上海酒店', amount: '450' },
                ] },
                { recognizeType: 'accommodationList', sourceFileName: '广州住宿清单.pdf', guestName: '张三', city: '广东省广州市天河区', hotelName: '广州酒店', leavingDate: '2026-01-08', totalAmount: '800', accommodationDetail: [
                    { guestName: '张三', accommodationDate: '2026-01-06', city: '广东省广州市天河区', hotelName: '广州酒店', amount: '400' },
                    { guestName: '张三', accommodationDate: '2026-01-07', city: '广东省广州市天河区', hotelName: '广州酒店', amount: '400' },
                ] },
            ],
        },
        {
            id: 'travel-half-day-dedupe',
            caseName: '差旅费/同人同日两段半天补助不重复',
            scenarioType: 'travel',
            context: { defaultStartPlace: '广东省东莞市塘厦' },
            expected: {
                recordCount: 2,
                hotelAmountTotal: 0,
                transportAmountTotal: 0,
                localTransportAmountTotal: 80,
                totalAll: 180,
            },
            ocrItems: [
                { recognizeType: 'travelRequest', sourceFileName: '上午审批.pdf', requesterName: '李四', startDate: '2026-03-03', endDate: '2026-03-03', startPeriod: '上午', endPeriod: '上午', arrivalAddress: '广东省东莞市中堂镇', reason: '上午检查' },
                { recognizeType: 'travelRequest', sourceFileName: '下午审批.pdf', requesterName: '李四', startDate: '2026-03-03', endDate: '2026-03-03', startPeriod: '下午', endPeriod: '下午', arrivalAddress: '广东省东莞市长安镇', reason: '下午检查' },
            ],
        },
    ];
}

function summarizeTestData() {
    const travelRoot = path.join(TEST_DATA_ROOT, '差旅费');
    const otherRoot = path.join(TEST_DATA_ROOT, '其他事项');
    const travelFiles = walkFiles(travelRoot);
    const otherFiles = walkFiles(otherRoot);
    return {
        testDataRoot: relative(TEST_DATA_ROOT),
        travel: {
            caseDirectoryCount: leafCaseDirs(travelRoot).length,
            fileCount: travelFiles.length,
            fileTypes: countBy(travelFiles.map(file => path.extname(file).toLowerCase() || '(none)')),
        },
        other: {
            caseDirectoryCount: leafCaseDirs(otherRoot).length,
            fileCount: otherFiles.length,
            fileTypes: countBy(otherFiles.map(file => path.extname(file).toLowerCase() || '(none)')),
        },
    };
}

function countBy(values = []) {
    return values.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

function matchedBudgetText(prefill = {}) {
    const record = (prefill.records || [])[0] || {};
    return [
        record.economicSubject,
        record.purpose,
        record.functionSubject,
        record.matchedBudgetIndicatorId,
    ].filter(Boolean).join('|');
}

function checkOtherCase(caseItem, prefill, auditResult) {
    const checks = [];
    const total = roundMoney(prefill.summary?.totalAll || 0);
    checks.push({ name: 'amountTotal', actual: total, expected: caseItem.expectedAmount, passed: Math.abs(total - caseItem.expectedAmount) < 0.01 });
    if (caseItem.expectedBudget) {
        const budgetText = matchedBudgetText(prefill);
        checks.push({ name: 'budgetMatched', actual: budgetText, expected: caseItem.expectedBudget, passed: budgetText.includes(caseItem.expectedBudget) });
    }
    checks.push({ name: 'auditIssues', actual: (auditResult.issues || []).length, expected: 0, passed: !(auditResult.issues || []).some(item => /金额/.test(item.category || item.description || '')) });
    return checks;
}

function checkTravelCase(caseItem, prefill, auditResult) {
    const expected = caseItem.expected || {};
    const checks = [];
    const push = (name, actual, expect) => {
        if (expect === undefined) return;
        checks.push({ name, actual, expected: expect, passed: Math.abs(numberValue(actual) - numberValue(expect)) < 0.01 });
    };
    push('recordCount', (prefill.records || []).length, expected.recordCount);
    push('hotelAmountTotal', prefill.summary?.hotelAmountTotal, expected.hotelAmountTotal);
    push('transportAmountTotal', prefill.summary?.transportAmountTotal, expected.transportAmountTotal);
    push('localTransportAmountTotal', prefill.summary?.localTransportAmountTotal, expected.localTransportAmountTotal);
    push('totalAll', prefill.summary?.totalAll, expected.totalAll);
    checks.push({ name: 'noEmptyPersonRecords', actual: (prefill.records || []).filter(row => !row.name).length, expected: 0, passed: !(prefill.records || []).some(row => !row.name) });
    checks.push({ name: 'auditEngineReturned', actual: auditResult.engine || '', expected: 'non-empty', passed: Boolean(auditResult.engine) });
    return checks;
}

async function runPrefillAndAudit(caseItem) {
    const prefill = await prefillService.buildPrefillData({
        scenarioType: caseItem.scenarioType,
        ocrItems: caseItem.ocrItems,
        context: caseItem.context || {},
    });
    const auditResult = await auditService.runPreAudit({
        scenarioType: caseItem.scenarioType,
        prefillData: prefill,
        ocrItems: caseItem.ocrItems,
        attachments: caseItem.ocrItems.map((item, index) => ({
            fileId: item.sourceFileName || `${caseItem.id}-${index + 1}`,
            fileName: item.sourceFileName || `${caseItem.id}-${index + 1}`,
            ocrModelsData: [{ modelName: 'local-regression-fixture', data: [item] }],
        })),
        context: {
            pageAmount: caseItem.expectedAmount || caseItem.context?.pageAmount || '',
            uploadResults: [],
        },
    });
    const checks = caseItem.scenarioType === 'other'
        ? checkOtherCase(caseItem, prefill, auditResult)
        : checkTravelCase(caseItem, prefill, auditResult);
    return {
        id: caseItem.id,
        caseName: caseItem.caseName,
        scenarioType: caseItem.scenarioType,
        recordCount: (prefill.records || []).length,
        summary: prefill.summary,
        records: prefill.records,
        auditSummary: auditResult.summary,
        issueCount: (auditResult.issues || []).length,
        issues: auditResult.issues || [],
        checks,
        passed: checks.every(item => item.passed),
    };
}

async function main() {
    const travelFixtures = readJson(TRAVEL_FIXTURE_PATH).map((item, index) => ({
        id: `travel-fixture-${index + 1}`,
        scenarioType: 'travel',
        ...item,
    }));
    const cases = [
        ...travelFixtures,
        ...buildTravelSyntheticCases(),
        buildOtherRawTextCase(),
        ...buildOtherSyntheticCases(),
    ];
    const results = [];
    for (const caseItem of cases) {
        results.push(await runPrefillAndAudit(caseItem));
    }
    const report = {
        generatedAt: new Date().toISOString(),
        workspaceRoot: WORKSPACE_ROOT,
        inventory: summarizeTestData(),
        totalRunnableCases: results.length,
        passed: results.filter(item => item.passed).length,
        failed: results.filter(item => !item.passed).length,
        results,
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({
        reportPath: REPORT_PATH,
        inventory: report.inventory,
        totalRunnableCases: report.totalRunnableCases,
        passed: report.passed,
        failed: report.failed,
        failures: results.filter(item => !item.passed).map(item => ({
            caseName: item.caseName,
            scenarioType: item.scenarioType,
            summary: item.summary,
            failedChecks: item.checks.filter(check => !check.passed),
        })),
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
