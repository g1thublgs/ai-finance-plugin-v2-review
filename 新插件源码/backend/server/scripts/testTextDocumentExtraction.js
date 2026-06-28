const assert = require('assert');
const zlib = require('zlib');

const {
    extractTextFromBuffer,
    isTextDocumentFile,
} = require('../src/services/ocr/textDocumentExtractor');

function dosDateTime() {
    return { time: 0, date: 0 };
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function zipSingleFile(fileName, content) {
    const name = Buffer.from(fileName, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    const { time, date } = dosDateTime();
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(0, 42);

    const localRecord = Buffer.concat([local, name, compressed]);
    const centralRecord = Buffer.concat([central, name]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(centralRecord.length, 12);
    end.writeUInt32LE(localRecord.length, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([localRecord, centralRecord, end]);
}

(async () => {
    assert.strictEqual(isTextDocumentFile('出差审批单.wps'), true);
    assert.strictEqual(isTextDocumentFile('出差审批单.doc'), true);
    assert.strictEqual(isTextDocumentFile('出差审批单.ofd'), true);
    assert.strictEqual(isTextDocumentFile('出租车发票.pdf'), false);

    const wpsBuffer = Buffer.from('机关干部外出报告申请表\n申请人：张三\n出差地点：广州市\n开始日期：2026-05-06', 'utf16le');
    const wpsResult = await extractTextFromBuffer({ fileName: '机关干部外出报告申请表.wps', buffer: wpsBuffer });
    assert.match(wpsResult.text, /机关干部外出报告申请表/);
    assert.match(wpsResult.text, /张三/);
    assert.match(wpsResult.text, /广州市/);

    const ofdBuffer = zipSingleFile('Doc_0/Pages/Page_0/Content.xml', '<ofd:TextObject><ofd:TextCode>广州出租车机打发票 金额39.00</ofd:TextCode></ofd:TextObject>');
    const ofdResult = await extractTextFromBuffer({ fileName: '广州出租车机打发票.ofd', buffer: ofdBuffer });
    assert.match(ofdResult.text, /广州出租车机打发票/);
    assert.match(ofdResult.text, /39\.00/);

    console.log('文本附件抽取测试通过');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
