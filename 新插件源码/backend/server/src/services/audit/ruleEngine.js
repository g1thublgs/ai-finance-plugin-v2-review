const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../../config/appConfig');

const RULE_ENGINE_SCRIPT = path.join(config.rulePythonRoot, 'run_rules.py');
const RULE_ENGINE_TIMEOUT_MS = Number(process.env.RULE_ENGINE_TIMEOUT_MS || 120000);

function getPythonCandidates() {
    const candidates = [];
    const bundledPython = path.join(config.ruleRuntimeRoot, 'python', 'python.exe');
    if (process.env.PYTHON_BIN) candidates.push({ command: process.env.PYTHON_BIN, args: [] });
    if (fs.existsSync(bundledPython)) candidates.push({ command: bundledPython, args: [] });
    candidates.push({ command: 'python', args: [] }, { command: 'python3', args: [] }, { command: 'py', args: ['-3'] });
    return candidates;
}

function stripLargeBase64(value) {
    if (Array.isArray(value)) return value.map(stripLargeBase64);
    if (value && typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, val]) => {
            if (['fileBase64', 'ruleBase64', 'base64', 'fileContent', 'buffer'].includes(key)) return;
            output[key] = stripLargeBase64(val);
        });
        return output;
    }
    return value;
}

function buildRuleContext(body = {}) {
    const attachments = Array.isArray(body.attachments) ? body.attachments.map(stripLargeBase64) : [];
    const prefillData = body.prefillData || body.data || {};
    return {
        scenarioType: body.scenarioType || prefillData.scenarioType || '',
        prefillData,
        records: body.records || prefillData.records || [],
        summary: body.summary || prefillData.summary || {},
        attachments,
        ocrItems: body.ocrItems || [],
        uploadResults: body.uploadResults || [],
        payments: body.payments || body.paymentInfoList || [],
        paymentInfoList: body.paymentInfoList || body.payments || [],
        ruleFileName: body.ruleFileName || '',
        currentPageUrl: body.currentPageUrl || '',
    };
}

function hasScenarioRuleDirectory(scenarioType) {
    if (!scenarioType) return false;
    const ruleDir = path.join(config.rulePythonRoot, scenarioType);
    if (!fs.existsSync(ruleDir)) return false;
    return fs.readdirSync(ruleDir).some(name => /^rule_.*\.py$/i.test(name));
}

function runRuleCommand(candidate, input) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const child = spawn(candidate.command, [...candidate.args, RULE_ENGINE_SCRIPT], {
            cwd: config.rulePythonRoot,
            windowsHide: true,
            env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(new Error('规则引擎执行超时'));
        }, RULE_ENGINE_TIMEOUT_MS);
        child.stdout.on('data', data => { stdout += data.toString('utf8'); });
        child.stderr.on('data', data => { stderr += data.toString('utf8'); });
        child.on('error', error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error((stderr || stdout || `规则引擎退出码 ${code}`).trim()));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (error) {
                reject(new Error(`规则引擎返回内容不是合法 JSON：${stdout.slice(0, 500)}`));
            }
        });
        child.stdin.write(input);
        child.stdin.end();
    });
}

async function runPythonRules(context) {
    if (!fs.existsSync(RULE_ENGINE_SCRIPT)) throw new Error(`规则执行器不存在：${RULE_ENGINE_SCRIPT}`);
    const input = JSON.stringify(context);
    const errors = [];
    for (const candidate of getPythonCandidates()) {
        try {
            return await runRuleCommand(candidate, input);
        } catch (error) {
            errors.push(`${candidate.command}: ${error.message}`);
        }
    }
    throw new Error(`未能启动 Python 规则引擎：${errors.join('；')}`);
}

function failure(error) {
    return {
        issues: [{ category: '规则引擎执行失败', description: error.message, suggestion: '请确认 Python 运行环境、规则目录和 rule_*.py 文件完整。', severity: 'error' }],
        summary: '规则引擎执行失败，请检查后端运行环境。',
        ruleResults: [],
        engine: 'python-rule-functions',
    };
}

module.exports = { buildRuleContext, hasScenarioRuleDirectory, runPythonRules, failure };