/**
 * 輪詢查詢 - 定期查詢所有設備狀態
 * 
 * 使用方式：
 * 1. 用 inject 節點觸發（設定 interval，例如每 5 秒）
 * 2. 連接到此 function node
 * 3. 輸出連到 MQTT out，發布查詢主題
 */

// 設定要查詢的設備列表
const QUERY_DEVICES = [
    // Single 燈光
    { type: "single", moduleId: 11, channel: "1" },
    { type: "single", moduleId: 11, channel: "2" },
    { type: "single", moduleId: 12, channel: "1" },
    { type: "single", moduleId: 12, channel: "2" },
    { type: "single", moduleId: 12, channel: "3" },
    { type: "single", moduleId: 12, channel: "4" },
    { type: "single", moduleId: 13, channel: "1" },
    { type: "single", moduleId: 13, channel: "2" },
    { type: "single", moduleId: 13, channel: "3" },
    
    // Dual 燈光
    { type: "dual", moduleId: 14, channel: "a" },
    { type: "dual", moduleId: 14, channel: "b" },
    
    // Relay（可選）
    // { type: "relay", moduleId: 12, channel: "1" },
];

// 產生查詢訊息
const queryMessages = QUERY_DEVICES.map(device => ({
    topic: `homeassistant/query/${device.type}/${device.moduleId}/${device.channel}`,
    payload: "query"
}));

node.status({
    fill: "blue",
    shape: "ring",
    text: `查詢 ${queryMessages.length} 個設備`
});

// 返回多個訊息（每個設備一個）
return [queryMessages];
