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
    // ========== 盤A 單色燈光 ==========
    { type: "single", moduleId: 11, channel: "1" },  // 走廊間照
    { type: "single", moduleId: 11, channel: "2" },  // 走廊間照
    { type: "single", moduleId: 12, channel: "1" },  // 泡茶區
    { type: "single", moduleId: 12, channel: "2" },  // 走道崁燈
    { type: "single", moduleId: 12, channel: "3" },  // 展示櫃
    { type: "single", moduleId: 12, channel: "4" },  // 展示櫃
    { type: "single", moduleId: 13, channel: "1" },  // 會議間照
    { type: "single", moduleId: 13, channel: "2" },  // 冷氣間照
    { type: "single", moduleId: 13, channel: "3" },  // 會議崁燈
    { type: "single", moduleId: 13, channel: "4" },  // single-13-4
    
    // ========== 盤A 雙色溫燈光 ==========
    { type: "dual", moduleId: 14, channel: "a" },    // 會議室雙色溫A
    { type: "dual", moduleId: 14, channel: "b" },    // 會議室雙色溫B
    
    // ========== 盤B 單色燈光 ==========
    { type: "single", moduleId: 15, channel: "1" },  // 客廳前
    { type: "single", moduleId: 15, channel: "2" },  // 客廳後
    { type: "single", moduleId: 16, channel: "1" },  // 走道間照
    { type: "single", moduleId: 16, channel: "2" },  // 走道間照
    { type: "single", moduleId: 17, channel: "1" },  // 廚房
    { type: "single", moduleId: 17, channel: "2" },  // 廚房
    { type: "single", moduleId: 18, channel: "1" },  // 1F壁燈
    { type: "single", moduleId: 18, channel: "2" },  // 1F地燈
    { type: "single", moduleId: 19, channel: "1" },  // 2F壁燈
    { type: "single", moduleId: 19, channel: "2" },  // 2F地燈
    
    // ========== 窗簾/捲簾 (可選) ==========
    // { type: "curtain", moduleId: 21, channel: "1-2-3" },  // 鐵捲門
    // { type: "curtain", moduleId: 22, channel: "1-2" },    // 會議室捲簾
    // { type: "curtain", moduleId: 23, channel: "1-2" },    // 布簾
    // { type: "curtain", moduleId: 23, channel: "3-4" },    // 沙簾
    // { type: "curtain", moduleId: 23, channel: "5-6-7" },  // 排煙窗
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
