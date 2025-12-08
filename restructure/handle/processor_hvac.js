/**
 * 空調處理器 - 支援 HVAC 控制
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 crc_builder → modbus_queue
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 支援的 Topic 格式:
 *   homeassistant/hvac/{s200Id}/{hvacId}/mode/set     (payload: "cool", "heat", "dry", "fan_only", "off")
 *   homeassistant/hvac/{s200Id}/{hvacId}/temperature/set (payload: 16-30)
 *   homeassistant/hvac/{s200Id}/{hvacId}/fan/set      (payload: "auto", "low", "medium", "high")
 */

// ========== 共用模組 ==========
const debugConfig = global.get('debug_config') || {
    topic: true, cache: true, modbus: true, mqtt: true, scene: true, query: true
};

function debugLog(category, message) {
    if (debugConfig[category]) node.warn(message);
}

// CRC 由 crc_builder.js 處理

// ========== 常數定義 ==========
const MODE_MAP = {
    "cool": 0,
    "heat": 1,
    "dry": 2,
    "fan_only": 3,
    "off": 4
};

const FAN_MODE_MAP = {
    "auto": 0,
    "low": 1,
    "medium": 2,
    "high": 3
};

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // hvac

if (deviceType !== "hvac") {
    return null;
}

const s200Id = parseInt(parts[2]);      // S200 模組 ID (通常是 200)
const hvacId = parseInt(parts[3]);      // HVAC 設備 ID (1, 2, 3...)
const hvacAction = parts[4];            // mode, fan, temperature
const payload = msg.payload;

debugLog('topic', `=== HVAC 處理器 ===`);
debugLog('topic', `S200 ID: ${s200Id}, HVAC ID: ${hvacId}, 動作: ${hvacAction}, 值: ${payload}`);

const baseAddress = 0x100;
const speed = 0x00; // HVAC 統一使用 0x00 (立即執行)

let register, value;

switch (hvacAction) {
    case "mode":
        register = baseAddress + hvacId * 8 + 1;
        value = MODE_MAP[payload];
        debugLog('modbus', `模式設定: ${payload} -> ${value}`);
        break;

    case "fan":
        register = baseAddress + hvacId * 8 + 2;
        value = FAN_MODE_MAP[payload];
        debugLog('modbus', `風速設定: ${payload} -> ${value}`);
        break;

    case "temperature":
        register = baseAddress + hvacId * 8 + 3;
        value = parseFloat(payload);
        debugLog('modbus', `溫度設定: ${value}°C`);
        break;

    default:
        debugLog('topic', `未知的 HVAC 動作: ${hvacAction}`);
        return null;
}

if (value === undefined || value === null) {
    debugLog('topic', `無效的 HVAC 值: ${payload}`);
    return null;
}

const regHi = (register >> 8) & 0xFF;
const regLo = register & 0xFF;

const cmd = Buffer.from([
    s200Id,
    0x06,
    regHi,
    regLo,
    speed,
    value
]);

debugLog('modbus', `=== Modbus 指令 (HVAC) ===`);
debugLog('modbus', `寄存器: 0x${register.toString(16).padStart(4, '0')}`);
debugLog('modbus', `指令: ${cmd.toString('hex')}`);

let modbusMessages = [];
modbusMessages.push({ payload: cmd, deviceType, s200Id, hvacId, hvacAction, value });

node.status({
    fill: "orange",
    shape: "dot",
    text: `HVAC ${hvacId}: ${hvacAction}=${payload}`
});

return [modbusMessages, []];
