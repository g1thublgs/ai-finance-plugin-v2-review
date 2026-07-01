// popup.js - 预填预审前端：批量上传、OCR轮询、规则预审、网页预填

const BACKEND_BASE_URL = 'http://150.88.16.204:3000';
const UPLOAD_URL = `${BACKEND_BASE_URL}/upload`;
const REFINE_PREFILL_URL = `${BACKEND_BASE_URL}/api/refinePrefillData`;
const CASE_SNAPSHOT_URL = `${BACKEND_BASE_URL}/api/plugin/caseSnapshot`;
const FILE_SERVER_URL = 'http://86.16.27.237:9010/cw/net/hitina/biz/nk/fjsc/FjscUnite.downloadFile.svc?fjLsh=';
const MAX_ATTACHMENT_COUNT = 100;
const MAX_CONCURRENT_UPLOADS = 100;
const PAGE_ATTACHMENT_CONCURRENCY = 8;
const AI_REFINE_OCR_ITEM_LIMIT = 180;
const AI_REFINE_OCR_TEXT_LIMIT = 800;
const AI_REFINE_OCR_ARRAY_LIMIT = 40;
const OTHER_EXPENSE_BUDGET_OPTIONS = `
710101022104 交通补贴|交通补贴|行政运行公用
710101022304 体检费|体检费|行政运行公用
7101010205 电费|电费|行政运行公用
710102021803 其他委托业务|其他委托业务|税费协同共治
710102022309 其他|应急药品|地方综合社会事务
71010202230902 其他支出|其他支出（法院诉讼受理费）|地方综合社会事务
71010202230904 党建和文化建设|党建和文化建设|地方综合社会事务
710102022307 广告宣传费|税务宣传费|优化营商环境
710101022302 活动费|党建活动|行政运行公用
710101022105 租用费|租车费（党建活动）|行政运行公用
710102020201 办公印刷|其他印刷|优化营商环境
710101022305 离退休人员公用支出|离退休公用经费（离世慰问）|行政运行公用
710101020103 其他办公|其他办公|行政运行公用
710101022001 燃料（充电）费|燃料（充电）费|行政运行公用
710101020801 办公物业|保洁服务|行政运行公用
710101021802 购买服务费用|餐厨保安等后勤服务|其他预算收入
710101022002 维修费|公车维修费|行政运行公用
710101022306 食堂费用|其他饭堂费用|行政运行公用
710101020601 邮寄费|邮寄费|行政运行公用
710101020101 日常办公用品|饮用水|行政运行公用
710101022305 离退休人员公用支出|离退休公用经费（住院慰问）|行政运行公用
710101022006 其他公车运维|其他公车运维|行政运行公用
710101022003 过桥过路费|过路过桥费|行政运行公用
7101010204 水费|水费|行政运行公用
71010102030401 其他手续费|手续费|其他预算收入
710101021101 公房维修|公房维修|行政运行公用
710101021102 设备维修|设备维修|行政运行公用
710101020101 日常办公用品|日常办公用品|行政运行公用
710101022004 保险费|公车保险费|行政运行公用
710101022305 离退休人员公用支出|离退休人员公用支出|行政运行公用
7101010222 税金及附加费用|税金及附加费用|行政运行公用
710101022306 食堂费用|饭堂补助|行政运行公用
71010102060202 有线电视费|有线电视费|行政运行公用
71010102060201 电话费|电话费|行政运行公用
710101020801 办公物业|办公物业|行政运行公用
710102020302 三代手续费|三代手续费|代扣代收代征税款手续费
`.trim().split('\n').map(line => {
    const [economicSubject, purpose, functionSubject = ''] = line.split('|');
    return { economicSubject, purpose, functionSubject };
});

let selectedFiles = [];
let uploadResults = [];
let preAuditData = null;
let isRunning = false;
let isRefining = false;
let dataSourceMode = 'upload';
let pageExtractData = null;
let activeWorkspaceView = 'summaryPanel';
let isDashboardVisible = false;
let selectedScenarioType = 'smart';
let activeOcrFileIndex = 0;
let currentCaseId = '';
let recordSortMode = 'default';

const $ = (selector) => document.querySelector(selector);

function debugLog(event, payload = {}) {
    try {
        console.log(`[一体化插件调试][${event}]`, JSON.parse(JSON.stringify(payload)));
    } catch (error) {
        console.log(`[一体化插件调试][${event}]`, payload);
    }
}

function createCaseId(prefix = 'case') {
    if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function revokeFilePreviewUrls(files = selectedFiles) {
    files.forEach(item => {
        if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
            item.previewUrl = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initWorkspaceNavigation();
    showUploadHome();
    document.querySelectorAll('input[name="sourceMode"]').forEach(input => {
        input.addEventListener('change', () => setSourceMode(input.value));
    });
    $('#fileInput').addEventListener('change', handleFileSelect);
    $('#scenarioSelect')?.addEventListener('change', handleScenarioChange);
    $('#recordSortSelect')?.addEventListener('change', handleRecordSortChange);
    $('#startBtn').addEventListener('click', startUploadAndAudit);
    $('#extractPageBtn').addEventListener('click', extractCurrentPageAndAudit);
    $('#clearBtn').addEventListener('click', resetAll);
    $('#fillBtn').addEventListener('click', fillCurrentPage);
    $('#aiRefineBtn').addEventListener('click', refinePrefillDataByAi);
    $('#aiAssistantToggle')?.addEventListener('click', () => $('#aiAssistantWidget')?.classList.toggle('open'));
    $('#aiAssistantClose')?.addEventListener('click', () => $('#aiAssistantWidget')?.classList.remove('open'));
    document.addEventListener('input', handleRecordEditorInput);
    document.addEventListener('change', handleRecordEditorInput);
    document.addEventListener('click', handleOcrFileClick);
    setSourceMode('upload');
    updateScenarioHint();
    renderAll();
});

window.addEventListener('beforeunload', () => revokeFilePreviewUrls());

function setSourceMode(mode = 'upload') {
    dataSourceMode = mode === 'page' ? 'page' : 'upload';
    document.querySelectorAll('input[name="sourceMode"]').forEach(input => {
        input.checked = input.value === dataSourceMode;
    });
    updateSourceModeUi();
    if (!preAuditData && !isRunning) {
        showStatus(dataSourceMode === 'page' ? '请打开需要审核的财务报销页面后点击提取。' : '请选择需要报销的单据文件。', 'info');
    }
    renderActions();
}

function handleScenarioChange(event) {
    selectedScenarioType = event.target?.value || 'smart';
    updateScenarioHint();
}

function handleRecordSortChange(event) {
    recordSortMode = event.target?.value || 'default';
    renderRecords();
}

function getSelectedScenarioType() {
    return $('#scenarioSelect')?.value || selectedScenarioType || 'smart';
}

function updateScenarioHint() {
    const select = $('#scenarioSelect');
    if (select && select.value !== selectedScenarioType) select.value = selectedScenarioType;
    const hint = $('#sourceModeHint');
    if (!hint || dataSourceMode === 'page') return;
    const labels = {
        smart: '默认智能匹配；也可手动选择场景。',
        travel: '差旅费：审批单、交通票、住宿清单、发票。',
        other: '其他事项：发票、购买方、用途、金额。',
        meeting: '会议费：会议材料和发票。',
        training: '培训费：培训材料和发票。',
        reception: '公务接待费：接待材料、菜单和发票。',
    };
    hint.textContent = labels[selectedScenarioType] || labels.smart;
}

function updateSourceModeUi() {
    const isPageMode = dataSourceMode === 'page';
    const fileInput = $('#fileInput');
    const startBtn = $('#startBtn');
    const extractPageBtn = $('#extractPageBtn');
    const hint = $('#sourceModeHint');
    const actionHint = $('#homeActionHint');
    const badge = $('#sourceModeBadge');
    if (fileInput) fileInput.classList.toggle('is-hidden', isPageMode);
    if (startBtn) {
        startBtn.classList.toggle('is-hidden', isPageMode);
        startBtn.textContent = '上传识别';
    }
    if (extractPageBtn) extractPageBtn.classList.toggle('is-hidden', !isPageMode);
    if (hint) {
        hint.textContent = isPageMode
            ? '从当前财务页面提取已填数据。'
            : '默认智能匹配；也可手动选择场景。';
    }
    if (actionHint) {
        actionHint.textContent = isPageMode
            ? '请先打开需要审核的财务报销页面。'
            : '支持 PDF、OFD、JPG、PNG、BMP，最多 100 个附件。';
    }
    if (!isPageMode) updateScenarioHint();
    if (badge) {
        badge.textContent = isPageMode || preAuditData?.dataSource === 'pageExtract'
            ? '页面提取审核模式'
            : '附件上传预填模式';
    }
}

function handleFileSelect(event) {
    setSourceMode('upload');
    const files = Array.from(event.target.files || []);
    const acceptedFiles = files.slice(0, MAX_ATTACHMENT_COUNT);
    revokeFilePreviewUrls();
    selectedFiles = acceptedFiles.map((file, index) => ({
        id: `prefill_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        name: file.name,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
        message: '待上传',
        completedCount: 0,
        totalModels: 0,
        ocrModelsData: null,
    }));
    uploadResults = [];
    preAuditData = null;
    if (files.length > MAX_ATTACHMENT_COUNT) {
        showStatus(`已选择 ${files.length} 个文件，本次仅处理前 ${MAX_ATTACHMENT_COUNT} 个附件。`, 'warning');
    } else {
        showStatus(selectedFiles.length ? `已选择 ${selectedFiles.length} 个文件。` : '请选择需要报销的单据文件。', 'info');
    }
    renderAll();
}

function resetAll() {
    revokeFilePreviewUrls();
    selectedFiles = [];
    uploadResults = [];
    preAuditData = null;
    isRunning = false;
    isRefining = false;
    pageExtractData = null;
    currentCaseId = '';
    recordSortMode = 'default';
    const sortSelect = $('#recordSortSelect');
    if (sortSelect) sortSelect.value = recordSortMode;
    $('#fileInput').value = '';
    if ($('#aiInstruction')) $('#aiInstruction').value = '';
    showStatus('已清空。', 'info');
    renderAll();
    showUploadHome();
    setSourceMode(dataSourceMode);
}

async function startUploadAndAudit() {
    if (!selectedFiles.length || isRunning) return;
    dataSourceMode = 'upload';
    pageExtractData = null;
    isRunning = true;
    uploadResults = [];
    preAuditData = null;
    currentCaseId = createCaseId('upload');
    renderAll();
    showStatus('正在并发上传附件并调用 OCR 识别...', 'info');

    try {
        await uploadFilesConcurrently(selectedFiles, MAX_CONCURRENT_UPLOADS);

        const successful = uploadResults.filter(item => item.success && Array.isArray(item.ocrModelsData));
        debugLog('upload-finished', {
            uploadResultCount: uploadResults.length,
            successCount: successful.length,
            uploads: uploadResults.map(item => ({
                fileName: item.fileName,
                success: item.success,
                error: item.error || '',
                modelCount: (item.ocrModelsData || []).length,
                dataCounts: (item.ocrModelsData || []).map(model => ({
                    modelName: model.modelName,
                    status: model.status || model.modelStatus,
                    dataCount: (model.data || []).length,
                    debug: model.debug || {},
                })),
            })),
        });
        if (!successful.length) {
            throw new Error('所有文件 OCR 均失败，无法预审。');
        }

        const ocrItems = collectOcrItemsWithSource(successful);
        debugLog('ocr-items-collected', {
            count: ocrItems.length,
            types: ocrItems.reduce((acc, item) => {
                const type = item.recognizeType || item.docType || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {}),
            sample: ocrItems.slice(0, 20),
        });
        const selectedScenario = getSelectedScenarioType();
        const expenseType = selectedScenario !== 'smart' ? selectedScenario : inferExpenseType(ocrItems);
        if (expenseType === 'travel') {
            showStatus('识别到差旅类附件，正在调用差旅规则预审...', 'info');
            const pageBasics = await extractPageBasics();
            const response = await fetch(`${BACKEND_BASE_URL}/api/preAuditTravel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caseId: currentCaseId,
                    uploadResults: successful,
                    attachments: successful.map(item => ({
                        fileId: item.fileId,
                        fileName: item.fileName,
                        ocrModelsData: item.ocrModelsData,
                    })),
                    currentPageUrl: pageBasics?.pageUrl || '',
                    unitName: pageBasics?.unitName || '',
                    departmentName: pageBasics?.departmentName || pageBasics?.unitName || '',
                    applicantName: pageBasics?.applicantName || '',
                    applyDate: pageBasics?.applyDate || '',
                    scenarioType: selectedScenario,
                    source: 'prefill-preaudit-extension',
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || '预填预审接口调用失败');
            }
            debugLog('preaudit-travel-response', {
                recordCount: (payload.data?.records || []).length,
                itineraryCount: (payload.data?.itinerary || []).length,
                summary: payload.data?.summary || {},
                sourceStats: payload.data?.sourceStats || {},
                ocrItemCount: (payload.data?.ocrItems || []).length,
                sample: (payload.data?.records || []).slice(0, 10),
            });
            preAuditData = { ...(payload.data || {}), caseId: payload.caseId || payload.data?.caseId || currentCaseId, expenseType: 'travel', dataSource: 'upload' };
            showStatus('差旅费OCR识别和业务规则预审完成，请核对命中指标后再一键预填。', 'success');
        } else {
            if (expenseType === 'other' || selectedScenario === 'smart') {
                preAuditData = { ...buildOtherExpensePrefillData(ocrItems, successful), caseId: currentCaseId, dataSource: 'upload' };
                await persistCaseSnapshot(preAuditData, { scenarioType: 'other', source: 'prefill-preaudit-extension' });
                showStatus('已生成其他事项报销预填数据，请核对后再一键预填。', 'success');
            } else if (expenseType === 'meeting') {
                showStatus('会议费材料识别完成，正在调用会议费归集和规则审核...', 'info');
                preAuditData = await buildMeetingPrefillAndAuditData({ successfulUploads: successful, ocrItems, source: 'prefill-preaudit-extension' });
                preAuditData.dataSource = 'upload';
                showStatus('会议费OCR识别、预填归集和规则审核完成，请核对命中指标。', 'success');
            } else {
                preAuditData = { ...buildReservedScenarioPrefillData(expenseType, ocrItems, successful), caseId: currentCaseId, dataSource: 'upload' };
                await persistCaseSnapshot(preAuditData, { scenarioType: expenseType, source: 'prefill-preaudit-extension' });
                showStatus('该场景已使用专用 OCR 提示词识别，预填归集逻辑暂未接入，请查看 OCR 结果。', 'warning');
            }
        }
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        isRunning = false;
        updateProgress();
        renderAll();
        if (preAuditData) showDashboard('summaryPanel');
    }
}

async function extractCurrentPageAndAudit() {
    if (isRunning) return;
    dataSourceMode = 'page';
    isRunning = true;
    pageExtractData = null;
    revokeFilePreviewUrls();
    selectedFiles = [];
    uploadResults = [];
    preAuditData = null;
    currentCaseId = createCaseId('page');
    renderAll();
    showStatus('正在提取当前财务页面数据...', 'info');

    try {
        const pageSnapshot = await extractCurrentPageSnapshot();
        pageExtractData = pageSnapshot;
        selectedFiles = await downloadPageAttachmentFiles(pageSnapshot.attachments || []);
        renderAll();

        const uploadableFiles = selectedFiles.filter(file => file.file);
        if (uploadableFiles.length) {
            showStatus(`已提取 ${uploadableFiles.length} 个页面附件，正在上传OCR识别...`, 'info');
            await uploadFilesConcurrently(uploadableFiles, Math.min(PAGE_ATTACHMENT_CONCURRENCY, uploadableFiles.length));
        }

        const successful = uploadResults.filter(item => item.success && Array.isArray(item.ocrModelsData));
        const ocrItems = collectOcrItemsWithSource(successful);
        if (pageSnapshot.scenarioType === 'travel') {
            preAuditData = await buildPageTravelAuditData(pageSnapshot, successful, ocrItems);
        } else if (pageSnapshot.scenarioType === 'meeting') {
            preAuditData = await buildMeetingPrefillAndAuditData({
                successfulUploads: successful,
                ocrItems,
                pageSnapshot,
                source: 'page-extract-audit-extension',
            });
        } else {
            preAuditData = await buildPageOtherAuditData(pageSnapshot, successful, ocrItems);
        }
        preAuditData.dataSource = 'pageExtract';
        showStatus('当前页面数据和附件识别审核完成，页面提取模式下不显示一键填写。', 'success');
    } catch (error) {
        showStatus(error.message || '页面提取审核失败', 'error');
    } finally {
        isRunning = false;
        updateProgress();
        renderAll();
        if (preAuditData) showDashboard('rulesPanel');
    }
}

async function extractCurrentPageSnapshot() {
    const basicsRes = await sendMessageToActiveTab({ action: 'extractPrefillPageBasics' });
    const subjectRes = await sendMessageToActiveTab({ action: 'getEconomicSubjects' });
    const attachmentRes = await sendMessageToActiveTab({ action: 'extractAttachments' });
    const amountRes = await sendMessageToActiveTab({ action: 'getTotalAmount' });
    const paymentRes = await sendMessageToActiveTab({ action: 'getPaymentInfo' });
    const travelRes = await sendMessageToActiveTab({ action: 'extractTravelDetail' });
    const meetingRes = await sendMessageToActiveTab({ action: 'extractMeetingDetail' });
    const travelDetail = travelRes?.data || travelRes || {};
    const meetingDetail = meetingRes?.data || meetingRes || {};
    const subjects = subjectRes?.subjects || [];
    const selectedScenario = getSelectedScenarioType();
    const isTravel = subjects.some(subject => String(subject || '').includes('7101010209'))
        || (Array.isArray(travelDetail.personal) && travelDetail.personal.length > 0);
    const isMeeting = selectedScenario === 'meeting'
        || /会议/.test([basicsRes?.data?.pageTitle, basicsRes?.data?.documentTitle, meetingDetail.title, meetingDetail.reason].filter(Boolean).join(' '))
        || Boolean(meetingDetail.meetingDays || meetingDetail.attendeeCount || meetingDetail.mealAmount || meetingDetail.accommodationAmount || meetingDetail.venueRentAmount);
    return {
        scenarioType: isTravel ? 'travel' : (isMeeting ? 'meeting' : 'other'),
        subjects,
        attachments: attachmentRes?.attachments || [],
        pageAmount: amountRes?.totalAmount ?? null,
        payments: paymentRes?.payments || [],
        travelData: travelDetail || {},
        meetingData: meetingDetail || {},
        pageBasics: basicsRes?.data || {},
        pageUrl: basicsRes?.data?.pageUrl || '',
    };
}

async function downloadPageAttachmentFiles(attachments = []) {
    const limited = attachments.slice(0, MAX_ATTACHMENT_COUNT);
    const results = new Array(limited.length);
    let nextIndex = 0;
    const workerCount = Math.min(PAGE_ATTACHMENT_CONCURRENCY, limited.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < limited.length) {
            const index = nextIndex;
            nextIndex += 1;
            const attachment = limited[index];
            try {
                results[index] = await downloadPageAttachmentFile(attachment, index);
            } catch (error) {
                results[index] = {
                    id: `page_${Date.now()}_${index}`,
                    pageAttachmentId: attachment.id || '',
                    name: attachment.name || `页面附件${index + 1}`,
                    size: 0,
                    previewUrl: attachment.id ? `${FILE_SERVER_URL}${attachment.id}` : '',
                    status: 'failed',
                    message: `下载失败：${error.message}`,
                    ocrModelsData: [],
                };
            }
        }
    });
    await Promise.all(workers);
    if (attachments.length > MAX_ATTACHMENT_COUNT) {
        showStatus(`当前页面有 ${attachments.length} 个附件，本次仅处理前 ${MAX_ATTACHMENT_COUNT} 个。`, 'warning');
    }
    return results.filter(Boolean);
}

async function downloadPageAttachmentFile(attachment = {}, index = 0) {
    const fileId = safeText(attachment.id || attachment.key);
    if (!fileId) throw new Error('页面附件缺少文件流水号');
    const fileName = safeText(attachment.name || attachment.fileName) || `页面附件${index + 1}.pdf`;
    const sourceUrl = `${FILE_SERVER_URL}${fileId}`;
    const blob = await fetchAttachmentBlob(sourceUrl);
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    return {
        id: `page_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        pageAttachmentId: fileId,
        sourceUrl,
        file,
        name: fileName,
        size: file.size,
        previewUrl: URL.createObjectURL(blob),
        status: 'pending',
        message: '待上传',
        completedCount: 0,
        totalModels: 0,
        ocrModelsData: null,
    };
}

async function fetchAttachmentBlob(url) {
    try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.blob();
    } catch (error) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.withCredentials = true;
            xhr.responseType = 'blob';
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
                else reject(new Error(`HTTP ${xhr.status || '未知'}`));
            };
            xhr.onerror = () => reject(error);
            xhr.send();
        });
    }
}

function normalizePageTravelRecord(record = {}, index = 0) {
    const normalized = { ...record };
    [
        'transportDocs', 'transportAmount', 'hotelDays', 'hotelDocs', 'hotelAmount', 'hotelStandard',
        'mealDays', 'mealPersons', 'mealStandard', 'mealAmount',
        'localTransportDays', 'localTransportPersons', 'localTransportStandard', 'localTransportAmount',
        'otherAmount',
    ].forEach(field => {
        normalized[field] = numberValue(normalized[field]);
    });
    normalized.recordIndex = normalized.recordIndex ?? index;
    normalized.recordKey = normalized.recordKey || [
        normalized.name,
        normalized.startTime,
        normalized.endTime,
        normalized.startAddress,
        normalized.endAddress,
        index,
    ].join('|');
    normalized.totalAmount = numberValue(normalized.totalAmount)
        || normalized.transportAmount + normalized.hotelAmount + normalized.mealAmount + normalized.localTransportAmount + normalized.otherAmount;
    return normalized;
}

function buildPageTravelSummary(records = [], rawSummary = {}) {
    const uniquePeople = new Set(records.map(item => safeText(item.name)).filter(Boolean));
    return {
        ...rawSummary,
        recordCount: records.length,
        personCount: uniquePeople.size,
        transportAmountTotal: records.reduce((sum, item) => sum + numberValue(item.transportAmount), 0),
        hotelAmountTotal: records.reduce((sum, item) => sum + numberValue(item.hotelAmount), 0),
        mealAmountTotal: records.reduce((sum, item) => sum + numberValue(item.mealAmount), 0),
        localTransportAmountTotal: records.reduce((sum, item) => sum + numberValue(item.localTransportAmount), 0),
        otherAmountTotal: records.reduce((sum, item) => sum + numberValue(item.otherAmount), 0),
        totalAll: records.reduce((sum, item) => sum + numberValue(item.totalAmount), 0),
    };
}

function buildAuditAttachments(successfulUploads = []) {
    return successfulUploads.map(item => ({
        fileId: item.fileId,
        fileName: item.fileName,
        caseId: item.caseId || currentCaseId || '',
        taskId: item.taskId || '',
        attachmentId: item.attachmentId || '',
        ocrModelsData: item.ocrModelsData,
    }));
}

async function persistCaseSnapshot(data = {}, options = {}) {
    if (!data) return;
    try {
        const response = await fetch(CASE_SNAPSHOT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                caseId: data.caseId || currentCaseId || createCaseId('snapshot'),
                scenarioType: options.scenarioType || data.scenarioType || data.expenseType || 'smart',
                source: options.source || data.dataSource || dataSourceMode || 'snapshot',
                operationType: options.operationType || 'prefill_snapshot',
                prefillData: data,
                ocrItems: data.ocrItems || [],
            }),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload.caseId && !currentCaseId) currentCaseId = payload.caseId;
        if (!response.ok || !payload.success) {
            debugLog('case-snapshot-save-failed', { status: response.status, payload });
        }
    } catch (error) {
        debugLog('case-snapshot-save-error', { message: error.message });
    }
}

async function buildPageTravelAuditData(pageSnapshot, successfulUploads, ocrItems) {
    const records = (pageSnapshot.travelData?.personal || []).map(normalizePageTravelRecord);
    const summary = buildPageTravelSummary(records, pageSnapshot.travelData?.summary || {});
    const response = await fetch(`${BACKEND_BASE_URL}/api/auditOcrRules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caseId: currentCaseId,
            scenarioType: 'travel',
            travelData: { personal: records, summary },
            records,
            summary,
            ocrItems,
            uploadResults: successfulUploads,
            attachments: buildAuditAttachments(successfulUploads),
            payments: pageSnapshot.payments || [],
            pageAmount: pageSnapshot.pageAmount,
            currentPageUrl: pageSnapshot.pageUrl,
            unitName: pageSnapshot.pageBasics?.unitName || '',
            departmentName: pageSnapshot.pageBasics?.departmentName || '',
            applicantName: pageSnapshot.pageBasics?.applicantName || '',
            applyDate: pageSnapshot.pageBasics?.applyDate || '',
            source: 'page-extract-audit-extension',
        }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || '页面差旅费指标审核失败');
    return {
        caseId: payload.caseId || currentCaseId,
        scenarioType: 'travel',
        expenseType: 'travel',
        records,
        itinerary: buildFrontendTravelItinerary(records),
        summary,
        sourceStats: {
            ocrItemCount: ocrItems.length,
            ticketCount: ocrItems.filter(isTravelOcrItem).length,
            uploadCount: successfulUploads.length,
            pageAttachmentCount: (pageSnapshot.attachments || []).length,
        },
        ocrItems,
        uploadResults: successfulUploads,
        auditResult: payload.auditResult || payload.data || {},
        pageExtractData: pageSnapshot,
    };
}

async function buildMeetingPrefillAndAuditData({ successfulUploads = [], ocrItems = [], pageSnapshot = null, source = 'prefill-preaudit-extension' } = {}) {
    const pageFields = pageSnapshot?.meetingData || {};
    const pageBasics = pageSnapshot?.pageBasics || {};
    const pageAmount = numberValue(pageSnapshot?.pageAmount);
    const prefillResponse = await fetch(`${BACKEND_BASE_URL}/api/plugin/prefill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caseId: currentCaseId,
            scenarioType: 'meeting',
            ocrItems,
            uploadResults: successfulUploads,
            attachments: buildAuditAttachments(successfulUploads),
            pageFields: {
                ...pageFields,
                pageAmount,
                reimbursementUnitName: pageBasics.unitName || pageFields.reimbursementUnitName || '',
                applicantName: pageBasics.applicantName || pageFields.applicantName || '',
                departmentName: pageBasics.departmentName || pageFields.departmentName || '',
            },
            payments: pageSnapshot?.payments || [],
            pageAmount,
            currentPageUrl: pageSnapshot?.pageUrl || '',
            source,
        }),
    });
    const prefillPayload = await prefillResponse.json();
    if (!prefillResponse.ok || !prefillPayload.success) throw new Error(prefillPayload.error || '会议费预填归集失败');
    const prefill = prefillPayload.data || {};
    const auditResponse = await fetch(`${BACKEND_BASE_URL}/api/plugin/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caseId: prefillPayload.caseId || currentCaseId,
            scenarioType: 'meeting',
            prefillData: prefill,
            ocrItems,
            uploadResults: successfulUploads,
            attachments: buildAuditAttachments(successfulUploads),
            payments: pageSnapshot?.payments || [],
            pageAmount,
            currentPageUrl: pageSnapshot?.pageUrl || '',
            source,
        }),
    });
    const auditPayload = await auditResponse.json();
    if (!auditResponse.ok || !auditPayload.success) throw new Error(auditPayload.error || '会议费指标审核失败');
    return {
        ...prefill,
        caseId: auditPayload.caseId || prefillPayload.caseId || currentCaseId,
        scenarioType: 'meeting',
        expenseType: 'meeting',
        sourceStats: {
            ...(prefill.sourceStats || {}),
            ocrItemCount: ocrItems.length,
            uploadCount: successfulUploads.length,
            pageAttachmentCount: (pageSnapshot?.attachments || []).length,
        },
        ocrItems,
        uploadResults: successfulUploads,
        auditResult: auditPayload.auditResult || auditPayload.data || {},
        pageExtractData: pageSnapshot || null,
    };
}

async function buildPageOtherAuditData(pageSnapshot, successfulUploads, ocrItems) {
    const prefill = buildOtherExpensePrefillData(ocrItems, successfulUploads);
    const pageAmount = numberValue(pageSnapshot.pageAmount);
    if (pageAmount > 0 && prefill.records?.[0] && numberValue(prefill.records[0].totalAmount) === 0) {
        prefill.records[0].totalAmount = pageAmount;
        prefill.summary.totalAll = pageAmount;
    }
    const response = await fetch(`${BACKEND_BASE_URL}/api/plugin/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caseId: currentCaseId,
            scenarioType: 'other',
            prefillData: prefill,
            ocrItems,
            uploadResults: successfulUploads,
            attachments: buildAuditAttachments(successfulUploads),
            payments: pageSnapshot.payments || [],
            pageAmount,
            currentPageUrl: pageSnapshot.pageUrl,
            source: 'page-extract-audit-extension',
        }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || '页面其他事项指标审核失败');
    return {
        ...prefill,
        caseId: payload.caseId || currentCaseId,
        scenarioType: 'other',
        expenseType: 'other',
        sourceStats: {
            ...(prefill.sourceStats || {}),
            ocrItemCount: ocrItems.length,
            uploadCount: successfulUploads.length,
            pageAttachmentCount: (pageSnapshot.attachments || []).length,
        },
        ocrItems,
        uploadResults: successfulUploads,
        auditResult: payload.auditResult || payload.data || {},
        pageExtractData: pageSnapshot,
    };
}

async function uploadFilesConcurrently(files, concurrency = MAX_CONCURRENT_UPLOADS) {
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, files.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < files.length) {
            const current = files[nextIndex];
            nextIndex += 1;
            try {
                await uploadAndPollFile(current);
            } catch (error) {
                current.status = 'failed';
                current.message = error.message || '识别失败';
                uploadResults.push({
                    fileId: current.id,
                    fileName: current.name,
                    caseId: current.caseId || currentCaseId || '',
                    taskId: current.taskId || '',
                    attachmentId: current.attachmentId || '',
                    success: false,
                    error: current.message,
                    ocrModelsData: current.ocrModelsData || [],
                });
            } finally {
                updateProgress();
                renderFileList();
            }
        }
    });
    await Promise.all(workers);
}

async function uploadAndPollFile(fileState) {
    fileState.status = 'uploading';
    fileState.message = '上传中';
    renderFileList();

    const formData = new FormData();
    formData.append('file', fileState.file, fileState.name);
    formData.append('fileId', fileState.id);
    formData.append('fileName', fileState.name || '');
    formData.append('caseId', currentCaseId || createCaseId('upload'));
    const scenarioType = pageExtractData?.scenarioType || getSelectedScenarioType();
    formData.append('scenarioType', scenarioType);
    formData.append('source', dataSourceMode === 'page' ? 'page-extract-audit-extension' : 'prefill-preaudit-extension');
    formData.append('businessCategory', scenarioType === 'smart' ? '智能报销预填预审' : `${scenarioType}报销预填预审`);

    const uploadResponse = await fetch(UPLOAD_URL, { method: 'POST', body: formData });
    const uploadPayload = await uploadResponse.json();
    debugLog('upload-response', {
        fileName: fileState.name,
        ok: uploadResponse.ok,
        taskId: uploadPayload.taskId,
        success: uploadPayload.success,
        scenarioType: uploadPayload.scenarioType,
        message: uploadPayload.message || uploadPayload.error || '',
    });
    if (!uploadResponse.ok || !uploadPayload.success || !uploadPayload.taskId) {
        fileState.status = 'failed';
        fileState.message = uploadPayload.message || uploadPayload.error || '上传失败';
        uploadResults.push({
            fileId: fileState.id,
            fileName: fileState.name,
            caseId: uploadPayload.caseId || currentCaseId || '',
            taskId: uploadPayload.taskId || '',
            attachmentId: uploadPayload.attachmentId || '',
            success: false,
            error: fileState.message,
        });
        return;
    }

    fileState.taskId = uploadPayload.taskId;
    fileState.caseId = uploadPayload.caseId || currentCaseId || '';
    fileState.attachmentId = uploadPayload.attachmentId || '';
    fileState.status = 'recognizing';
    fileState.message = '识别中';
    renderFileList();
    const taskPayload = await pollTask(fileState);
    debugLog('task-final', {
        fileName: fileState.name,
        taskId: fileState.taskId,
        success: taskPayload.success,
        status: taskPayload.status,
        message: taskPayload.message || '',
        modelCount: (taskPayload.ocrModels || taskPayload.partialResults || []).length,
        modelSummaries: (taskPayload.ocrModels || taskPayload.partialResults || []).map(model => ({
            modelName: model.modelName,
            status: model.status || model.modelStatus,
            fileName: model.fileName,
            dataCount: (model.data || []).length,
            debug: model.debug || {},
        })),
    });
    if (taskPayload.success && taskPayload.code === 200) {
        fileState.status = 'success';
        fileState.message = '已识别';
        fileState.ocrModelsData = taskPayload.ocrModels || [];
        fileState.ocrData = taskPayload.data;
        fileState.completedCount = fileState.ocrModelsData.length;
        fileState.totalModels = fileState.completedCount;
        uploadResults.push({
            fileId: fileState.id,
            fileName: fileState.name,
            caseId: fileState.caseId,
            taskId: fileState.taskId,
            attachmentId: fileState.attachmentId,
            success: true,
            data: taskPayload.data,
            ocrModelsData: fileState.ocrModelsData,
        });
    } else {
        fileState.status = 'failed';
        fileState.message = taskPayload.message || '识别失败';
        fileState.ocrModelsData = taskPayload.partialResults || [];
        uploadResults.push({
            fileId: fileState.id,
            fileName: fileState.name,
            caseId: fileState.caseId || currentCaseId || '',
            taskId: fileState.taskId || '',
            attachmentId: fileState.attachmentId || '',
            success: false,
            error: fileState.message,
            ocrModelsData: taskPayload.partialResults || [],
        });
    }
}

async function pollTask(fileState) {
    const started = Date.now();
    const timeoutMs = 30 * 60 * 1000;
    while (Date.now() - started < timeoutMs) {
        const response = await fetch(`${BACKEND_BASE_URL}/task/${fileState.taskId}`);
        const payload = await response.json();
        if (payload.success && payload.code === 200) return payload;
        if (payload.status === 'processing') {
            fileState.completedCount = payload.completedCount || 0;
            fileState.totalModels = payload.totalModels || fileState.totalModels || 0;
            fileState.ocrModelsData = payload.partialResults || [];
            fileState.message = `识别中 ${fileState.completedCount}/${fileState.totalModels || '-'}`;
            renderFileList();
            await sleep(2000);
            continue;
        }
        return payload;
    }
    return { success: false, message: 'OCR 识别超时' };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractPageBasics() {
    const response = await sendMessageToActiveTab({ action: 'extractPrefillPageBasics' });
    return response?.data || {};
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]+,/, ''));
        reader.onerror = () => reject(reader.error || new Error('附件读取失败'));
        reader.readAsDataURL(file);
    });
}

function safeText(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function inferUploadScenarioType(fileName = '') {
    const text = safeText(fileName);
    if (/会议/i.test(text)) return 'meeting';
    if (/培训/i.test(text)) return 'training';
    if (/接待|公函/i.test(text)) return 'reception';
    if (/电费|水费|物业|办公|体检|邮寄|维修|食堂|宣传|印刷|电话|电视|燃料|保险|手续费|交通补贴|出租车|出行明细|付款截图|其他事项|其它事项/i.test(text)) return 'other';
    return 'travel';
}

const OCR_TYPE_ALIASES = {
    electronicInvoice: 'normalInvoice',
    vatInvoice: 'normalInvoice',
    vatSpecialInvoice: 'normalInvoice',
    specialInvoice: 'normalInvoice',
    generalInvoice: 'normalInvoice',
    digitalInvoice: 'normalInvoice',
    invoice: 'normalInvoice',
    normal_invoice: 'normalInvoice',
    normalinvoice: 'normalInvoice',
    electronic_invoice: 'normalInvoice',
    vat_invoice: 'normalInvoice',
    vat_special_invoice: 'normalInvoice',
    special_invoice: 'normalInvoice',
    general_invoice: 'normalInvoice',
    digital_invoice: 'normalInvoice',
    普通发票: 'normalInvoice',
    增值税发票: 'normalInvoice',
    增值税专用发票: 'normalInvoice',
    增值税普通发票: 'normalInvoice',
    数电票: 'normalInvoice',
    电子发票: 'normalInvoice',
    电子普通发票: 'normalInvoice',
    电子专用发票: 'normalInvoice',
    专票: 'normalInvoice',
    普票: 'normalInvoice',
    发票: 'normalInvoice',
    taxiInvoice: 'guangzhouTaxiInvoice',
    taxi_ticket: 'guangzhouTaxiInvoice',
    taxiTicket: 'guangzhouTaxiInvoice',
    guangzhouTaxiInvoice: 'guangzhouTaxiInvoice',
    guangzhou_taxi_invoice: 'guangzhouTaxiInvoice',
    出租车票: 'guangzhouTaxiInvoice',
    出租汽车票: 'guangzhouTaxiInvoice',
    广州出租汽车统一车票: 'guangzhouTaxiInvoice',
    广州出租车机打发票: 'guangzhouTaxiInvoice',
    tripDetailList: 'tripDetailList',
    trip_detail_list: 'tripDetailList',
    公务出行明细表: 'tripDetailList',
    出行明细表: 'tripDetailList',
    paymentRecord: 'paymentRecord',
    payment_record: 'paymentRecord',
    paymentScreenshot: 'paymentRecord',
    付款截图: 'paymentRecord',
    付款记录: 'paymentRecord',
    交易明细: 'paymentRecord',
    air_ticket: 'planeInvoice',
    airTicket: 'planeInvoice',
    plane_ticket: 'planeInvoice',
    flight_ticket: 'planeInvoice',
    flight: 'planeInvoice',
    plane: 'planeInvoice',
    train_ticket: 'trainInvoice',
    trainTicket: 'trainInvoice',
    railway_ticket: 'trainInvoice',
    train: 'trainInvoice',
    accommodationlist: 'accommodationList',
    accommodation_list: 'accommodationList',
    hotelList: 'accommodationList',
    hotel_list: 'accommodationList',
    accommodation: 'accommodationList',
    hotel: 'accommodationList',
    TravelRequest: 'travelRequest',
    travel_request: 'travelRequest',
    meeting_notice: 'meetingNotice',
    meeting_approval: 'meetingApproval',
    training_notice: 'trainingNotice',
    training_approval: 'trainingApproval',
    reception_letter: 'receptionLetter',
    reception_list: 'receptionList',
    attendance_list: 'attendanceList',
    normalInvoice: 'normalInvoice',
    guangzhouTaxiInvoice: 'guangzhouTaxiInvoice',
    tripDetailList: 'tripDetailList',
    paymentRecord: 'paymentRecord',
    trainInvoice: 'trainInvoice',
    planeInvoice: 'planeInvoice',
    accommodationList: 'accommodationList',
    travelRequest: 'travelRequest',
    meetingNotice: 'meetingNotice',
    meetingApproval: 'meetingApproval',
    trainingNotice: 'trainingNotice',
    trainingApproval: 'trainingApproval',
    receptionLetter: 'receptionLetter',
    receptionList: 'receptionList',
    attendanceList: 'attendanceList',
};

const OCR_TYPE_LABELS = {
    normalInvoice: '普通发票',
    guangzhouTaxiInvoice: '广州出租汽车统一车票',
    tripDetailList: '公务出行明细表',
    paymentRecord: '付款记录',
    trainInvoice: '火车票',
    planeInvoice: '飞机票',
    accommodationList: '住宿清单',
    travelRequest: '出差审批单',
    meetingNotice: '会议通知',
    meetingApproval: '会议审批单',
    trainingNotice: '培训通知',
    trainingApproval: '培训审批单',
    receptionLetter: '接待函',
    receptionList: '接待清单',
    attendanceList: '签到表',
};

const DISPLAYABLE_OCR_TYPES = new Set(Object.keys(OCR_TYPE_LABELS));

function collectOcrItems(value, items = []) {
    if (!value) return items;
    if (Array.isArray(value)) {
        value.forEach(item => collectOcrItems(item, items));
        return items;
    }
    if (typeof value !== 'object') return items;
    if (value.recognizeType || value.docType) {
        items.push(value);
        return items;
    }
    if (value.result) collectOcrItems(value.result, items);
    if (value.data) collectOcrItems(value.data, items);
    if (value.ocrModels) collectOcrItems(value.ocrModels, items);
    if (value.ocrModelsData) collectOcrItems(value.ocrModelsData, items);
    return items;
}

function collectOcrItemsWithSource(uploadList = []) {
    const items = [];
    (uploadList || []).forEach(upload => {
        const group = collectOcrItems(upload?.ocrModelsData || upload?.ocrModels || upload?.data || []);
        group.forEach(item => {
            if (!item || typeof item !== 'object') return;
            items.push({
                ...item,
                sourceFileName: item.sourceFileName || upload.fileName || '',
                fileName: item.fileName || item.sourceFileName || upload.fileName || '',
                sourceFileId: item.sourceFileId || upload.fileId || '',
            });
        });
    });
    return items;
}

function ensureOcrKeys(items = []) {
    (items || []).forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        if (!item.ocrKey) item.ocrKey = `ocr-${index + 1}`;
        if (item.ocrIndex === undefined || item.ocrIndex === null || item.ocrIndex === '') item.ocrIndex = index;
    });
    return items;
}

function stripLargeAiRefineValue(value, depth = 0) {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') {
        return value.length > AI_REFINE_OCR_TEXT_LIMIT
            ? `${value.slice(0, AI_REFINE_OCR_TEXT_LIMIT)}...(已截断)`
            : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= 4) return safeText(value).slice(0, AI_REFINE_OCR_TEXT_LIMIT);
    if (Array.isArray(value)) {
        return value
            .slice(0, AI_REFINE_OCR_ARRAY_LIMIT)
            .map(item => stripLargeAiRefineValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        const result = {};
        Object.entries(value).forEach(([key, child]) => {
            if (/base64|fileContent|image|binary|buffer|bytes/i.test(key)) return;
            result[key] = stripLargeAiRefineValue(child, depth + 1);
        });
        return result;
    }
    return safeText(value);
}

function buildOcrRefineItems() {
    const existing = Array.isArray(preAuditData?.ocrItems) && preAuditData.ocrItems.length
        ? preAuditData.ocrItems
        : collectOcrItemsWithSource(uploadResults.filter(item => item.success));
    ensureOcrKeys(existing);
    return existing.slice(0, AI_REFINE_OCR_ITEM_LIMIT).map((item, index) => ({
        ...stripLargeAiRefineValue(item),
        ocrKey: item.ocrKey || `ocr-${index + 1}`,
        ocrIndex: item.ocrIndex ?? index,
        sourceFileName: item.sourceFileName || item.fileName || '',
        fileName: item.fileName || item.sourceFileName || '',
        recognizeType: item.recognizeType || item.docType || item.type || '',
    }));
}

function buildRecordEvidence(record = {}) {
    return stripLargeAiRefineValue({
        sourceSummary: record.sourceSummary || '',
        sourceDetails: Array.isArray(record.sourceDetails) ? record.sourceDetails.slice(0, 30) : [],
        sourceItems: record.sourceItems || {},
    });
}

function getOcrModelItemGroups(fileState) {
    const models = Array.isArray(fileState.ocrModelsData) ? fileState.ocrModelsData : [];
    const groups = models
        .map(model => collectOcrItems(model?.result || model?.data || model))
        .filter(group => group.length);
    if (groups.length) return groups;
    const fallback = collectOcrItems(fileState.ocrData || fileState.ocrModelsData || []);
    return fallback.length ? [fallback] : [];
}

function collectOcrDiagnostics(uploadList = uploadResults) {
    return (uploadList || []).flatMap(upload => {
        const models = Array.isArray(upload.ocrModelsData) ? upload.ocrModelsData : [];
        if (!models.length) {
            return [{
                fileName: upload.fileName || '',
                success: upload.success,
                error: upload.error || '',
                modelName: '',
                status: upload.success ? 'success' : 'failed',
                dataCount: 0,
                debug: {},
            }];
        }
        return models.map(model => ({
            fileName: upload.fileName || model.fileName || '',
            success: upload.success,
            error: upload.error || '',
            modelName: model.modelName || 'Qwen-VL',
            status: model.status || model.modelStatus || '',
            dataCount: (model.data || []).length,
            pageCount: model.pageCount || '',
            debug: model.debug || {},
            dataSample: (model.data || []).slice(0, 5),
        }));
    });
}

function normalizeRecognizeType(type) {
    const raw = String(type || '').trim();
    if (!raw) return 'other';
    return OCR_TYPE_ALIASES[raw] || OCR_TYPE_ALIASES[raw.replace(/\s+/g, '')] || OCR_TYPE_ALIASES[raw.toLowerCase()] || raw;
}

function isDisplayableOcrItem(item) {
    return DISPLAYABLE_OCR_TYPES.has(normalizeRecognizeType(item?.recognizeType || item?.docType || item?.type));
}

function prepareDisplayOcrItem(item = {}, sourceFileName = '') {
    const recognizeType = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
    return {
        ...item,
        recognizeType,
        sourceFileName: item.sourceFileName || item.fileName || sourceFileName || '',
        fileName: item.fileName || item.sourceFileName || sourceFileName || '',
    };
}

function getDisplayableOcrItems(items = [], sourceFileName = '') {
    return (items || [])
        .map(item => prepareDisplayOcrItem(item, sourceFileName))
        .filter(isDisplayableOcrItem);
}

function getChineseType(type) {
    const normalized = normalizeRecognizeType(type);
    return OCR_TYPE_LABELS[normalized] || '';
}

function getRelevantFields(type) {
    const map = {
        normalInvoice: ['invoiceNumber', 'invoiceCode', 'issueDate', 'sellerName', 'sellerTaxNo', 'payerName', 'buyerTaxNo', 'projectName', 'totalAmount', 'taxAmount', 'comment'],
        guangzhouTaxiInvoice: ['invoiceCode', 'invoiceNumber', 'serialNumber', 'rideDate', 'startTime', 'endTime', 'carPlate', 'certificateNumber', 'unitPrice', 'distanceKm', 'waitingTime', 'amount'],
        tripDetailList: ['department', 'personName', 'rank', 'monthlyLimit', 'totalAmount'],
        paymentRecord: ['transactionTime', 'accountTime', 'cardNumber', 'summary', 'countryOrRegion', 'payeeName', 'amount', 'currency', 'balance'],
        trainInvoice: ['invoiceNumber', 'trainNumber', 'departureStation', 'arrivalStation', 'departureTime', 'passengerName', 'seatClass', 'totalAmount'],
        planeInvoice: ['invoiceNumber', 'gpNumber', 'flightNumber', 'departure', 'arrival', 'departureAirport', 'arrivalAirport', 'departureTime', 'passengerName', 'seatClass', 'amount', 'insurance'],
        accommodationList: ['creditcardNumber', 'hotelName', 'guestName', 'checkInDate', 'leavingDate', 'totalAmount'],
        travelRequest: ['requesterName', 'startDate', 'startPeriod', 'endDate', 'endPeriod', 'destination', 'arrivalAddress', 'transportation', 'rank', 'reason'],
        meetingNotice: ['meetingName', 'meetingDate', 'meetingPlace', 'organizer', 'attendees'],
        meetingApproval: ['applicantName', 'meetingName', 'startDate', 'endDate', 'meetingPlace', 'reason'],
        trainingNotice: ['trainingName', 'trainingDate', 'trainingPlace', 'organizer', 'attendees'],
        trainingApproval: ['applicantName', 'trainingName', 'startDate', 'endDate', 'trainingPlace', 'reason'],
        receptionLetter: ['visitorUnit', 'visitorNames', 'receptionDate', 'receptionPlace', 'reason'],
        receptionList: ['receptionDate', 'receptionPlace', 'visitorCount', 'staffCount', 'amount'],
        attendanceList: ['activityName', 'date', 'place', 'attendees'],
    };
    return map[normalizeRecognizeType(type)] || [];
}

const OCR_FIELD_NAME_MAP = {
    invoiceNumber: '发票号码',
    issueDate: '开票日期',
    sellerName: '销售方/收款方',
    sellerTaxNo: '销售方识别号',
    payerName: '购买方',
    buyerTaxNo: '购买方识别号',
    projectName: '项目名称',
    totalAmount: '价税合计',
    taxAmount: '税额',
    taxIncludedAmount: '价税合计',
    comment: '备注',
    invoiceCode: '票据代码',
    serialNumber: '流水号',
    rideDate: '乘车日期',
    startTime: '上车时间',
    endTime: '下车时间',
    phoneNumber: '监督电话',
    carPlate: '车牌号',
    certificateNumber: '证号',
    unitPrice: '单价',
    distanceKm: '里程',
    waitingTime: '候时',
    cardNumber: '卡号',
    department: '部门',
    personName: '姓名',
    monthlyLimit: '限额标准',
    detailRows: '出行明细',
    sequence: '序号',
    travelDate: '公务出行时间',
    transportType: '出行方式',
    claimAmount: '报销金额',
    remark: '备注',
    transactionTime: '交易时间',
    accountTime: '记账时间',
    summary: '业务摘要',
    countryOrRegion: '交易国家或地区',
    payeeName: '交易场所/收款方',
    currency: '币种',
    balance: '余额',
    trainNumber: '车次',
    departureStation: '出发站',
    arrivalStation: '到达站',
    departureTime: '出发时间',
    passengerName: '乘客',
    seatClass: '席别',
    gpNumber: 'GP单号',
    flightNumber: '航班号',
    departure: '出发地',
    arrival: '到达地',
    departureAirport: '出发机场',
    arrivalAirport: '到达机场',
    amount: '金额',
    insurance: '保险费',
    creditcardNumber: '结算/银行卡号',
    hotelName: '酒店名称',
    guestName: '入住人',
    checkInDate: '入住日期',
    leavingDate: '离店日期',
    requesterName: '申请人',
    startDate: '开始日期',
    endDate: '结束日期',
    startPeriod: '开始时段',
    endPeriod: '结束时段',
    destination: '目的地',
    arrivalAddress: '出差地点',
    transportation: '交通工具',
    rank: '人员级别',
    reason: '事由',
    meetingName: '会议名称',
    meetingDate: '会议日期',
    meetingPlace: '会议地点',
    organizer: '主办单位',
    attendees: '参会人员',
    applicantName: '申请人',
    trainingName: '培训名称',
    trainingDate: '培训日期',
    trainingPlace: '培训地点',
    visitorUnit: '来访单位',
    visitorNames: '来访人员',
    receptionDate: '接待日期',
    receptionPlace: '接待地点',
    visitorCount: '来访人数',
    staffCount: '陪同人数',
    activityName: '事项名称',
    date: '日期',
    place: '地点',
    itemsDetail: '发票明细',
    specification: '规格型号',
    unit: '单位',
    quantity: '数量',
    name: '项目名称',
    accommodationDetail: '住宿明细',
    passengers: '乘客明细',
    travelers: '出行人员',
    details: '明细',
};

function getChineseFieldName(key) {
    return OCR_FIELD_NAME_MAP[key] || key;
}

function renderOcrValue(value) {
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value)) {
        if (!value.length) return '';
        return `<ul class="ocr-value-list">${value.map(item => `<li>${renderOcrValue(item)}</li>`).join('')}</ul>`;
    }
    if (typeof value === 'object') {
        const pairs = Object.entries(value)
            .filter(([key, val]) => !/base64|fileContent|image|buffer|bytes/i.test(key) && val !== undefined && val !== null && val !== '')
            .map(([key, val]) => `<span class="ocr-nested-field"><strong>${escapeHtml(getChineseFieldName(key))}：</strong>${renderOcrValue(val)}</span>`);
        return pairs.length ? `<span class="ocr-nested">${pairs.join('')}</span>` : '';
    }
    return escapeHtml(String(value));
}

function renderOcrField(key, value) {
    const rendered = renderOcrValue(value);
    if (!rendered) return '';
    return `<div class="ocr-field"><span>${escapeHtml(getChineseFieldName(key))}</span><strong>${rendered}</strong></div>`;
}

function renderInvoiceDetailTable(rows = []) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const columns = [
        ['name', '项目名称'],
        ['specification', '规格型号'],
        ['unit', '单位'],
        ['quantity', '数量'],
        ['amount', '金额'],
        ['taxAmount', '税额'],
    ];
    return `
        <div class="invoice-detail-table-wrap">
            <table class="invoice-detail-table">
                <thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
                <tbody>
                    ${rows.map(row => `<tr>${columns.map(([key]) => `<td>${escapeHtml(firstValue(row, [key, getChineseFieldName(key)]) || '')}</td>`).join('')}</tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderOcrItemCard(item = {}, index = 0) {
    const type = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
    const fields = getRelevantFields(type);
    const detailHtml = fields
        .map(key => renderOcrField(key, item[key]))
        .filter(Boolean)
        .join('');
    const nestedHtml = ['itemsDetail', 'accommodationDetail', 'detailRows', 'passengers', 'travelers', 'attendees', 'details']
        .filter(key => Array.isArray(item[key]) && item[key].length)
        .map(key => `
            <div class="ocr-nested-block">
                <div class="ocr-nested-title">${escapeHtml(getChineseFieldName(key))}</div>
                ${type === 'normalInvoice' && key === 'itemsDetail' ? renderInvoiceDetailTable(item[key]) : renderOcrValue(item[key])}
            </div>
        `)
        .join('');
    const source = item.sourceFileName || item.fileName || '';
    return `
        <div class="ocr-item-card">
            <div class="ocr-item-head">
                <span>${escapeHtml(getChineseType(type))}</span>
                <span class="muted">#${index + 1}${source ? ` · ${escapeHtml(shortName(source, 32))}` : ''}</span>
            </div>
            <div class="ocr-field-grid">${detailHtml || '<div class="muted">该类型未返回可展示字段。</div>'}</div>
            ${nestedHtml}
        </div>
    `;
}

function resultKey(upload = {}) {
    return String(upload.fileId || upload.id || upload.fileName || upload.name || '');
}

function getUploadResultForFile(fileState = {}, usedKeys = new Set()) {
    const candidates = [
        String(fileState.id || ''),
        String(fileState.fileId || ''),
        String(fileState.name || ''),
    ].filter(Boolean);
    const matched = uploadResults.find(item => {
        const key = resultKey(item);
        if (usedKeys.has(key)) return false;
        return candidates.includes(String(item.fileId || '')) || candidates.includes(String(item.fileName || ''));
    });
    if (matched) usedKeys.add(resultKey(matched));
    return matched || null;
}

function buildOcrFileGroups() {
    const groups = [];
    const used = new Set();
    (selectedFiles || []).forEach((fileState, index) => {
        const upload = getUploadResultForFile(fileState, used);
        const rawItems = collectOcrItems(upload?.ocrModelsData || upload?.ocrModels || upload?.data || fileState.ocrModelsData || fileState.ocrData || []);
        groups.push({
            key: fileState.id || upload?.fileId || fileState.name || `file-${index}`,
            fileName: fileState.name || upload?.fileName || `附件${index + 1}`,
            previewUrl: fileState.previewUrl || fileState.sourceUrl || '',
            status: fileState.status || (upload?.success ? 'success' : upload ? 'failed' : 'pending'),
            message: fileState.message || upload?.error || '',
            rawItems,
            displayItems: getDisplayableOcrItems(rawItems, fileState.name || upload?.fileName || ''),
            diagnostics: collectOcrDiagnostics(upload ? [upload] : []),
        });
    });
    (uploadResults || []).forEach((upload, index) => {
        if (used.has(resultKey(upload))) return;
        const rawItems = collectOcrItems(upload?.ocrModelsData || upload?.ocrModels || upload?.data || []);
        groups.push({
            key: upload.fileId || upload.fileName || `upload-${index}`,
            fileName: upload.fileName || `附件${index + 1}`,
            previewUrl: '',
            status: upload.success ? 'success' : 'failed',
            message: upload.error || '',
            rawItems,
            displayItems: getDisplayableOcrItems(rawItems, upload.fileName || ''),
            diagnostics: collectOcrDiagnostics([upload]),
        });
    });
    if (!groups.length && (preAuditData?.ocrItems || []).length) {
        const byFile = new Map();
        (preAuditData.ocrItems || []).forEach(item => {
            const fileName = item.sourceFileName || item.fileName || 'OCR汇总';
            if (!byFile.has(fileName)) byFile.set(fileName, []);
            byFile.get(fileName).push(item);
        });
        [...byFile.entries()].forEach(([fileName, rawItems], index) => {
            groups.push({
                key: `prefill-${index}`,
                fileName,
                previewUrl: '',
                status: 'success',
                message: '',
                rawItems,
                displayItems: getDisplayableOcrItems(rawItems, fileName),
                diagnostics: [],
            });
        });
    }
    return groups;
}

function handleOcrFileClick(event) {
    const button = event.target.closest?.('[data-ocr-file-index]');
    if (!button) return;
    activeOcrFileIndex = Number(button.dataset.ocrFileIndex || 0);
    renderOcrData();
}

function isInvoiceOcrItem(item) {
    const type = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
    const text = safeText(item);
    if (['guangzhouTaxiInvoice', 'tripDetailList', 'paymentRecord'].includes(type)) return false;
    if (/trainInvoice|planeInvoice|travelRequest|accommodationList/i.test(type)) return false;
    if (/火车票|飞机票|行程单|审批单|住宿清单/.test(text)) return false;
    return type === 'normalInvoice' || /发票|电子发票|增值税|数电票|专票|普票/.test(text);
}

function isTravelOcrItem(item) {
    const type = safeText(item.recognizeType || item.docType || item.type);
    const text = safeText(item);
    return /travelRequest|TravelRequest|trainInvoice|planeInvoice|accommodationList/i.test(type)
        || /出差|差旅|火车票|飞机票|行程单|住宿清单|旅客|航班|车次/.test(text);
}

function inferExpenseType(ocrItems) {
    return (ocrItems || []).some(isTravelOcrItem) ? 'travel' : 'other';
}

function firstValue(source, keys) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return '';
}

function invoiceAmount(item) {
    const explicitTaxIncluded = numberValue(firstValue(item, [
        'taxIncludedAmount', 'amountWithTax', 'priceTaxAmount', 'priceTaxTotal', '价税合计', '合计金额', '小写金额'
    ]));
    if (explicitTaxIncluded) return explicitTaxIncluded;
    const total = numberValue(firstValue(item, ['totalAmount', 'amount', 'total', 'invoiceAmount', '金额']));
    if (total) return total;
    return numberValue(firstValue(item, ['totalWithoutTax', 'totalPrice', 'price', '价款', '不含税金额']));
}

function isTaxiInvoiceOcrItem(item) {
    const type = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
    const text = safeText(item);
    return type === 'guangzhouTaxiInvoice' || /广州出租汽车统一车票|GUANGZHOU\s*TAXI\s*RECEIPT|出租汽车统一车票/i.test(text);
}

function taxiInvoiceAmount(item) {
    return numberValue(firstValue(item, ['amount', 'totalAmount', 'fare', 'fareAmount', '金额', '合计金额']));
}

function taxiInvoiceNumber(item = {}, fallbackIndex = 0) {
    const code = normalizeInvoiceNo(firstValue(item, ['invoiceCode', 'ticketCode', 'receiptCode', '发票代码', '票据代码']));
    const number = normalizeInvoiceNo(firstValue(item, ['invoiceNumber', 'ticketNumber', 'receiptNumber', '票号', '发票号码']));
    const serial = normalizeInvoiceNo(firstValue(item, ['serialNumber', 'serialNo', '流水号', '红色票号']));
    if (code && number) return `${code}:${number}`;
    if (number && serial && !number.includes(serial)) return `${number}${serial}`;
    if (number) return number;
    if (code && serial) return `${code}:SERIAL:${serial}`;
    if (serial) return `SERIAL:${serial}`;
    const rideDate = safeText(firstValue(item, ['rideDate', 'travelDate', 'date', 'issueDate']));
    const carPlate = safeText(firstValue(item, ['carPlate', 'plateNo', 'licensePlate', '车牌号', '车号'])).replace(/\s+/g, '').toUpperCase();
    const amount = money(taxiInvoiceAmount(item));
    return rideDate && carPlate && numberValue(amount) ? `FALLBACK:${rideDate}|${carPlate}|${amount}` : `UNKNOWN:${fallbackIndex}`;
}

function dedupeTaxiInvoiceItems(ocrItems) {
    const seen = new Set();
    const invoices = [];
    const duplicates = [];
    (ocrItems || []).forEach((item, index) => {
        if (!isTaxiInvoiceOcrItem(item)) return;
        const key = taxiInvoiceNumber(item, index);
        if (seen.has(key)) {
            duplicates.push({ ...item, duplicateKey: key });
            return;
        }
        seen.add(key);
        invoices.push(item);
    });
    return {
        invoices,
        duplicates,
        duplicateInvoiceCount: duplicates.length,
        duplicateInvoiceNumbers: [...new Set(duplicates.map(taxiInvoiceNumber).filter(Boolean))],
    };
}

function hasTrafficSubsidyOcr(ocrItems = []) {
    return (ocrItems || []).some(item => {
        const type = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
        return type === 'guangzhouTaxiInvoice' || type === 'tripDetailList' || /交通补贴|出租车|公务出行明细表/.test(safeText(item));
    });
}

function tripDetailListAmount(item = {}) {
    const rows = Array.isArray(item.detailRows || item.tripRows || item.rows || item.items)
        ? (item.detailRows || item.tripRows || item.rows || item.items)
        : [];
    const rowsTotal = rows.reduce((sum, row) => sum + numberValue(firstValue(row, ['claimAmount', 'amount', '报销金额', '金额'])), 0);
    return Number(money(rowsTotal || numberValue(firstValue(item, ['totalAmount', '合计金额', '合计']))));
}

function getTrafficPersonName(ocrItems = []) {
    const detail = (ocrItems || []).find(item => normalizeRecognizeType(item.recognizeType || item.docType || item.type) === 'tripDetailList');
    return safeText(firstValue(detail, ['personName', 'name', '姓名'])) || '交通补贴';
}

function normalizeInvoiceNo(value = '') {
    return safeText(value).replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

function invoiceNumberValue(item = {}) {
    return normalizeInvoiceNo(firstValue(item, [
        'invoiceNumber', 'invoiceNo', 'number', 'no', 'fphm', '发票号码', '数电票号码', '发票号', '票号'
    ]));
}

function invoiceKey(item, fallbackIndex) {
    const number = invoiceNumberValue(item);
    if (number) return `number:${number}`;
    const seller = safeText(firstValue(item, ['sellerName', 'vendorName', 'supplierName', '销售方名称', '销售方'])).replace(/\s+/g, '');
    const issueDate = safeText(firstValue(item, ['issueDate', '开票日期', 'date'])).replace(/\s+/g, '');
    const amount = money(invoiceAmount(item));
    if (seller && issueDate && numberValue(amount)) return `fallback:${seller}|${issueDate}|${amount}`;
    return `unknown:${fallbackIndex}`;
}

function dedupeInvoiceItems(ocrItems) {
    const seen = new Set();
    const invoices = [];
    const duplicates = [];
    (ocrItems || []).forEach((item, index) => {
        if (!isInvoiceOcrItem(item)) return;
        const key = invoiceKey(item, index);
        if (seen.has(key)) {
            duplicates.push({ ...item, duplicateKey: key });
            return;
        }
        seen.add(key);
        invoices.push(item);
    });
    return {
        invoices,
        duplicates,
        duplicateInvoiceCount: duplicates.length,
        duplicateInvoiceNumbers: [...new Set(duplicates.map(invoiceNumberValue).filter(Boolean))],
    };
}

function uniqueInvoiceItems(ocrItems) {
    return dedupeInvoiceItems(ocrItems).invoices;
}

function duplicateInvoiceHint(dedupeResult = {}) {
    const count = dedupeResult.duplicateInvoiceCount || 0;
    if (!count) return '';
    const numbers = (dedupeResult.duplicateInvoiceNumbers || []).slice(0, 5).join('、');
    return numbers ? `已按发票号码去重 ${count} 条重复发票：${numbers}` : `已去重 ${count} 条重复发票`;
}

function collectProjectNamesFromInvoice(item) {
    const names = [];
    ['projectName', 'itemName', 'goodsName', 'serviceName', 'name', '项目名称', '货物或应税劳务名称', 'comment'].forEach(key => {
        const value = safeText(item?.[key]).trim();
        if (value) names.push(value);
    });
    const details = item?.itemsDetail || item?.goodsDetail || item?.detail || item?.details || [];
    if (Array.isArray(details)) {
        details.forEach(row => {
            ['projectName', 'itemName', 'goodsName', 'serviceName', 'name', '项目名称', '货物或应税劳务名称'].forEach(key => {
                const value = safeText(row?.[key]).trim();
                if (value) names.push(value);
            });
        });
    }
    return [...new Set(names.map(name => name.replace(/^[*＊]+|[*＊]+$/g, '').trim()).filter(Boolean))];
}

function normalizeBudgetKeyword(value) {
    return safeText(value).replace(/\s+/g, '').toLowerCase();
}

function scoreOtherExpenseBudgetOption(option, projectNames) {
    const haystack = normalizeBudgetKeyword([option.economicSubject, option.purpose, option.functionSubject].join(' '));
    let score = 0;
    (projectNames && projectNames.length ? projectNames : ['其他']).forEach(project => {
        const keyword = normalizeBudgetKeyword(project);
        if (!keyword) return;
        const purpose = normalizeBudgetKeyword(option.purpose);
        const subject = normalizeBudgetKeyword(option.economicSubject);
        if (/交通补贴|出租车|出租汽车|公务出行/.test(keyword) && /交通补贴/.test(haystack)) score += 100;
        if (haystack.includes(keyword)) score += 12;
        if (purpose && keyword.includes(purpose)) score += 10;
        if (subject && keyword.includes(subject.replace(/^\d+/, ''))) score += 8;
        [...keyword].forEach(ch => {
            if (ch && haystack.includes(ch)) score += 0.2;
        });
    });
    return score;
}

function inferOtherExpenseBudget(projectNames) {
    const ranked = OTHER_EXPENSE_BUDGET_OPTIONS
        .map(option => ({ option, score: scoreOtherExpenseBudgetOption(option, projectNames) }))
        .sort((a, b) => b.score - a.score);
    const matched = ranked.find(item => item.score > 0)?.option
        || OTHER_EXPENSE_BUDGET_OPTIONS.find(option => /其他|办公|委托/.test(`${option.economicSubject}${option.purpose}`))
        || {};
    return {
        economicSubject: matched.economicSubject || '待匹配',
        purpose: matched.purpose || '待匹配',
        matchScore: ranked[0]?.score || 0,
    };
}

function buildOtherExpensePrefillData(ocrItems, successfulUploads) {
    if (hasTrafficSubsidyOcr(ocrItems)) {
        const dedupeResult = dedupeTaxiInvoiceItems(ocrItems);
        const invoices = dedupeResult.invoices;
        const tripTotal = (ocrItems || []).reduce((sum, item) => {
            const type = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
            return type === 'tripDetailList' ? sum + tripDetailListAmount(item) : sum;
        }, 0);
        const totalAmount = Number(money(invoices.length
            ? invoices.reduce((sum, item) => sum + taxiInvoiceAmount(item), 0)
            : tripTotal));
        const projectNames = ['交通补贴', '出租车', '广州出租汽车统一车票'];
        const personName = getTrafficPersonName(ocrItems);
        const record = {
            recordKey: `other-traffic|${Date.now()}`,
            expenseType: 'other',
            scenarioType: 'other',
            reportName: `${personName}交通补贴报销`,
            reason: `根据广州出租汽车统一车票申请交通补贴报销，出租车票去重后合计${money(totalAmount)}元。`,
            totalAmount,
            projectNames,
            economicSubject: '710101022104 交通补贴',
            purpose: '交通补贴',
            invoiceCount: invoices.length,
            invoiceItems: invoices,
            trafficSummary: {
                taxiCount: invoices.length,
                duplicateTaxiInvoiceCount: dedupeResult.duplicateInvoiceCount,
                duplicateTaxiInvoiceNumbers: dedupeResult.duplicateInvoiceNumbers,
                totalTaxiAmount: totalAmount,
            },
        };
        return {
            expenseType: 'other',
            records: totalAmount || invoices.length ? [record] : [],
            summary: {
                recordCount: totalAmount || invoices.length ? 1 : 0,
                invoiceCount: invoices.length,
                duplicateInvoiceCount: dedupeResult.duplicateInvoiceCount,
                duplicateInvoiceNumbers: dedupeResult.duplicateInvoiceNumbers,
                projectCount: projectNames.length,
                totalAll: totalAmount,
                projectNames,
                economicSubject: record.economicSubject,
                purpose: record.purpose,
                trafficSummary: record.trafficSummary,
            },
            sourceStats: {
                ocrItemCount: (ocrItems || []).length,
                invoiceCount: invoices.length,
                taxiInvoiceCount: invoices.length,
                duplicateInvoiceCount: dedupeResult.duplicateInvoiceCount,
                duplicateInvoiceNumbers: dedupeResult.duplicateInvoiceNumbers,
                uploadCount: (successfulUploads || []).length,
            },
            ocrItems,
            auditResult: {
                issues: [],
                summary: duplicateInvoiceHint(dedupeResult) || '已根据出租车票生成交通补贴预填数据。',
                ruleResults: [],
                records: [],
                engine: 'frontend-other-traffic-prefill',
            },
        };
    }
    const dedupeResult = dedupeInvoiceItems(ocrItems);
    const invoices = dedupeResult.invoices;
    const projectNames = [...new Set(invoices.flatMap(collectProjectNamesFromInvoice))];
    const totalAmount = Number(money(invoices.reduce((sum, item) => sum + invoiceAmount(item), 0)));
    const budgetMatch = inferOtherExpenseBudget(projectNames);
    const mainProject = projectNames[0] || '其他事项';
    const reportName = `${mainProject}报销`;
    const reason = projectNames.length
        ? `根据发票项目“${projectNames.join('、')}”申请报销，价税合计共${money(totalAmount)}元。`
        : `根据已识别发票申请报销，价税合计共${money(totalAmount)}元。`;
    const record = {
        recordKey: `other|${Date.now()}`,
        expenseType: 'other',
        reportName,
        reason,
        totalAmount,
        projectNames,
        economicSubject: budgetMatch.economicSubject,
        purpose: budgetMatch.purpose,
        invoiceCount: invoices.length,
        invoiceItems: invoices,
    };
    return {
        expenseType: 'other',
        records: invoices.length ? [record] : [],
        summary: {
            recordCount: invoices.length ? 1 : 0,
            invoiceCount: invoices.length,
            duplicateInvoiceCount: dedupeResult.duplicateInvoiceCount,
            duplicateInvoiceNumbers: dedupeResult.duplicateInvoiceNumbers,
            projectCount: projectNames.length,
            totalAll: totalAmount,
            projectNames,
            economicSubject: budgetMatch.economicSubject,
            purpose: budgetMatch.purpose,
        },
        sourceStats: {
            ocrItemCount: (ocrItems || []).length,
            invoiceCount: invoices.length,
            duplicateInvoiceCount: dedupeResult.duplicateInvoiceCount,
            duplicateInvoiceNumbers: dedupeResult.duplicateInvoiceNumbers,
            uploadCount: (successfulUploads || []).length,
        },
        ocrItems,
        auditResult: {
            issues: [],
            summary: duplicateInvoiceHint(dedupeResult) || '已根据OCR发票项目生成其他事项报销预填数据。',
            ruleResults: [],
            records: [],
            engine: 'frontend-other-expense-prefill',
        },
    };
}

function buildReservedScenarioPrefillData(expenseType, ocrItems = [], successfulUploads = []) {
    const labels = {
        meeting: '会议费报销',
        training: '培训费报销',
        reception: '公务接待费报销',
    };
    return {
        expenseType,
        scenarioType: expenseType,
        scenarioLabel: labels[expenseType] || '预留报销场景',
        placeholder: true,
        records: [],
        itinerary: [],
        summary: {
            message: `${labels[expenseType] || '该'}场景 OCR 已完成，预填归集逻辑暂未接入。`,
            recordCount: 0,
            totalAll: 0,
        },
        sourceStats: {
            ocrItemCount: (ocrItems || []).length,
            uploadCount: successfulUploads.length,
        },
        ocrItems,
        auditResult: {
            issues: [],
            summary: '该场景为预留场景，当前仅展示 OCR 结果。',
            ruleResults: [],
        },
    };
}

function inferPageAttachmentType(fileState) {
    const groups = getOcrModelItemGroups(fileState);
    if (groups.length && groups.every(group => group.length === 1 && isInvoiceOcrItem(group[0]))) {
        return '发票（含电子发票）';
    }
    return '其他';
}

async function buildPageAttachmentPayloads() {
    const payloads = [];
    for (const fileState of selectedFiles) {
        if (!fileState.file) continue;
        // eslint-disable-next-line no-await-in-loop
        const base64 = await fileToBase64(fileState.file);
        payloads.push({
            fileId: fileState.id,
            fileName: fileState.name,
            mimeType: fileState.file.type || 'application/octet-stream',
            size: fileState.size,
            attachmentType: inferPageAttachmentType(fileState),
            base64,
        });
    }
    return payloads;
}

function attachmentStatusText(result) {
    if (!result) return '';
    if (result.success) {
        return result.uploaded ? `，已同步上传 ${result.uploaded} 个附件` : '，附件无需重复上传';
    }
    return `，附件同步未完成：${result.message || '未知原因'}`;
}

async function fillCurrentPage() {
    if (preAuditData?.dataSource === 'pageExtract' || dataSourceMode === 'page') {
        showStatus('当前为页面提取审核模式，只展示指标命中，不执行一键填写。', 'warning');
        return;
    }
    syncRecordEditorsFromDom();
    const records = preAuditData?.records || [];
    if (!records.length) {
        showStatus('暂无可填写的预填明细。', 'warning');
        return;
    }
    $('#fillBtn').disabled = true;
    showStatus('正在准备附件并填写当前网页报销信息...', 'info');
    try {
        const pageAttachments = await buildPageAttachmentPayloads();
        const action = preAuditData?.expenseType === 'other' ? 'fillOtherPrefillData' : 'fillTravelPrefillRecords';
        const response = await sendMessageToActiveTab({
            action,
            records,
            preAuditData,
            attachments: pageAttachments,
        });
        if (!response || !response.success) {
            throw new Error(response?.error || '网页填写失败，请确认当前页面类型与OCR识别结果一致。');
        }
        const attachmentText = attachmentStatusText(response.attachmentResult);
        const label = preAuditData?.expenseType === 'other' ? '其他事项报销信息' : `${response.filledCount} 条报销明细`;
        showStatus(`已预填 ${label}${attachmentText}。`, response.attachmentResult?.success === false ? 'warning' : 'success');
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        renderActions();
    }
}

function buildRefinePrefillPayload() {
    syncRecordEditorsFromDom();
    const ocrItems = buildOcrRefineItems();
    return {
        caseId: preAuditData?.caseId || currentCaseId || '',
        expenseType: preAuditData?.expenseType || 'travel',
        scenarioType: preAuditData?.scenarioType || preAuditData?.expenseType || 'travel',
        records: (preAuditData?.records || []).map(buildEditableRefineRecord),
        itinerary: [],
        summary: preAuditData?.summary || {},
        sourceStats: preAuditData?.sourceStats || {},
        ocrItems,
        ocrStats: {
            total: Array.isArray(preAuditData?.ocrItems) ? preAuditData.ocrItems.length : ocrItems.length,
            sent: ocrItems.length,
            truncated: Array.isArray(preAuditData?.ocrItems) && preAuditData.ocrItems.length > ocrItems.length,
        },
    };
}

function buildEditableRefineRecord(record = {}, index = 0) {
    const transportAmount = moneyNumber(record.transportAmount);
    const hotelAmount = moneyNumber(record.hotelAmount);
    const mealAmount = moneyNumber(numberValue(record.mealDays) * numberValue(record.mealStandard));
    const localStandardValue = defaultWhenBlank(record.localTransportStandard, 80);
    const localTransportAmount = moneyNumber(numberValue(record.localTransportDays) * numberValue(localStandardValue));
    const otherAmount = moneyNumber(record.otherAmount);
    return {
        recordKey: record.recordKey || `record-${index + 1}`,
        recordIndex: record.recordIndex ?? index,
        name: record.name || '',
        rank: record.rank || '',
        startTime: record.startTime || '',
        endTime: record.endTime || '',
        startPeriod: record.startPeriod || '',
        endPeriod: record.endPeriod || '',
        startAddress: record.startAddress || '',
        endAddress: record.endAddress || '',
        transportType: record.transportType || '其它',
        transportDocs: numberValue(record.transportDocs),
        transportAmount,
        hotelDays: numberValue(record.hotelDays),
        hotelDocs: numberValue(record.hotelDocs),
        hotelAmount,
        hotelStandard: moneyNumber(record.hotelStandard),
        mealDays: numberValue(record.mealDays),
        mealStandard: moneyNumber(record.mealStandard),
        mealAmount,
        localTransportDays: numberValue(record.localTransportDays),
        localTransportStandard: moneyNumber(localStandardValue),
        localTransportAmount,
        otherAmount,
        totalAmount: moneyNumber(transportAmount + hotelAmount + mealAmount + localTransportAmount + otherAmount),
        reason: record.reason || '',
        remark: record.remark || '',
        evidence: buildRecordEvidence(record),
    };
}

function setObjectPathValue(target, path, value) {
    if (!target || typeof target !== 'object' || !path) return false;
    const parts = String(path).split('.').map(item => item.trim()).filter(Boolean);
    if (!parts.length) return false;
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
    return true;
}

function deleteObjectPathValue(target, path) {
    if (!target || typeof target !== 'object' || !path) return false;
    const parts = String(path).split('.').map(item => item.trim()).filter(Boolean);
    if (!parts.length) return false;
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        cursor = cursor?.[parts[i]];
        if (!cursor || typeof cursor !== 'object') return false;
    }
    delete cursor[parts[parts.length - 1]];
    return true;
}

function ocrOperationTargets(items, operation = {}) {
    const key = safeText(operation.ocrKey || operation.itemKey || operation.key);
    const indexValue = operation.ocrIndex ?? operation.index;
    const fileName = safeText(operation.sourceFileName || operation.fileName);
    const recognizeType = safeText(operation.recognizeType || operation.docType || operation.type);
    if (operation.scope === 'all') return items.map((item, index) => ({ item, index }));
    return items
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => {
            if (key && safeText(item.ocrKey) !== key) return false;
            if (indexValue !== undefined && indexValue !== null && Number(indexValue) !== index && Number(indexValue) !== Number(item.ocrIndex)) return false;
            if (fileName && ![item.sourceFileName, item.fileName].some(value => safeText(value).includes(fileName) || fileName.includes(safeText(value)))) return false;
            if (recognizeType && safeText(item.recognizeType || item.docType || item.type) !== recognizeType) return false;
            return Boolean(key || indexValue !== undefined || fileName || recognizeType);
        });
}

function applyOcrOperationsToLocal(items = [], operations = []) {
    if (!Array.isArray(operations) || !operations.length) return items;
    const nextItems = ensureOcrKeys([...(items || [])].map(item => (item && typeof item === 'object' ? { ...item } : item)));
    operations.forEach(operation => {
        if (!operation || typeof operation !== 'object') return;
        const op = safeText(operation.op || operation.action || 'update').toLowerCase();
        if (/add|insert|create|新增|增加/.test(op)) {
            const newItem = { ...(operation.item || operation.record || operation.fields || {}) };
            newItem.ocrKey = newItem.ocrKey || `ocr-ai-${Date.now()}-${nextItems.length + 1}`;
            newItem.ocrIndex = nextItems.length;
            nextItems.push(newItem);
            return;
        }
        const targets = ocrOperationTargets(nextItems, operation);
        if (!targets.length) return;
        if (/delete|remove|del|删除/.test(op)) {
            targets.map(target => target.index).sort((a, b) => b - a).forEach(index => nextItems.splice(index, 1));
            ensureOcrKeys(nextItems);
            return;
        }
        const fields = operation.fields && typeof operation.fields === 'object' ? operation.fields : {};
        if (/clear|empty|reset|清空/.test(op)) {
            const fieldList = Array.isArray(operation.fields) ? operation.fields : Object.keys(fields);
            targets.forEach(({ item }) => fieldList.forEach(field => deleteObjectPathValue(item, field)));
            return;
        }
        targets.forEach(({ item }) => {
            Object.entries(fields).forEach(([field, value]) => {
                if (/base64|fileContent|image|binary|buffer|bytes/i.test(field)) return;
                setObjectPathValue(item, field, value);
            });
        });
    });
    ensureOcrKeys(nextItems);
    return nextItems;
}

async function refinePrefillDataByAi() {
    const instruction = ($('#aiInstruction')?.value || '').trim();
    if (!instruction) {
        showStatus('请输入需要 AI 处理的问题或调整要求。', 'warning');
        return;
    }
    isRefining = true;
    renderActions();
    showStatus('正在处理智能问答/调整请求...', 'info');
    try {
        const response = await fetch(REFINE_PREFILL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instruction,
                prefillData: buildRefinePrefillPayload(),
            }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'AI智能调整接口调用失败');
        }
        const data = payload.data || {};
        const responseType = data.responseType === 'answer' ? 'answer' : 'adjust';
        const previousData = preAuditData || {
            expenseType: data.expenseType || 'travel',
            records: [],
            itinerary: [],
            summary: {},
            sourceStats: {},
            ocrItems: [],
            auditResult: {},
        };
        const shouldApplyData = responseType !== 'answer';
        const ocrOperations = Array.isArray(data.ocrOperations)
            ? data.ocrOperations
            : (data.ocrOperations ? [data.ocrOperations] : []);
        const previousOcrItems = Array.isArray(previousData.ocrItems) ? previousData.ocrItems : [];
        const nextOcrItems = shouldApplyData
            ? applyOcrOperationsToLocal(previousOcrItems, ocrOperations)
            : previousOcrItems;
        preAuditData = {
            ...previousData,
            caseId: data.caseId || previousData.caseId || currentCaseId || '',
            records: shouldApplyData ? (data.records || previousData.records || []) : (previousData.records || []),
            itinerary: shouldApplyData ? (data.itinerary || previousData.itinerary || []) : (previousData.itinerary || []),
            summary: shouldApplyData ? (data.summary || previousData.summary || {}) : (previousData.summary || {}),
            sourceStats: shouldApplyData && data.sourceStats && Object.keys(data.sourceStats).length ? data.sourceStats : (previousData.sourceStats || {}),
            ocrItems: shouldApplyData && ocrOperations.length ? nextOcrItems : previousOcrItems,
            auditResult: shouldApplyData ? (data.auditResult || previousData.auditResult || {}) : (previousData.auditResult || {}),
            aiRefine: {
                instruction,
                responseType,
                answer: data.answer || '',
                changeLog: data.changeLog || [],
                ocrOperations,
                aiModel: data.aiModel || 'qwen3-32b',
                engine: data.engine || '',
                refinedAt: data.refinedAt || new Date().toISOString(),
            },
        };
        if (preAuditData.caseId) currentCaseId = preAuditData.caseId;
        showStatus(responseType === 'answer' ? 'AI已完成回答。' : 'AI已按要求调整预填数据，请核对后再一键预填。', 'success');
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        isRefining = false;
        renderAll();
    }
}

function sendMessageToActiveTab(message) {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab || !tab.id) {
                resolve(null);
                return;
            }
            chrome.tabs.sendMessage(tab.id, message, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
        });
    });
}

function renderAll() {
    if (preAuditData?.expenseType === 'travel') recomputeTravelSummary();
    renderActions();
    renderFileList();
    renderSummary();
    renderAiRefineStatus();
    updateTravelOnlyPanelsVisibility();
    renderItinerary();
    renderRecords();
    renderRules();
    renderOcrData();
    updateProgress();
    refreshWorkspaceNavigation();
}

function initWorkspaceNavigation() {
    document.querySelectorAll('[data-view-target]').forEach(button => {
        button.addEventListener('click', () => switchWorkspaceView(button.dataset.viewTarget));
    });
    switchWorkspaceView(activeWorkspaceView, { force: true });
}

function showUploadHome() {
    isDashboardVisible = false;
    const uploadHome = $('#uploadHome');
    const dashboard = $('#dashboardShell');
    if (uploadHome) uploadHome.classList.remove('is-hidden');
    if (dashboard) dashboard.classList.add('is-hidden');
    activeWorkspaceView = 'summaryPanel';
}

function showDashboard(viewId = 'summaryPanel') {
    isDashboardVisible = true;
    const uploadHome = $('#uploadHome');
    const dashboard = $('#dashboardShell');
    if (uploadHome) uploadHome.classList.add('is-hidden');
    if (dashboard) dashboard.classList.remove('is-hidden');
    switchWorkspaceView(viewId, { force: true });
    refreshWorkspaceNavigation();
}

function isPageAuditMode() {
    return dataSourceMode === 'page' || preAuditData?.dataSource === 'pageExtract';
}

function isWorkspaceViewAvailable(viewId) {
    const section = document.getElementById(viewId);
    return !!section && section.style.display !== 'none';
}

function chooseWorkspaceFallback() {
    if (preAuditData?.summary) return 'summaryPanel';
    if (preAuditData?.expenseType === 'travel' && isWorkspaceViewAvailable('itineraryPanel')) return 'itineraryPanel';
    if ((preAuditData?.records || []).length && isWorkspaceViewAvailable('recordsPanel')) return 'recordsPanel';
    return 'summaryPanel';
}

function switchWorkspaceView(viewId, options = {}) {
    const target = document.getElementById(viewId);
    if (!target) return;
    if (!options.force && !isWorkspaceViewAvailable(viewId)) return;
    activeWorkspaceView = viewId;
    document.querySelectorAll('[data-nav-section]').forEach(section => {
        section.classList.toggle('active', section.id === viewId);
    });
    document.querySelectorAll('[data-view-target]').forEach(button => {
        button.classList.toggle('active', button.dataset.viewTarget === viewId);
        button.classList.toggle('view-active', button.dataset.viewTarget === viewId);
    });
    const title = $('#workspaceTitle');
    const subtitle = $('#workspaceSubtitle');
    if (title) title.textContent = target.dataset.title || '智能预填预审';
    if (subtitle) subtitle.textContent = target.dataset.subtitle || '';
}

function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
}

function refreshWorkspaceNavigation() {
    updateWorkspaceModeLabels();
    if (!isDashboardVisible) {
        setText('#navSummaryBadge', preAuditData?.summary ? String(preAuditData?.summary?.recordCount || (preAuditData?.records || []).length || 1) : '0');
        setText('#navItineraryBadge', String((preAuditData?.itinerary || []).length || 0));
        setText('#navRecordBadge', String((preAuditData?.records || []).length || 0));
        setText('#navRuleBadge', String((preAuditData?.auditResult?.issues || []).length || (preAuditData?.auditResult?.ruleResults || []).length || 0));
        setText('#navOcrBadge', String((preAuditData?.ocrItems || []).length || 0));
        return;
    }
    if (!isWorkspaceViewAvailable(activeWorkspaceView)) {
        switchWorkspaceView(chooseWorkspaceFallback(), { force: true });
    } else {
        switchWorkspaceView(activeWorkspaceView, { force: true });
    }
    setText('#navSummaryBadge', preAuditData?.summary ? String(preAuditData?.summary?.recordCount || (preAuditData?.records || []).length || 1) : '0');
    setText('#navItineraryBadge', String((preAuditData?.itinerary || []).length || 0));
    setText('#navRecordBadge', String((preAuditData?.records || []).length || 0));
    setText('#navRuleBadge', String((preAuditData?.auditResult?.issues || []).length || (preAuditData?.auditResult?.ruleResults || []).length || 0));
    setText('#navOcrBadge', String((preAuditData?.ocrItems || []).length || 0));
    document.querySelectorAll('[data-view-target]').forEach(button => {
        const target = button.dataset.viewTarget;
        if (!target) return;
        const available = isWorkspaceViewAvailable(target);
        button.disabled = !available;
        button.style.display = available ? '' : 'none';
    });
}

function updateWorkspaceModeLabels() {
    const auditMode = isPageAuditMode();
    const otherAuditMode = auditMode && preAuditData?.expenseType === 'other';
    const labels = otherAuditMode
        ? {
            summaryPanel: '报销金额比对',
            itineraryPanel: '行程确认',
            recordsPanel: '收款人信息比对',
            rulesPanel: '指标命中',
            ocrPanel: 'OCR结果',
        }
        : (auditMode
        ? {
            summaryPanel: '审核概览',
            itineraryPanel: '行程确认',
            recordsPanel: '人员核验',
            rulesPanel: '指标命中',
            ocrPanel: '附件识别',
        }
        : {
            summaryPanel: '预填汇总',
            itineraryPanel: '行程确认',
            recordsPanel: '报销明细',
            rulesPanel: '指标命中',
            ocrPanel: 'OCR结果',
        });
    Object.entries(labels).forEach(([target, label]) => {
        document.querySelectorAll(`[data-view-target="${target}"] .nav-text`).forEach(node => { node.textContent = label; });
        document.querySelectorAll(`button[data-view-target="${target}"]`).forEach(node => {
            if (!node.querySelector('.nav-text')) node.textContent = label.replace('确认', '页').replace('明细', '页');
        });
    });
    const recordsPanel = $('#recordsPanel');
    const summaryPanel = $('#summaryPanel');
    const ocrPanel = $('#ocrPanel');
    if (summaryPanel) {
        summaryPanel.dataset.title = otherAuditMode ? '报销金额比对' : (auditMode ? '审核概览' : '预填汇总');
        summaryPanel.dataset.subtitle = otherAuditMode ? '比对页面填报金额与附件发票价税合计，定位差额来源。' : (auditMode ? '先看当前页面金额、附件识别和指标命中概况，再进入人员核验。' : '先看总体金额和归集结果，再进入行程或明细逐项核对。');
    }
    const summaryHeading = $('#summaryPanelHeading');
    if (summaryHeading) summaryHeading.textContent = otherAuditMode ? '报销金额比对' : (auditMode ? '审核概览' : '预填汇总');
    if (recordsPanel) {
        recordsPanel.dataset.title = otherAuditMode ? '收款人信息比对' : (auditMode ? '人员核验' : '报销明细');
        recordsPanel.dataset.subtitle = otherAuditMode ? '按收款人名称和金额匹配发票销售方，提示未匹配或疑似不一致项目。' : (auditMode ? '按人展示页面填报数据、附件匹配明细和审核结论。' : '按财务系统字段顺序核对可编辑内容，伙食补助和市内交通金额自动计算。');
    }
    const recordsHeading = $('#recordsPanelHeading');
    if (recordsHeading) recordsHeading.textContent = otherAuditMode ? '收款人信息比对' : (auditMode ? '人员核验与审核结论' : '报销明细');
    const rulesHeading = $('#rulesPanelHeading');
    if (rulesHeading) rulesHeading.textContent = auditMode ? '指标命中情况' : '全部指标执行情况';
    if (ocrPanel) {
        ocrPanel.dataset.title = otherAuditMode ? 'OCR结果' : (auditMode ? '附件识别' : 'OCR结果');
        ocrPanel.dataset.subtitle = auditMode ? '按附件查看 OCR 识别结果并打开原件核对。' : '按附件查看 OCR 结构化数据，便于测试时核验模型返回。';
    }
    const ocrHeading = $('#ocrPanelHeading');
    if (ocrHeading) ocrHeading.textContent = otherAuditMode ? 'OCR结果' : (auditMode ? '附件识别结果' : 'OCR结构化数据');
    const nextBox = document.querySelector('.next-box');
    if (nextBox) nextBox.style.display = auditMode ? 'none' : '';
}

function updateTravelOnlyPanelsVisibility() {
    const showTravelPanels = preAuditData?.expenseType === 'travel';
    const auditMode = isPageAuditMode();
    const hasRules = !!(preAuditData?.auditResult && (
        (preAuditData.auditResult.issues || []).length
        || (preAuditData.auditResult.ruleResults || []).length
        || preAuditData.dataSource === 'pageExtract'
    ));
    const itineraryPanel = $('#itineraryPanel');
    const recordsPanel = $('#recordsPanel');
    const rulesPanel = $('#rulesPanel');
    if (itineraryPanel) itineraryPanel.style.display = showTravelPanels && !auditMode ? '' : 'none';
    if (recordsPanel) recordsPanel.style.display = (showTravelPanels || preAuditData?.expenseType === 'other') ? '' : 'none';
    if (rulesPanel) rulesPanel.style.display = auditMode && preAuditData?.expenseType === 'other' ? 'none' : (hasRules || auditMode ? '' : 'none');
}

function numberValue(value) {
    const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
}

function defaultWhenBlank(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : value;
}

const TRAVEL_NUMERIC_FIELDS = new Set([
    'transportDocs', 'transportAmount',
    'hotelDays', 'hotelDocs', 'hotelAmount', 'hotelStandard',
    'mealDays', 'mealStandard', 'mealAmount',
    'localTransportDays', 'localTransportStandard', 'localTransportAmount',
    'otherAmount', 'totalAmount',
]);

function moneyNumber(value) {
    const n = Number(numberValue(value));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeTravelRecordAliases(record = {}) {
    if (record.transportAmount === undefined || record.transportAmount === null || record.transportAmount === '') {
        record.transportAmount = record.trafficAmount || 0;
    }
    if (record.transportType === undefined || record.transportType === null || record.transportType === '') {
        record.transportType = record.transportTool || '其它';
    }
    if (record.hotelDocs === undefined || record.hotelDocs === null || record.hotelDocs === '') {
        record.hotelDocs = record.hotelInvoiceCount || 0;
    }
    if (record.localTransportDays === undefined || record.localTransportDays === null || record.localTransportDays === '') {
        record.localTransportDays = record.localTrafficDays || 0;
    }
    if (record.localTransportStandard === undefined || record.localTransportStandard === null || record.localTransportStandard === '') {
        record.localTransportStandard = record.localTrafficStandard || 80;
    }
    if (record.localTransportAmount === undefined || record.localTransportAmount === null || record.localTransportAmount === '') {
        record.localTransportAmount = record.localTrafficAmount || 0;
    }
    return record;
}

function recomputeTravelRecord(record = {}) {
    normalizeTravelRecordAliases(record);
    record.mealPersons = record.name ? 1 : 0;
    record.localTransportPersons = record.name ? 1 : 0;
    if (record.startPeriod || record.endPeriod) {
        record.mealDays = mealAllowanceDaysFromPeriods(record.startTime, record.endTime, record.startPeriod, record.endPeriod) || record.mealDays;
    }
    record.mealAmount = moneyNumber(numberValue(record.mealDays) * numberValue(record.mealStandard));
    record.localTransportStandard = moneyNumber(defaultWhenBlank(record.localTransportStandard, 80));
    record.localTransportAmount = moneyNumber(numberValue(record.localTransportDays) * numberValue(record.localTransportStandard));
    if (!numberValue(record.transportAmount)) record.transportType = '其它';
    record.totalAmount = moneyNumber(
        numberValue(record.transportAmount)
        + numberValue(record.hotelAmount)
        + numberValue(record.mealAmount)
        + numberValue(record.localTransportAmount)
        + numberValue(record.otherAmount)
    );
    return record;
}

function recomputeTravelSummary() {
    if (!preAuditData || preAuditData.expenseType !== 'travel') return;
    const records = preAuditData.records || [];
    records.forEach(recomputeTravelRecord);
    const summary = { ...(preAuditData.summary || {}) };
    summary.recordCount = records.length;
    summary.personCount = new Set(records.map(item => item.name).filter(Boolean)).size;
    summary.transportAmountTotal = moneyNumber(records.reduce((sum, item) => sum + numberValue(item.transportAmount), 0));
    summary.hotelAmountTotal = moneyNumber(records.reduce((sum, item) => sum + numberValue(item.hotelAmount), 0));
    summary.mealAmountTotal = moneyNumber(records.reduce((sum, item) => sum + numberValue(item.mealAmount), 0));
    summary.localTransportAmountTotal = moneyNumber(records.reduce((sum, item) => sum + numberValue(item.localTransportAmount), 0));
    summary.otherAmountTotal = moneyNumber(records.reduce((sum, item) => sum + numberValue(item.otherAmount), 0));
    summary.totalAll = moneyNumber(
        summary.transportAmountTotal
        + summary.hotelAmountTotal
        + summary.mealAmountTotal
        + summary.localTransportAmountTotal
        + summary.otherAmountTotal
    );
    preAuditData.summary = summary;
    preAuditData.itinerary = buildFrontendTravelItinerary(records);
}

function parseDateOnlyForDays(value) {
    const text = String(value || '').replace(/[年月./]/g, '-').replace(/日/g, '');
    const match = text.match(/(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}

function inclusiveDays(startValue, endValue) {
    const start = parseDateOnlyForDays(startValue);
    const end = parseDateOnlyForDays(endValue);
    if (!start || !end) return 0;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function normalizeHalfDayPeriod(value = '') {
    const text = safeText(value).replace(/\s+/g, '');
    if (/全天|整天|全日/.test(text)) return '全天';
    if (/上午|上半天/.test(text)) return '上午';
    if (/下午|下半天/.test(text)) return '下午';
    if (/半天/.test(text)) return '半天';
    return '';
}

function mealAllowanceDaysFromPeriods(startValue, endValue, startPeriod = '', endPeriod = '') {
    const baseDays = inclusiveDays(startValue, endValue);
    if (!baseDays) return 0;
    const start = normalizeHalfDayPeriod(startPeriod);
    const end = normalizeHalfDayPeriod(endPeriod);
    if (baseDays === 1 && (start === '上午' || start === '下午' || start === '半天' || end === '上午' || end === '下午' || end === '半天')) {
        if (start === '全天' || end === '全天') return 1;
        return 0.5;
    }
    let days = baseDays;
    if (start === '下午' || start === '半天') days -= 0.5;
    if (end === '上午' || end === '半天') days -= 0.5;
    return Math.max(0.5, days);
}

function buildFrontendTravelItinerary(records = []) {
    return records.map((record, index) => ({
        recordKey: record.recordKey || recordAuditKey(record, index),
        person: record.name || '',
        startTime: record.startTime || '',
        endTime: record.endTime || '',
        startPeriod: record.startPeriod || '',
        endPeriod: record.endPeriod || '',
        startAddress: record.startAddress || '',
        destination: record.endAddress || '',
        routeText: [record.startAddress, record.endAddress].filter(Boolean).join('-'),
        tripDays: record.tripDays || inclusiveDays(record.startTime, record.endTime) || record.localTransportDays || record.mealDays || 0,
        transportType: record.transportType || '',
        transportAmount: record.transportAmount || 0,
        hotelDays: record.hotelDays || 0,
        hotelDocs: record.hotelDocs || 0,
        hotelAmount: record.hotelAmount || 0,
        hotelStandard: record.hotelStandard || 0,
        mealDays: record.mealDays || 0,
        mealStandard: record.mealStandard || 0,
        mealAmount: record.mealAmount || 0,
        localTransportDays: record.localTransportDays || 0,
        localTransportStandard: defaultWhenBlank(record.localTransportStandard, 80),
        localTransportAmount: record.localTransportAmount || 0,
        otherAmount: record.otherAmount || 0,
        sourceRecord: record,
    }));
}

function refreshComputedRecordOutputs(index) {
    const record = preAuditData?.records?.[index];
    if (!record) return;
    document.querySelectorAll(`[data-computed-record="${index}"][data-computed-field]`).forEach(node => {
        const fieldName = node.dataset.computedField;
        node.textContent = money(record[fieldName]);
    });
}

function updateRecordFromEditor(target) {
    if (!target?.classList?.contains('record-edit-control')) return false;
    if (!preAuditData || preAuditData.expenseType !== 'travel') return false;
    const index = Number(target.dataset.recordIndex);
    const fieldName = target.dataset.field;
    const record = preAuditData.records?.[index];
    if (!record || !fieldName) return false;
    record[fieldName] = TRAVEL_NUMERIC_FIELDS.has(fieldName) ? moneyNumber(target.value) : target.value.trim();
    recomputeTravelRecord(record);
    return true;
}

function handleRecordEditorInput(event) {
    if (!updateRecordFromEditor(event.target)) return;
    const index = Number(event.target.dataset.recordIndex);
    refreshComputedRecordOutputs(index);
    recomputeTravelSummary();
    renderSummary();
    renderItinerary();
}

function syncRecordEditorsFromDom() {
    document.querySelectorAll('.record-edit-control[data-record-index][data-field]').forEach(updateRecordFromEditor);
    recomputeTravelSummary();
}

function renderActions() {
    const isPageMode = dataSourceMode === 'page' || preAuditData?.dataSource === 'pageExtract';
    const startBtn = $('#startBtn');
    const extractPageBtn = $('#extractPageBtn');
    const fillBtn = $('#fillBtn');
    const aiRefineBtn = $('#aiRefineBtn');
    if (startBtn) startBtn.disabled = isRunning || !selectedFiles.length;
    if (extractPageBtn) extractPageBtn.disabled = isRunning;
    if (fillBtn) {
        fillBtn.classList.toggle('is-hidden', isPageMode);
        fillBtn.disabled = isPageMode || isRunning || isRefining || !(preAuditData?.records || []).length;
    }
    if (aiRefineBtn) aiRefineBtn.disabled = isRunning || isRefining;
    updateSourceModeUi();
}

function renderFileList() {
    const container = $('#fileList');
    $('#fileStats').textContent = `${selectedFiles.length} 个文件`;
    if (!selectedFiles.length) {
        container.innerHTML = '<div class="empty">暂无文件</div>';
        return;
    }
    container.innerHTML = selectedFiles.map(file => `
        <div class="file-card">
            <div class="file-card-title">${renderFilePreviewLink(file)}</div>
            <div class="file-card-meta">
                <span class="muted">${formatSize(file.size)}</span>
                <span class="badge ${badgeClass(file.status)}">${escapeHtml(file.message || statusText(file.status))}</span>
            </div>
        </div>
    `).join('');
}

function renderFilePreviewLink(file) {
    const fileName = file?.name || '附件';
    const label = escapeHtml(shortName(fileName, 42));
    if (!file?.previewUrl) return label;
    const title = escapeHtml(`打开附件：${fileName}`);
    return `<a class="file-link" href="${escapeHtml(file.previewUrl)}" target="_blank" rel="noopener noreferrer" title="${title}">${label}</a>`;
}

function renderSummary() {
    const container = $('#summaryBody');
    const summary = preAuditData?.summary;
    const stats = preAuditData?.sourceStats;
    $('#sourceStats').textContent = stats
        ? (preAuditData?.expenseType === 'other'
            ? `OCR项 ${stats.ocrItemCount || 0}，发票 ${stats.invoiceCount || 0}${stats.duplicateInvoiceCount ? `，重复 ${stats.duplicateInvoiceCount}` : ''}，附件 ${stats.uploadCount || selectedFiles.length || 0}`
            : (preAuditData?.expenseType === 'meeting'
                ? `OCR项 ${stats.ocrItemCount || 0}，发票 ${stats.invoiceCount || 0}，附件 ${stats.uploadCount || selectedFiles.length || 0}`
                : `OCR项 ${stats.ocrItemCount || 0}，审批单 ${stats.travelRequestCount || 0}，票据 ${stats.ticketCount || stats.invoiceCount || 0}`))
        : '';
    if (!summary) {
        container.innerHTML = '<div class="empty">等待 OCR 返回数据</div>';
        return;
    }
    if (isPageAuditMode()) {
        if (preAuditData?.expenseType === 'meeting') {
            const auditResult = preAuditData?.auditResult || {};
            const issues = auditResult.issues || [];
            container.innerHTML = renderMeetingSummaryMetrics(summary, issues);
            return;
        }
        if (preAuditData?.expenseType === 'other') {
            container.innerHTML = renderOtherAmountComparison();
            return;
        }
        const auditResult = preAuditData?.auditResult || {};
        const issues = auditResult.issues || [];
        const redCount = issues.filter(issue => issueClass(issue) === 'error').length;
        const pageAmount = numberValue(preAuditData?.pageExtractData?.pageAmount);
        const paymentCount = (preAuditData?.pageExtractData?.payments || []).length;
        container.innerHTML = `
            <div class="metric-grid">
                ${metric('审核场景', preAuditData?.expenseType === 'travel' ? '差旅费报销' : '其他事项报销')}
                ${metric('页面金额', pageAmount ? `${money(pageAmount)} 元` : `${money(summary.totalAll || 0)} 元`)}
                ${metric('附件数量', preAuditData?.sourceStats?.pageAttachmentCount || preAuditData?.sourceStats?.uploadCount || selectedFiles.length || 0)}
                ${metric('OCR可用项', preAuditData?.sourceStats?.ocrItemCount || (preAuditData?.ocrItems || []).length || 0)}
                ${metric('指标提示', issues.length)}
                ${metric('标红提示', redCount)}
                ${metric('收款记录', paymentCount)}
            </div>
        `;
        return;
    }
    if (preAuditData?.placeholder) {
        container.innerHTML = `
            <div class="empty">${escapeHtml(summary.message || '该场景 OCR 已完成，预填归集逻辑暂未接入。')}</div>
            <div class="metric-grid">
                ${metric('OCR项', preAuditData?.sourceStats?.ocrItemCount || 0)}
                ${metric('附件数量', preAuditData?.sourceStats?.uploadCount || selectedFiles.length || 0)}
                ${metric('预填记录', 0)}
                ${metric('金额合计', money(0))}
            </div>
        `;
        return;
    }
    if (preAuditData?.expenseType === 'other') {
        const duplicateHint = summary.duplicateInvoiceCount ? duplicateInvoiceHint(summary) : '';
        container.innerHTML = `
            <div class="metric-grid">
                ${metric('经济科目', summary.economicSubject || (preAuditData.records || [])[0]?.economicSubject || '-')}
                ${metric('用途明细', summary.purpose || (preAuditData.records || [])[0]?.purpose || '-')}
                ${metric('发票数量', summary.invoiceCount || 0)}
                ${metric('金额合计', money(summary.totalAll))}
            </div>
            ${duplicateHint ? `<div class="issue warning">${escapeHtml(duplicateHint)}，重复发票未计入合计。</div>` : ''}
        `;
        return;
    }
    if (preAuditData?.expenseType === 'meeting') {
        container.innerHTML = renderMeetingSummaryMetrics(summary, preAuditData?.auditResult?.issues || []);
        return;
    }
    container.innerHTML = `
        <div class="metric-grid">
            ${metric('预填记录', summary.recordCount || 0)}
            ${metric('报销人员', summary.personCount || 0)}
            ${metric('城际交通费', money(summary.transportAmountTotal))}
            ${metric('住宿费', money(summary.hotelAmountTotal))}
            ${metric('伙食补助费', money(summary.mealAmountTotal))}
            ${metric('市内交通费', money(summary.localTransportAmountTotal))}
            ${metric('合计金额', money(summary.totalAll))}
        </div>
    `;
}

function renderMeetingSummaryMetrics(summary = {}, issues = []) {
    return `
        <div class="metric-grid">
            ${metric('会议名称', summary.meetingName || '-')}
            ${metric('会议时间', [summary.startDate, summary.endDate].filter(Boolean).join(' 至 ') || summary.meetingDate || '-')}
            ${metric('会议地点', summary.meetingLocation || '-')}
            ${metric('会议天数', summary.meetingDays || 0)}
            ${metric('参会人数', summary.attendeeCount || 0)}
            ${metric('发票金额', `${money(summary.invoiceAmount || 0)} 元`)}
            ${metric('金额合计', `${money(summary.totalAmount || summary.totalAll || 0)} 元`)}
            ${metric('指标提示', issues.length)}
        </div>
    `;
}

function renderAiRefineStatus() {
    const stats = $('#aiRefineStats');
    const result = $('#aiRefineResult');
    if (!stats || !result) return;
    const hasRecords = (preAuditData?.records || []).length > 0;
    stats.textContent = isRefining ? '正在处理...' : (hasRecords ? '可查询、解释或调整当前预填结果' : '可先咨询问题，上传识别后可结合数据分析');
    const refine = preAuditData?.aiRefine;
    if (!refine) {
        result.style.display = 'none';
        result.innerHTML = '';
        return;
    }
    result.style.display = '';
    const isAnswer = refine.responseType === 'answer';
    result.className = `ai-result ${isAnswer ? 'answer' : 'adjust'}`;
    const logs = (refine.changeLog || []).map(item => `<div>${escapeHtml(item)}</div>`).join('');
    const answer = refine.answer ? `<div class="ai-answer">${escapeHtml(refine.answer).replace(/\n/g, '<br>')}</div>` : '';
    const ocrNote = (refine.ocrOperations || []).length ? `<div>已同步处理 ${(refine.ocrOperations || []).length} 项 OCR 数据补丁。</div>` : '';
    const modelText = refine.aiModel || 'qwen3-32b';
    result.innerHTML = `
        <div><strong>${escapeHtml(modelText)}</strong> ${isAnswer ? '回答' : '已处理'}：${escapeHtml(refine.instruction || '')}</div>
        ${answer}
        ${logs || ocrNote ? `<div class="ai-change-log">${logs}${ocrNote}</div>` : (isAnswer ? '' : '<div class="ai-change-log">已完成调整。</div>')}
    `;
}

function formatPeriod(value = '') {
    return safeText(value).replace(/\s+/g, '');
}

function formatDateWithPeriod(dateValue = '', period = '') {
    const text = safeText(dateValue) || '-';
    const suffix = formatPeriod(period);
    return suffix ? `${text}${suffix}` : text;
}

function formatTravelRange(row = {}) {
    const start = formatDateWithPeriod(row.startTime, row.startPeriod);
    const end = formatDateWithPeriod(row.endTime, row.endPeriod);
    return start === end ? start : `${start} 至 ${end}`;
}

function issueStatusForIssues(issues = []) {
    if (!issues.length) return 'pass';
    return issues.some(issue => issueClass(issue) === 'error') ? 'error' : 'warning';
}

function issueStatusLabel(status) {
    if (status === 'error') return '需重点核对';
    if (status === 'warning') return '有提示';
    return '未命中';
}

function issueCountBadges(issues = []) {
    const redCount = issues.filter(issue => issueClass(issue) === 'error').length;
    const yellowCount = Math.max(0, issues.length - redCount);
    if (!redCount && !yellowCount) return '<span class="badge success">未命中</span>';
    return `
        <span class="issue-counts">
            ${yellowCount ? `<span class="badge pending">黄 ${yellowCount}</span>` : ''}
            ${redCount ? `<span class="badge failed">红 ${redCount}</span>` : ''}
        </span>
    `;
}

function dateSortValue(record = {}) {
    const value = safeText(record.startTime || record.startDate || record.departureTime);
    const parsed = Date.parse(value.replace(/[年月]/g, '-').replace(/日/g, ''));
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortedTravelRecordEntries(records = []) {
    const entries = records.map((record, index) => ({ record, index }));
    if (recordSortMode === 'name') {
        return entries.sort((a, b) => String(a.record.name || '').localeCompare(String(b.record.name || ''), 'zh-Hans-CN-u-co-pinyin')
            || dateSortValue(a.record) - dateSortValue(b.record)
            || a.index - b.index);
    }
    if (recordSortMode === 'time') {
        return entries.sort((a, b) => dateSortValue(a.record) - dateSortValue(b.record)
            || String(a.record.name || '').localeCompare(String(b.record.name || ''), 'zh-Hans-CN-u-co-pinyin')
            || a.index - b.index);
    }
    return entries;
}

function renderItinerary() {
    const container = $('#itineraryBody');
    const stats = $('#itineraryStats');
    if (!container) return;
    const rows = preAuditData?.expenseType === 'travel' ? (preAuditData.itinerary || []) : [];
    if (stats) stats.textContent = rows.length ? `${rows.length} 条行程` : '';
    if (!rows.length) {
        container.innerHTML = '<div class="empty">暂无行程单</div>';
        return;
    }
    container.innerHTML = `
        <div class="journey-list">
            ${rows.map((row, index) => {
                const record = row.sourceRecord || (preAuditData?.records || [])[index] || row;
                const issues = issuesForRecord(record, index);
                const status = issueStatusForIssues(issues);
                const route = renderRouteCell(row);
                const timeRange = formatTravelRange(row);
                return `
                <div class="journey-card ${status}">
                    <div class="journey-head">
                        <div>
                            <div class="journey-title">${escapeHtml(row.person || '-')} · ${escapeHtml(timeRange)} · ${escapeHtml(String(row.tripDays || 0))} 天</div>
                            <div class="journey-route">${route}</div>
                        </div>
                        <div style="text-align:right;">
                            <span class="badge ${status === 'pass' ? 'success' : (status === 'error' ? 'failed' : 'pending')}">${issueStatusLabel(status)}</span>
                        </div>
                    </div>
                    <div class="journey-fees">
                        ${feePill('城际交通费', money(row.transportAmount), row.transportType || '其它')}
                        ${feePill('住宿费', money(row.hotelAmount), `${row.hotelDays || 0} 天 / ${row.hotelDocs || 0} 张，上限 ${money(row.hotelStandard)}`)}
                        ${feePill('伙食补助', money(row.mealAmount), `${row.mealDays || 0} 天 × ${money(row.mealStandard)}`)}
                        ${feePill('市内交通费', money(row.localTransportAmount), `${row.localTransportDays || 0} 天 × ${money(defaultWhenBlank(row.localTransportStandard, 80))}`)}
                    </div>
                    <div class="journey-issues">${renderIssueList(issues)}</div>
                </div>
            `;
            }).join('')}
        </div>
    `;
}

function renderRouteCell(row) {
    const route = row.routeText || [row.startAddress, row.destination].filter(Boolean).join('-') || row.destination || '-';
    const stay = row.stayAddress && row.stayAddress !== row.destination ? `<br><span class="muted">住宿/标准：${escapeHtml(row.stayAddress)}</span>` : '';
    return `${escapeHtml(route)}${stay}`;
}

function feePill(label, value, subText = '') {
    return `
        <div class="fee-pill">
            <div class="fee-label">${escapeHtml(label)}</div>
            <div class="fee-value">${escapeHtml(value)}</div>
            ${subText ? `<div class="fee-sub">${escapeHtml(subText)}</div>` : ''}
        </div>
    `;
}

function editInput(index, fieldName, value, label, type = 'text', step = '') {
    const stepAttr = step ? ` step="${escapeHtml(step)}"` : '';
    const hint = escapeHtml(label);
    return `<span class="input-watermark" data-hint="${hint}"><input class="record-edit-control" data-record-index="${index}" data-field="${escapeHtml(fieldName)}" type="${type}"${stepAttr} value="${escapeHtml(value ?? '')}" title="${hint}" aria-label="${hint}" placeholder="${hint}"></span>`;
}

function editSelect(index, fieldName, value, label, options) {
    const normalized = value || '其它';
    const finalOptions = options.includes(normalized) ? options : [...options, normalized];
    const hint = escapeHtml(label);
    return `
        <span class="input-watermark" data-hint="${hint}">
            <select class="record-edit-control" data-record-index="${index}" data-field="${escapeHtml(fieldName)}" title="${hint}" aria-label="${hint}">
                ${finalOptions.map(option => `<option value="${escapeHtml(option)}" ${option === normalized ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
            </select>
        </span>
    `;
}

function editPeriodSelect(index, fieldName, value, label) {
    const options = ['', '上午', '下午', '全天', '半天'];
    const hint = escapeHtml(label);
    return `
        <span class="input-watermark" data-hint="${hint}">
            <select class="record-edit-control" data-record-index="${index}" data-field="${escapeHtml(fieldName)}" title="${hint}" aria-label="${hint}">
                ${options.map(option => `<option value="${escapeHtml(option)}" ${option === (value || '') ? 'selected' : ''}>${escapeHtml(option || '未填')}</option>`).join('')}
            </select>
        </span>
    `;
}

function computedAmount(index, fieldName, value, label = '自动金额') {
    const hint = escapeHtml(label);
    return `<span class="input-watermark" data-hint="${hint}"><span class="readonly-amount" data-computed-record="${index}" data-computed-field="${escapeHtml(fieldName)}">${money(value)}</span></span>`;
}

function renderTravelRecordEditTable(record, index) {
    recomputeTravelRecord(record);
    return `
        <table class="prefill-edit-table">
            <tbody>
                <tr>
                    <th>出发-到达时间</th>
                    <td><div class="edit-line four">${editInput(index, 'startTime', record.startTime, '出发日期')}${editPeriodSelect(index, 'startPeriod', record.startPeriod, '出发时段')}${editInput(index, 'endTime', record.endTime, '到达日期')}${editPeriodSelect(index, 'endPeriod', record.endPeriod, '到达时段')}</div></td>
                </tr>
                <tr>
                    <th>出发-到达地点</th>
                    <td><div class="edit-line">${editInput(index, 'startAddress', record.startAddress, '出发地点')}<span class="edit-sep">至</span>${editInput(index, 'endAddress', record.endAddress, '到达地点')}</div></td>
                </tr>
                <tr>
                    <th>城际交通费</th>
                    <td><div class="edit-line">${editSelect(index, 'transportType', record.transportType, '城际交通费工具', ['飞机', '火车', '轮船', '公车', '其它', '汽车'])}<span class="edit-sep">金额</span>${editInput(index, 'transportAmount', record.transportAmount, '城际交通费金额', 'number', '0.01')}</div></td>
                </tr>
                <tr>
                    <th>住宿费</th>
                    <td><div class="edit-line four">${editInput(index, 'hotelDays', record.hotelDays, '住宿天数', 'number', '1')}${editInput(index, 'hotelDocs', record.hotelDocs, '单据数量', 'number', '1')}${editInput(index, 'hotelAmount', record.hotelAmount, '报销金额', 'number', '0.01')}${editInput(index, 'hotelStandard', record.hotelStandard, '标准上限', 'number', '0.01')}</div></td>
                </tr>
                <tr>
                    <th>伙食补助</th>
                    <td><div class="edit-line three">${editInput(index, 'mealDays', record.mealDays, '伙食补助天数', 'number', '1')}${editInput(index, 'mealStandard', record.mealStandard, '补助标准', 'number', '0.01')}${computedAmount(index, 'mealAmount', record.mealAmount, '自动金额')}</div></td>
                </tr>
                <tr>
                    <th>市内交通费</th>
                    <td><div class="edit-line three">${editInput(index, 'localTransportDays', record.localTransportDays, '市内交通费天数', 'number', '1')}${editInput(index, 'localTransportStandard', defaultWhenBlank(record.localTransportStandard, 80), '市内交通费标准', 'number', '0.01')}${computedAmount(index, 'localTransportAmount', record.localTransportAmount, '自动金额')}</div></td>
                </tr>
                <tr>
                    <th>其他费用</th>
                    <td><div class="edit-line single">${editInput(index, 'otherAmount', record.otherAmount, '其他费用金额', 'number', '0.01')}</div></td>
                </tr>
            </tbody>
        </table>
        <div class="record-total-line">预填合计：<span data-computed-record="${index}" data-computed-field="totalAmount">${money(record.totalAmount)}</span> 元</div>
    `;
}

function recordAuditKey(record = {}, index = 0) {
    return record.recordKey || [
        record.name,
        record.startTime,
        record.endTime,
        record.startAddress,
        record.endAddress,
        index,
    ].join('|');
}

function issuesForRecord(record = {}, index = 0) {
    const issues = preAuditData?.auditResult?.issues || [];
    const key = recordAuditKey(record, index);
    const grouped = groupIssuesByRecord(issues);
    const direct = grouped.get(key) || grouped.get(record.recordKey) || [];
    const byName = issues.filter(issue => {
        if (issue.recordKey || issue.evidence?.recordKey) return false;
        const text = [issue.description, issue.suggestion, issue.ruleName, issue.category].filter(Boolean).join(' ');
        return record.name && text.includes(record.name);
    });
    return [...direct, ...byName];
}

function collectOcrDates(item = {}) {
    const dates = [];
    ['departureTime', 'startTime', 'issueDate', 'startDate', 'endDate', 'leavingDate', 'checkInDate', 'accommodationDate', 'date'].forEach(key => {
        if (item[key]) dates.push(item[key]);
    });
    (item.accommodationDetail || []).forEach(detail => {
        if (detail.accommodationDate) dates.push(detail.accommodationDate);
        if (detail.date) dates.push(detail.date);
    });
    return dates;
}

function isDateInsideRecord(dateValue, record = {}, allowPreviousDay = false) {
    const date = parseDateOnlyForDays(dateValue);
    const start = parseDateOnlyForDays(record.startTime);
    const end = parseDateOnlyForDays(record.endTime);
    if (!date || !start || !end) return false;
    const from = new Date(start);
    if (allowPreviousDay) from.setDate(from.getDate() - 1);
    return date >= from && date <= end;
}

function itemNameMatchesRecord(record = {}, item = {}) {
    const recordName = safeText(record.name);
    if (!recordName) return false;
    const candidate = firstValue(item, [
        'passengerName', 'guestName', 'requesterName', 'applicantName', 'travelerName',
        'personName', 'name', '入住人', '申请人', '乘客',
    ]);
    if (!candidate) return (preAuditData?.records || []).length === 1;
    const left = safeText(candidate).replace(/\s+/g, '');
    const right = recordName.replace(/\s+/g, '');
    return left.includes(right) || right.includes(left);
}

function ocrItemsForRecord(record = {}, typeList = [], options = {}) {
    const types = new Set(typeList.map(normalizeRecognizeType));
    return getDisplayableOcrItems(preAuditData?.ocrItems || [])
        .filter(item => types.has(normalizeRecognizeType(item.recognizeType || item.docType || item.type)))
        .filter(item => itemNameMatchesRecord(record, item))
        .filter(item => {
            const dates = collectOcrDates(item);
            if (!dates.length) return (preAuditData?.records || []).length === 1;
            return dates.some(date => isDateInsideRecord(date, record, options.allowPreviousDay));
        });
}

function isLodgingInvoiceItem(item = {}) {
    const type = normalizeRecognizeType(item.recognizeType || item.docType || item.type);
    if (type !== 'normalInvoice') return false;
    const text = safeText([
        item.sellerName,
        item.comment,
        item.rawText,
        ...(Array.isArray(item.itemsDetail) ? item.itemsDetail.map(row => [row.name, row.projectName, row.goodsName].filter(Boolean).join(' ')) : []),
    ].join(' '));
    return /住宿|酒店|宾馆|旅馆|客房|房费|住宿服务/.test(text);
}

function lodgingItemsForRecord(record = {}) {
    const listItems = ocrItemsForRecord(record, ['accommodationList']);
    const invoiceItems = getDisplayableOcrItems(preAuditData?.ocrItems || [])
        .filter(isLodgingInvoiceItem)
        .filter(item => {
            if (itemNameMatchesRecord(record, item)) return true;
            return !firstValue(item, ['guestName', 'personName', 'passengerName', 'travelerName', 'name']);
        })
        .filter(item => {
            const dates = collectOcrDates(item);
            if (!dates.length) return true;
            return dates.some(date => isDateInsideRecord(date, record, true));
        });
    const seen = new Set();
    return [...listItems, ...invoiceItems].filter(item => {
        const key = [item.sourceFileName, item.invoiceNumber, item.sellerName, item.totalAmount].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function renderAuditBlock(title, summary, bodyHtml) {
    return `
        <div class="audit-block">
            <div class="audit-block-head">
                <span>${escapeHtml(title)}</span>
                <span class="muted">${escapeHtml(summary || '')}</span>
            </div>
            <div class="audit-block-body">${bodyHtml}</div>
        </div>
    `;
}

function renderAuditOcrList(items = [], emptyText = '未匹配到对应附件识别数据') {
    if (!items.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return `<div class="audit-ocr-list">${items.map((item, index) => renderOcrItemCard(item, index)).join('')}</div>`;
}

function renderAuditConclusion(record = {}, index = 0) {
    const issues = issuesForRecord(record, index);
    return renderAuditBlock(
        '审核结论',
        issues.length ? `${issues.length} 个提示` : '未命中明显问题',
        renderIssueList(issues),
    );
}

function renderTravelAuditRecord(record = {}, index = 0) {
    const requests = ocrItemsForRecord(record, ['travelRequest']);
    const transports = ocrItemsForRecord(record, ['trainInvoice', 'planeInvoice'], { allowPreviousDay: true });
    const hotels = lodgingItemsForRecord(record);
    const issues = issuesForRecord(record, index);
    const actualTime = formatTravelRange(record);
    const route = [record.startAddress || record.from, record.endAddress || record.to || record.destination].filter(Boolean).join('-') || '-';
    const amount = numberValue(record.totalAmount) || (
        numberValue(record.transportAmount || record.trafficAmount)
        + numberValue(record.hotelAmount)
        + numberValue(record.mealAmount)
        + numberValue(record.localTransportAmount || record.localTrafficAmount)
        + numberValue(record.otherAmount)
    );
    return `
        <details class="record ${issueStatusForIssues(issues)}">
            <summary>
                <span class="record-summary-main">${escapeHtml(record.name || '未识别人员')} ${escapeHtml(actualTime)} · ${escapeHtml(route)}</span>
                <span class="muted">${money(amount)} 元</span>
                ${issueCountBadges(issues)}
            </summary>
            <div class="record-body audit-record-body">
                ${renderAuditConclusion(record, index)}
                ${renderAuditBlock('页面填报数据', route, `
                    <div class="field-grid">
                        ${field('出差时间', actualTime)}
                        ${field('出差路线', route)}
                        ${field('城际交通费', `${record.transportType || record.transportTool || '其它'} / ${money(record.transportAmount || record.trafficAmount)} 元`)}
                        ${field('住宿费', `${record.hotelDays || 0} 天 / ${money(record.hotelAmount)} 元 / 标准 ${money(record.hotelStandard)} 元`)}
                        ${field('伙食补助', `${record.mealDays || 0} 天 × ${money(record.mealStandard)} = ${money(record.mealAmount)} 元`)}
                        ${field('市内交通', `${record.localTransportDays || record.localTrafficDays || 0} 天 × ${money(record.localTransportStandard || record.localTrafficStandard)} = ${money(record.localTransportAmount || record.localTrafficAmount)} 元`)}
                    </div>
                `)}
                ${renderAuditBlock('出差时间比对', actualTime, renderAuditOcrList(requests, '未匹配到对应审批单，请核对附件或人员姓名。'))}
                ${renderAuditBlock('城际交通费用比对', `${money(record.transportAmount || record.trafficAmount)} 元`, renderAuditOcrList(transports, '未匹配到对应火车票/飞机票。'))}
                ${renderAuditBlock('住宿费比对', `${money(record.hotelAmount)} 元`, renderAuditOcrList(hotels, '未匹配到对应住宿清单。'))}
            </div>
        </details>
    `;
}

function travelRecordPerson(record = {}) {
    return safeText(record.name || record.personName || record.person || record.travelerName);
}

function travelRecordAmount(record = {}) {
    return numberValue(record.totalAmount) || (
        numberValue(record.transportAmount || record.trafficAmount)
        + numberValue(record.hotelAmount)
        + numberValue(record.mealAmount)
        + numberValue(record.localTransportAmount || record.localTrafficAmount)
        + numberValue(record.otherAmount)
    );
}

function buildTravelPaymentMatches(records = []) {
    const payments = getOtherAuditPayments();
    const recordGroups = new Map();
    records.forEach(record => {
        const person = travelRecordPerson(record);
        const key = normalizeCompareName(person);
        if (!key) return;
        if (!recordGroups.has(key)) recordGroups.set(key, { person, records: [], amount: 0 });
        const group = recordGroups.get(key);
        group.records.push(record);
        group.amount += travelRecordAmount(record);
    });
    return groupOtherPaymentsByPayee(payments).map(group => {
        const matchedRecordGroup = recordGroups.get(normalizeCompareName(group.payee)) || null;
        const matchedAmount = matchedRecordGroup ? matchedRecordGroup.amount : 0;
        const amountMatched = matchedRecordGroup && Math.abs(matchedAmount - group.amount) < 0.01;
        return {
            ...group,
            matchedPerson: matchedRecordGroup?.person || '',
            matchedRecords: matchedRecordGroup?.records || [],
            matchedAmount,
            amountMatched,
            status: matchedRecordGroup && amountMatched ? 'pass' : (matchedRecordGroup ? 'warning' : 'error'),
        };
    });
}

function renderTravelPaymentAudit(records = []) {
    const payments = getOtherAuditPayments();
    if (!payments.length) return '';
    const matches = buildTravelPaymentMatches(records);
    const cards = matches.map((match, index) => {
        const diff = Number(money(match.amount - match.matchedAmount));
        const badgeText = match.status === 'pass' ? '匹配一致' : (match.status === 'error' ? '未匹配人员' : '金额不一致');
        const badgeClassName = match.status === 'pass' ? 'success' : (match.status === 'error' ? 'failed' : 'pending');
        return `
            <details class="record payment-match-card ${match.status}" ${index === 0 ? 'open' : ''}>
                <summary>
                    <span class="record-summary-main">收款人核验：${escapeHtml(match.payee || '-')}</span>
                    <span class="badge ${badgeClassName}">${badgeText}</span>
                </summary>
                <div class="record-body audit-record-body">
                    <div class="field-grid">
                        ${field('页面付款金额', `${money(match.amount)} 元`)}
                        ${field('匹配报销人员', match.matchedPerson || '-')}
                        ${field('匹配报销金额', `${money(match.matchedAmount)} 元`)}
                        ${field('差额', `${money(diff)} 元`)}
                        ${field('银行/账号', match.bankInfo || '-')}
                        ${field('页面收款条数', match.payments.length)}
                    </div>
                    <div class="issue ${match.status === 'pass' ? 'pass' : (match.status === 'error' ? 'error' : '')}">
                        ${escapeHtml(match.status === 'pass'
                            ? '页面收款人与差旅报销人员金额一致。'
                            : (match.status === 'error'
                                ? '页面收款人未匹配到同名差旅报销人员，请核对收款人或报销人。'
                                : '页面收款人与差旅报销人员已匹配，但金额存在差额。'))}
                    </div>
                </div>
            </details>
        `;
    }).join('');
    return `
        <div class="audit-block">
            <div class="audit-block-head">
                <span>收款人信息核验</span>
                <span class="muted">${payments.length} 条页面收款信息</span>
            </div>
            <div class="audit-block-body">${cards || '<div class="empty">未提取到可核验收款人。</div>'}</div>
        </div>
    `;
}

function renderTravelAuditRecords(records = []) {
    const total = records.reduce((sum, item) => sum + numberValue(item.totalAmount), 0);
    $('#recordStats').textContent = `${records.length} 条页面记录，页面合计 ${money(total)} 元`;
    return `${renderTravelPaymentAudit(records)}${records.map(renderTravelAuditRecord).join('')}`;
}

function getOtherAuditInvoices() {
    return uniqueInvoiceItems(getDisplayableOcrItems(preAuditData?.ocrItems || []))
        .filter(item => normalizeRecognizeType(item.recognizeType) === 'normalInvoice');
}

function getOtherAuditAmountItems() {
    const ocrItems = getDisplayableOcrItems(preAuditData?.ocrItems || []);
    if (hasTrafficSubsidyOcr(ocrItems)) {
        const dedupeResult = dedupeTaxiInvoiceItems(ocrItems);
        return {
            items: dedupeResult.invoices,
            dedupeResult,
            amountOf: taxiInvoiceAmount,
            totalLabel: '出租车票金额合计',
            countLabel: '出租车票数量',
        };
    }
    const dedupeResult = dedupeInvoiceItems(ocrItems);
    return {
        items: getOtherAuditInvoices(),
        dedupeResult,
        amountOf: invoiceAmount,
        totalLabel: '发票价税合计',
        countLabel: '发票数量',
    };
}

function invoiceSellerName(item = {}) {
    return firstValue(item, ['sellerName', 'payeeName', 'vendorName', 'supplierName', '销售方名称', '销售方', '收款方']);
}

function paymentPayeeName(item = {}) {
    return firstValue(item, ['skrmc', 'payeeName', 'payee', 'recipientName', '收款人名称', '收款方']);
}

function paymentBankInfo(item = {}) {
    return [
        firstValue(item, ['khyhmc', 'bankName', 'bank', '开户银行']),
        firstValue(item, ['yhzh', 'accountNo', 'bankAccount', '银行账号']),
    ].filter(Boolean).join(' ');
}

function paymentAmount(item = {}) {
    return numberValue(firstValue(item, ['zfje', 'amount', 'paymentAmount', 'cardAmount', '金额']));
}

function normalizeCompareName(value = '') {
    return safeText(value)
        .replace(/\s+/g, '')
        .replace(/[（）()]/g, '')
        .replace(/国家税务总局|有限公司|有限责任公司|股份有限公司|公司|分局/g, '');
}

function nameFuzzyMatch(left = '', right = '') {
    const a = normalizeCompareName(left);
    const b = normalizeCompareName(right);
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
}

function invoiceMatchesPayee(invoice = {}, payee = '') {
    const seller = invoiceSellerName(invoice);
    const payer = firstValue(invoice, ['payerName', 'buyerName', 'purchaserName', '购买方名称', '购买方']);
    return nameFuzzyMatch(seller, payee) || (!seller && nameFuzzyMatch(payer, payee));
}

function getOtherAuditPayments() {
    return Array.isArray(preAuditData?.pageExtractData?.payments) ? preAuditData.pageExtractData.payments : [];
}

function invoiceMatchKey(invoice = {}, index = 0) {
    return [
        invoice.sourceFileName || invoice.fileName || '',
        invoice.invoiceNumber || '',
        invoiceSellerName(invoice) || '',
        invoiceAmount(invoice),
        index,
    ].join('|');
}

function groupOtherPaymentsByPayee(payments = []) {
    const groups = new Map();
    payments.forEach((payment, index) => {
        const payee = paymentPayeeName(payment) || `未识别收款人${index + 1}`;
        const key = normalizeCompareName(payee) || `unknown-${index}`;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                payee,
                payments: [],
                amount: 0,
                bankInfo: '',
            });
        }
        const group = groups.get(key);
        group.payments.push(payment);
        group.amount += paymentAmount(payment);
        if (!group.bankInfo) group.bankInfo = paymentBankInfo(payment);
    });
    return [...groups.values()];
}

function buildOtherPaymentMatches() {
    const invoices = getOtherAuditInvoices();
    const payments = getOtherAuditPayments();
    const indexedInvoices = invoices.map((invoice, index) => ({
        invoice,
        key: invoiceMatchKey(invoice, index),
    }));
    const matchedKeys = new Set();
    const matches = groupOtherPaymentsByPayee(payments).map((group, index) => {
        const matched = indexedInvoices.filter(({ invoice }) => invoiceMatchesPayee(invoice, group.payee));
        matched.forEach(({ key }) => matchedKeys.add(key));
        const matchedInvoices = matched.map(({ invoice }) => invoice);
        const matchedAmount = matchedInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0);
        const amountMatched = matchedInvoices.length > 0 && Math.abs(matchedAmount - group.amount) < 0.01;
        return {
            index,
            ...group,
            matchedInvoices,
            matchedAmount,
            amountMatched,
            status: matchedInvoices.length && amountMatched ? 'pass' : (matchedInvoices.length ? 'warning' : 'error'),
        };
    });
    const unmatchedInvoices = indexedInvoices
        .filter(({ key }) => !matchedKeys.has(key))
        .map(({ invoice }) => invoice);
    return { matches, unmatchedInvoices };
}

function renderOtherAmountComparison() {
    const amountItems = getOtherAuditAmountItems();
    const invoiceTotal = Number(money(amountItems.items.reduce((sum, item) => sum + amountItems.amountOf(item), 0)));
    const pageAmount = numberValue(preAuditData?.pageExtractData?.pageAmount || preAuditData?.summary?.totalAll);
    const diff = Number(money(pageAmount - invoiceTotal));
    const matched = Math.abs(diff) < 0.01;
    const record = (preAuditData?.records || [])[0] || {};
    const issues = (preAuditData?.auditResult?.issues || []).filter(item => /金额|价税合计|发票合计/i.test([
        item.category,
        item.description,
        item.suggestion,
    ].join(' ')));
    const hasBudgetMatch = !!(
        record.matchedBudgetIndicatorId
        || record.matchedBudget
        || record.budgetMatched
        || preAuditData?.summary?.matchedBudgetIndicatorId
        || preAuditData?.summary?.matchedBudget
    );
    const budgetMetrics = hasBudgetMatch ? `
            ${metric('经济科目', record.economicSubject || preAuditData?.summary?.economicSubject || '-')}
            ${metric('用途明细', record.purpose || preAuditData?.summary?.purpose || '-')}
    ` : '';
    return `
        <div class="metric-grid">
            ${metric('页面报销金额', `${money(pageAmount)} 元`)}
            ${metric(amountItems.totalLabel, `${money(invoiceTotal)} 元`)}
            ${metric('差额', `${money(diff)} 元`)}
            ${metric(amountItems.countLabel, amountItems.items.length)}
            ${budgetMetrics}
        </div>
        <div class="issue ${matched ? 'pass' : 'error'}">${matched ? `页面报销金额与${amountItems.totalLabel}一致。` : `页面报销金额与${amountItems.totalLabel}不一致，请核对是否存在漏票、重复票或金额填写错误。`}</div>
        ${amountItems.dedupeResult.duplicateInvoiceCount ? `<div class="issue warning">${escapeHtml(duplicateInvoiceHint(amountItems.dedupeResult))}，重复票据未计入合计。</div>` : ''}
        ${issues.length ? `<div class="rule-issues">${renderIssueList(issues)}</div>` : ''}
    `;
}

function renderOtherInvoiceSummary(invoice = {}) {
    const seller = invoiceSellerName(invoice) || '-';
    const number = invoice.invoiceNumber || '-';
    const amount = money(invoiceAmount(invoice));
    const fileName = invoice.sourceFileName || invoice.fileName || '-';
    return `${seller} / ${amount} 元 / ${number} / ${fileName}`;
}

function renderOtherMatchedInvoices(invoices = []) {
    if (!invoices.length) return '<div class="empty">未按收款人名称匹配到发票。</div>';
    return `<div class="audit-ocr-list">${invoices.map((invoice, index) => `
        <div class="ocr-item-card">
            <div class="ocr-item-head">
                <span>${escapeHtml(invoiceSellerName(invoice) || '未识别销售方')}</span>
                <small>${escapeHtml(money(invoiceAmount(invoice)))} 元</small>
            </div>
            <div class="field-grid">
                ${field('发票号码', invoice.invoiceNumber || '-')}
                ${field('购买方', invoice.payerName || '-')}
                ${field('销售方/收款方', invoiceSellerName(invoice) || '-')}
                ${field('价税合计', `${money(invoiceAmount(invoice))} 元`)}
                ${field('来源附件', invoice.sourceFileName || invoice.fileName || '-')}
            </div>
            ${renderInvoiceDetailTable(invoice.itemsDetail || [])}
            <div class="muted" style="margin-top:6px;">匹配明细 ${index + 1}</div>
        </div>
    `).join('')}</div>`;
}

function renderPendingOtherInvoices(invoices = []) {
    if (!invoices.length) return '';
    return `
        <details class="record pending-invoices" open>
            <summary>
                <span>待匹配发票</span>
                <span class="badge pending">${invoices.length} 张需人工核对</span>
            </summary>
            <div class="record-body">
                <div class="issue">以下发票未按收款人名称匹配到页面收款信息，请人工核对是否属于本次报销。</div>
                ${renderOtherMatchedInvoices(invoices)}
            </div>
        </details>
    `;
}

function renderOtherAuditRecords(records = []) {
    const invoices = getOtherAuditInvoices();
    const payments = getOtherAuditPayments();
    const { matches, unmatchedInvoices } = buildOtherPaymentMatches();
    $('#recordStats').textContent = `${invoices.length} 张发票，${payments.length} 条收款信息`;
    const drawerHtml = matches.length
        ? matches.map((match, index) => {
            const diff = Number(money(match.amount - match.matchedAmount));
            const badgeText = match.status === 'pass' ? '匹配一致' : (match.status === 'error' ? '未匹配发票' : '金额不一致');
            const badgeClassName = match.status === 'pass' ? 'success' : (match.status === 'error' ? 'failed' : 'pending');
            const issueText = match.status === 'pass'
                ? '该收款人的页面付款金额与匹配发票金额一致。'
                : (match.status === 'error'
                    ? '该收款人未按名称匹配到发票，请核对发票销售方或收款信息。'
                    : '该收款人已匹配到发票，但页面付款金额与发票金额存在差额。');
            return `
                <details class="record payment-match-card ${match.status}" ${index === 0 ? 'open' : ''}>
                    <summary>
                        <span>收款人：${escapeHtml(match.payee || '-')}</span>
                        <span class="badge ${badgeClassName}">${badgeText}</span>
                    </summary>
                    <div class="record-body audit-record-body">
                        <div class="field-grid">
                            ${field('页面付款金额', `${money(match.amount)} 元`)}
                            ${field('匹配发票金额', `${money(match.matchedAmount)} 元`)}
                            ${field('差额', `${money(diff)} 元`)}
                            ${field('银行/账号', match.bankInfo || '-')}
                            ${field('页面收款条数', match.payments.length)}
                            ${field('匹配发票张数', match.matchedInvoices.length)}
                        </div>
                        <div class="issue ${match.status === 'pass' ? 'pass' : (match.status === 'error' ? 'error' : '')}">${escapeHtml(issueText)}</div>
                        ${renderAuditBlock('匹配发票明细', match.matchedInvoices.length ? match.matchedInvoices.map(renderOtherInvoiceSummary).join('；') : '无匹配发票', renderOtherMatchedInvoices(match.matchedInvoices))}
                    </div>
                </details>
            `;
        }).join('')
        : '<div class="empty">未从页面提取到收款人信息。</div>';
    return `${drawerHtml}${renderPendingOtherInvoices(unmatchedInvoices)}`;
}

function renderRecords() {
    const container = $('#recordsBody');
    const records = preAuditData?.records || [];
    const sortSelect = $('#recordSortSelect');
    const showSort = !isPageAuditMode() && preAuditData?.expenseType === 'travel' && records.length > 1;
    if (sortSelect) {
        sortSelect.classList.toggle('is-hidden', !showSort);
        sortSelect.value = recordSortMode;
    }
    $('#recordStats').textContent = records.length
        ? `${records.length} 条明细，合计 ${money(preAuditData?.summary?.totalAll || records.reduce((sum, item) => sum + numberValue(item.totalAmount), 0))} 元`
        : '';
    if (!records.length) {
        container.innerHTML = `<div class="empty">${isPageAuditMode() ? '暂无可核验的页面明细' : '暂无预填明细'}</div>`;
        return;
    }
    if (isPageAuditMode()) {
        container.innerHTML = preAuditData?.expenseType === 'travel'
            ? renderTravelAuditRecords(records)
            : (preAuditData?.expenseType === 'meeting' ? renderMeetingAuditRecords(records) : renderOtherAuditRecords(records));
        return;
    }
    if (preAuditData?.expenseType === 'meeting') {
        container.innerHTML = renderMeetingAuditRecords(records);
        return;
    }
    if (preAuditData?.expenseType === 'other') {
        const record = records[0];
        container.innerHTML = `
            <details class="record" open>
                <summary>
                    <span>${escapeHtml(record.reportName || '其他事项报销')}</span>
                    <span class="muted">${money(record.totalAmount)} 元</span>
                </summary>
                <div class="record-body">
                    <div class="field-grid">
                        ${field('发票项目', (record.projectNames || []).join('、'))}
                        ${field('发票数量', record.invoiceCount || 0)}
                        ${field('价税合计', money(record.totalAmount))}
                        ${field('报销事由', record.reason)}
                    </div>
                    <div class="issue pass">一键预填时将按发票项目名称匹配当前页面预算指标。</div>
                </div>
            </details>
        `;
        return;
    }

    let html = sortedTravelRecordEntries(records).map(({ record, index }, displayIndex) => {
        const actualTime = formatTravelRange(record);
        return `
            <details class="record" ${displayIndex === 0 ? 'open' : ''}>
                <summary>
                    <span class="record-summary-main">${escapeHtml(record.name || '未识别人员')} ${escapeHtml(actualTime)}</span>
                    <span class="muted"><span data-computed-record="${index}" data-computed-field="totalAmount">${money(record.totalAmount)}</span> 元</span>
                </summary>
                <div class="record-body">
                    ${renderTravelRecordEditTable(record, index)}
                    ${renderPrefillNotes(record)}
                </div>
            </details>
        `;
    }).join('');
    container.innerHTML = html;
}

function renderMeetingAuditRecords(records = []) {
    const summary = preAuditData?.summary || {};
    $('#recordStats').textContent = `${records.length} 条材料记录，合计 ${money(summary.totalAmount || summary.totalAll || 0)} 元`;
    const issues = preAuditData?.auditResult?.issues || [];
    const issueHtml = issues.length ? `<div class="rule-issues">${renderIssueList(issues)}</div>` : '<div class="issue pass">当前会议费规则未发现明显问题。</div>';
    return `
        <details class="record" open>
            <summary>
                <span>${escapeHtml(summary.meetingName || '会议费报销')}</span>
                <span class="muted">${money(summary.totalAmount || summary.totalAll || 0)} 元</span>
                ${issueCountBadges(issues)}
            </summary>
            <div class="record-body">
                <div class="field-grid">
                    ${field('会议时间', [summary.startDate, summary.endDate].filter(Boolean).join(' 至 ') || summary.meetingDate || '-')}
                    ${field('会议地点', summary.meetingLocation || '-')}
                    ${field('会议天数', summary.meetingDays || 0)}
                    ${field('参会人数', summary.attendeeCount || 0)}
                    ${field('住宿费', `${money(summary.accommodationAmount || 0)} 元`)}
                    ${field('伙食费', `${money(summary.mealAmount || 0)} 元`)}
                    ${field('场地租金', `${money(summary.venueRentAmount || 0)} 元`)}
                    ${field('其他费用', `${money(summary.otherAmount || 0)} 元`)}
                    ${field('发票金额', `${money(summary.invoiceAmount || 0)} 元`)}
                </div>
                ${issueHtml}
            </div>
        </details>
    `;
}

function renderPrefillNotes(record) {
    const notes = record?.prefillNotes || [];
    if (!notes.length) return '';
    return `<div class="issue">${notes.map(escapeHtml).join('<br>')}</div>`;
}

function renderRules() {
    const container = $('#rulesBody');
    const auditResult = preAuditData?.auditResult || {};
    const rules = auditResult.ruleResults || [];
    const issues = auditResult.issues || [];
    $('#ruleStats').textContent = rules.length || issues.length
        ? `${rules.length} 条规则，${issues.length} 个提示`
        : '';
    if (!rules.length && !issues.length) {
        container.innerHTML = '<div class="empty">暂无指标命中，当前规则未发现明显问题。</div>';
        return;
    }
    const issueRuleKey = issue => safeText(issue.ruleId || issue.ruleName || issue.category || '');
    const issuesByRule = new Map();
    issues.forEach(issue => {
        const key = issueRuleKey(issue) || '__unassigned';
        if (!issuesByRule.has(key)) issuesByRule.set(key, []);
        issuesByRule.get(key).push(issue);
    });
    const ruleHtml = rules.map(rule => {
        const status = rule.status || (rule.passed ? 'pass' : 'warning');
        const matchedIssues = [
            ...(Array.isArray(rule.issues) ? rule.issues : []),
            ...(issuesByRule.get(safeText(rule.ruleId)) || []),
            ...(issuesByRule.get(safeText(rule.ruleName)) || []),
        ].filter((issue, index, rows) => rows.findIndex(item => JSON.stringify(item) === JSON.stringify(issue)) === index);
        const hasIssue = matchedIssues.length || (status !== 'pass' && status !== 'skipped');
        const isRed = status === 'error' || promptIsRed(rule.promptLevel) || matchedIssues.some(issue => issueClass(issue) === 'error');
        const label = status === 'pass' ? '通过' : (status === 'skipped' ? '跳过' : (isRed ? '标红' : '命中'));
        const badge = !hasIssue ? 'success' : (isRed ? 'failed' : 'pending');
        const rowClass = !hasIssue ? 'pass' : (isRed ? 'error' : 'warning');
        return `
            <div class="rule-card ${rowClass}">
                <div class="rule-row">
                    <div>
                        <div style="font-weight:700;">${escapeHtml(rule.ruleName || rule.ruleId || '未命名规则')}</div>
                        <div class="muted">${escapeHtml(rule.auditType || '')} ${escapeHtml(rule.promptLevel || '')}</div>
                    </div>
                    <span class="badge ${badge}">${label}${matchedIssues.length ? ` ${matchedIssues.length}` : ''}</span>
                </div>
                ${matchedIssues.length ? `<div class="rule-issues">${renderIssueList(matchedIssues)}</div>` : ''}
            </div>
        `;
    }).join('');
    const assigned = new Set();
    rules.forEach(rule => {
        assigned.add(safeText(rule.ruleId));
        assigned.add(safeText(rule.ruleName));
    });
    const unassignedIssues = issues.filter(issue => !assigned.has(issueRuleKey(issue)));
    const unassignedHtml = unassignedIssues.length
        ? `<div class="rule-card warning"><div class="rule-row"><div style="font-weight:700;">未定位到具体规则的问题</div><span class="badge pending">${unassignedIssues.length}</span></div><div class="rule-issues">${renderIssueList(unassignedIssues)}</div></div>`
        : '';
    container.innerHTML = `${ruleHtml}${unassignedHtml}`;
}

function renderOcrData() {
    const container = $('#ocrBody');
    const groups = buildOcrFileGroups();
    const totalRaw = groups.reduce((sum, group) => sum + (group.rawItems || []).length, 0);
    const totalDisplayable = groups.reduce((sum, group) => sum + (group.displayItems || []).length, 0);
    const hiddenCount = Math.max(0, totalRaw - totalDisplayable);
    $('#ocrStats').textContent = groups.length
        ? `${groups.length} 个附件，${totalDisplayable} 条可展示 OCR 项${hiddenCount ? `，已过滤 ${hiddenCount} 条未知类型` : ''}`
        : '';
    if (!groups.length) {
        const diagnostics = collectOcrDiagnostics();
        if (diagnostics.length) {
            $('#ocrStats').textContent = 'OCR项为空，显示附件任务诊断';
            container.innerHTML = `
                <div class="empty">暂无可归集 OCR 项。请查看下方附件识别诊断，判断是模型返回为空、解析为空，还是归集过滤为空。</div>
                <div class="raw-box">${escapeHtml(JSON.stringify(diagnostics, null, 2))}</div>
            `;
            return;
        }
        container.innerHTML = '<div class="empty">暂无 OCR 数据</div>';
        return;
    }
    if (activeOcrFileIndex >= groups.length) activeOcrFileIndex = 0;
    const activeGroup = groups[activeOcrFileIndex] || groups[0];
    const listHtml = groups.map((group, index) => {
        const count = (group.displayItems || []).length;
        return `
            <button class="ocr-file-tab ${index === activeOcrFileIndex ? 'active' : ''}" data-ocr-file-index="${index}">
                <span class="ocr-file-name">${escapeHtml(shortName(group.fileName || `附件${index + 1}`, 46))}</span>
                <span class="badge ${badgeClass(group.status)}">${escapeHtml(statusText(group.status))}</span>
                <span class="muted">${count} 条</span>
            </button>
        `;
    }).join('');
    const previewLink = activeGroup.previewUrl
        ? `<a class="file-link" href="${escapeHtml(activeGroup.previewUrl)}" target="_blank" rel="noopener noreferrer">打开原附件</a>`
        : '<span class="muted">暂无原附件链接</span>';
    const cards = (activeGroup.displayItems || [])
        .map((item, index) => renderOcrItemCard(item, index))
        .join('');
    const hiddenCountForGroup = (activeGroup.rawItems || [])
        .filter(item => !isDisplayableOcrItem(item))
        .length;
    const hiddenNote = hiddenCountForGroup
        ? `<div class="issue">本附件另有 ${hiddenCountForGroup} 条辅助材料或非内置类型未展示，不参与发票金额汇总。</div>`
        : '';
    const diagnosticsHtml = !(activeGroup.displayItems || []).length && (activeGroup.diagnostics || []).length
        ? `<div class="raw-box">${escapeHtml(JSON.stringify(activeGroup.diagnostics, null, 2))}</div>`
        : '';
    container.innerHTML = `
        <div class="ocr-inspector">
            <div class="ocr-file-tabs">${listHtml}</div>
            <div class="ocr-file-detail">
                <div class="ocr-file-toolbar">
                    <div>
                        <div class="ocr-file-title">${escapeHtml(activeGroup.fileName || '附件')}</div>
                        <div class="muted">${escapeHtml(activeGroup.message || statusText(activeGroup.status))}</div>
                    </div>
                    ${previewLink}
                </div>
                ${cards || '<div class="empty">该附件暂无可展示的内置 OCR 类型，请查看后台日志或模型返回。</div>'}
                ${hiddenNote}
                ${diagnosticsHtml}
            </div>
        </div>
    `;
}

function groupIssuesByRecord(issues) {
    const map = new Map();
    issues.forEach(issue => {
        const keys = Array.isArray(issue.recordKeys)
            ? issue.recordKeys
            : (Array.isArray(issue.evidence?.recordKeys) ? issue.evidence.recordKeys : []);
        if (keys.length) {
            keys.forEach(key => {
                const normalizedKey = safeText(key);
                if (!normalizedKey) return;
                if (!map.has(normalizedKey)) map.set(normalizedKey, []);
                map.get(normalizedKey).push(issue);
            });
            return;
        }
        const key = issue.recordKey || issue.evidence?.recordKey || '__unassigned';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(issue);
    });
    return map;
}

function renderIssueList(issues) {
    if (!issues.length) {
        return '<div class="issue pass">当前记录未命中指标。</div>';
    }
    return issues.map(issue => `
        <div class="issue ${issueClass(issue)}">
            <div style="font-weight:700;">${escapeHtml(issue.ruleName || issue.category || '命中指标')}</div>
            <div>${escapeHtml(issue.description || '')}</div>
            ${issue.suggestion ? `<div class="muted">建议：${escapeHtml(issue.suggestion)}</div>` : ''}
        </div>
    `).join('');
}

function promptIsRed(promptLevel) {
    return String(promptLevel || '').includes('标红');
}

function issueClass(issue) {
    if (issue.severity === 'error' || promptIsRed(issue.promptLevel)) return 'error';
    return '';
}

function updateProgress() {
    const total = selectedFiles.length;
    const finished = selectedFiles.filter(file => ['success', 'failed'].includes(file.status)).length;
    const width = total ? Math.round((finished / total) * 100) : 0;
    $('#progressBar').style.width = `${isRunning && width === 0 ? 4 : width}%`;
}

function showStatus(message, type = 'info') {
    const box = $('#statusBox');
    box.textContent = message;
    box.className = `status ${type === 'info' ? '' : type}`;
}

function statusText(status) {
    const map = {
        pending: '待上传',
        uploading: '上传中',
        recognizing: '识别中',
        success: '已识别',
        failed: '失败',
    };
    return map[status] || status;
}

function badgeClass(status) {
    if (status === 'success') return 'success';
    if (status === 'failed') return 'failed';
    if (status === 'recognizing' || status === 'uploading') return 'running';
    return 'pending';
}

function metric(label, value) {
    return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(String(value ?? ''))}</div></div>`;
}

function field(label, value) {
    return `<div class="field"><div class="field-label">${escapeHtml(label)}</div><div class="field-value">${escapeHtml(value === undefined || value === null || value === '' ? '-' : String(value))}</div></div>`;
}

function money(value) {
    const n = Number(value || 0);
    return Number.isInteger(n) ? `${n}` : n.toFixed(2);
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortName(name, max) {
    return name.length > max ? `${name.slice(0, max - 3)}...` : name;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
