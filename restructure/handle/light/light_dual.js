/**
 * 雙色溫燈光處理器 (Dual)
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 crc_builder → modbus_queue
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 前置需求：
 *   必須先執行 common.js 初始化共用模組
 * 
 * 支援的 Topic 格式:
 *   homeassistant/light/dual/{moduleId}/{channel}/set
 *   homeassistant/light/dual/{moduleId}/{channel}/set/brightness
 *   homeassistant/light/dual/{moduleId}/{channel}/set/colortemp
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 light_common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { clamp, buildCommand, miredToPercent } = UTILS;
const { DEFAULT_BRIGHTNESS, DEFAULT_COLORTEMP, MIN_MIRED, MAX_MIRED, BRIGHTNESS_TIME, DUAL_REGISTER_MAP } = CONST;

function debugLog(category, message) {
    UTILS.debugLog.call({ warn: node.warn.bind(node) }, category, message);
}

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light
const subType = parts[2];        // dual
const moduleId = parseInt(parts[3]);
const channel = parts[4];

if (deviceType !== "light" || subType !== "dual") {
    return null;
}

debugLog('topic', `=== Dual Light 處理器 ===`);
debugLog('topic', `Topic: ${msg.topic}, Payload: ${msg.payload}`);
debugLog('topic', `Module: ${moduleId}, Channel: ${channel}`);

let modbusMessages = [];
let mqttMessages = [];
const baseTopic = `homeassistant/light/dual/${moduleId}/${channel}`;

const regs = DUAL_REGISTER_MAP[channel];
if (!regs) {
    debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
    return null;
}

// 處理 set/brightness 或 set/colortemp
if (parts.length >= 7 && parts[5] === "set") {
    const attribute = parts[6];
    const val = Number(msg.payload);
    
    if (!isNaN(val)) {
        const key = `dual_${moduleId}_${channel}_${attribute}`;
        flow.set(key, val);
        debugLog('cache', `儲存 ${key} = ${val}`);
    }

    // 色溫調整：只發送色溫指令
    if (attribute === "colortemp") {
        let colortemp = val;
        colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
        const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);
        const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);

        debugLog('modbus', `=== Modbus 指令 (Dual Colortemp Only) ===`);
        debugLog('modbus', `色溫: ${cmdColortemp.toString('hex')}`);

        modbusMessages.push({ payload: cmdColortemp, subType: "dual", moduleId, channel, colortemp });

        node.status({ fill: "yellow", shape: "dot", text: `${moduleId}-${channel}: Colortemp ${colortemp}K` });
        return [modbusMessages, []];
    }

    // 亮度變更時，保持當前開關狀態
    if (attribute === "brightness") {
        const stateKey = `dual_${moduleId}_${channel}_state`;
        const state = flow.get(stateKey) || "ON";
        msg.payload = state;
    }
}

// 處理開關指令
let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
flow.set(`dual_${moduleId}_${channel}_state`, state);

let brightness = flow.get(`dual_${moduleId}_${channel}_brightness`);
if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
brightness = clamp(Math.round(brightness), 0, 100);

let colortemp = flow.get(`dual_${moduleId}_${channel}_colortemp`);
if (typeof colortemp !== "number") colortemp = DEFAULT_COLORTEMP;
colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);

const brValue = (state === "ON") ? brightness : 0;
const cmdBrightness = buildCommand(moduleId, regs[0], brValue);
const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);

debugLog('modbus', `=== Modbus 指令 (Dual) ===`);
debugLog('modbus', `亮度: ${cmdBrightness.toString('hex')}`);
debugLog('modbus', `色溫: ${cmdColortemp.toString('hex')}`);

modbusMessages.push({ payload: cmdBrightness, subType: "dual", moduleId, channel, state, brightness, colortemp });
modbusMessages.push({ payload: cmdColortemp, subType: "dual", moduleId, channel, state, brightness, colortemp });
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

return [modbusMessages, mqttMessages];
