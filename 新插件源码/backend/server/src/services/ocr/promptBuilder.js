function buildAllowedTypes(profile = {}) {
    return Array.isArray(profile.documentTypes) && profile.documentTypes.length
        ? profile.documentTypes
        : ['normalInvoice', 'other'];
}

function buildOcrPrompt(profile = {}) {
    if (typeof profile.buildOcrPrompt === 'function') return profile.buildOcrPrompt();
    if (typeof profile.ocrPrompt === 'string' && profile.ocrPrompt.trim()) return profile.ocrPrompt.trim();
    throw new Error(`场景 ${profile.scenarioType || 'unknown'} 未配置独立 OCR 提示词文件`);
}

function buildBatchOcrPrompt(files = [], profile = {}) {
    if (typeof profile.buildBatchOcrPrompt === 'function') return profile.buildBatchOcrPrompt(files);
    const list = files.map((file, index) => `${index + 1}. ${file.fileName || file.name || `page_${index + 1}`}`).join('\n');
    return `${buildOcrPrompt(profile)}

【多图输出要求】
本次会同时发送多张图片，请按图片顺序返回一个数组：
{"files":[{"fileName":"图片文件名","data":[...]}]}
files 长度必须等于输入图片数量，fileName 必须完全照抄下方图片列表。
每张图片只识别自己的内容，严禁把上一张或下一张图片的数据复制给空白页。
空白、无票据、低证据图片必须输出 "data":[]，不要省略该 fileName。

图片列表：
${list}
`.trim();
}

module.exports = {
    buildAllowedTypes,
    buildBatchOcrPrompt,
    buildOcrPrompt,
};
