/**
 * 單色溫燈光處理器 (Single)
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
 *   homeassistant/light/single/{moduleId}/{channel}/set
 *   homeassistant/light/single/{moduleId}/{channel}/set/brightness
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    node.error('共用模組未初始化，請先執行 light_common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { clamp, buildCommand } = UTILS;
const { DEFAULT_BRIGHTNESS, BRIGHTNESS_TIME, CHANNEL_REGISTER_MAP } = CONST;

function debugLog(category, message) {
    UTILS.debugLog.call({ warn: node.warn.bind(node) }, category, message);
}

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light
const subType = parts[2];        // single
const moduleId = parseInt(parts[3]);
const channel = parts[4];

if (deviceType !== "light" || subType !== "single") {
    return null;
}

debugLog('topic', `=== Single Light 處理器 ===`);
debugLog('topic', `Topic: ${msg.topic}, Payload: ${msg.payload}`);
debugLog('topic', `Module: ${moduleId}, Channel: ${channel}`);

let modbusMessages = [];
let mqttMessages = [];
const baseTopic = `homeassistant/light/single/${moduleId}/${channel}`;

// 處理 set/brightness
if (parts.length >= 7 && parts[5] === "set" && parts[6] === "brightness") {
    const val = Number(msg.payload);
    if (!isNaN(val)) {
        const key = `single_${moduleId}_${channel}_brightness`;
        flow.set(key, val);
        debugLog('cache', `儲存 ${key} = ${val}`);
    }
    
    // 亮度變更時，保持當前開關狀態
    const stateKey = `single_${moduleId}_${channel}_state`;
    const state = flow.get(stateKey) || "ON";
    msg.payload = state;
}

// 處理開關指令
const reg = CHANNEL_REGISTER_MAP[channel];
if (!reg) {
    debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
    return null;
}

let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
flow.set(`single_${moduleId}_${channel}_state`, state);

let brightness = flow.get(`single_${moduleId}_${channel}_brightness`);
if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
brightness = clamp(Math.round(brightness), 0, 100);

const brValue = (state === "ON") ? brightness : 0;
const speed = (state === "OFF") ? 0x00 : BRIGHTNESS_TIME;
const cmd = buildCommand(moduleId, reg, brValue, speed);

debugLog('modbus', `=== Modbus 指令 (Single) ===`);
debugLog('modbus', `指令: ${cmd.toString('hex')}`);

modbusMessages.push({ payload: cmd, subType: "single", moduleId, channel, state, brightness });
mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
if (state === "ON") {
    mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
}

node.status({ 
    fill: state === "ON" ? "green" : "grey", 
    shape: "dot", 
    text: `${moduleId}-${channel}: ${state} ${brightness}%` 
});

return [modbusMessages, mqttMessages];
