/**
 * Mqtt Queue - MQTT 訊息佇列處理器
 * 依序發送 MQTT 訊息，避免過於密集
 */

let queue = global.get("mqtt_queue") || [];

if (queue.length > 0) {
    function sendNext() {
        // 重新從 global 取最新 queue（避免同步問題）
        let q = global.get("mqtt_queue") || [];
        if (q.length > 0) {
            // 取出第一筆
            const msgToSend = q.shift();
            // 更新 global（移除剛發送的那筆）
            global.set("mqtt_queue", q);
            node.status({ fill: "green", shape: "dot", text: `queue ${q.length} left` });
            // 發送
            node.send(msgToSend);
            setTimeout(sendNext, 50);  // ← 改這裡：從 1ms 改為 50ms
        } else {
            // 全部送完
            node.status({ fill: "green", shape: "dot", text: "queue empty" });
        }
    }
    sendNext(); // 啟動發送
}
return null;
