function safeText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function compactText(value) {
    return safeText(value).replace(/\s+/g, '').toLowerCase();
}

function firstValue(source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

function numberValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    const num = match ? Number(match[0]) : 0;
    return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
}

module.exports = {
    safeText,
    compactText,
    firstValue,
    numberValue,
    roundMoney,
    asArray,
};
