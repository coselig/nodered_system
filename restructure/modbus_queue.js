// 設定
const TIMEOUT_MS = 500;  // 等待 feedback 超時時間 (毫秒)

// Debug 控制 - 強制啟用 queue debug
const globalDebug = global.get('debug_config') || {};
const debugConfig = {
    topic: globalDebug.topic !== false,
    cache: globalDebug.cache !== false,
    modbus: globalDebug.modbus !== false,
    mqtt: globalDebug.mqtt !== false,
    scene: globalDebug.scene !== false,
    query: globalDebug.query !== false,
    queue: true  // Queue debug 強制開啟
};

function debugLog(category, message) {
    if (debugConfig[category]) {
        node.warn(message);
    }
}

// 初始化佇列（如果不存在）
let queue = flow.get('modbus_queue') || [];
let isProcessing = flow.get('modbus_queue_processing') || false;
let currentCmd = flow.get('modbus_queue_current') || null;
let lastSendTime = flow.get('modbus_queue_last_send') || 0;

// 判斷輸入類型
const action = msg.topic || "";

// ===== ENQUEUE: 將指令加入佇列 =====
// 如果 topic 不是 queue 控制指令，就當作是 enqueue
const isQueueCommand = action.startsWith("modbus/queue/");
if (!isQueueCommand) {
    // 支援單個或多個指令
    const commands = Array.isArray(msg) ? msg : [msg];
    
    for (const cmd of commands) {
        // 確保有 payload（Buffer）
        if (cmd.payload && Buffer.isBuffer(cmd.payload)) {
            queue.push({
                payload: cmd.payload,
                subType: cmd.subType,
                moduleId: cmd.moduleId,
                channel: cmd.channel,
                state: cmd.state,
                brightness: cmd.brightness,
                colortemp: cmd.colortemp,
                deviceType: cmd.deviceType,
                queryInfo: cmd.queryInfo,
                timestamp: Date.now()
            });
            debugLog('queue', `入隊: Module ${cmd.moduleId} Channel ${cmd.channel} - ${cmd.payload.toString('hex')}`);
        }
    }
    
    flow.set('modbus_queue', queue);
    debugLog('queue', `佇列長度: ${queue.length}`);
    
    // 如果目前沒有在處理，開始處理
    if (!isProcessing) {
        sendNext();
    }
    
    updateStatus();
    return null;
}

// ===== DEQUEUE: 收到 feedback，發送下一個 =====
if (action === "modbus/queue/dequeue") {
    debugLog('queue', `收到 feedback，準備發送下一個`);
    
    // 清除當前指令
    flow.set('modbus_queue_current', null);
    
    // 發送下一個
    sendNext();
    return null;
}

// ===== TIMEOUT: 超時，強制發送下一個 =====
if (action === "modbus/queue/timeout") {
    const now = Date.now();
    const elapsed = now - lastSendTime;
    
    // 顯示超時檢查狀態
    if (isProcessing) {
        debugLog('queue', `⏱️ 超時檢查: 已等待 ${elapsed}ms / ${TIMEOUT_MS}ms，佇列剩餘: ${queue.length}`);
    }

    if (isProcessing && elapsed >= TIMEOUT_MS) {
        debugLog('queue', `⚠️ 超時 ${elapsed}ms，強制發送下一個`);
        flow.set('modbus_queue_current', null);
        sendNext();
    }
    return null;
}

// ===== CLEAR: 清空佇列 =====
if (action === "modbus/queue/clear") {
    queue = [];
    flow.set('modbus_queue', []);
    flow.set('modbus_queue_processing', false);
    flow.set('modbus_queue_current', null);
    
    debugLog('queue', `佇列已清空`);
    node.status({ fill: "grey", shape: "ring", text: "佇列已清空" });
    return null;
}

// ===== STATUS: 查詢佇列狀態 =====
if (action === "modbus/queue/status") {
    const status = {
        queueLength: queue.length,
        isProcessing: isProcessing,
        currentCmd: currentCmd,
        lastSendTime: lastSendTime
    };
    
    debugLog('queue', `佇列狀態: ${JSON.stringify(status)}`);
    return [{ payload: status }];
}

// ===== 發送下一個指令 =====
function sendNext() {
    queue = flow.get('modbus_queue') || [];
    
    if (queue.length === 0) {
        // 佇列空了
        flow.set('modbus_queue_processing', false);
        flow.set('modbus_queue_current', null);
        node.status({ fill: "green", shape: "ring", text: "佇列空" });
        debugLog('queue', `佇列處理完成`);
        return;
    }
    
    // 取出第一個指令
    const cmd = queue.shift();
    flow.set('modbus_queue', queue);
    flow.set('modbus_queue_processing', true);
    flow.set('modbus_queue_current', cmd);
    flow.set('modbus_queue_last_send', Date.now());
    
    debugLog('queue', `發送: Module ${cmd.moduleId} Ch ${cmd.channel} - ${cmd.payload.toString('hex')} (剩餘 ${queue.length})`);
    updateStatus();
    
    // 儲存當前查詢資訊到 flow context，讓 Feedback 可以讀取
    // 因為 TCP Request 會覆蓋 msg 屬性
    flow.set('modbus_current_query', {
        queryInfo: cmd.queryInfo,
        moduleId: cmd.moduleId,
        channel: cmd.channel,
        subType: cmd.subType,
        timestamp: Date.now()
    });

    // 發送到 Modbus
    node.send([{
        payload: cmd.payload,
        queryInfo: cmd.queryInfo,
        moduleId: cmd.moduleId,
        channel: cmd.channel,
        subType: cmd.subType
    }]);
}

// ===== 更新節點狀態 =====
function updateStatus() {
    queue = flow.get('modbus_queue') || [];
    isProcessing = flow.get('modbus_queue_processing') || false;
    
    if (queue.length === 0 && !isProcessing) {
        node.status({ fill: "green", shape: "ring", text: "佇列空" });
    } else if (isProcessing) {
        node.status({ fill: "yellow", shape: "dot", text: `處理中... 剩餘 ${queue.length}` });
    } else {
        node.status({ fill: "blue", shape: "ring", text: `等待中 ${queue.length}` });
    }
}

return null;