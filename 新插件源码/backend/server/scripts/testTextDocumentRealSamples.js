const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { extractTextFromBuffer } = require('../src/services/ocr/textDocumentExtractor');

const repoRoot = path.resolve(__dirname, '../../../../../..');
const samples = [
    {
        file: path.join(repoRoot, '资料', '测试数据', '差旅费', '东莞报销', '机关干部外出报告申请表.wps'),
        pattern: /机关干部外出报告|外出报告|出差|目的地|申请/,
    },
    {
        file: path.join(repoRoot, '资料', '测试数据', '其他事项', '其他交通费审核', '其他交通费审核.doc'),
        pattern: /交通补贴|出租车|公务出行|明细表|报销/,
    },
];

(async () => {
    for (const sample of samples) {
        if (!fs.existsSync(sample.file)) continue;
        const result = await extractTextFromBuffer({
            fileName: path.basename(sample.file),
            buffer: fs.readFileSync(sample.file),
        });
        assert.ok(result.textLength > 0, `${sample.file} 未抽取到文字`);
        assert.match(result.text, sample.pattern, `${sample.file} 未抽取到预期业务文字`);
    }
    console.log('文本附件真实样例抽取测试通过');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
