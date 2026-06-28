// background.js - 控制预填预审浮窗显示状态

chrome.runtime.onInstalled.addListener(() => {
    console.log('AI财务预填预审审核助手已安装');
});

const floatingState = new Map();

chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) return;
    const current = floatingState.get(tab.id) || false;
    const visible = !current;
    floatingState.set(tab.id, visible);
    chrome.tabs.sendMessage(tab.id, { action: 'togglePrefillFloating', visible }).catch(() => {
        console.log('无法发送消息，content script 可能未注入');
    });
});
