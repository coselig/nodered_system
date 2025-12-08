/**
 * 燈光 Feedback 處理器 - 解析燈光控制回應
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
 *   - 0x06: Write Single Register (Single/Dual Light 亮度/色溫)
 *   - 0x05: Write Single Coil (Relay 開關)
 *   - 0x10: Write Multiple Registers (WRGB 顏色)
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { REGISTER_TO_SINGLE, REGISTER_TO_DUAL, COIL_TO_RELAY, REGISTER_TO_WRGB } = CONST;
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

// 只處理燈光相關的功能碼
if (funcCode !== 0x06 && funcCode !== 0x05 && funcCode !== 0x10) {
    return null;
}

let mqttMessages = [];

// ===== 0x06 Write Single Register (Single/Dual Light) =====
if (funcCode === 0x06) {
    const regHi = buf[2];
    const regLo = buf[3];
    const valueOrCoil = buf[5];
    const register = (regHi << 8) | regLo;
    
    debugLog('modbus', `=== Light Feedback (0x06) ===`);
    debugLog('modbus', `模組: ${moduleId}, 寄存器: 0x${register.toString(16).padStart(4, '0')}, 值: ${valueOrCoil}`);
    
    // 檢查是否為 Single Light
    const singleInfo = REGISTER_TO_SINGLE[register];
    if (singleInfo) {
        const { type, channel } = singleInfo;
        const brightness = valueOrCoil;
        const state = brightness > 0 ? "ON" : "OFF";
        const baseTopic = `homeassistant/light/${type}/${moduleId}/${channel}`;
        
        debugLog('modbus', `Single 燈光: ${moduleId}-${channel}, 狀態: ${state}, 亮度: ${brightness}`);
        
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
        }
        
        // 更新快取
        flow.set(`single_${moduleId}_${channel}_state`, state);
        if (brightness > 0) {
            flow.set(`single_${moduleId}_${channel}_brightness`, brightness);
        }
        
        node.status({ fill: state === "ON" ? "green" : "grey", shape: "dot", text: `Single ${moduleId}-${channel}: ${state} ${brightness}%` });
    }
    
    // 檢查是否為 Dual Light
    const dualInfo = REGISTER_TO_DUAL[register];
    if (dualInfo) {
        const { type, channel, attribute } = dualInfo;
        const baseTopic = `homeassistant/light/${type}/${moduleId}/${channel}`;
        
        if (attribute === "brightness") {
            const brightness = valueOrCoil;
            const state = brightness > 0 ? "ON" : "OFF";
            
            debugLog('modbus', `Dual 燈光亮度: ${moduleId}-${channel}, 狀態: ${state}, 亮度: ${brightness}`);
            
            mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
            if (state === "ON") {
                mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
            }
            
            flow.set(`dual_${moduleId}_${channel}_state`, state);
            if (brightness > 0) {
                flow.set(`dual_${moduleId}_${channel}_brightness`, brightness);
            }
            
            node.status({ fill: state === "ON" ? "green" : "grey", shape: "dot", text: `Dual ${moduleId}-${channel}: ${state} ${brightness}%` });
            
        } else if (attribute === "colortemp") {
            const ctPercent = valueOrCoil;
            const colortemp = percentToMired(ctPercent);
            
            debugLog('modbus', `Dual 燈光色溫: ${moduleId}-${channel}, 色溫: ${colortemp} mired (${ctPercent}%)`);
            
            mqttMessages.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
            flow.set(`dual_${moduleId}_${channel}_colortemp`, colortemp);
            
            node.status({ fill: "yellow", shape: "dot", text: `Dual ${moduleId}-${channel}: ${colortemp} mired` });
        }
    }
}

// ===== 0x05 Write Single Coil (Relay) =====
else if (funcCode === 0x05) {
    const regHi = buf[2];
    const regLo = buf[3];
    const coilValue = buf[4];
    const register = (regHi << 8) | regLo;
    
    debugLog('modbus', `=== Relay Feedback (0x05) ===`);
    debugLog('modbus', `模組: ${moduleId}, Coil: 0x${register.toString(16).padStart(4, '0')}`);
    
    const coilInfo = COIL_TO_RELAY[register];
    if (coilInfo) {
        const { channel } = coilInfo;
        const state = coilValue === 0xFF ? "ON" : "OFF";
        const baseTopic = `homeassistant/light/relay/${moduleId}/${channel}`;
        
        debugLog('modbus', `Relay: ${moduleId}-${channel}, 狀態: ${state}`);
        
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        flow.set(`relay_${moduleId}_${channel}_state`, state);
        
        node.status({ fill: state === "ON" ? "green" : "grey", shape: "ring", text: `Relay ${moduleId}-${channel}: ${state}` });
    }
}

// ===== 0x10 Write Multiple Registers (WRGB) =====
else if (funcCode === 0x10) {
    const regHi = buf[2];
    const regLo = buf[3];
    const register = (regHi << 8) | regLo;
    
    debugLog('modbus', `=== WRGB Feedback (0x10) ===`);
    debugLog('modbus', `模組: ${moduleId}, 寄存器: 0x${register.toString(16).padStart(4, '0')}`);
    
    const channel = REGISTER_TO_WRGB[register];
    if (channel) {
        const baseTopic = `homeassistant/light/wrgb/${moduleId}/${channel}`;
        const stateKey = `wrgb_${moduleId}_${channel}_state`;
        const state = flow.get(stateKey) || "OFF";
        
        debugLog('modbus', `WRGB: ${moduleId}-${channel}, 狀態確認: ${state}`);
        
        // WRGB 回應只確認指令已執行，狀態從 flow context 取得
        node.status({ fill: state === "ON" ? "magenta" : "grey", shape: "dot", text: `WRGB ${moduleId}-${channel}: ${state}` });
    }
}

// 回傳 MQTT 訊息和 Dequeue
if (mqttMessages.length > 0) {
    return [mqttMessages, makeDequeueMsg()];
}

return [null, makeDequeueMsg()];
