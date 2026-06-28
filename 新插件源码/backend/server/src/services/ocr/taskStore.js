const crypto = require('crypto');

const tasks = new Map();

function createTaskRecord({ fileId, fileName, fileSize }) {
    const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const task = {
        taskId,
        status: 'processing',
        fileInfo: {
            fileId,
            fileName,
            fileSize,
            storage: 'memory',
            persisted: false,
        },
        results: [],
        totalModels: 1,
        completedCount: 0,
        totalOcrModels: 1,
        completedModelCount: 0,
        message: '正在识别',
        startTime: Date.now(),
    };
    tasks.set(taskId, task);
    const cleanupTimer = setTimeout(() => tasks.delete(taskId), 60 * 60 * 1000);
    if (cleanupTimer.unref) cleanupTimer.unref();
    return task;
}

function updateTask(taskId, updater) {
    const task = tasks.get(taskId);
    if (!task) return null;
    updater(task);
    tasks.set(taskId, task);
    return task;
}

function setTaskTotal(taskId, total) {
    updateTask(taskId, task => {
        task.totalModels = Math.max(1, total || 1);
        task.totalOcrModels = task.totalModels;
    });
}

function addResult(taskId, result, increment = 1) {
    updateTask(taskId, task => {
        if (increment) {
            task.completedCount = Math.min(task.totalModels, task.completedCount + increment);
        }
        task.completedModelCount = task.completedCount;

        if (result) {
            task.results.push(result);
            task.completedCount = Math.max(task.completedCount, task.totalModels);
            task.completedModelCount = task.completedCount;
            task.status = 'completed';
            task.message = '识别完成';
            task.finishedAt = Date.now();
            return;
        }

        if (task.completedCount >= task.totalModels) {
            task.message = '识别结果整理中';
        }
    });
}

function failTask(taskId, error) {
    updateTask(taskId, task => {
        task.status = 'failed';
        task.message = error?.message || String(error || '识别失败');
    });
}

function getSnapshot(taskId) {
    const task = tasks.get(taskId);
    if (!task) return { success: false, status: 'not_found', message: '任务不存在' };
    if (task.status === 'completed') {
        return {
            success: true,
            status: 'completed',
            message: '识别完成',
            data: {
                fileId: task.fileInfo.fileId,
                fileName: task.fileInfo.fileName,
                fileSize: task.fileInfo.fileSize,
                storage: task.fileInfo.storage,
                persisted: task.fileInfo.persisted,
                uploadTime: new Date(task.startTime).toISOString(),
            },
            completedCount: task.completedCount,
            totalModels: task.totalModels,
            ocrModels: task.results,
        };
    }
    return {
        success: false,
        status: task.status,
        message: task.message,
        completedCount: task.completedCount,
        totalModels: task.totalModels,
        partialResults: task.results,
    };
}

module.exports = {
    addResult,
    createTaskRecord,
    failTask,
    getSnapshot,
    setTaskTotal,
    updateTask,
};
