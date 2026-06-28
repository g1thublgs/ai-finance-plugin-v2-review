const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');
const config = require('../../config/appConfig');
const { writeDebugLog } = require('../../utils/debugLogger');

const execFilePromise = util.promisify(execFile);

function safeExtension(fileName) {
    const ext = path.extname(fileName || '').toLowerCase();
    return /^[.][a-z0-9]{1,12}$/.test(ext) ? ext : '.bin';
}

function ensureTempDir() {
    const candidates = [
        config.ocr.tempDir,
        process.platform === 'win32' ? 'C:\\ai_finance_plugin_tmp\\ocr' : '',
        path.join(os.tmpdir(), 'ai_finance_ocr'),
    ].filter(Boolean);
    for (const dir of candidates) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        } catch (error) {
            writeDebugLog('ocr-temp-dir-unavailable', { dir, error: error.message });
        }
    }
    throw new Error('无法创建 OCR 临时目录，请检查 D 盘或 OCR_TEMP_DIR 配置');
}

function tempFilePath(fileName, prefix = 'upload') {
    const random = Math.random().toString(36).slice(2, 10);
    return path.join(ensureTempDir(), `${prefix}_${Date.now()}_${random}${safeExtension(fileName)}`);
}

function cleanupFiles(files = []) {
    const root = path.resolve(ensureTempDir());
    files.filter(Boolean).forEach(file => {
        try {
            const resolved = path.resolve(file);
            if (resolved.startsWith(root + path.sep) && fs.existsSync(resolved)) fs.unlinkSync(resolved);
        } catch (error) {
            // Ignore cleanup failures.
        }
    });
}

function resolvePopplerPath(toolName) {
    const executableMap = {
        pdfinfo: 'pdfinfo.exe',
        pdftoppm: 'pdftoppm.exe',
    };
    const executable = executableMap[toolName] || `${toolName}.exe`;
    const configured = toolName === 'pdfinfo'
        ? config.poppler.pdfinfoPath
        : (toolName === 'pdftoppm' ? config.poppler.pdftoppmPath : '');
    const configuredDir = config.poppler.pdftoppmPath ? path.dirname(config.poppler.pdftoppmPath) : '';
    const roots = [
        config.poppler.root,
        ...(config.poppler.fallbackRoots || []),
    ].filter(Boolean);

    if (configured && fs.existsSync(configured)) return configured;
    if (configured && fs.existsSync(path.dirname(configured))) return path.join(path.dirname(configured), executable);
    if (configuredDir && fs.existsSync(path.join(configuredDir, executable))) return path.join(configuredDir, executable);
    for (const root of roots) {
        const candidate = path.join(root, 'Library', 'bin', executable);
        if (fs.existsSync(candidate)) return candidate;
    }
    return process.platform === 'win32' ? executable : executable.replace(/\.exe$/i, '');
}

function popplerRootFromTool(toolPath) {
    const resolved = path.resolve(toolPath);
    const binDir = path.dirname(resolved);
    if (path.basename(binDir).toLowerCase() !== 'bin') return '';
    const libraryDir = path.dirname(binDir);
    if (path.basename(libraryDir).toLowerCase() !== 'library') return '';
    return path.dirname(libraryDir);
}

function popplerExecOptions(toolPath) {
    const binDir = path.dirname(path.resolve(toolPath));
    const root = popplerRootFromTool(toolPath);
    const derivedDataDir = root ? path.join(root, 'share', 'poppler') : '';
    const configuredDataDir = config.poppler.dataDir && fs.existsSync(config.poppler.dataDir)
        ? config.poppler.dataDir
        : '';
    const dataDir = configuredDataDir || (fs.existsSync(derivedDataDir) ? derivedDataDir : '');
    const fontDir = config.poppler.fontDir && fs.existsSync(config.poppler.fontDir)
        ? config.poppler.fontDir
        : (root && fs.existsSync(path.join(root, 'fonts')) ? path.join(root, 'fonts') : '');
    return {
        timeout: config.ocr.renderTimeoutMs,
        windowsHide: true,
        env: {
            ...process.env,
            PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
            ...(dataDir ? { POPPLER_DATADIR: dataDir, POPPLER_DATA: dataDir } : {}),
            ...(fontDir ? { POPPLER_FONTDIR: fontDir } : {}),
        },
    };
}

function validatePopplerRuntime(toolPath) {
    const root = popplerRootFromTool(toolPath);
    const dataDir = config.poppler.dataDir && fs.existsSync(config.poppler.dataDir)
        ? config.poppler.dataDir
        : (root ? path.join(root, 'share', 'poppler') : '');
    const requiredFiles = [
        path.join(dataDir, 'cidToUnicode', 'Adobe-GB1'),
        path.join(dataDir, 'cMap', 'Adobe-GB1'),
    ];
    const missing = requiredFiles.filter(file => !fs.existsSync(file));
    if (missing.length) {
        writeDebugLog('poppler-runtime-missing-data', {
            toolPath,
            root,
            dataDir,
            missing,
            hint: '请确认已将新插件 poppler 文件夹复制为 D:\\poppler，并保留 share\\poppler 目录。',
        });
    }
    return { root, dataDir, missing };
}

async function writeUploadTempFile(file) {
    const filePath = tempFilePath(file.originalname || file.fileName || file.name || 'upload.bin', 'upload');
    fs.writeFileSync(filePath, file.buffer);
    return filePath;
}

async function getPdfPageCount(filePath) {
    const pdfinfo = resolvePopplerPath('pdfinfo');
    try {
        const { stdout } = await execFilePromise(pdfinfo, [filePath], popplerExecOptions(pdfinfo));
        const match = stdout.match(/Pages:\s+(\d+)/i);
        return match ? Number(match[1]) : 1;
    } catch (error) {
        console.warn(`[OCR][PDF] pdfinfo 读取页数失败，按 1 页处理：${filePath}；${error.message}`);
        return 1;
    }
}

function listRenderedImages(outputPrefix) {
    const dir = path.dirname(outputPrefix);
    const base = path.basename(outputPrefix);
    return fs.readdirSync(dir)
        .filter(name => name.startsWith(`${base}-`) && /\.(jpg|jpeg)$/i.test(name))
        .map(name => {
            const match = name.match(/-(\d+)\.(?:jpg|jpeg)$/i);
            return {
                pageNumber: Number(match?.[1] || 0),
                filePath: path.join(dir, name),
            };
        })
        .sort((left, right) => left.pageNumber - right.pageNumber);
}

async function renderPdfPages(filePath, knownPageCount = null) {
    const pageCount = knownPageCount || await getPdfPageCount(filePath);
    const outputPrefix = path.join(ensureTempDir(), `pdf_page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const pdftoppm = resolvePopplerPath('pdftoppm');
    const runtimeStatus = validatePopplerRuntime(pdftoppm);
    const started = Date.now();
    try {
        await execFilePromise(pdftoppm, [
            '-jpeg',
            '-freetype',
            'yes',
            '-aa',
            'yes',
            '-r',
            String(config.ocr.renderScale),
            filePath,
            outputPrefix,
        ], popplerExecOptions(pdftoppm));
    } catch (error) {
        const detail = [error.message, error.stderr].filter(Boolean).join('\n').slice(0, 1200);
        throw new Error(`PDF 切片失败：${detail}`);
    }

    const renderedImages = listRenderedImages(outputPrefix);
    const files = renderedImages.map((item, index) => ({
        fileName: `${path.basename(filePath)}_page_${item.pageNumber || index + 1}.jpg`,
        pageNumber: item.pageNumber || index + 1,
        filePath: item.filePath,
        buffer: fs.readFileSync(item.filePath),
        mimeType: 'image/jpeg',
        fileType: 'pdf-page',
    }));
    writeDebugLog('pdf-render-completed', {
        filePath,
        pageCount,
        renderedPageCount: files.length,
        renderScale: config.ocr.renderScale,
        elapsedMs: Date.now() - started,
        pdftoppm,
        popplerRoot: runtimeStatus.root,
        popplerDataDir: runtimeStatus.dataDir,
        popplerMissingData: runtimeStatus.missing,
        tempDir: ensureTempDir(),
        fileNames: files.map(item => item.fileName),
        imageBytes: files.map(item => item.buffer.length),
    });
    return { pageCount, files };
}

module.exports = {
    cleanupFiles,
    getPdfPageCount,
    renderPdfPages,
    resolvePopplerPath,
    validatePopplerRuntime,
    writeUploadTempFile,
};
