const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const config = require('../src/config/appConfig');
const { resolvePopplerPath, validatePopplerRuntime } = require('../src/services/ocr/pdfRenderer');

function exists(filePath) {
    return Boolean(filePath && fs.existsSync(filePath));
}

function hasChinesePath(filePath = '') {
    return /[\u4e00-\u9fff]/.test(String(filePath));
}

function runTool(toolPath, args = []) {
    try {
        const stdout = execFileSync(toolPath, args, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30000,
        });
        return { ok: true, output: stdout.trim().slice(0, 1000) };
    } catch (error) {
        return {
            ok: false,
            output: [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').slice(0, 2000),
        };
    }
}

function main() {
    const pdftoppm = resolvePopplerPath('pdftoppm');
    const pdfinfo = resolvePopplerPath('pdfinfo');
    const runtime = validatePopplerRuntime(pdftoppm);
    const dataDir = runtime.dataDir || config.poppler.dataDir;
    const fontDir = exists(config.poppler.fontDir)
        ? config.poppler.fontDir
        : path.join(runtime.root || '', 'fonts');
    const checks = [
        { name: 'pdftoppm.exe', path: pdftoppm, ok: exists(pdftoppm) },
        { name: 'pdfinfo.exe', path: pdfinfo, ok: exists(pdfinfo) },
        { name: 'POPPLER_DATADIR', path: dataDir, ok: exists(dataDir) },
        { name: 'Adobe-GB1 cidToUnicode', path: path.join(dataDir || '', 'cidToUnicode', 'Adobe-GB1'), ok: exists(path.join(dataDir || '', 'cidToUnicode', 'Adobe-GB1')) },
        { name: 'Adobe-GB1 CMap', path: path.join(dataDir || '', 'cMap', 'Adobe-GB1'), ok: exists(path.join(dataDir || '', 'cMap', 'Adobe-GB1')) },
        { name: 'POPPLER_FONTDIR', path: fontDir, ok: exists(fontDir) },
        { name: 'OCR temp dir', path: config.ocr.tempDir, ok: !hasChinesePath(config.ocr.tempDir) },
        { name: 'Poppler root no Chinese path', path: runtime.root, ok: !hasChinesePath(runtime.root) },
    ];

    const version = exists(pdftoppm) ? runTool(pdftoppm, ['-h']) : { ok: false, output: 'pdftoppm not found' };
    const result = {
        config: {
            popplerRoot: config.poppler.root,
            pdftoppmPath: config.poppler.pdftoppmPath,
            pdfinfoPath: config.poppler.pdfinfoPath,
            dataDir: config.poppler.dataDir,
            fontDir: config.poppler.fontDir,
            ocrTempDir: config.ocr.tempDir,
        },
        resolved: {
            pdftoppm,
            pdfinfo,
            runtime,
        },
        checks,
        allRequiredOk: checks.filter(item => item.name !== 'POPPLER_FONTDIR').every(item => item.ok),
        help: [
            '推荐把新插件目录下的 poppler 文件夹完整复制为 D:\\poppler。',
            'D:\\poppler 必须包含 Library\\bin\\pdftoppm.exe 和 share\\poppler\\cidToUnicode\\Adobe-GB1。',
            '如果新版火车票仍缺中文，请把服务器 C:\\Windows\\Fonts 下的 simsun.ttc、msyh.ttc、simhei.ttf 等中文字体复制到 D:\\poppler\\fonts。',
            '不要把 Poppler 放在含中文、空格或特殊字符的路径下。',
        ],
        pdftoppmHelpOk: version.ok,
        pdftoppmHelpPreview: version.output,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.allRequiredOk) process.exitCode = 1;
}

main();
