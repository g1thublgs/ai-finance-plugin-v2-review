// content.js - 预填预审浮窗与财务页面一键填写

(function() {
    'use strict';

    let floatingWindow = null;
    let isVisible = false;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function createFloatingWindow() {
        if (floatingWindow) return;

        floatingWindow = document.createElement('div');
        floatingWindow.className = 'finance-prefill-floating';
        floatingWindow.style.display = 'none';

        const header = document.createElement('div');
        header.className = 'finance-prefill-header';
        header.innerHTML = '<h3>AI财务预填预审审核助手</h3><button class="finance-prefill-close" title="关闭">✕</button>';

        const body = document.createElement('div');
        body.className = 'finance-prefill-body';
        const iframe = document.createElement('iframe');
        iframe.id = 'financePrefillFrame';
        iframe.src = chrome.runtime.getURL('popup.html');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.background = '#fff';
        body.appendChild(iframe);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'finance-prefill-resize-handle';

        floatingWindow.appendChild(header);
        floatingWindow.appendChild(body);
        floatingWindow.appendChild(resizeHandle);
        document.body.appendChild(floatingWindow);
        bindFloatingEvents(header);
    }

    function bindFloatingEvents(header) {
        const closeBtn = header.querySelector('.finance-prefill-close');
        closeBtn.addEventListener('click', () => {
            floatingWindow.style.display = 'none';
            isVisible = false;
        });

        header.addEventListener('mousedown', (event) => {
            if (event.target === closeBtn) return;
            isDragging = true;
            const rect = floatingWindow.getBoundingClientRect();
            dragOffsetX = event.clientX - rect.left;
            dragOffsetY = event.clientY - rect.top;
            floatingWindow.style.cursor = 'move';
            event.preventDefault();
        });

        document.addEventListener('mousemove', (event) => {
            if (!isDragging || !floatingWindow) return;
            floatingWindow.style.left = `${event.clientX - dragOffsetX}px`;
            floatingWindow.style.top = `${event.clientY - dragOffsetY}px`;
            floatingWindow.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            if (floatingWindow) floatingWindow.style.cursor = '';
        });
    }

    function getFinanceDocument() {
        const iframe = document.querySelector('iframe[src*="/cw/biz/nk/jfzcsq/"]');
        if (!iframe) return document;
        try {
            return iframe.contentDocument || iframe.contentWindow.document;
        } catch (error) {
            return document;
        }
    }

    function getFinanceWindow(doc) {
        return doc.defaultView || window;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function extractPageBasics() {
        const doc = getFinanceDocument();
        const text = (selector) => {
            const el = doc.querySelector(selector);
            return el ? (el.value || el.textContent || '').trim() : '';
        };
        const valueOf = (el) => (el ? (el.value || el.textContent || '').trim() : '');
        const compact = (value) => String(value || '').replace(/\s+/g, '').replace(/[：:]/g, '');
        const directText = (el) => Array.from(el?.childNodes || [])
            .filter(node => node.nodeType === 3)
            .map(node => node.textContent || '')
            .join('')
            .trim();
        const readByLabel = (label) => {
            const target = compact(label);
            const nodes = Array.from(doc.querySelectorAll('td,th,label,span,div'));
            for (const node of nodes) {
                const labelText = compact(directText(node) || node.textContent);
                if (labelText !== target) continue;
                if (node.htmlFor) {
                    const targetEl = doc.getElementById(node.htmlFor);
                    const targetValue = valueOf(targetEl);
                    if (targetValue) return targetValue;
                }
                const next = valueOf(node.nextElementSibling);
                if (next) return next;
                const cells = Array.from(node.parentElement?.children || []);
                const index = cells.indexOf(node);
                if (index >= 0) {
                    const rowNext = valueOf(cells[index + 1]);
                    if (rowNext) return rowNext;
                }
            }
            return '';
        };
        const departmentName = text('#SSBM_MC')
            || text('[id="SSBM_MC"]')
            || text('#SQ_SSBM')
            || readByLabel('所属部门');
        return {
            unitName: departmentName,
            departmentName,
            applyDate: text('#SQ_RQ') || text('#SQ_SQRQ'),
            applicantName: text('#JBR_MC') || text('#SQ_JBR'),
            pageUrl: location.href
        };
    }

    function groupTravelRows(doc) {
        const grid = doc.getElementById('bxmx_grid');
        if (!grid) return [];
        const groups = new Map();
        const rows = grid.querySelectorAll('tbody tr.bodyTr[rowindex]');
        rows.forEach(row => {
            const index = row.getAttribute('rowindex');
            if (!groups.has(index)) groups.set(index, { rowindex: index, top: null, bottom: null });
            const group = groups.get(index);
            if (row.querySelector('td[dataname="RYMD"], td[dataname="STARTIME"]')) group.top = row;
            if (row.querySelector('td[dataname="ENDTIME"], td[dataname="BXJE"]')) group.bottom = row;
        });
        return [...groups.values()]
            .filter(group => group.top || group.bottom)
            .sort((a, b) => Number(a.rowindex) - Number(b.rowindex));
    }

    async function ensureTravelRows(doc, targetCount) {
        const win = getFinanceWindow(doc);
        let groups = groupTravelRows(doc);
        let attempts = 0;
        while (groups.length < targetCount && attempts < targetCount + 3) {
            attempts += 1;
            const before = groups.length;
            try {
                if (typeof win.bt_addbx === 'function') {
                    win.bt_addbx();
                } else {
                    const addButton = doc.getElementById('bt_addbx') || doc.querySelector('button[onclick*="bt_addbx"], .glyphicon-plus.rowButton');
                    if (!addButton) break;
                    addButton.click();
                }
            } catch (error) {
                const addButton = doc.getElementById('bt_addbx') || doc.querySelector('button[onclick*="bt_addbx"], .glyphicon-plus.rowButton');
                if (!addButton) break;
                addButton.click();
            }
            await sleep(500);
            groups = groupTravelRows(doc);
            if (groups.length <= before && attempts > 2) break;
        }
        return groups;
    }

    function setNativeValue(element, value) {
        const text = value === undefined || value === null ? '' : String(value);
        const win = element.ownerDocument?.defaultView || window;
        const oldReadonly = element.readOnly;
        if (oldReadonly) element.readOnly = false;
        try { element.focus(); } catch (error) {}
        const proto = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) descriptor.set.call(element, text);
        else element.value = text;
        element.dispatchEvent(new win.Event('input', { bubbles: true }));
        element.dispatchEvent(new win.Event('change', { bubbles: true }));
        element.dispatchEvent(new win.Event('blur', { bubbles: true }));
        if (oldReadonly) element.readOnly = oldReadonly;
    }

    function updateKnockoutData(doc, cell, column, value) {
        const win = getFinanceWindow(doc);
        const ko = win.ko;
        if (!ko || typeof ko.contextFor !== 'function') return false;
        const input = cell.querySelector(`input[name$="_${column}"], input, textarea`);
        const contexts = [ko.contextFor(cell), input ? ko.contextFor(input) : null].filter(Boolean);
        const candidates = [];
        contexts.forEach(ctx => candidates.push(ctx.$data, ctx.$parent, ctx.$root));
        for (const data of candidates) {
            if (!data || typeof data !== 'object') continue;
            if (column in data) {
                if (typeof ko.isObservable === 'function' && ko.isObservable(data[column])) data[column](value);
                else data[column] = value;
                return true;
            }
            if (data.value && typeof ko.isObservable === 'function' && ko.isObservable(data.value)) {
                data.value(value);
                return true;
            }
            if (data.text && typeof ko.isObservable === 'function' && ko.isObservable(data.text)) {
                data.text(value);
                return true;
            }
        }
        return false;
    }

    function updateSdatagridRowData(doc, cell, column, value) {
        const win = getFinanceWindow(doc);
        const ko = win.ko;
        if (!ko || typeof ko.contextFor !== 'function') return false;

        const row = cell.closest('tr.bodyTr[rowindex]');
        const input = cell.querySelector(`input[name$="_${column}"], input, textarea`);
        const contexts = [cell, row, input]
            .filter(Boolean)
            .map(el => ko.contextFor(el))
            .filter(Boolean);
        const seen = new Set();
        let touched = false;

        const setExactColumn = (data) => {
            if (!data || typeof data !== 'object' || seen.has(data) || !(column in data)) return false;
            seen.add(data);
            const target = data[column];
            if (typeof ko.isObservable === 'function' && ko.isObservable(target)) {
                target(value);
            } else {
                data[column] = value;
            }
            return true;
        };

        contexts.forEach(ctx => {
            [ctx.$parent, ctx.$data, ctx.$rawData, ctx.$root].forEach(data => {
                touched = setExactColumn(data) || touched;
            });
            if (ctx.$parentContext) {
                touched = setExactColumn(ctx.$parentContext.$data) || touched;
            }
        });

        if (touched) {
            contexts.forEach(ctx => {
                const rootData = ctx.$root && ctx.$root.data;
                try {
                    if (rootData && typeof ko.isObservable === 'function' && ko.isObservable(rootData) && rootData.valueHasMutated) {
                        rootData.valueHasMutated();
                    }
                } catch (error) {}
            });
            if (row) row.classList.add('changed');
        }
        return touched;
    }

    function normalizeChoiceText(column, value) {
        const text = value === undefined || value === null ? '' : String(value).trim();
        if (column === 'RYZJ') return text || '其他人员';
        if (column === 'CJJTF_JTGJ') {
            if (/高铁|动车|火车|铁路|列车|车次/.test(text)) return '火车';
            if (/飞机|机票|航班|航空/.test(text)) return '飞机';
            if (/轮船|船/.test(text)) return '轮船';
            if (/公车|公务用车|单位派车|派车/.test(text)) return '公车';
            if (/汽车|客车|大巴|巴士|公交|出租|网约车/.test(text)) return '汽车';
            if (/其他|其它/.test(text)) return '其它';
            return '其它';
        }
        return text;
    }

    function normalizeTransportToolForFill(record = {}) {
        const amount = normalizeNumberText(record.transportAmount);
        if (amount <= 0) return '其它';
        return normalizeChoiceText('CJJTF_JTGJ', record.transportType);
    }

    function normalizeTravelRecordForFill(record = {}) {
        const normalized = { ...record };
        normalized.transportType = normalizeTransportToolForFill(record);
        if (normalizeNumberText(record.transportAmount) <= 0) {
            normalized.transportAmount = 0;
            normalized.transportDocs = normalized.transportDocs || 0;
        }
        return normalized;
    }

    function normalizeDateText(value) {
        const text = value === undefined || value === null ? '' : String(value).trim();
        if (!text) return '';
        const match = text
            .replace(/[年月]/g, '-')
            .replace(/日/g, '')
            .replace(/\./g, '-')
            .replace(/\//g, '-')
            .match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!match) return text;
        return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
    }

    function dispatchCommitKeys(doc, element) {
        if (!element) return;
        const win = getFinanceWindow(doc);
        ['keydown', 'keypress', 'keyup'].forEach(type => {
            element.dispatchEvent(new win.KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
            }));
        });
        element.dispatchEvent(new win.KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Tab',
            code: 'Tab',
            keyCode: 9,
            which: 9,
        }));
    }

    function triggerFrameworkValue(doc, element, value) {
        if (!element) return;
        try {
            const win = getFinanceWindow(doc);
            if (win.jQuery) {
                win.jQuery(element)
                    .val(value)
                    .trigger('input')
                    .trigger('keyup')
                    .trigger('change')
                    .trigger('blur');
            }
        } catch (error) {}
    }

    function updateAdamComboData(doc, host, input, rawValue, displayText) {
        const win = getFinanceWindow(doc);
        const ko = win.ko;
        if (!ko || typeof ko.contextFor !== 'function') return false;
        const contexts = [host, input]
            .filter(Boolean)
            .map(el => ko.contextFor(el))
            .filter(Boolean);
        const candidates = [];
        contexts.forEach(ctx => candidates.push(ctx.$data, ctx.$parent, ctx.$root));
        const seen = new Set();
        let touched = false;
        const setObservable = (data, key, value) => {
            if (!data || typeof data !== 'object' || !(key in data)) return false;
            const target = data[key];
            if (typeof ko.isObservable === 'function' && ko.isObservable(target)) {
                target(value);
                return true;
            }
            if (typeof target !== 'function') {
                data[key] = value;
                return true;
            }
            return false;
        };
        for (const data of candidates) {
            if (!data || typeof data !== 'object' || seen.has(data)) continue;
            seen.add(data);
            ['value', 'selectedValue', 'realValue', 'id', 'key'].forEach(key => {
                touched = setObservable(data, key, rawValue) || touched;
            });
            ['text', 'showText', 'displayText', 'selectedText', 'label', 'name'].forEach(key => {
                touched = setObservable(data, key, displayText) || touched;
            });
        }
        return touched;
    }

    function setPageComboValue(doc, id, displayText, rawValue) {
        const win = getFinanceWindow(doc);
        const host = doc.getElementById(id)
            || doc.querySelector(`combobox[name$=".${id}"], combobox[name="${id}"]`)
            || doc.querySelector(`[name$=".${id}"]`)?.closest('combobox, .adam-ui-combobox, .dropdown, td, div');
        const input = host && /^(INPUT|SELECT|TEXTAREA)$/.test(host.tagName)
            ? host
            : (host && host.querySelector('input.adam-ui-showinput, select, input, textarea'))
                || doc.querySelector(`input[name$=".${id}"], input[name="${id}"], select[name$=".${id}"], select[name="${id}"]`);
        if (!host && !input) return false;

        if (input && input.tagName === 'SELECT') {
            const option = [...input.options].find(item => {
                const optionText = `${item.value || ''} ${item.textContent || ''} ${item.label || ''}`.replace(/\s+/g, '');
                return optionText.includes(String(rawValue)) || optionText.includes(displayText);
            });
            input.value = option ? option.value : displayText;
            input.dispatchEvent(new win.Event('change', { bubbles: true }));
            input.dispatchEvent(new win.Event('blur', { bubbles: true }));
        } else if (input) {
            setNativeValue(input, displayText);
            input.setAttribute('title', displayText);
            triggerFrameworkValue(doc, input, displayText);
            dispatchCommitKeys(doc, input);
        }

        updateAdamComboData(doc, host, input, rawValue, displayText);
        if (host) {
            host.setAttribute('data-prefill-value', displayText);
            host.setAttribute('data-prefill-code', rawValue);
            const displayArea = host.querySelector('.display-area, .input-group, .form-control');
            if (displayArea) displayArea.setAttribute('title', displayText);
        }
        try {
            if (win.jQuery) {
                if (host) win.jQuery(host).trigger('input').trigger('change').trigger('blur');
                if (input) win.jQuery(input).trigger('input').trigger('change').trigger('blur');
            }
        } catch (error) {}
        return true;
    }

    function fillDefaultReimbursementFlags(doc) {
        return {
            finalReport: setPageComboValue(doc, 'BYJ_BJ', '是', 'Y'),
            advancePay: setPageComboValue(doc, 'SFYF', '否', '0') || setPageComboValue(doc, 'YFHX', '否', '0'),
        };
    }

    function notifyCellChanged(doc, cell, column, value) {
        const win = getFinanceWindow(doc);
        ['input', 'keyup', 'change', 'blur'].forEach(type => {
            cell.dispatchEvent(new win.Event(type, { bubbles: true }));
        });
        try {
            if (win.jQuery) {
                const $cell = win.jQuery(cell);
                $cell.trigger('input').trigger('keyup').trigger('change').trigger('blur');
                win.jQuery('#bxmx_grid').trigger('change').trigger('blur');
                win.jQuery(`#bxmx_grid td[dataname="${column}"]`).trigger('change');
            }
        } catch (error) {}
        cell.setAttribute('data-prefill-column', column);
        cell.setAttribute('data-prefill-value', value === undefined || value === null ? '' : String(value));
    }

    function textMatchesChoice(optionText, wanted) {
        const a = String(optionText || '').replace(/\s+/g, '');
        const b = String(wanted || '').replace(/\s+/g, '');
        if (!a || !b) return false;
        if (a === b || a.includes(b) || b.includes(a)) return true;
        if (b === '火车' && /高铁|动车|火车|铁路|列车/.test(a)) return true;
        if (b === '汽车' && /汽车|客车|大巴|巴士/.test(a)) return true;
        if (b === '其它' && /其他|其它/.test(a)) return true;
        if (b === '其他人员' && /其他/.test(a)) return true;
        return false;
    }

    async function activateCellEditor(doc, cell) {
        cell.scrollIntoView({ block: 'center', inline: 'center' });
        const win = getFinanceWindow(doc);
        cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
        cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: win }));
        await sleep(120);
    }

    function commitCellDisplay(cell, column, value) {
        const text = value === undefined || value === null ? '' : String(value);
        const input = cell.querySelector(`input[name$="_${column}"], input.adam-ui-showinput, input, textarea`);
        if (input) setNativeValue(input, text);
        const editingDiv = cell.querySelector('.editingDiv') || cell.querySelector('.sdatagrid-content-container[columnname]');
        if (editingDiv) {
            editingDiv.textContent = text;
            editingDiv.title = text;
            editingDiv.setAttribute('data-prefill-value', text);
        }
        const editorDiv = cell.querySelector('.editorDiv');
        if (editorDiv) editorDiv.title = text;
        const visible = cell.querySelector('.sdatagrid-content-container') || cell;
        visible.textContent = text;
        visible.title = text;
        visible.setAttribute('data-prefill-value', text);
        cell.classList.add('changed');
        const win = cell.ownerDocument?.defaultView || window;
        ['input', 'change', 'blur'].forEach(type => cell.dispatchEvent(new win.Event(type, { bubbles: true })));
    }

    async function selectCodeListValue(doc, cell, column, value) {
        const wanted = normalizeChoiceText(column, value);
        if (!wanted) return false;
        await activateCellEditor(doc, cell);
        const input = cell.querySelector(`input[name$="_${column}"], input.adam-ui-showinput, input`);
        if (input) {
            input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: getFinanceWindow(doc) }));
            setNativeValue(input, wanted);
        }
        await sleep(80);
        const editor = cell.querySelector('.editorDiv') || cell;
        const options = [
            ...editor.querySelectorAll('.list-group-item'),
            ...doc.querySelectorAll('.dropdown-menu .list-group-item')
        ];
        const option = options.find(item => textMatchesChoice(item.getAttribute('title') || item.textContent, wanted));
        if (option) {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: getFinanceWindow(doc) }));
            option.click();
            await sleep(120);
        }
        updateKnockoutData(doc, cell, column, wanted);
        commitCellDisplay(cell, column, wanted);
        notifyCellChanged(doc, cell, column, wanted);
        return true;
    }

    async function setLookupTextValue(doc, cell, column, value) {
        const text = normalizeChoiceText(column, value);
        await activateCellEditor(doc, cell);
        const input = cell.querySelector(`input[name$="_${column}"], input.adam-ui-showinput, input`);
        if (input) {
            input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: getFinanceWindow(doc) }));
            input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: getFinanceWindow(doc) }));
            setNativeValue(input, text);
            triggerFrameworkValue(doc, input, text);
            dispatchCommitKeys(doc, input);
            await sleep(80);
        }
        updateKnockoutData(doc, cell, column, text);
        commitCellDisplay(cell, column, text);
        notifyCellChanged(doc, cell, column, text);
        await sleep(160);
        triggerGridRecalc(doc);
        return true;
    }

    async function setDateCellValue(doc, cell, column, value) {
        const text = normalizeDateText(value);
        if (!text) return false;
        await activateCellEditor(doc, cell);
        const active = doc.activeElement;
        const input = cell.querySelector(`input[name$="_${column}"], input.adam-ui-showinput, input`)
            || (active && /^(INPUT|TEXTAREA)$/.test(active.tagName) ? active : null);
        if (input && !input.disabled) {
            input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: getFinanceWindow(doc) }));
            input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: getFinanceWindow(doc) }));
            setNativeValue(input, text);
            triggerFrameworkValue(doc, input, text);
            dispatchCommitKeys(doc, input);
            await sleep(120);
        }
        updateKnockoutData(doc, cell, column, text);
        commitCellDisplay(cell, column, text);
        notifyCellChanged(doc, cell, column, text);
        await sleep(180);
        triggerGridRecalc(doc);
        return true;
    }

    async function tryEditorFill(doc, cell, column, value) {
        const text = normalizeChoiceText(column, value);
        await activateCellEditor(doc, cell);
        const active = doc.activeElement;
        if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && !active.disabled) {
            setNativeValue(active, text);
            return true;
        }
        const editor = cell.querySelector(`input[name$="_${column}"], input:not([disabled]), textarea:not([disabled]), select:not([disabled])`)
            || doc.querySelector('.sdatagrid input:not([disabled]), .sdatagrid textarea:not([disabled]), .sdatagrid select:not([disabled])');
        if (editor) {
            setNativeValue(editor, text);
            return true;
        }
        return false;
    }

    async function setCellValue(doc, group, column, value) {
        const text = normalizeChoiceText(column, value);
        const scope = [group.top, group.bottom].filter(Boolean);
        let cell = null;
        for (const row of scope) {
            cell = row.querySelector(`td[dataname="${column}"]`);
            if (cell) break;
        }
        if (!cell) return false;

        if (['RYZJ', 'CJJTF_JTGJ'].includes(column)) return selectCodeListValue(doc, cell, column, text);
        if (['RYMD', 'STARADDRESS', 'ENDDDRESS'].includes(column)) return setLookupTextValue(doc, cell, column, text);
        if (['STARTIME', 'ENDTIME'].includes(column)) return setDateCellValue(doc, cell, column, text);

        const directRowUpdated = updateSdatagridRowData(doc, cell, column, text);
        updateKnockoutData(doc, cell, column, text);
        if (directRowUpdated) {
            commitCellDisplay(cell, column, text);
            notifyCellChanged(doc, cell, column, text);
            return true;
        }

        const input = cell.querySelector('input, textarea, select');
        if (input && !input.disabled) {
            setNativeValue(input, text);
            triggerFrameworkValue(doc, input, text);
            commitCellDisplay(cell, column, text);
            notifyCellChanged(doc, cell, column, text);
            return true;
        }
        await tryEditorFill(doc, cell, column, text);
        commitCellDisplay(cell, column, text);
        notifyCellChanged(doc, cell, column, text);
        return true;
    }

    function triggerGridRecalc(doc) {
        const win = getFinanceWindow(doc);
        const fnNames = ['calHj', 'countHj', 'sumBxmx', 'queryTotal', 'calcTotal', 'totalMoney', 'refreshTotal'];
        fnNames.forEach(name => {
            try {
                if (typeof win[name] === 'function') win[name]();
            } catch (error) {}
        });
        try {
            if (win.jQuery) {
                win.jQuery('#bxmx_grid').trigger('change').trigger('blur');
            }
        } catch (error) {}
    }

    function readCellText(row, column) {
        if (!row) return '';
        const cell = row.querySelector(`td[dataname="${column}"]`);
        if (!cell) return '';
        const input = cell.querySelector(`input[name$="_${column}"], input.adam-ui-showinput, textarea`);
        if (input && String(input.value || '').trim()) return String(input.value || '').trim();
        const prefill = cell.querySelector('[data-prefill-value]');
        if (prefill && String(prefill.getAttribute('data-prefill-value') || '').trim()) {
            return String(prefill.getAttribute('data-prefill-value') || '').trim();
        }
        const container = cell.querySelector('.editingDiv') || cell.querySelector('.sdatagrid-content-container') || cell;
        return (container.textContent || '').trim();
    }

    function normalizeNumberText(value) {
        const n = Number(String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
        return Number.isFinite(n) ? n : 0;
    }

    function readControlValue(doc, idOrName) {
        const key = String(idOrName || '').trim();
        if (!key) return '';
        const selectors = [
            `#${key}`,
            `[id="${key}"]`,
            `[name="${key}"]`,
            `[name="JFZCSQ.${key}"]`,
            `[columnname="${key}"]`,
        ];
        const element = selectors.map(selector => {
            try { return doc.querySelector(selector); } catch (error) { return null; }
        }).find(Boolean);
        if (!element) return '';
        const ownValue = (element.value ?? element.getAttribute?.('value') ?? '').toString().trim();
        if (ownValue) return ownValue;
        const ownText = (element.textContent || '').trim();
        if (ownText) return ownText;
        const inner = element.querySelector?.('input.adam-ui-showinput, input, textarea, select');
        if (!inner) return '';
        return (inner.value || inner.textContent || inner.getAttribute?.('value') || '').trim();
    }

    function readMeetingNumber(doc, idOrName) {
        return normalizeNumberText(readControlValue(doc, idOrName));
    }

    function buildRecordKey(rowData, index) {
        return [
            rowData.name || '',
            rowData.startTime || '',
            rowData.endTime || '',
            rowData.startAddress || '',
            rowData.endAddress || '',
            rowData.recordIndex ?? index,
        ].join('|');
    }

    function extractTravelDetail() {
        const doc = getFinanceDocument();
        const personal = [];
        const groups = groupTravelRows(doc);
        groups.forEach((group, idx) => {
            const rowData = {
                recordIndex: Number(group.rowindex || idx),
                name: readCellText(group.top, 'RYMD'),
                rank: readCellText(group.top, 'RYZJ'),
                startTime: readCellText(group.top, 'STARTIME'),
                startAddress: readCellText(group.top, 'STARADDRESS'),
                endTime: readCellText(group.bottom, 'ENDTIME'),
                endAddress: readCellText(group.bottom, 'ENDDDRESS'),
                transportType: readCellText(group.bottom, 'CJJTF_JTGJ'),
                transportDocs: readCellText(group.bottom, 'CJJTF_DJ'),
                transportAmount: readCellText(group.bottom, 'CJJTF_JE'),
                hotelDays: readCellText(group.bottom, 'ZSF_JTGJ'),
                hotelDocs: readCellText(group.bottom, 'ZSF_DJ'),
                hotelAmount: readCellText(group.bottom, 'ZSF_JE'),
                hotelStandard: readCellText(group.bottom, 'BZSX_JE'),
                mealDays: readCellText(group.bottom, 'HSF_TS'),
                mealPersons: readCellText(group.bottom, 'HSF_RS'),
                mealStandard: readCellText(group.bottom, 'HSF_BTBZ'),
                mealAmount: readCellText(group.bottom, 'HSF_JE'),
                localTransportDays: readCellText(group.bottom, 'SNJTF_TS'),
                localTransportPersons: readCellText(group.bottom, 'SNJTF_RS'),
                localTransportStandard: readCellText(group.bottom, 'SNJTF_BTBZ'),
                localTransportAmount: readCellText(group.bottom, 'SNJTF_JE'),
                otherAmount: readCellText(group.bottom, 'BXJE'),
                remark: readCellText(group.bottom, 'BZ'),
            };
            rowData.transportAmount = normalizeNumberText(rowData.transportAmount);
            rowData.hotelAmount = normalizeNumberText(rowData.hotelAmount);
            rowData.mealAmount = normalizeNumberText(rowData.mealAmount);
            rowData.localTransportAmount = normalizeNumberText(rowData.localTransportAmount);
            rowData.otherAmount = normalizeNumberText(rowData.otherAmount);
            rowData.totalAmount = rowData.transportAmount + rowData.hotelAmount + rowData.mealAmount + rowData.localTransportAmount + rowData.otherAmount;
            rowData.recordKey = buildRecordKey(rowData, idx);
            if (rowData.name || rowData.startTime || rowData.endTime || rowData.transportAmount || rowData.hotelAmount) {
                personal.push(rowData);
            }
        });

        const summary = {};
        const templateTable = doc.getElementById('templateTable');
        if (templateTable) {
            const getSummary = (id) => {
                const el = templateTable.querySelector(`#${id}`);
                return el ? (el.textContent || el.value || '').trim() : '';
            };
            summary.totalAll = getSummary('HZ_ALL_SUM');
            summary.transportDocsTotal = getSummary('HZ_CJJTF_DJ');
            summary.transportAmountTotal = getSummary('HZ_CJJTF_JE');
            summary.hotelDaysTotal = getSummary('HZ_ZSF_TS');
            summary.hotelDocsTotal = getSummary('HZ_ZSF_DJ');
            summary.hotelAmountTotal = getSummary('YB_ZSF_JE');
            summary.mealDaysTotal = getSummary('HZ_HSF_TS');
            summary.mealPersonsTotal = getSummary('HZ_HSF_RS');
            summary.mealAmountTotal = getSummary('YB_HSF_JE');
            summary.localTransportDaysTotal = getSummary('HZ_SNJTF_TS');
            summary.localTransportPersonsTotal = getSummary('HZ_SNJTF_RS');
            summary.localTransportAmountTotal = getSummary('YB_SNJTF_JE');
            summary.otherAmountTotal = getSummary('HZ_QT_JE');
        }
        return { personal, summary };
    }

    async function waitForPageStandards(doc) {
        const started = Date.now();
        while (Date.now() - started < 8000) {
            const hasStandard = groupTravelRows(doc).some(group =>
                readCellText(group.bottom, 'BZSX_JE')
                || readCellText(group.bottom, 'HSF_BTBZ')
                || readCellText(group.bottom, 'SNJTF_BTBZ')
            );
            if (hasStandard) return;
            await sleep(300);
        }
    }

    function readAttachmentRows(doc) {
        return [...doc.querySelectorAll('#fj_grid tbody tr[datakey]')].map(row => {
            const link = row.querySelector('a[onclick*="viewFile"]');
            const nameCell = row.querySelector('td[name="WJ_MC"], td[data-name="WJ_MC"]');
            const typeCell = row.querySelector('td[name="FJLX_DM"], td[data-name="FJLX_DM"]');
            return {
                key: row.getAttribute('datakey') || '',
                fileName: (link?.textContent || nameCell?.textContent || '').trim(),
                attachmentType: (typeCell?.textContent || '').trim(),
            };
        }).filter(item => item.fileName || item.key);
    }

    function readPaymentRows(doc) {
        const grid = doc.getElementById('mx_grid');
        if (!grid) return [];
        const groups = new Map();
        [...grid.querySelectorAll('tbody tr.bodyTr[rowindex]')].forEach(row => {
            const index = row.getAttribute('rowindex');
            if (!groups.has(index)) groups.set(index, { rowindex: index, rows: [] });
            groups.get(index).rows.push(row);
        });
        return [...groups.values()].map(group => {
            const text = (column) => {
                const cell = group.rows.map(row => row.querySelector(`td[dataname="${column}"]`)).find(Boolean);
                return (cell?.querySelector('.sdatagrid-content-container')?.textContent || cell?.textContent || '').trim();
            };
            return {
                rowindex: group.rowindex,
                payee: text('SKRMC'),
                payType: text('ZFFS_MC'),
                amount: text('ZF_JE'),
                cardAmount: text('BX_JE'),
                cardConsumeTime: text('GWKHKSJ'),
                expenseType: text('HWLX'),
            };
        }).filter(item => item.payee || item.payType || item.amount || item.cardAmount || item.cardConsumeTime || item.expenseType);
    }

    function extractMeetingDetail() {
        const doc = getFinanceDocument();
        const basics = extractPageBasics();
        const meetingFieldIds = ['HYTS', 'HYRS', 'HSF', 'ZSF', 'CDF', 'QTFY', 'SQ_JE', 'PJZS', 'HYPXBH'];
        const presentMeetingFields = meetingFieldIds.filter(id => doc.getElementById(id) || doc.querySelector(`[name="JFZCSQ.${id}"]`));
        const bodyText = doc.body?.textContent || '';
        const meetingData = {
            days: readMeetingNumber(doc, 'HYTS'),
            peopleCount: readMeetingNumber(doc, 'HYRS'),
            mealAmount: readMeetingNumber(doc, 'HSF'),
            accommodationAmount: readMeetingNumber(doc, 'ZSF'),
            venueAmount: readMeetingNumber(doc, 'CDF'),
            otherAmount: readMeetingNumber(doc, 'QTFY'),
            totalAmount: readMeetingNumber(doc, 'SQ_JE'),
            paperAttachmentCount: readMeetingNumber(doc, 'PJZS'),
            meetingPlanNo: readControlValue(doc, 'HYPXBH'),
            reimbursementUnitName: readControlValue(doc, 'SSBM_MC') || readControlValue(doc, 'SQ_SSBM') || basics.unitName || '',
            departmentName: readControlValue(doc, 'SSBM_MC') || readControlValue(doc, 'SQ_SSBM') || basics.departmentName || '',
        };
        const payments = readPaymentRows(doc).map(row => ({
            rowindex: row.rowindex,
            payeeName: row.payee,
            payType: row.payType,
            paymentAmount: normalizeNumberText(row.amount),
            cardAmount: normalizeNumberText(row.cardAmount),
            cardConsumeTime: row.cardConsumeTime || '',
            expenseType: row.expenseType,
        }));
        return {
            scenarioType: 'meeting',
            hasMeetingFields: presentMeetingFields.length > 0 || /会议费|会议经费/.test(bodyText),
            presentMeetingFields,
            pageTextHint: /会议费|会议经费/.test(bodyText) ? '会议费' : '',
            meetingData,
            attachments: readAttachmentRows(doc),
            payments,
            pageBasics: basics,
            pageUrl: basics.pageUrl || location.href,
        };
    }

    function extractCurrentPageAttachments() {
        const doc = getFinanceDocument();
        const rows = doc.querySelectorAll('#fj_grid tbody tr[datakey]');
        return [...rows].map((row, index) => {
            const link = row.querySelector('a[onclick*="viewFile"]');
            const nameCell = row.querySelector('td[name="WJ_MC"], td[data-name="WJ_MC"]');
            const onclick = link?.getAttribute('onclick') || '';
            const match = onclick.match(/viewFile\('([^']+)','([^']+)'\)/);
            const id = match?.[1] || row.getAttribute('datakey') || '';
            const name = match?.[2] || link?.textContent || nameCell?.textContent || `附件${index + 1}`;
            return {
                id: String(id || '').trim(),
                name: String(name || '').trim(),
                rowIndex: index,
                attachmentType: (row.querySelector('td[name="FJLX_DM"], td[data-name="FJLX_DM"]')?.textContent || '').trim(),
            };
        }).filter(item => item.id || item.name);
    }

    function extractCurrentPagePaymentInfo() {
        return readPaymentRows(getFinanceDocument()).map(row => ({
            rowindex: row.rowindex,
            skrmc: row.payee,
            khyhmc: '',
            yhzh: '',
            zfje: normalizeNumberText(row.amount || row.cardAmount),
            rawZfje: row.amount || row.cardAmount || '',
            bxje: normalizeNumberText(row.cardAmount),
            gwkhksj: row.cardConsumeTime || '',
            payType: row.payType,
            expenseType: row.expenseType,
        }));
    }

    function extractCurrentPageTotalAmount() {
        const payments = extractCurrentPagePaymentInfo();
        if (payments.length) {
            const total = payments.reduce((sum, row) => sum + normalizeNumberText(row.zfje), 0);
            if (total > 0) return total;
        }
        const doc = getFinanceDocument();
        const candidates = [
            '#ZFJE',
            '#ZFJEHJ',
            '#SQ_JE',
            '[name="JFZCSQ.ZFJE"]',
            '[name="JFZCSQ.ZFJEHJ"]',
            '[name="JFZCSQ.SQ_JE"]',
            '[columnname="ZF_JE"]',
        ];
        for (const selector of candidates) {
            const element = doc.querySelector(selector);
            const value = element ? (element.value || element.textContent || '') : '';
            const amount = normalizeNumberText(value);
            if (amount > 0) return amount;
        }
        return null;
    }

    function extractCurrentPageEconomicSubjects() {
        const doc = getFinanceDocument();
        const subjects = [];
        const table = doc.getElementById('zbtable');
        if (table) {
            [...table.querySelectorAll('tbody tr')].forEach(row => {
                [...row.querySelectorAll('td')].some(cell => {
                    const text = (cell.textContent || '').trim();
                    const match = text.match(/^(\d{10,14})\s+/);
                    if (match && !subjects.includes(match[1])) subjects.push(match[1]);
                    return Boolean(match);
                });
            });
        }
        if (!subjects.length) {
            const bodyText = doc.body?.textContent || '';
            const regex = /(\d{10,14})\s+\S+/g;
            let match;
            while ((match = regex.exec(bodyText)) !== null) {
                if (!subjects.includes(match[1])) subjects.push(match[1]);
            }
        }
        return subjects;
    }

    function hasPaymentTypeReady(doc) {
        const grid = doc.getElementById('mx_grid');
        if (!grid) return true;
        return readPaymentRows(doc).some(row => row.payType || normalizeNumberText(row.amount) > 0 || normalizeNumberText(row.cardAmount) > 0);
    }

    async function waitForPaymentTypeReady(doc, timeoutMs = 8000) {
        if (hasPaymentTypeReady(doc)) return true;
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            triggerGridRecalc(doc);
            try {
                const win = getFinanceWindow(doc);
                ['countHj', 'calHj', 'queryTotal', 'calcTotal', 'refreshTotal'].forEach(name => {
                    try {
                        if (typeof win[name] === 'function') win[name]();
                    } catch (error) {}
                });
            } catch (error) {}
            if (hasPaymentTypeReady(doc)) return true;
            await sleep(500);
        }
        return hasPaymentTypeReady(doc);
    }

    function getReachableDocuments(rootDoc) {
        const docs = [];
        const seen = new Set();
        const addDoc = (doc) => {
            if (!doc || seen.has(doc)) return;
            seen.add(doc);
            docs.push(doc);
            [...doc.querySelectorAll('iframe')].forEach(frame => {
                try {
                    addDoc(frame.contentDocument || frame.contentWindow?.document);
                } catch (error) {}
            });
        };
        addDoc(rootDoc);
        addDoc(document);
        return docs;
    }

    function base64ToFile(doc, attachment) {
        const win = getFinanceWindow(doc);
        const cleanBase64 = String(attachment.base64 || '').replace(/^data:[^,]+,/, '');
        const binary = win.atob ? win.atob(cleanBase64) : atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const FileCtor = win.File || File;
        return new FileCtor([bytes], attachment.fileName || 'attachment', {
            type: attachment.mimeType || 'application/octet-stream',
            lastModified: Date.now(),
        });
    }

    function setUploadInputFiles(doc, input, attachments) {
        const win = getFinanceWindow(doc);
        const transfer = new (win.DataTransfer || DataTransfer)();
        attachments.forEach(attachment => transfer.items.add(base64ToFile(doc, attachment)));
        input.files = transfer.files;
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    function findFileInput(rootDoc) {
        for (const doc of getReachableDocuments(rootDoc)) {
            const inputs = [...doc.querySelectorAll('input[type="file"]')];
            const input = inputs.find(item => !item.disabled) || inputs[0];
            if (input) return { doc, input };
        }
        return null;
    }

    function invokePageUploadEntry(doc, entry) {
        const win = getFinanceWindow(doc);
        let alertMessage = '';
        const originalAlert = win.alert;
        try {
            win.alert = (message) => {
                alertMessage = String(message || '');
            };
            if (entry.type === 'function' && typeof win[entry.name] === 'function') {
                win[entry.name]();
            } else if (entry.type === 'button' && entry.button) {
                entry.button.click();
            } else {
                return { success: false, message: '附件入口不可用' };
            }
            return alertMessage
                ? { success: false, message: alertMessage }
                : { success: true, message: '' };
        } catch (error) {
            return { success: false, message: error.message || '打开附件入口失败' };
        } finally {
            win.alert = originalAlert;
        }
    }

    async function openAttachmentUploader(doc) {
        const paymentReady = await waitForPaymentTypeReady(doc);
        const entries = [];
        if (typeof getFinanceWindow(doc).batchAddFile === 'function') entries.push({ type: 'function', name: 'batchAddFile' });
        if (typeof getFinanceWindow(doc).addFile === 'function') entries.push({ type: 'function', name: 'addFile' });
        [
            doc.getElementById('bt_batchAddFile'),
            doc.querySelector('button[onclick*="batchAddFile"]'),
            doc.getElementById('bt_addFile'),
            doc.querySelector('button[onclick*="addFile"]'),
        ].filter(Boolean).forEach(button => entries.push({ type: 'button', button }));

        let lastMessage = paymentReady ? '' : '付款明细尚未生成支付方式，附件上传入口可能被财务系统拦截。';
        for (const entry of entries) {
            const result = invokePageUploadEntry(doc, entry);
            await sleep(600);
            if (result.success) {
                const found = await waitForFileInput(doc, 1500);
                if (found) return { success: true, message: paymentReady ? '' : lastMessage };
                lastMessage = result.message || lastMessage || '附件入口已触发，但暂未出现文件选择控件。';
                continue;
            }
            lastMessage = result.message || lastMessage;
            if (/支付类型|支付方式|先选择/i.test(lastMessage)) {
                await waitForPaymentTypeReady(doc, 3000);
            }
        }
        return { success: false, message: lastMessage || '未找到页面添加附件或批量添加入口' };
    }

    async function waitForFileInput(doc, timeoutMs = 8000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const found = findFileInput(doc);
            if (found) return found;
            await sleep(250);
        }
        return null;
    }

    function matchesAttachmentType(text, wanted) {
        const a = String(text || '').replace(/\s+/g, '');
        const b = String(wanted || '').replace(/\s+/g, '');
        if (!a || !b) return false;
        if (a === b || a.includes(b) || b.includes(a)) return true;
        if (b.includes('发票') && /发票|电子发票/.test(a)) return true;
        if (b === '其他' && /其他/.test(a)) return true;
        return false;
    }

    async function setAttachmentTypeInDoc(doc, typeLabel) {
        let changed = false;
        const win = getFinanceWindow(doc);
        const selects = [...doc.querySelectorAll('select')].filter(select => /FJLX|fj|type|lx/i.test(`${select.name || ''} ${select.id || ''} ${select.className || ''}`));
        for (const select of selects) {
            const option = [...select.options].find(item => matchesAttachmentType(item.textContent || item.label || item.value, typeLabel));
            if (option) {
                select.value = option.value;
                select.dispatchEvent(new win.Event('change', { bubbles: true }));
                changed = true;
            }
        }

        const inputs = [...doc.querySelectorAll('input, textarea')].filter(input => {
            const mark = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''}`;
            return /FJLX|附件类型|选择项|type|lx/i.test(mark) && !input.disabled;
        });
        for (const input of inputs) {
            input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
            setNativeValue(input, typeLabel);
            triggerFrameworkValue(doc, input, typeLabel);
            await sleep(80);
            const option = [...doc.querySelectorAll('.dropdown-menu .list-group-item, .list-group-item, .dropdown-menu a, .dropdown-menu li')]
                .find(item => matchesAttachmentType(item.getAttribute('title') || item.textContent, typeLabel));
            if (option) {
                option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: win }));
                option.click();
                changed = true;
            } else {
                changed = true;
            }
        }
        return changed;
    }

    async function setAttachmentType(doc, typeLabel) {
        let changed = false;
        for (const scopeDoc of getReachableDocuments(doc)) {
            // eslint-disable-next-line no-await-in-loop
            if (await setAttachmentTypeInDoc(scopeDoc, typeLabel)) changed = true;
        }
        return changed;
    }

    function clickUploadConfirm(doc) {
        const buttons = [...doc.querySelectorAll('button, a, input[type="button"], input[type="submit"]')];
        const target = buttons.find(button => {
            const text = (button.textContent || button.value || button.title || '').replace(/\s+/g, '');
            return /开始上传|上传|确定|保存|提交|批量添加/.test(text) && !/取消|关闭|删除|清空/.test(text);
        });
        if (!target) return false;
        target.click();
        return true;
    }

    function refreshAttachmentGrid(doc) {
        const win = getFinanceWindow(doc);
        try {
            if (typeof win._query === 'function') win._query();
        } catch (error) {}
        try {
            if (win.jQuery) win.jQuery('#fj_grid').trigger('reload').trigger('change');
        } catch (error) {}
    }

    async function waitForAttachmentIncrease(doc, beforeCount, expectedIncrease, timeoutMs = 20000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            refreshAttachmentGrid(doc);
            const current = readAttachmentRows(doc).length;
            if (current >= beforeCount + expectedIncrease) return true;
            await sleep(700);
        }
        return false;
    }

    async function uploadAttachmentGroup(doc, attachments, typeLabel) {
        const beforeCount = readAttachmentRows(doc).length;
        const opened = await openAttachmentUploader(doc);
        if (!opened.success) {
            return { success: false, uploaded: 0, message: opened.message || '未找到页面添加附件或批量添加入口' };
        }
        await setAttachmentType(doc, typeLabel);
        const found = await waitForFileInput(doc);
        if (!found) {
            return { success: false, uploaded: 0, message: opened.message || '已打开附件入口，但未定位到文件上传控件' };
        }
        setUploadInputFiles(found.doc, found.input, attachments);
        await sleep(500);
        await setAttachmentType(found.doc, typeLabel);
        const confirmed = clickUploadConfirm(found.doc) || clickUploadConfirm(doc);
        if (!confirmed) {
            found.input.dispatchEvent(new getFinanceWindow(found.doc).Event('change', { bubbles: true }));
        }
        const increased = await waitForAttachmentIncrease(doc, beforeCount, attachments.length);
        return {
            success: increased,
            uploaded: Math.max(readAttachmentRows(doc).length - beforeCount, 0),
            message: increased
                ? (opened.message ? `附件已同步上传；${opened.message}` : '附件已同步上传')
                : (opened.message ? `已注入文件，但页面未在限定时间内刷新附件列表；${opened.message}` : '已注入文件，但页面未在限定时间内刷新附件列表'),
        };
    }

    async function syncPageAttachments(doc, attachments = []) {
        const valid = attachments.filter(item => item && item.base64 && item.fileName);
        if (!valid.length) return { success: true, uploaded: 0, skipped: 0, message: '无待上传附件' };
        if (!doc.getElementById('fj_grid')) {
            return { success: false, uploaded: 0, skipped: valid.length, message: '未找到附件表格 fj_grid' };
        }
        const existingNames = new Set(readAttachmentRows(doc).map(item => item.fileName));
        const pending = valid.filter(item => !existingNames.has(item.fileName));
        if (!pending.length) return { success: true, uploaded: 0, skipped: valid.length, message: '页面已存在同名附件' };

        const groups = new Map();
        pending.forEach(item => {
            const typeLabel = item.attachmentType || '其他';
            if (!groups.has(typeLabel)) groups.set(typeLabel, []);
            groups.get(typeLabel).push(item);
        });

        const details = [];
        let uploaded = 0;
        for (const [typeLabel, group] of groups.entries()) {
            // eslint-disable-next-line no-await-in-loop
            const result = await uploadAttachmentGroup(doc, group, typeLabel);
            uploaded += result.uploaded || 0;
            details.push({ typeLabel, count: group.length, ...result });
        }
        return {
            success: details.every(item => item.success),
            uploaded,
            skipped: valid.length - pending.length,
            details,
            message: details.map(item => `${item.typeLabel}:${item.uploaded}/${item.count}`).join('，'),
        };
    }

    async function fillTravelPrefillRecords(records, attachments = []) {
        const doc = getFinanceDocument();
        if (!doc.getElementById('bxmx_grid')) {
            throw new Error('未找到差旅费报销明细表，请确认当前页面为差旅费报销申请页面。');
        }
        fillDefaultReimbursementFlags(doc);
        const normalizedRecords = (records || []).map(normalizeTravelRecordForFill);
        const rows = await ensureTravelRows(doc, normalizedRecords.length);
        if (rows.length < normalizedRecords.length) {
            throw new Error(`报销明细行不足，需要${normalizedRecords.length}行，当前仅找到${rows.length}行。`);
        }

        const fieldMap = {
            RYMD: 'name',
            RYZJ: 'rank',
            STARTIME: 'startTime',
            STARADDRESS: 'startAddress',
            ENDTIME: 'endTime',
            ENDDDRESS: 'endAddress',
            CJJTF_JTGJ: 'transportType',
            CJJTF_DJ: 'transportDocs',
            CJJTF_JE: 'transportAmount',
            ZSF_JTGJ: 'hotelDays',
            ZSF_DJ: 'hotelDocs',
            BZSX_JE: 'hotelStandard',
            ZSF_JE: 'hotelAmount',
            HSF_TS: 'mealDays',
            HSF_RS: 'mealPersons',
            HSF_BTBZ: 'mealStandard',
            HSF_JE: 'mealAmount',
            SNJTF_TS: 'localTransportDays',
            SNJTF_RS: 'localTransportPersons',
            SNJTF_BTBZ: 'localTransportStandard',
            SNJTF_JE: 'localTransportAmount',
            BXJE: 'otherAmount',
            BZ: 'remark'
        };

        const filled = [];
        const standardTriggerColumns = ['RYMD', 'RYZJ', 'STARTIME', 'STARADDRESS', 'ENDTIME', 'ENDDDRESS'];
        for (let i = 0; i < normalizedRecords.length; i += 1) {
            const row = rows[i];
            const record = normalizedRecords[i] || {};
            for (const [column, key] of Object.entries(fieldMap)) {
                const value = record[key];
                if (value === undefined || value === null) continue;
                // 财务系统的 sdatagrid 需要走编辑器提交，否则仅改 DOM 可能无法进入保存数据源。
                await setCellValue(doc, row, column, value);
                if (standardTriggerColumns.includes(column)) {
                    await sleep(column === 'ENDDDRESS' ? 650 : 260);
                }
            }
            triggerGridRecalc(doc);
            await sleep(300);
            filled.push(record.name || `第${i + 1}条`);
        }
        triggerGridRecalc(doc);
        await waitForPageStandards(doc);
        const flagResult = fillDefaultReimbursementFlags(doc);
        triggerGridRecalc(doc);
        const attachmentResult = await syncPageAttachments(doc, attachments);
        return {
            success: true,
            filledCount: filled.length,
            filled,
            fillMode: 'hybrid-sdatagrid-row-data',
            flagResult,
            attachmentResult,
            travelData: extractTravelDetail(),
        };
    }

    function normalizeOtherText(value) {
        return String(value || '').replace(/\s+/g, '').toLowerCase();
    }

    function moneyText(value) {
        const n = Number(String(value || 0).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
        return Number.isFinite(n) ? n.toFixed(2) : '0.00';
    }

    function getOtherBudgetRows(doc) {
        const table = doc.getElementById('zbtable');
        if (!table) return [];
        return [...table.querySelectorAll('tbody tr')].map(row => {
            const cells = [...row.querySelectorAll('td')];
            return {
                row,
                checkbox: row.querySelector('input[name="zbcheckbox"], input[type="checkbox"]'),
                amountInput: row.querySelector('input[name^="SQJE"], input.adam-ui-showinput, moneybox input'),
                department: (cells[1]?.textContent || '').trim(),
                functionSubject: (cells[2]?.textContent || '').trim(),
                economicSubject: (cells[3]?.textContent || '').trim(),
                purpose: (cells[4]?.textContent || '').trim(),
            };
        }).filter(item => item.economicSubject || item.purpose);
    }

    function scoreOtherBudgetRow(row, projectNames) {
        const haystack = normalizeOtherText([row.economicSubject, row.purpose, row.functionSubject].join(' '));
        let score = 0;
        (projectNames && projectNames.length ? projectNames : ['其他']).forEach(project => {
            const keyword = normalizeOtherText(project);
            if (!keyword) return;
            if (haystack.includes(keyword)) score += 10;
            const purpose = normalizeOtherText(row.purpose);
            if (purpose && keyword.includes(purpose)) score += 8;
            [...keyword].forEach(ch => {
                if (ch && haystack.includes(ch)) score += 0.2;
            });
        });
        return score;
    }

    function pickOtherBudgetRow(doc, projectNames) {
        const rows = getOtherBudgetRows(doc);
        if (!rows.length) return null;
        const ranked = rows
            .map(row => ({ row, score: scoreOtherBudgetRow(row, projectNames) }))
            .sort((a, b) => b.score - a.score);
        if (ranked[0].score > 0) return ranked[0].row;
        return rows.find(row => /其他|办公|委托/.test(row.economicSubject + row.purpose)) || rows[0];
    }

    function findAdamInput(doc, selectors) {
        for (const selector of selectors) {
            const host = doc.querySelector(selector);
            if (!host) continue;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(host.tagName)) return host;
            const inner = host.querySelector('input.adam-ui-showinput, textarea, input, select');
            if (inner) return inner;
        }
        return null;
    }

    function setOtherField(doc, selectors, value) {
        const input = findAdamInput(doc, selectors);
        if (!input) return false;
        setNativeValue(input, value);
        triggerFrameworkValue(doc, input, value);
        dispatchCommitKeys(doc, input);
        return true;
    }

    function callPageRecalc(doc) {
        const win = getFinanceWindow(doc);
        ['changeje_SQJE', 'countHj', 'calHj', 'calcTotal', 'queryTotal', 'refreshTotal'].forEach(name => {
            try {
                if (typeof win[name] === 'function') win[name]();
            } catch (error) {}
        });
        try {
            if (win.jQuery) {
                win.jQuery('#zbtable').trigger('change');
                win.jQuery('#mx_grid').trigger('change');
            }
        } catch (error) {}
    }

    async function fillOtherBudget(doc, projectNames, amount) {
        const rows = getOtherBudgetRows(doc);
        if (!rows.length) {
            throw new Error('未找到预算指标表，请确认当前页面为其他事项报销申请页面。');
        }
        rows.forEach(item => {
            if (item.checkbox) item.checkbox.checked = false;
            if (item.amountInput) setNativeValue(item.amountInput, '0.00');
        });
        const matched = pickOtherBudgetRow(doc, projectNames);
        if (!matched) return null;
        if (matched.checkbox) {
            if (!matched.checkbox.checked) matched.checkbox.click();
            matched.checkbox.checked = true;
            try {
                const win = getFinanceWindow(doc);
                if (typeof win.jqueryFun === 'function') win.jqueryFun(matched.checkbox);
            } catch (error) {}
        }
        await sleep(180);
        if (matched.amountInput) {
            setNativeValue(matched.amountInput, moneyText(amount));
            triggerFrameworkValue(doc, matched.amountInput, moneyText(amount));
        }
        matched.row.style.backgroundColor = '#fff9d6';
        callPageRecalc(doc);
        return matched;
    }

    function getOtherRecord(preAuditData, records) {
        return (records && records[0]) || (preAuditData?.records || [])[0] || {};
    }

    async function fillOtherPrefillData(preAuditData = {}, records = [], attachments = []) {
        const doc = getFinanceDocument();
        if (!doc.getElementById('zbtable') || !doc.getElementById('SQ_JE')) {
            throw new Error('未找到其他事项报销页面的预算指标或报销金额字段。');
        }
        fillDefaultReimbursementFlags(doc);
        const record = getOtherRecord(preAuditData, records);
        const amount = Number(record.totalAmount || preAuditData?.summary?.totalAll || 0);
        const projectNames = record.projectNames || preAuditData?.summary?.projectNames || [];
        const reportName = record.reportName || `${projectNames[0] || '其他事项'}报销`;
        const reason = record.reason || (
            projectNames.length
                ? `根据发票项目“${projectNames.join('、')}”申请报销，价税合计共${moneyText(amount)}元。`
                : `根据已识别发票申请报销，价税合计共${moneyText(amount)}元。`
        );

        const matchedBudget = await fillOtherBudget(doc, projectNames, amount);
        setOtherField(doc, ['#SQ_MC', '[name="JFZCSQ.SQ_MC"]'], reportName);
        setOtherField(doc, ['#SQ_SY', '[name="JFZCSQ.SQ_SY"]'], reason);
        setOtherField(doc, ['#SQ_JE', '[name="JFZCSQ.SQ_JE"]'], moneyText(amount));
        setOtherField(doc, ['#ZFJE', '[name="JFZCSQ.ZFJE"]'], moneyText(amount));
        setOtherField(doc, ['#ZFJEHJ', '[name="JFZCSQ.ZFJEHJ"]'], moneyText(amount));
        setOtherField(doc, ['#PJZS', '[name="JFZCSQ.PJZS"]'], '0');
        setOtherField(doc, ['#FPGS', '[name="JFZCSQ.FPGS"]'], String(record.invoiceCount || attachments.length || 0));
        callPageRecalc(doc);
        const flagResult = fillDefaultReimbursementFlags(doc);
        const attachmentResult = await syncPageAttachments(doc, attachments);
        return {
            success: true,
            filledCount: 1,
            matchedBudget: matchedBudget ? {
                economicSubject: matchedBudget.economicSubject,
                purpose: matchedBudget.purpose,
            } : null,
            flagResult,
            attachmentResult,
        };
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'togglePrefillFloating') {
            createFloatingWindow();
            isVisible = request.visible;
            floatingWindow.style.display = isVisible ? 'flex' : 'none';
            sendResponse({ success: true });
            return true;
        }
        if (request.action === 'extractPrefillPageBasics') {
            sendResponse({ success: true, data: extractPageBasics() });
            return true;
        }
        if (request.action === 'extractPrefillTravelDetail') {
            sendResponse({ success: true, data: extractTravelDetail() });
            return true;
        }
        if (request.action === 'extractAttachments') {
            sendResponse({ success: true, attachments: extractCurrentPageAttachments() });
            return true;
        }
        if (request.action === 'getPaymentInfo') {
            sendResponse({ success: true, payments: extractCurrentPagePaymentInfo() });
            return true;
        }
        if (request.action === 'getTotalAmount') {
            sendResponse({ success: true, totalAmount: extractCurrentPageTotalAmount() });
            return true;
        }
        if (request.action === 'getEconomicSubjects') {
            sendResponse({ success: true, subjects: extractCurrentPageEconomicSubjects() });
            return true;
        }
        if (request.action === 'extractTravelDetail') {
            const travelDetail = extractTravelDetail();
            sendResponse({ success: true, data: travelDetail, ...travelDetail });
            return true;
        }
        if (request.action === 'extractMeetingDetail') {
            const meetingDetail = extractMeetingDetail();
            sendResponse({ success: true, data: meetingDetail, ...meetingDetail });
            return true;
        }
        if (request.action === 'fillTravelPrefillRecords') {
            fillTravelPrefillRecords(request.records || [], request.attachments || [])
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }
        if (request.action === 'fillOtherPrefillData') {
            fillOtherPrefillData(request.preAuditData || {}, request.records || [], request.attachments || [])
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }
        return true;
    });

    createFloatingWindow();
})();
