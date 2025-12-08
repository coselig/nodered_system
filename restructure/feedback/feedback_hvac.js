/**
 * HVAC Feedback 處理器 - 解析空調回應
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
 *   - 0x03: Read Holding Registers (HVAC 狀態回應，長度 17 bytes)
 * 
 * HVAC 回應格式 (17 bytes):
 *   [Module_ID] [0x03] [ByteCount] [Power Hi] [Power Lo] [Mode Hi] [Mode Lo] 
 *   [Fan Hi] [Fan Lo] [Temp Hi] [Temp Lo] [CurrTemp Hi] [CurrTemp Lo] 
 *   [0x00] [HVAC_ID*8] [CRC Lo] [CRC Hi]
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { HVAC_MODE_MAP, HVAC_FAN_MAP } = CONST;
const { makeDequeueMsg } = UTILS;

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

// HVAC 回應特徵: 功能碼 0x03, 長度 17 bytes
if (funcCode !== 0x03 || buf.length !== 17) {
    return null;
}

debugLog('modbus', `=== HVAC Feedback (0x03) ===`);
debugLog('modbus', `模組: ${moduleId}, 長度: ${buf.length}`);

let mqttMessages = [];

const power_state = buf.readUInt16BE(3);
const mode_state = buf.readUInt16BE(5);
const fan_mode_state = buf.readUInt16BE(7);
const temperature_state = buf.readUInt16BE(9);
const current_temperature_state = buf.readUInt16BE(11);
const hvac_id = buf.readUInt8(14) / 8;

debugLog('modbus', `HVAC ID: ${hvac_id}`);
debugLog('modbus', `電源: ${power_state}, 模式: ${mode_state}, 風速: ${fan_mode_state}`);
debugLog('modbus', `設定溫度: ${temperature_state}°C, 當前溫度: ${current_temperature_state}°C`);

// 當 power_state 為 0 時，將 mode_state 設為 "off"
const mode_state_str = (power_state === 0) ? "off" : (HVAC_MODE_MAP[mode_state] || "off");
const fan_mode_state_str = HVAC_FAN_MAP[fan_mode_state] || "auto";

debugLog('modbus', `模式字串: ${mode_state_str}, 風速字串: ${fan_mode_state_str}`);

// 發布 MQTT 狀態
const baseTopic = `homeassistant/hvac/${moduleId}/${hvac_id}`;

mqttMessages.push({ topic: `${baseTopic}/mode/state`, payload: mode_state_str });
mqttMessages.push({ topic: `${baseTopic}/fan_mode/state`, payload: fan_mode_state_str });
mqttMessages.push({ topic: `${baseTopic}/temperature/state`, payload: temperature_state });
mqttMessages.push({ topic: `${baseTopic}/current_temperature`, payload: current_temperature_state });

// 更新快取
flow.set(`hvac_${moduleId}_${hvac_id}_mode`, mode_state_str);
flow.set(`hvac_${moduleId}_${hvac_id}_fan_mode`, fan_mode_state_str);
flow.set(`hvac_${moduleId}_${hvac_id}_temperature`, temperature_state);
flow.set(`hvac_${moduleId}_${hvac_id}_current_temperature`, current_temperature_state);

debugLog('mqtt', `發布 HVAC 狀態: ${baseTopic}`);
debugLog('mqtt', `  模式: ${mode_state_str}, 風速: ${fan_mode_state_str}`);
debugLog('mqtt', `  設定溫度: ${temperature_state}°C, 當前溫度: ${current_temperature_state}°C`);

node.status({
    fill: "orange",
    shape: "dot",
    text: `HVAC ${moduleId}-${hvac_id}: ${mode_state_str} ${temperature_state}°C (${current_temperature_state}°C)`
});

return [mqttMessages, makeDequeueMsg()];
