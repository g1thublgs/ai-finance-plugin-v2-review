const fs = require('fs');
const path = require('path');

const config = require('../config/appConfig');

const logDir = path.join(config.projectRoot, 'server', 'logs');
const logFile = path.join(logDir, 'ocr-debug.log');
const latestFile = path.join(logDir, 'ocr-debug-latest.json');

function isEnabled() {
    return process.env.OCR_DEBUG !== 'false';
}

function truncateText(value, maxLength = Number(process.env.OCR_DEBUG_MAX_TEXT || 12000)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...(已截断，原长度 ${text.length})`;
}

function sanitize(value, depth = 0) {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') return truncateText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth > 5) return truncateText(value, 2000);
    if (Array.isArray(value)) return value.slice(0, 80).map(item => sanitize(item, depth + 1));
    if (typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, child]) => {
            if (/base64|buffer|binary|bytes|fileContent|image_url|dataUrl/i.test(key)) {
                output[key] = '[已省略大字段]';
                return;
            }
            output[key] = sanitize(child, depth + 1);
        });
        return output;
    }
    return truncateText(value);
}

function summarizeItems(items = []) {
    const rows = Array.isArray(items) ? items : [];
    const byType = {};
    rows.forEach(item => {
        const type = item?.recognizeType || item?.docType || item?.type || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
    });
    return { count: rows.length, byType };
}

function writeDebugLog(event, payload = {}) {
    if (!isEnabled()) return;
    const entry = {
        time: new Date().toISOString(),
        event,
        ...sanitize(payload),
    };
    try {
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(logFile, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
        fs.writeFileSync(latestFile, JSON.stringify(entry, null, 2), 'utf8');
    } catch (error) {
        console.warn(`[DEBUG][${event}] 写入日志失败：${error.message}`);
    }
    console.log(`[DEBUG][${event}] ${truncateText(entry, Number(process.env.OCR_DEBUG_CONSOLE_MAX_TEXT || 6000))}`);
    if (process.env.DB_RUNTIME_LOGS !== 'false') {
        try {
            const dataStore = require('../services/database/pluginDataStore');
            dataStore.insertRuntimeLog({
                caseId: payload.caseId || payload.pluginCaseId || payload.batchId || '',
                requestId: payload.requestId || '',
                level: /fail|error/i.test(event) ? 'error' : 'debug',
                type: event.includes('ocr') ? 'ocr'
                    : event.includes('audit') || event.includes('rule') ? 'audit'
                        : event.includes('prefill') ? 'prefill'
                            : event.includes('qwen') ? 'model'
                                : 'system',
                eventName: event,
                message: payload.message || '',
                data: entry,
                errorStack: payload.stack || '',
            }).catch(error => {
                console.warn(`[DEBUG][${event}] 写入数据库日志失败：${error.message}`);
            });
        } catch (error) {
            console.warn(`[DEBUG][${event}] 初始化数据库日志失败：${error.message}`);
        }
    }
}

module.exports = {
    sanitize,
    summarizeItems,
    truncateText,
    writeDebugLog,
};
