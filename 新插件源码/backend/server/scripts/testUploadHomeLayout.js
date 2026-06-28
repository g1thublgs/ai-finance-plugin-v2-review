const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pluginRoot = path.resolve(__dirname, '..', '..', '..', '预填预审事中审核一体化插件');
const popupHtml = fs.readFileSync(path.join(pluginRoot, 'popup.html'), 'utf8');

assert(
    /\.upload-home-main\s*{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/.test(popupHtml),
    '首页主区域应分为操作区和附件列表滚动区',
);
assert(
    /\.upload-home-main\s*{[\s\S]*max-height:\s*calc\(100vh\s*-\s*64px\)/.test(popupHtml),
    '首页主区域应限制在可视高度内，避免附件列表撑开遮挡操作区',
);
assert(
    /class="panel upload-progress-panel"/.test(popupHtml),
    '附件识别进度面板应使用独立滚动容器类',
);
assert(
    /\.upload-progress-panel\s+\.file-list\s*{[\s\S]*flex:\s*1/.test(popupHtml),
    '附件列表应在进度面板内独立滚动',
);

console.log('testUploadHomeLayout passed');
