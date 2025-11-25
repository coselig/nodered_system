/**
 * 完整處理器 - 支援所有設備類型
 * 
 * Node ID: 50313094f488b340
 * Node Type: function
 * 
 * 此檔案從 test_full_integrated.json 自動提取
 */

// 完整版處理器：支援 Single/Dual/Relay 燈光、Cover、Scene

// Debug 控制 (透過 global context 設定)
const debugConfig = global.get('debug_config') || {
    topic: true,        // 顯示收到的 Topic
    cache: true,        // 顯示快取操作
    modbus: true,       // 顯示 Modbus 指令詳情
    mqtt: true,         // 顯示 MQTT 狀態回報
    scene: true,        // 顯示 Scene 處理
    query: true         // 顯示 Query 查詢
};

function debugLog(category, message) {
    if (debugConfig[category]) {
        node.warn(message);
    }
}

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_COLORTEMP = 250;
const MIN_MIRED = 167;
const MAX_MIRED = 333;
const BRIGHTNESS_TIME = 0x05;
const CHANNEL_REGISTER_MAP = {
    "1": 0x082A,
    "2": 0x082B,
    "3": 0x082C,
    "4": 0x082D,
    "a": [0x082A, 0x082B],
    "b": [0x082C, 0x082D]
};
const CHANNEL_COIL_MAP = {
    "1": 0x0000,
    "2": 0x0001,
    "3": 0x0002,
    "4": 0x0003
};

function generalCommandBuild(frame) {
    function crc16(buf) {
        let crc = 0xFFFF;
        for (const b of buf) {
            crc ^= b;
            for (let i = 0; i < 8; i++) {
                crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
            }
        }
        return crc;
    }
    const crc = crc16(frame);
    return Buffer.concat([frame, Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF])]);
}

function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

function buildCommand(moduleId, reg, value, speed = 0x05) {
    const hi = (reg >> 8) & 0xFF;
    const lo = reg & 0xFF;
    const cmd = Buffer.from([moduleId, 0x06, hi, lo, speed, value]);
    return generalCommandBuild(cmd);
}

const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light, cover
const subType = parts[2];        // single, dual, relay, scene, general
const moduleId = parseInt(parts[3]);
const channel = parts[4];

debugLog('topic', `=== 收到訊息 ===`);
debugLog('topic', `Topic: ${msg.topic}`);
debugLog('topic', `Payload: ${msg.payload}`);
debugLog('topic', `Device: ${deviceType}, SubType: ${subType}, Module: ${moduleId}, Channel: ${channel}`);

let modbusMessages = [];
let mqttMessages = [];

// ========== LIGHT DEVICE ==========
if (deviceType === "light") {
    const baseTopic = `homeassistant/light/${subType}/${moduleId}/${channel}`;

    // 處理 set/brightness 和 set/colortemp
    if (parts.length >= 7 && parts[5] === "set") {
        const attribute = parts[6];
        // Scene 的 key 格式不同：scene_single_12-3--12-4_brightness
        let key;
        if (subType === "scene") {
            key = `scene_${parts[3]}_${parts[4]}_${attribute}`;
        } else {
            key = `${subType}_${moduleId}_${channel}_${attribute}`;
        }
        const val = Number(msg.payload);

        if (!isNaN(val)) {
            flow.set(key, val);
            debugLog('cache', `儲存 ${key} = ${val}`);
        }

        if (attribute === "brightness" || attribute === "colortemp") {
            // 對於 dual 燈光的色溫調整，只發送色溫指令，不觸發完整控制流程
            if (subType === "dual" && attribute === "colortemp") {
                const regs = CHANNEL_REGISTER_MAP[channel];
                if (!regs) {
                    debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
                    return null;
                }
                
                let colortemp = val;
                colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
                const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);
                
                const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);
                
                debugLog('modbus', `=== Modbus 指令 (Dual Colortemp Only) ===`);
                debugLog('modbus', `色溫: ${cmdColortemp.toString('hex')}`);
                
                modbusMessages.push({ payload: cmdColortemp, subType, moduleId, channel, colortemp });
                
                node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: `${moduleId}-${channel}: Colortemp ${colortemp}K`
                });
                
                return [modbusMessages, []];
            }
            
            // 亮度或色溫變更時，保持當前開關狀態不變
            // 0% 不會自動變成 OFF，需要明確發送 OFF 指令才會關閉
            const stateKey = `${subType}_${moduleId}_${channel}_state`;
            const state = flow.get(stateKey) || "ON";
            msg.topic = `homeassistant/light/${subType}/${moduleId}/${channel}/set`;
            msg.payload = state;
        } else {
            return null;
        }
    }

    // ===== RELAY =====
    if (subType === "relay") {
        const addr = CHANNEL_COIL_MAP[channel];
        if (addr === undefined) {
            debugLog('modbus', `找不到 Relay 通道 ${channel}`);
            return null;
        }

        const state = (msg.payload === "ON") ? "ON" : "OFF";
        const valHi = (msg.payload === "ON") ? 0xFF : 0x00;
        const valLo = 0x00;
        const hi = (addr >> 8) & 0xFF;
        const lo = addr & 0xFF;
        const frame = Buffer.from([moduleId, 0x05, hi, lo, valHi, valLo]);
        const cmd = generalCommandBuild(frame);

        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        debugLog('modbus', `=== Modbus 指令 (Relay) ===`);
        debugLog('modbus', `Coil 地址: 0x${addr.toString(16).padStart(4, '0')}`);
        debugLog('modbus', `指令: ${cmd.toString('hex')}`);

        modbusMessages.push({ payload: cmd, subType, moduleId, channel, state });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });

        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `Relay ${moduleId}-${channel}: ${state}`
        });
    }

    // ===== SINGLE =====
    else if (subType === "single") {
        const reg = CHANNEL_REGISTER_MAP[channel];
        if (!reg) {
            debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
            return null;
        }

        let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        let brightness = flow.get(`${subType}_${moduleId}_${channel}_brightness`);
        if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
        brightness = clamp(Math.round(brightness), 0, 100);

        const brValue = (state === "ON") ? brightness : 0;
        const speed = (state === "OFF") ? 0x00 : BRIGHTNESS_TIME;
        const cmd = buildCommand(moduleId, reg, brValue, speed);

        debugLog('modbus', `=== Modbus 指令 (Single) ===`);
        debugLog('modbus', `指令: ${cmd.toString('hex')}`);

        modbusMessages.push({ payload: cmd, subType, moduleId, channel, state, brightness });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
        }

        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `${moduleId}-${channel}: ${state} ${brightness}%`
        });
    }

    // ===== DUAL =====
    else if (subType === "dual") {
        const regs = CHANNEL_REGISTER_MAP[channel];
        if (!regs) {
            debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
            return null;
        }

        let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        let brightness = flow.get(`${subType}_${moduleId}_${channel}_brightness`);
        if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
        brightness = clamp(Math.round(brightness), 0, 100);

        let colortemp = flow.get(`${subType}_${moduleId}_${channel}_colortemp`);
        if (typeof colortemp !== "number") colortemp = DEFAULT_COLORTEMP;
        colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
        const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);

        const brValue = (state === "ON") ? brightness : 0;
        const cmdBrightness = buildCommand(moduleId, regs[0], brValue);
        const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);

        debugLog('modbus', `=== Modbus 指令 (Dual) ===`);
        debugLog('modbus', `亮度: ${cmdBrightness.toString('hex')}`);
        debugLog('modbus', `色溫: ${cmdColortemp.toString('hex')}`);

        modbusMessages.push({ payload: cmdBrightness, subType, moduleId, channel, state, brightness, colortemp });
        modbusMessages.push({ payload: cmdColortemp, subType, moduleId, channel, state, brightness, colortemp });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
            mqttMessages.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
        }

        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `${moduleId}-${channel}: ${state} ${brightness}% ${colortemp}K`
        });
    }

    // ===== SCENE =====
    else if (subType === "scene") {
        const sceneType = parts[3];  // single, dual
        const lights = parts[4].split("--");  // 12-1--12-2
        const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
        
        // Scene 快取 key 格式: scene_single_12-3--12-4_brightness
        const groupBrightnessKey = `scene_${sceneType}_${parts[4]}_brightness`;
        const groupColortempKey = `scene_${sceneType}_${parts[4]}_colortemp`;
        const groupBrightness = flow.get(groupBrightnessKey);
        const groupColortemp = flow.get(groupColortempKey);

        debugLog('scene', `=== Scene 控制 ===`);
        debugLog('scene', `場景類型: ${sceneType}`);
        debugLog('scene', `燈光列表: ${lights.join(", ")}`);
        debugLog('scene', `狀態: ${state}`);

        // 發送指令到每個燈光
        for (let light of lights) {
            const [lightId, lightChannel] = light.split("-");
            
            // 先直接更新個別燈光的快取（不透過 MQTT）
            if (state === "ON" && groupBrightness !== undefined) {
                flow.set(`${sceneType}_${lightId}_${lightChannel}_brightness`, groupBrightness);
                debugLog('scene', `更新快取: ${sceneType}_${lightId}_${lightChannel}_brightness = ${groupBrightness}`);
            }
            if (state === "ON" && groupColortemp !== undefined && sceneType === "dual") {
                flow.set(`${sceneType}_${lightId}_${lightChannel}_colortemp`, groupColortemp);
                debugLog('scene', `更新快取: ${sceneType}_${lightId}_${lightChannel}_colortemp = ${groupColortemp}`);
            }
            
            // 然後發送開關指令（會使用剛更新的快取）
            const lightTopic = `homeassistant/light/${sceneType}/${lightId}/${lightChannel}/set`;
            mqttMessages.push({ topic: lightTopic, payload: state });
        }

        // 更新場景本身的狀態
        mqttMessages.push({ topic: `homeassistant/light/scene/${sceneType}/${parts[4]}/state`, payload: state });

        node.status({
            fill: state === "ON" ? "yellow" : "grey",
            shape: "ring",
            text: `Scene: ${lights.length} 燈 ${state}`
        });
    }
}

// ========== COVER DEVICE ==========
else if (deviceType === "cover") {
    // 格式: homeassistant/cover/general/12/set
    // payload: "1_2/3" 表示開啟 relay 1 和 2，關閉 relay 3
    
    const relays = msg.payload.split("/");
    const on_relays = relays[0] ? relays[0].split("_").map(Number) : [];
    const off_relays = (relays[1] && relays[1].length > 0) ? relays[1].split("_").map(Number) : [];

    let output = 0x00;
    for (let relay of on_relays) {
        output |= (1 << (relay - 1));
    }
    for (let relay of off_relays) {
        output &= ~(1 << (relay - 1));
    }

    const frame = Buffer.from([moduleId, 0x06, 0x01, 0x9b, 0x10, output]);
    const cmd = generalCommandBuild(frame);

    debugLog('modbus', `=== Modbus 指令 (Cover) ===`);
    debugLog('modbus', `開啟 Relay: ${on_relays.join(", ")}`);
    debugLog('modbus', `關閉 Relay: ${off_relays.join(", ")}`);
    debugLog('modbus', `Bit Mask: 0b${output.toString(2).padStart(8, '0')} (0x${output.toString(16).padStart(2, '0')})`);
    debugLog('modbus', `指令: ${cmd.toString('hex')}`);

    modbusMessages.push({ payload: cmd, deviceType, moduleId, on_relays, off_relays });

    node.status({
        fill: "blue",
        shape: "dot",
        text: `Cover: ON[${on_relays}] OFF[${off_relays}]`
    });
}


// ========== QUERY DEVICE (查詢) ==========
else if (deviceType === "query") {
    // 格式: homeassistant/query/{subType}/{moduleId}/{channel}
    // subType: single, dual, relay
    
    const querySubType = subType;  // single, dual, relay
    
    debugLog('query', `=== Query 查詢 ===`);
    debugLog('query', `類型: ${querySubType}, 模組: ${moduleId}, 通道: ${channel}`);
    
    let frame;
    
    if (querySubType === "single" || querySubType === "dual") {
        // 查詢 Single/Dual Light: Read Holding Registers (0x03)
        const reg = CHANNEL_REGISTER_MAP[channel];
        if (!reg) {
            debugLog('query', `找不到通道 ${channel} 的寄存器`);
            return null;
        }
        
        const startReg = Array.isArray(reg) ? reg[0] : reg;  // dual 取第一個寄存器
        const quantity = Array.isArray(reg) ? 2 : 1;  // dual 讀 2 個，single 讀 1 個
        
        const regHi = (startReg >> 8) & 0xFF;
        const regLo = startReg & 0xFF;
        const qtyHi = (quantity >> 8) & 0xFF;
        const qtyLo = quantity & 0xFF;
        
        frame = Buffer.from([moduleId, 0x03, regHi, regLo, qtyHi, qtyLo]);
        
        debugLog('query', `讀取寄存器: 0x${startReg.toString(16).padStart(4, '0')}, 數量: ${quantity}`);
    }
    else if (querySubType === "relay") {
        // 查詢 Relay: Read Coils (0x01)
        const addr = CHANNEL_COIL_MAP[channel] || 0x0000;
        const quantity = 4;  // 讀取 4 個 coils
        
        const addrHi = (addr >> 8) & 0xFF;
        const addrLo = addr & 0xFF;
        const qtyHi = (quantity >> 8) & 0xFF;
        const qtyLo = quantity & 0xFF;
        
        frame = Buffer.from([moduleId, 0x01, addrHi, addrLo, qtyHi, qtyLo]);
        
        debugLog('query', `讀取線圈: 0x${addr.toString(16).padStart(4, '0')}, 數量: ${quantity}`);
    }
    else {
        debugLog('query', `不支援的查詢類型: ${querySubType}`);
        return null;
    }
    
    const cmd = generalCommandBuild(frame);
    
    debugLog('modbus', `=== Modbus 查詢指令 ===`);
    debugLog('modbus', `指令: ${cmd.toString('hex')}`);
    
    // 將查詢資訊附加到每個訊息中，供 Feedback 使用
    const queryMsg = { 
        payload: cmd, 
        deviceType: "query", 
        subType: querySubType, 
        moduleId, 
        channel,
        queryInfo: { type: querySubType, channel: channel }
    };
    modbusMessages.push(queryMsg);
    
    node.status({
        fill: "cyan",
        shape: "ring",
        text: `Query ${querySubType} ${moduleId}-${channel}`
    });
}


else {
    debugLog('topic', `不支援的設備類型: ${deviceType}`);
    return null;
}

// 返回: [Modbus 指令, MQTT 狀態]
return [modbusMessages, mqttMessages];