function safeJsonParse(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function safeJsonStringify(value) {
    if (value === undefined) return null;
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({ error: 'JSON序列化失败' });
    }
}

function compactText(value) {
    return String(value || '').replace(/\s+/g, '').trim();
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
}

module.exports = {
    safeJsonParse,
    safeJsonStringify,
    compactText,
    asArray,
};

