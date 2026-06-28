const path = require('path');
const zlib = require('zlib');
const xlsx = require('xlsx');

let iconvLite = null;
try {
    iconvLite = require('iconv-lite');
} catch (error) {
    iconvLite = null;
}

const TEXT_DOCUMENT_EXTENSIONS = new Set([
    '.wps',
    '.doc',
    '.docx',
    '.ofd',
    '.xls',
    '.xlsx',
    '.et',
    '.ett',
    '.csv',
    '.txt',
]);

const IMAGE_ENTRY_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp']);

function isTextDocumentFile(fileName = '') {
    return TEXT_DOCUMENT_EXTENSIONS.has(path.extname(fileName || '').toLowerCase());
}

function decodeBuffer(buffer, encoding) {
    try {
        if (encoding === 'gb18030' && iconvLite) return iconvLite.decode(buffer, 'gb18030');
        return buffer.toString(encoding);
    } catch (error) {
        return '';
    }
}

function decodeText(buffer) {
    const candidates = [
        decodeBuffer(buffer, 'utf8'),
        decodeBuffer(buffer, 'utf16le'),
        decodeBuffer(buffer, 'gb18030'),
    ];
    return candidates
        .map(text => ({ text, score: scoreReadableText(text) }))
        .sort((left, right) => right.score - left.score)[0]?.text || '';
}

function scoreReadableText(text = '') {
    const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const ascii = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const controls = (text.match(/[\u0000-\u0008\u000b-\u001f]/g) || []).length;
    return cjk * 4 + ascii * 0.2 - controls * 3;
}

function htmlDecode(text = '') {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function isUsefulLine(line = '') {
    const text = String(line || '').trim();
    if (!text) return false;
    if (/申请|审批|出差|报销|发票|金额|日期|时间|姓名|乘车|出租|公务|部门|地点|目的地|购买方|销售方|价税合计|住宿|酒店|飞机|火车|车次|航班/.test(text)) return true;
    if (/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}[-/.月]\d{1,2}/.test(text)) return true;
    if (/[￥¥]\s*\d|(?:金额|合计|票价|费用|标准|单价|数量).{0,12}\d|\d+\.\d{1,2}/.test(text)) return true;
    const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const latin = (text.match(/[a-zA-Z]/g) || []).length;
    const digits = (text.match(/\d/g) || []).length;
    if (cjk >= 2 && latin + digits === 0) return true;
    if (text.includes('|') && (cjk + digits) >= 2) return true;
    return false;
}

function normalizeExtractedText(text = '') {
    const lines = htmlDecode(text)
        .replace(/\r/g, '\n')
        .replace(/[\u0000-\u0008\u000b-\u001f]+/g, '\n')
        .split(/\n+/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(isUsefulLine);
    const seen = new Set();
    return lines
        .filter(line => {
            const key = line.slice(0, 180);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join('\n')
        .slice(0, 60000);
}

function xmlToText(xml = '') {
    return normalizeExtractedText(xml
        .replace(/<[^>]+>/g, '\n')
        .replace(/[ \t]+/g, ' '));
}

function readZipEntries(buffer) {
    const entries = [];
    let offset = 0;
    while (offset + 30 <= buffer.length) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) {
            offset += 1;
            continue;
        }
        const method = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const nameStart = offset + 30;
        const dataStart = nameStart + fileNameLength + extraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataStart > buffer.length || dataEnd > buffer.length || compressedSize <= 0) break;
        const name = buffer.slice(nameStart, nameStart + fileNameLength).toString('utf8');
        const compressed = buffer.slice(dataStart, dataEnd);
        let data = Buffer.alloc(0);
        try {
            if (method === 0) data = compressed;
            if (method === 8) data = zlib.inflateRawSync(compressed);
        } catch (error) {
            data = Buffer.alloc(0);
        }
        if (data.length) entries.push({ name, data });
        offset = dataEnd;
    }
    return entries;
}

function extractZipPackage(buffer) {
    const wanted = /\.(xml|rels|txt|ofd)$/i;
    const entries = readZipEntries(buffer);
    const text = entries
        .filter(entry => wanted.test(entry.name) && !/\/(font|image|images|res|resources|media)\//i.test(entry.name))
        .slice(0, 400)
        .map(entry => {
            const lowerName = entry.name.toLowerCase();
            const looksXml = lowerName.endsWith('.xml') || lowerName.endsWith('.ofd') || lowerName.endsWith('.rels');
            const utf8 = decodeBuffer(entry.data, 'utf8');
            const decoded = looksXml && /<[^>]+>/.test(utf8) ? utf8 : decodeText(entry.data);
            return `【${entry.name}】\n${looksXml
                ? xmlToText(decoded)
                : normalizeExtractedText(decoded)}`;
        })
        .filter(Boolean)
        .join('\n');
    const images = entries
        .filter(entry => IMAGE_ENTRY_EXTENSIONS.has(path.extname(entry.name || '').toLowerCase()))
        .filter(entry => entry.data && entry.data.length > 1024)
        .slice(0, 30)
        .map((entry, index) => ({
            fileName: `${path.basename(entry.name) || `embedded_${index + 1}.jpg`}`,
            entryName: entry.name,
            buffer: entry.data,
            size: entry.data.length,
        }));
    return {
        text: normalizeExtractedText(text),
        images,
    };
}

function extractZipText(buffer) {
    return extractZipPackage(buffer).text;
}

function extractSpreadsheetText(buffer) {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: false, raw: false });
        return normalizeExtractedText(workbook.SheetNames.map(sheetName => {
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
            const body = rows
                .map(row => row.map(cell => String(cell ?? '').trim()).filter(Boolean).join(' | '))
                .filter(Boolean)
                .join('\n');
            return `【${sheetName}】\n${body}`;
        }).join('\n\n'));
    } catch (error) {
        return '';
    }
}

function extractBinaryOfficeText(buffer) {
    const decoded = [
        decodeBuffer(buffer, 'utf16le'),
        decodeBuffer(buffer, 'gb18030'),
        decodeBuffer(buffer, 'utf8'),
    ].join('\n');
    const chunks = decoded.match(/[\u4e00-\u9fa5a-zA-Z0-9￥¥（）()《》、，。；;:：\/\\_.\-\s]{2,}/g) || [];
    return normalizeExtractedText(chunks.join('\n'));
}

async function extractTextFromBuffer({ fileName = '', buffer }) {
    const ext = path.extname(fileName || '').toLowerCase();
    let text = '';
    let images = [];
    let method = 'plain';
    if (['.xls', '.xlsx', '.et', '.ett'].includes(ext)) {
        text = extractSpreadsheetText(buffer);
        method = 'spreadsheet';
    }
    if (!text && ['.docx', '.ofd'].includes(ext) && buffer.slice(0, 2).toString('utf8') === 'PK') {
        const extracted = extractZipPackage(buffer);
        text = extracted.text;
        images = extracted.images;
        method = 'zip-xml';
    }
    if (!text && !images.length && ['.wps'].includes(ext) && buffer.slice(0, 2).toString('utf8') === 'PK') {
        const extracted = extractZipPackage(buffer);
        text = extracted.text;
        images = extracted.images;
        method = 'zip-wps';
    }
    if (!text && ['.doc', '.wps'].includes(ext)) {
        text = extractBinaryOfficeText(buffer);
        method = 'binary-office-text';
    }
    if (!text) {
        text = normalizeExtractedText(decodeText(buffer));
        method = 'decoded-text';
    }
    return {
        fileName,
        fileType: ext.replace(/^\./, '') || 'text-document',
        method,
        text,
        textLength: text.length,
        images,
        imageCount: images.length,
    };
}

module.exports = {
    extractTextFromBuffer,
    isTextDocumentFile,
};
