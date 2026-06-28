const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const config = require('../../config/appConfig');

const execFilePromise = util.promisify(execFile);
const SQLITE_BRIDGE_TIMEOUT_MS = Number(process.env.SQLITE_BRIDGE_TIMEOUT_MS || 30000);
const SQLITE_BRIDGE_MAX_BUFFER = Number(process.env.SQLITE_BRIDGE_MAX_BUFFER || 20 * 1024 * 1024);

function pythonExePath() {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
    const win7Portable = path.join(config.projectRoot, 'python-win7', 'python.exe');
    if (process.platform === 'win32' && fs.existsSync(win7Portable)) return win7Portable;
    const bundled = path.join(config.ruleRuntimeRoot, 'python', process.platform === 'win32' ? 'python.exe' : 'python');
    return fs.existsSync(bundled) ? bundled : 'python';
}

function ensurePayloadDir() {
    const candidates = [
        path.join(path.dirname(config.databasePath), 'sqlite_payloads'),
        process.platform === 'win32' ? 'C:\\ai_finance_plugin_tmp\\sqlite_payloads' : '',
        path.join(os.tmpdir(), 'ai_finance_sqlite_payloads'),
    ].filter(Boolean);

    for (const dir of candidates) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        } catch (error) {
            // Try the next candidate.
        }
    }
    throw new Error('Cannot create sqlite payload temp directory. Check disk permissions.');
}

function writePayloadFile(payload = {}) {
    const payloadDir = ensurePayloadDir();
    const filePath = path.join(
        payloadDir,
        `sqlite_payload_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.json`,
    );
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
    return filePath;
}

function removePayloadFile(filePath) {
    if (!filePath) return;
    try {
        const payloadRoot = path.resolve(ensurePayloadDir());
        const resolved = path.resolve(filePath);
        if (resolved.startsWith(payloadRoot + path.sep) && fs.existsSync(resolved)) fs.unlinkSync(resolved);
    } catch (error) {
        // Ignore cleanup failures.
    }
}

function compactError(error) {
    return [
        error && error.message,
        error && error.stderr,
        error && error.stdout,
    ].filter(Boolean).join('\n').slice(0, 3000);
}

async function runBridge(mode, payload = {}) {
    const script = path.join(__dirname, 'sqliteBridge.py');
    const pythonPath = pythonExePath();
    const payloadFile = writePayloadFile(payload);
    const args = [script, mode, config.databasePath, '--payload-file', payloadFile];
    let stdout;
    try {
        const result = await execFilePromise(pythonPath, args, {
            windowsHide: true,
            timeout: SQLITE_BRIDGE_TIMEOUT_MS,
            maxBuffer: SQLITE_BRIDGE_MAX_BUFFER,
        });
        stdout = result.stdout;
    } catch (error) {
        const detail = compactError(error);
        const tooLong = /ENAMETOOLONG/i.test(detail);
        throw new Error([
            `SQLite bridge failed${tooLong ? ' (ENAMETOOLONG)' : ''}: ${detail}`,
            `pythonPath=${pythonPath}`,
            `bridgeScript=${script}`,
            `databasePath=${config.databasePath}`,
            `payloadFile=${payloadFile}`,
            'Tips:',
            '1. If ENAMETOOLONG still appears, make sure sqliteService.js and sqliteBridge.py are both updated on the intranet server.',
            '2. If ENOENT appears, check python.exe or set PYTHON_BIN to a compatible Python path.',
            '3. Windows 7 may need Python 3.8/3.9 instead of Python 3.12.',
            '4. Check antivirus or security policy if Node cannot spawn python.exe.',
        ].join('\n'));
    } finally {
        removePayloadFile(payloadFile);
    }

    let parsed;
    try {
        parsed = JSON.parse(stdout || '{}');
    } catch (error) {
        throw new Error(`SQLite bridge returned non-JSON output: ${(stdout || '').slice(0, 1000)}`);
    }
    if (!parsed.success) throw new Error(parsed.error || 'SQLite operation failed');
    return parsed;
}

async function getStatus() {
    return runBridge('status');
}

async function query(sql, params = []) {
    const result = await runBridge('query', { sql, params });
    return result.rows || [];
}

async function exec(sql, params = []) {
    return runBridge('exec', { sql, params });
}

async function execScript(sql) {
    return runBridge('script', { sql });
}

async function batch(operations = []) {
    if (!Array.isArray(operations) || !operations.length) return { success: true, changes: 0, results: [] };
    return runBridge('batch', { operations });
}

module.exports = {
    batch,
    exec,
    execScript,
    getStatus,
    query,
};
