const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const sourceRoot = path.join(projectRoot, 'server', 'src');
const rulesRoot = path.join(sourceRoot, 'services', 'rules');
const ocrRuntimeRoot = path.join(sourceRoot, 'services', 'ocr', 'runtime');
const referenceRoot = path.join(sourceRoot, 'domain', 'reference');
const pluginRoot = path.resolve(projectRoot, '..');
const defaultExternalPopplerRoot = process.platform === 'win32' ? 'D:\\poppler' : path.join(pluginRoot, 'poppler');
const configuredPopplerRoot = process.env.POPPLER_ROOT || process.env.POPPLER_HOME || defaultExternalPopplerRoot;
const siblingPopplerRoot = path.join(pluginRoot, 'poppler');
const legacyBundledPopplerRoot = path.join(ocrRuntimeRoot, 'poppler-25.12.0');
const defaultOcrTempDir = process.platform === 'win32'
    ? 'D:\\ai_finance_plugin_tmp\\ocr'
    : path.join(projectRoot, 'server', 'data', 'tmp_ocr');

function resolveProjectPath(value, fallback) {
    const raw = value || fallback;
    if (!raw) return '';
    return path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
}

module.exports = {
    projectRoot,
    pluginRoot,
    sourceRoot,
    rulesRoot,
    referenceRoot,
    rulePythonRoot: path.join(rulesRoot, 'python'),
    ruleRuntimeRoot: path.join(rulesRoot, 'runtime'),
    ocrRuntimeRoot,
    host: process.env.HOST || '0.0.0.0',
    publicHost: process.env.PUBLIC_HOST || '150.88.16.204',
    port: Number(process.env.PORT || 3000),
    databasePath: resolveProjectPath(
        process.env.AI_FINANCE_DB_PATH,
        path.join('server', 'data', 'plugin_finance.sqlite'),
    ),
    publicDir: path.join(projectRoot, 'public'),
    maxUploadSize: 100 * 1024 * 1024,
    ocr: {
        provider: (process.env.OCR_PROVIDER || 'qwen').toLowerCase(),
        pollIntervalMs: Number(process.env.OCR_POLL_INTERVAL_MS || 1200),
        pollTimeoutMs: Number(process.env.OCR_POLL_TIMEOUT_MS || 20 * 60 * 1000),
        maxConcurrentFiles: Number(process.env.OCR_MAX_CONCURRENT_FILES || 100),
        pageOcrEnabled: process.env.PDF_PAGE_OCR_ENABLED !== 'false',
        pdfMinPages: Math.max(2, Number(process.env.PDF_PAGE_OCR_MIN_PAGES || 2)),
        pdfBatchSize: Math.max(1, Number(process.env.PDF_PAGE_OCR_BATCH_SIZE || process.env.QWEN_DIRECT_MULTI_IMAGE_BATCH_SIZE || 1)),
        pdfBatchConcurrency: Math.max(1, Number(process.env.PDF_PAGE_OCR_BATCH_CONCURRENCY || 4)),
        retryEmptyPages: process.env.PDF_PAGE_OCR_RETRY_EMPTY !== 'false',
        retryEmptyPageMaxPages: Math.max(0, Number(process.env.PDF_PAGE_OCR_RETRY_MAX_PAGES || 3)),
        retryEmptyPageConcurrency: Math.max(1, Number(process.env.PDF_PAGE_OCR_RETRY_CONCURRENCY || 2)),
        renderScale: Math.min(1200, Math.max(96, Number(process.env.PDF_PAGE_RENDER_SCALE || 160))),
        renderTimeoutMs: Math.max(60000, Number(process.env.PDF_RENDER_TIMEOUT_MS || 600000)),
        tempDir: resolveProjectPath(process.env.OCR_TEMP_DIR || process.env.AI_FINANCE_OCR_TEMP_DIR, defaultOcrTempDir),
    },
    qwen: {
        url: process.env.QWEN_URL || process.env.QWEN_API_URL || 'http://86.12.74.210:8085/apis/ais-v2/chat/completions',
        apiKey: process.env.QWEN_API_KEY || 'sk-0dc7fd46-9e80-40d9-52ea-948a4c75fae4',
        ocrModel: process.env.QWEN_OCR_MODEL || 'qwen35-35b-a3b',
        textModel: process.env.QWEN_TEXT_MODEL || process.env.QWEN_LLM_MODEL || 'qwen3-32b',
        requestTimeoutMs: Math.max(30000, Number(process.env.QWEN_REQUEST_TIMEOUT_MS || process.env.QWEN_REQUEST_TIMEOUT || 300000)),
        imageDetail: process.env.QWEN_IMAGE_DETAIL || 'high',
        pdfImageDetail: process.env.QWEN_PDF_IMAGE_DETAIL || 'auto',
        ocrMaxTokens: Math.max(512, Number(process.env.QWEN_OCR_MAX_TOKENS || 4096)),
        ocrBatchMaxTokens: Math.max(1024, Number(process.env.QWEN_OCR_BATCH_MAX_TOKENS || 4096)),
        ocrJsonMode: process.env.QWEN_OCR_JSON_MODE !== 'false',
        omitMaxTokensInJsonMode: process.env.QWEN_OMIT_MAX_TOKENS_IN_JSON_MODE === 'true',
        disableThinkingForOcr: process.env.QWEN_OCR_DISABLE_THINKING !== 'false',
    },
    poppler: {
        root: configuredPopplerRoot,
        fallbackRoots: [siblingPopplerRoot, legacyBundledPopplerRoot],
        dataDir: process.env.POPPLER_DATADIR || process.env.POPPLER_DATA || path.join(configuredPopplerRoot, 'share', 'poppler'),
        fontDir: process.env.POPPLER_FONTDIR || path.join(configuredPopplerRoot, 'fonts'),
        pdftoppmPath: process.env.PDFTOPPM_PATH || process.env.POPPLER_PATH || path.join(configuredPopplerRoot, 'Library', 'bin', 'pdftoppm.exe'),
        pdfinfoPath: process.env.PDFINFO_PATH || path.join(configuredPopplerRoot, 'Library', 'bin', 'pdfinfo.exe'),
    },
};
