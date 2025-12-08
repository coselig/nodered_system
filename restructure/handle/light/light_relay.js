/**
 * Relay 燈光處理器
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
 *   homeassistant/light/relay/{moduleId}/{channel}/set
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { buildCoilCommand } = UTILS;
const { RELAY_COIL_MAP } = CONST;

function debugLog(category, message) {
    UTILS.debugLog.call({ warn: node.warn.bind(node) }, category, message);
}

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light
const subType = parts[2];        // relay
const moduleId = parseInt(parts[3]);
const channel = parts[4];

if (deviceType !== "light" || subType !== "relay") {
    return null;
}

debugLog('topic', `=== Relay 處理器 ===`);
debugLog('topic', `Topic: ${msg.topic}, Payload: ${msg.payload}`);
debugLog('topic', `Module: ${moduleId}, Channel: ${channel}`);

let modbusMessages = [];
let mqttMessages = [];
const baseTopic = `homeassistant/light/relay/${moduleId}/${channel}`;

const addr = RELAY_COIL_MAP[channel];
if (addr === undefined) {
    debugLog('modbus', `找不到 Relay 通道 ${channel}`);
    return null;
}

const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
const cmd = buildCoilCommand(moduleId, addr, state === "ON");

flow.set(`relay_${moduleId}_${channel}_state`, state);

debugLog('modbus', `=== Modbus 指令 (Relay) ===`);
debugLog('modbus', `Coil 地址: 0x${addr.toString(16).padStart(4, '0')}`);
debugLog('modbus', `指令: ${cmd.toString('hex')}`);

modbusMessages.push({ payload: cmd, subType: "relay", moduleId, channel, state });
mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });

node.status({ 
    fill: state === "ON" ? "green" : "grey", 
    shape: "dot", 
    text: `Relay ${moduleId}-${channel}: ${state}` 
});

return [modbusMessages, mqttMessages];
