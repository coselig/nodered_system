/**
 * Modbus Queue Processor - Modbus 訊息佇列處理器
 * 當有訊息進入時，檢查 modbus_queue 並開始處理
 */

// 檢查是否已經有處理程序在運行
let isProcessing = global.get("modbus_queue_processing") || false;

if (!isProcessing) {
    let queue = global.get("modbus_queue") || [];
    
    if (queue.length > 0) {
        // 標記為處理中
        global.set("modbus_queue_processing", true);
        
        function sendNext() {
            // 重新從 global 取最新 queue（避免同步問題）
            let q = global.get("modbus_queue") || [];
            if (q.length > 0) {
                // 取出第一筆
                const msgToSend = q.shift();
                // 更新 global（移除剛發送的那筆）
                global.set("modbus_queue", q);
                node.status({ fill: "green", shape: "dot", text: `modbus queue ${q.length} left` });
                // 發送
                node.send(msgToSend);
                // 設定延遲 50ms 避免 Modbus 設備來不及處理
                setTimeout(sendNext, 1000);  // ← 關鍵：50ms 延遲
            } else {
                // 全部送完，清除處理標記
                global.set("modbus_queue_processing", false);
                node.status({ fill: "green", shape: "ring", text: "modbus queue empty" });
            }
        }
        sendNext(); // 啟動發送
    }
}

return null;
