/**
 * 查詢 Feedback 處理器 - 解析燈光/Relay 查詢回應
 * 
 * Node Type: function
 * 
 * 前置需求：
 *   必須先執行 common.js 初始化共用模組
 * 
 * 輸入：
 *   msg.payload = Buffer (已驗證 CRC 的 Modbus 回應)
 * 
 * 輸出：
 *   Output 1: MQTT 狀態 → 連接到 MQTT out
 *   Output 2: Dequeue  → 連接到 modbus_queue
 * 
 * 處理的功能碼：
 *   - 0x03: Read Holding Registers (燈光亮度/色溫查詢，非 HVAC 長度)
 *   - 0x01: Read Coils (Relay 狀態查詢)
 * 
 * 查詢資訊來源：
 *   從 flow.get('modbus_current_query') 或 msg.queryInfo 取得查詢類型和通道
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { MIN_MIRED, MAX_MIRED } = CONST;
const { makeDequeueMsg, percentToMired } = UTILS;

function debugLog(category, message) {
    UTILS.debugLog.call({ warn: node.warn.bind(node) }, category, message);
}

// ========== 主處理邏輯 ==========
const buf = msg.payload;

if (!Buffer.isBuffer(buf) || buf.length < 5) {
    return null;
}

const moduleId = buf[0];
const funcCode = buf[1];

// 只處理查詢相關的功能碼
// 0x03 且長度不是 17 (HVAC) → 燈光查詢
// 0x01 → Relay 查詢
if (funcCode === 0x03 && buf.length === 17) {
    // 這是 HVAC 回應，交給 feedback_hvac.js 處理
    return null;
}

if (funcCode !== 0x03 && funcCode !== 0x01) {
    return null;
}

let mqttMessages = [];

// ===== 0x03 Read Holding Registers (燈光查詢回應) =====
if (funcCode === 0x03) {
    const byteCount = buf[2];
    
    debugLog('modbus', `=== Query Feedback (0x03 Read Holding Registers) ===`);
    debugLog('modbus', `模組: ${moduleId}, Byte Count: ${byteCount}`);
    
    if (byteCount < 2) {
        return [null, makeDequeueMsg()];
    }
    
    // 解析寄存器數據
    const reg1Hi = buf[3];
    const reg1Lo = buf[4];
    const brightness = reg1Lo;
    const state = brightness > 0 ? "ON" : "OFF";
    
    debugLog('modbus', `寄存器值: 0x${((reg1Hi << 8) | reg1Lo).toString(16).padStart(4, '0')} (亮度: ${brightness})`);
    
    // 從 flow context 取得查詢資訊
    const currentQuery = flow.get('modbus_current_query') || {};
    const queryInfo = msg.queryInfo || currentQuery.queryInfo || {};
    
    const type = queryInfo.type || currentQuery.subType || "single";
    const channel = queryInfo.channel || currentQuery.channel || "1";
    const baseTopic = `homeassistant/light/${type}/${moduleId}/${channel}`;
    
    debugLog('modbus', `查詢結果: ${type} 燈光, 模組 ${moduleId}, 通道 ${channel}`);
    debugLog('modbus', `狀態: ${state}, 亮度: ${brightness}`);
    
    // 發布狀態
    mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
    if (state === "ON") {
        mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
    }
    
    // 更新快取
    flow.set(`${type}_${moduleId}_${channel}_state`, state);
    if (brightness > 0) {
        flow.set(`${type}_${moduleId}_${channel}_brightness`, brightness);
    }
    
    // 如果有第二個寄存器 (Dual Light 色溫)
    if (byteCount >= 4 && type === "dual") {
        const reg2Lo = buf[6];
        const ctPercent = reg2Lo;
        const colortemp = percentToMired(ctPercent);
        
        debugLog('modbus', `色溫: ${colortemp} mired (${ctPercent}%)`);
        
        mqttMessages.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
        flow.set(`dual_${moduleId}_${channel}_colortemp`, colortemp);
    }
    
    node.status({
        fill: state === "ON" ? "cyan" : "grey",
        shape: "ring",
        text: `Query: ${type} ${moduleId}-${channel}: ${state} ${brightness}%`
    });
}

// ===== 0x01 Read Coils (Relay 查詢回應) =====
else if (funcCode === 0x01) {
    const byteCount = buf[2];
    const coilStatus = buf[3];
    
    debugLog('modbus', `=== Query Feedback (0x01 Read Coils) ===`);
    debugLog('modbus', `模組: ${moduleId}, Coil 狀態: 0b${coilStatus.toString(2).padStart(8, '0')}`);
    
    // 解析每個 Relay 的狀態
    for (let i = 0; i < 4; i++) {
        const channel = String(i + 1);
        const state = (coilStatus & (1 << i)) ? "ON" : "OFF";
        const baseTopic = `homeassistant/light/relay/${moduleId}/${channel}`;
        
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        flow.set(`relay_${moduleId}_${channel}_state`, state);
        
        debugLog('mqtt', `Relay ${moduleId}-${channel}: ${state}`);
    }
    
    node.status({
        fill: "cyan",
        shape: "ring",
        text: `Query: Relay ${moduleId} (1-4)`
    });
}

return [mqttMessages, makeDequeueMsg()];
