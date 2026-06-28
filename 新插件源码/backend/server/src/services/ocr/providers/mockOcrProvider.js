const path = require('path');

function contains(text, words = []) {
    return words.some(word => text.includes(word));
}

function firstKnownPerson(text = '') {
    const people = [
        '陈方圆', '陈方园', '陈萍', '胡闵柱', '陈慧琳', '苏冠荣', '黄嘉辉',
        '黄妙', '邹泽彬', '邹泽斌', '胡鹏', '张三',
    ];
    return people.find(name => text.includes(name)) || '张三';
}

function cityFromName(text = '') {
    if (contains(text, ['北京', '首都'])) return '北京市';
    if (contains(text, ['上海'])) return '上海市';
    if (contains(text, ['西安', '陕西'])) return '陕西省西安市';
    if (contains(text, ['广州', '省局'])) return '广东省广州市';
    if (contains(text, ['深圳'])) return '广东省深圳市';
    if (contains(text, ['沈阳'])) return '辽宁省沈阳市';
    return '上海市';
}

function dateFromName(text = '', fallback = '2026-05-10') {
    const full = text.match(/(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
    if (full) return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`;
    const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (monthDay) return `2023-${String(monthDay[1]).padStart(2, '0')}-${String(monthDay[2]).padStart(2, '0')}`;
    return fallback;
}

function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00`);
    date.setDate(date.getDate() + days);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function accommodationRows(person, city, startDate, days, hotelName) {
    return Array.from({ length: days }, (_, index) => ({
        guestName: person,
        accommodationDate: addDays(startDate, index),
        city,
        hotelName,
        amount: '300',
    }));
}

function mockDataForFile(fileName, profile = {}) {
    const text = String(fileName || '');
    const lowerExt = path.extname(text).toLowerCase();
    const person = firstKnownPerson(text);
    const city = cityFromName(text);
    const isTravelProfile = profile.scenarioType === 'travel' || profile.scenarioType === 'smart';

    if (isTravelProfile && contains(text, ['公务出差', '出差申请', '出差审批', '申请表', 'travel_request', 'travelRequest'])) {
        const startDate = dateFromName(text, contains(text, ['上海']) ? '2023-12-11' : '2026-05-10');
        const endDate = contains(text, ['上海']) ? '2023-12-17' : addDays(startDate, 2);
        const names = ['苏冠荣', '黄嘉辉'].filter(name => text.includes(name));
        const travelDetail = (names.length ? names : [person]).map(name => ({
            personName: name,
            startDate,
            endDate,
            destination: city,
            transportType: '飞机',
            reason: contains(text, ['培训']) ? '参加培训' : '公务出差',
        }));
        return [{
            recognizeType: 'travelRequest',
            requesterName: person,
            startDate,
            endDate,
            arrivalAddress: city,
            reception: '',
            transportation: '飞机/火车',
            reason: contains(text, ['培训']) ? '参加培训' : '公务出差',
            rank: '',
            hotelStandard: '450',
            travelDetail,
        }];
    }

    if (isTravelProfile && contains(text, ['高铁', '火车', '车票'])) {
        const isReturn = contains(text, ['17日', '返', '回程']);
        const date = dateFromName(text, isReturn ? '2023-12-17' : '2023-12-11');
        return [{
            recognizeType: 'trainInvoice',
            invoiceNumber: `MOCK-TRAIN-${date.replace(/-/g, '')}`,
            issueDate: date,
            totalAmount: '553',
            passengerName: person,
            payerName: '',
            seatClass: '二等座',
            departureStation: isReturn ? city : '广东省东莞市',
            arrivalStation: isReturn ? '广东省东莞市' : city,
            trainNumber: isReturn ? 'G888' : 'G666',
            departureTime: `${date} 09:00`,
        }];
    }

    if (isTravelProfile && contains(text, ['机票', '行程单', '航班'])) {
        const isReturn = contains(text, ['1.PDF', '返', '回程']);
        const date = isReturn ? '2026-05-12' : '2026-05-10';
        const destination = city === '上海市' ? '北京市' : city;
        return [{
            recognizeType: 'planeInvoice',
            invoiceNumber: `MOCK-PLANE-${date.replace(/-/g, '')}`,
            gpNumber: `GP${date.replace(/-/g, '')}001`,
            flightNumber: isReturn ? 'CA1888' : 'CA1666',
            departure: isReturn ? destination : '广东省广州市',
            arrival: isReturn ? '广东省广州市' : destination,
            departureTime: `${date} ${isReturn ? '18:00' : '08:00'}`,
            passengerName: person,
            payerName: '',
            seatClass: '经济舱',
            amount: '680',
            insurance: '',
        }];
    }

    if (isTravelProfile && contains(text, ['住宿', '酒店', '水单'])) {
        const startDate = dateFromName(text, contains(text, ['12月']) ? '2023-12-11' : '2026-05-10');
        const days = contains(text, ['12月11日-16日']) ? 6 : 2;
        return [{
            recognizeType: 'accommodationList',
            creditcardNumber: '',
            guestName: person,
            city,
            hotelName: `${city}测试酒店`,
            leavingDate: addDays(startDate, days),
            totalAmount: String(days * 300),
            accommodationDetail: accommodationRows(person, city, startDate, days, `${city}测试酒店`),
        }];
    }

    if (contains(text, ['发票', '电费', '水费', '办公', '维修'])) {
        return [{
            recognizeType: 'normalInvoice',
            invoiceNumber: `MOCK-INVOICE-${Date.now()}`,
            issueDate: '2026-05-10',
            payerName: '国家税务总局东莞市税务局',
            sellerName: '测试供应商',
            totalAmount: '300',
            taxAmount: '',
            comment: '',
            itemsDetail: [{ name: contains(text, ['电费']) ? '电费' : '服务费', specification: '', unit: '', quantity: '1', amount: '300' }],
        }];
    }

    if (!lowerExt || ['.jpg', '.jpeg', '.png', '.pdf', '.webp'].includes(lowerExt)) {
        return [{ recognizeType: 'other', rawText: `模拟OCR：${fileName}` }];
    }
    return [];
}

async function recognizeFile(file, profile, callbacks = {}) {
    const fileName = file.originalname || file.fileName || file.name || 'attachment';
    if (callbacks.onTotal) callbacks.onTotal(1);
    if (callbacks.onProgress) callbacks.onProgress(1);
    return {
        status: 'success',
        fileName,
        fileType: path.extname(fileName).slice(1).toLowerCase() || 'unknown',
        provider: 'mock',
        data: mockDataForFile(fileName, profile).map(item => ({
            ...item,
            sourceFileName: fileName,
        })),
    };
}

module.exports = {
    recognizeFile,
};
