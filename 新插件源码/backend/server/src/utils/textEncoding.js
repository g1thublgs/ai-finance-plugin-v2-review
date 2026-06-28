function looksMojibake(text) {
    return /[ÃÂâ€æåçä脙脗芒鈧γッ�]/.test(text || '');
}

function scoreChinese(text) {
    const chinese = (String(text).match(/[\u4e00-\u9fff]/g) || []).length;
    const mojibake = (String(text).match(/[ÃÂâ€æåçä脙脗芒鈧γッ�]/g) || []).length;
    return chinese * 3 - mojibake * 2;
}

function decodeLatin1Utf8(text) {
    try {
        return Buffer.from(text, 'latin1').toString('utf8');
    } catch (error) {
        return text;
    }
}

function repairText(value) {
    if (typeof value !== 'string' || !value || !looksMojibake(value)) return value;
    const candidates = [value, decodeLatin1Utf8(value)];
    return candidates.sort((a, b) => scoreChinese(b) - scoreChinese(a))[0];
}

function repairObjectEncoding(value) {
    if (Array.isArray(value)) return value.map(repairObjectEncoding);
    if (value && typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, val]) => {
            output[repairText(key)] = repairObjectEncoding(val);
        });
        return output;
    }
    return repairText(value);
}

module.exports = {
    repairText,
    repairObjectEncoding,
};

