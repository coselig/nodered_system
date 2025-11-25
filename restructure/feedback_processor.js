/**
 * Feedback 處理器 - 解析 Modbus 回應
 * 
 * Node ID: c543b1d15612a8c6
 * Node Type: function
 * 
 * 此檔案從 test_full_integrated.json 自動提取
 */

// 完整 Feedback 處理器：解析 Modbus 回應並發布 MQTT 狀態

// Debug 控制
const debugConfig = global.get('debug_config') || {
    topic: true,
    cache: true,
    modbus: true,
    mqtt: true,
    scene: true,
    query: true
};

function debugLog(category, message) {
    if (debugConfig[category]) {
        node.warn(message);
    }
}

function verifyCRC(buf) {
    let crc = 0xFFFF;
    for (let i = 0; i < buf.length - 2; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
        }
    }
    const lo = crc & 0xFF;
    const hi = (crc >> 8) & 0xFF;
    return lo === buf[buf.length - 2] && hi === buf[buf.length - 1];
}

const buf = msg.payload;

if (!Buffer.isBuffer(buf) || buf.length < 5) {
    debugLog('modbus', "回應格式錯誤");
    return null;
}

if (!verifyCRC(buf)) {
    debugLog('modbus', "CRC 驗證失敗");
    return null;
}

const moduleId = buf[0];
const funcCode = buf[1];

debugLog('modbus', `=== Modbus 回應 ===`);
debugLog('modbus', `模組ID: ${moduleId}`);
debugLog('modbus', `功能碼: 0x${funcCode.toString(16).padStart(2, '0')}`);

const CHANNEL_REGISTER_MAP = {
    0x082A: { type: "single", channel: "1" },
    0x082B: { type: "single", channel: "2" },
    0x082C: { type: "single", channel: "3" },
    0x082D: { type: "single", channel: "4" }
};

const DUAL_REGISTER_MAP = {
    0x082A: { type: "dual", channel: "a", attribute: "brightness" },
    0x082B: { type: "dual", channel: "a", attribute: "colortemp" },
    0x082C: { type: "dual", channel: "b", attribute: "brightness" },
    0x082D: { type: "dual", channel: "b", attribute: "colortemp" }
};

const RELAY_COIL_MAP = {
    0x0000: { channel: "1" },
    0x0001: { channel: "2" },
    0x0002: { channel: "3" },
    0x0003: { channel: "4" }
};

let mqttMessages = [];

// ===== 0x06 Write Single Register (Single/Dual Light) =====
if (funcCode === 0x06) {
    const regHi = buf[2];
    const regLo = buf[3];
    const speedOrCoil = buf[4];
    const valueOrCoil = buf[5];
    const register = (regHi << 8) | regLo;
    
    debugLog('modbus', `寄存器: 0x${register.toString(16).padStart(4, '0')}, 數值: ${valueOrCoil}`);
    
    const registerInfo = CHANNEL_REGISTER_MAP[register] || DUAL_REGISTER_MAP[register];
    
    if (registerInfo) {
        const { type, channel, attribute } = registerInfo;
        const brightness = valueOrCoil;  // 最後一個 byte 是亮度值
        const state = brightness > 0 ? "ON" : "OFF";
        
        const baseTopic = `homeassistant/light/${type}/${moduleId}/${channel}`;
        
        debugLog('modbus', `=== 解析 ${type.toUpperCase()} 燈光 ===`);
        debugLog('modbus', `通道: ${channel}, 狀態: ${state}, 亮度: ${brightness}`);
        
        if (type === "single") {
            // Single Light: 發布狀態和亮度
            mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
            if (state === "ON") {
                mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
            }
            
            // 更新快取：OFF 時不更新亮度快取，保留上次的亮度值
            flow.set(`single_${moduleId}_${channel}_state`, state);
            if (brightness > 0) {
                flow.set(`single_${moduleId}_${channel}_brightness`, brightness);
                debugLog('cache', `更新亮度快取: single_${moduleId}_${channel}_brightness = ${brightness}`);
            } else {
                debugLog('cache', `亮度為 0，保留原快取值: ${flow.get(`single_${moduleId}_${channel}_brightness`)}`);
            }
            
            debugLog('mqtt', `發布狀態: ${baseTopic}/state = ${state}`);
            if (state === "ON") {
                debugLog('mqtt', `發布亮度: ${baseTopic}/brightness = ${brightness}`);
            }
        } else if (type === "dual") {
            // Dual Light: 分別處理亮度和色溫
            if (attribute === "brightness") {
                mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
                if (state === "ON") {
                    mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
                }
                flow.set(`dual_${moduleId}_${channel}_state`, state);
                // OFF 時不更新亮度快取，保留上次的亮度值
                if (brightness > 0) {
                    flow.set(`dual_${moduleId}_${channel}_brightness`, brightness);
                    debugLog('cache', `更新亮度快取: dual_${moduleId}_${channel}_brightness = ${brightness}`);
                } else {
                    debugLog('cache', `亮度為 0，保留原快取值: ${flow.get(`dual_${moduleId}_${channel}_brightness`)}`);
                }
                
                debugLog('mqtt', `發布狀態: ${baseTopic}/state = ${state}`);
            } else if (attribute === "colortemp") {
                // 色溫百分比轉回 mired
                const ctPercent = valueOrCoil;
                const MIN_MIRED = 167;
                const MAX_MIRED = 333;
                const colortemp = Math.round(MAX_MIRED - (ctPercent / 100) * (MAX_MIRED - MIN_MIRED));
                
                mqttMessages.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
                flow.set(`dual_${moduleId}_${channel}_colortemp`, colortemp);
                
                debugLog('mqtt', `發布色溫: ${baseTopic}/colortemp = ${colortemp} mired (${ctPercent}%)`);
            }
        }
        
        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `${type} ${moduleId}-${channel}: ${state} ${brightness}%`
        });
    }
}

// ===== 0x05 Write Single Coil (Relay) =====
else if (funcCode === 0x05) {
    const regHi = buf[2];
    const regLo = buf[3];
    const speedOrCoil = buf[4];
    const register = (regHi << 8) | regLo;
    
    debugLog('modbus', `Coil: 0x${register.toString(16).padStart(4, '0')}`);
    
    const coilInfo = RELAY_COIL_MAP[register];
    
    if (coilInfo) {
        const { channel } = coilInfo;
        const state = speedOrCoil === 0xFF ? "ON" : "OFF";  // 0xFF00 = ON, 0x0000 = OFF
        
        const baseTopic = `homeassistant/light/relay/${moduleId}/${channel}`;
        
        debugLog('modbus', `=== 解析 RELAY ===`);
        debugLog('modbus', `通道: ${channel}, 狀態: ${state}`);
        
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        flow.set(`relay_${moduleId}_${channel}_state`, state);
        
        debugLog('mqtt', `發布狀態: ${baseTopic}/state = ${state}`);
        
        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "ring",
            text: `Relay ${moduleId}-${channel}: ${state}`
        });
    }
}

// ===== 0x03 Read Holding Registers (查詢回應) =====
else if (funcCode === 0x03) {
    const byteCount = buf[2];  // 回傳的 byte 數量
    
    debugLog('modbus', `=== 查詢回應 (0x03 Read Holding Registers) ===`);
    debugLog('modbus', `模組ID: ${moduleId}, Byte Count: ${byteCount}`);
    
    // 解析寄存器數據 (格式: [模組ID] [0x03] [Byte Count] [Reg1 Hi] [Reg1 Lo] [Reg2 Hi] [Reg2 Lo] ... [CRC])
    if (byteCount >= 2) {
        const reg1Hi = buf[3];
        const reg1Lo = buf[4];
        const reg1Value = (reg1Hi << 8) | reg1Lo;
        const brightness = reg1Lo;  // 低位元組是亮度值
        const state = brightness > 0 ? "ON" : "OFF";
        
        debugLog('modbus', `第一個寄存器值: 0x${reg1Value.toString(16).padStart(4, '0')} (亮度: ${brightness})`);
        
        // 從 msg.payload 中取得原始查詢的寄存器地址（需要從發送時儲存）
        // 或者我們可以根據模組ID和通道來推斷
        // 這裡我們假設查詢 single light channel 1 (0x082A)
        // 更好的做法是在發送查詢時將寄存器地址附加到 msg 中
        
        // 從 msg 中取得查詢時的設備資訊（由 Full Processor 傳遞）
        const queryInfo = msg.queryInfo || {};
        const type = queryInfo.type || "single";
        const channel = queryInfo.channel || "1";
        const baseTopic = `homeassistant/light/${type}/${moduleId}/${channel}`;
        
        debugLog('modbus', `查詢結果: ${type} 燈光, 通道 ${channel}`);
        debugLog('modbus', `狀態: ${state}, 亮度: ${brightness}`);
        
        // 發布查詢到的狀態
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
        }
        
        // 更新快取：查詢時如果亮度為 0，也不更新亮度快取
        flow.set(`${type}_${moduleId}_${channel}_state`, state);
        if (brightness > 0) {
            flow.set(`${type}_${moduleId}_${channel}_brightness`, brightness);
            debugLog('cache', `查詢更新亮度快取: ${type}_${moduleId}_${channel}_brightness = ${brightness}`);
        } else {
            debugLog('cache', `查詢亮度為 0，保留原快取值: ${flow.get(`${type}_${moduleId}_${channel}_brightness`)}`);
        }
        
        debugLog('mqtt', `查詢發布: ${baseTopic}/state = ${state}`);
        if (state === "ON") {
            debugLog('mqtt', `查詢發布亮度: ${baseTopic}/brightness = ${brightness}`);
        }
        
        // 如果有第二個寄存器 (Dual Light 色溫)
        if (byteCount >= 4) {
            const reg2Hi = buf[5];
            const reg2Lo = buf[6];
            const reg2Value = (reg2Hi << 8) | reg2Lo;
            const ctPercent = reg2Lo;
            
            debugLog('modbus', `第二個寄存器值: 0x${reg2Value.toString(16).padStart(4, '0')} (色溫%: ${ctPercent})`);
            
            const MIN_MIRED = 167;
            const MAX_MIRED = 333;
            const colortemp = Math.round(MAX_MIRED - (ctPercent / 100) * (MAX_MIRED - MIN_MIRED));
            
            // 如果是 dual light，發布色溫
            if (type === "dual") {
                mqttMessages.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
                flow.set(`dual_${moduleId}_${channel}_colortemp`, colortemp);
                debugLog('mqtt', `查詢發布色溫: ${baseTopic}/colortemp = ${colortemp} mired`);
            }
        }
        
        node.status({
            fill: state === "ON" ? "cyan" : "grey",
            shape: "ring",
            text: `Query: ${type} ${moduleId}-${channel}: ${state} ${brightness}%`
        });
    }
}

// ===== 0x01 Read Coils (Relay 查詢回應) =====
else if (funcCode === 0x01) {
    const byteCount = buf[2];
    const coilStatus = buf[3];  // Coil 狀態 (bit mask)
    
    debugLog('modbus', `=== 查詢回應 (0x01 Read Coils) ===`);
    debugLog('modbus', `模組ID: ${moduleId}, Coil 狀態: 0b${coilStatus.toString(2).padStart(8, '0')}`);
    
    // 解析每個 Relay 的狀態
    for (let i = 0; i < 4; i++) {
        const channel = String(i + 1);
        const state = (coilStatus & (1 << i)) ? "ON" : "OFF";
        const baseTopic = `homeassistant/light/relay/${moduleId}/${channel}`;
        
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        flow.set(`relay_${moduleId}_${channel}_state`, state);
        
        debugLog('mqtt', `查詢發布 Relay: ${baseTopic}/state = ${state}`);
    }
    
    node.status({
        fill: "cyan",
        shape: "ring",
        text: `Query: Relay ${moduleId} (1-4)`
    });
}

msg.feedback = {
    moduleId,
    funcCode,
    raw: buf.toString('hex')
};

// 返回: [Feedback 資訊, MQTT 狀態]
return [msg, mqttMessages];