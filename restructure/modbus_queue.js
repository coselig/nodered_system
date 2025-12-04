/**
 * Modbus Queue - 佇列處理器（等待 feedback 再發送下一個）
 * 
 * Node ID: modbus_queue
 * Node Type: function
 * 
 * 使用方式：
 * 1. full_processor 輸出的 Modbus 指令 → 入隊（enqueue）
 * 2. feedback_processor 回應後 → 觸發發送下一個（dequeue）
 * 3. 定時器防止卡住 → 超時自動發送下一個
 * 
 * 輸入 Topic:
 * - modbus/queue/enqueue → 將指令加入佇列
 * - modbus/queue/dequeue → 收到 feedback，發送下一個
 * - modbus/queue/timeout → 超時，強制發送下一個
 * - modbus/queue/clear   → 清空佇列
 * - modbus/queue/status  → 查詢佇列狀態
 */

// 設定
const TIMEOUT_MS = 500;  // 等待 feedback 超時時間 (毫秒)

// Debug 控制
const debugConfig = global.get('debug_config') || {
    topic: true,
    cache: true,
    modbus: true,
    mqtt: true,
    scene: true,
    query: true,
    queue: true
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
const action = msg.topic || "enqueue";

// ===== ENQUEUE: 將指令加入佇列 =====
if (action === "modbus/queue/enqueue" || !msg.topic) {
    // 支援單個或多個指令
    const commands = Array.isArray(msg.payload) ? msg.payload : [msg];
    
    for (const cmd of commands) {
        // 確保有 payload
        if (cmd.payload) {
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
        }
    }
    
    flow.set('modbus_queue', queue);
    debugLog('queue', `入隊: ${commands.length} 個指令，佇列長度: ${queue.length}`);
    
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
    
    debugLog('queue', `發送指令: ${cmd.payload.toString('hex')} (剩餘 ${queue.length})`);
    updateStatus();
    
    // 發送到 Modbus
    node.send([{ payload: cmd.payload }]);
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
