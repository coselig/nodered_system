/**
 * 空調處理器 - 支援 HVAC 控制
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 modbus_queue.js
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 支援的 Topic 格式:
 *   homeassistant/hvac/{s200Id}/{hvacId}/mode/set     (payload: "cool", "heat", "dry", "fan_only", "off")
 *   homeassistant/hvac/{s200Id}/{hvacId}/temperature/set (payload: 16-30)
 *   homeassistant/hvac/{s200Id}/{hvacId}/fan/set      (payload: "auto", "low", "medium", "high")
 */

// ========== 共用模組 ==========
// CRC16 MODBUS
function crc16(buf) {
    let crc = 0xFFFF;
    for (const b of buf) {
        crc ^= b;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 1)
                ? ((crc >> 1) ^ 0xA001)
                : (crc >> 1);
        }
    }
    return crc;
}

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
const brand = parts[2];          // hitachi
let s200Id, hvacId, hvacAction;
if (deviceType !== "hvac") return null;

if (brand === "hitachi") {
    s200Id = parseInt(parts[3]);
    hvacId = parseInt(parts[4]);
    hvacAction = parts[5];
} else {
    s200Id = parseInt(parts[2]);
    hvacId = parseInt(parts[3]);
    hvacAction = parts[4];
}
const payload = msg.payload;

const baseAddress = 0x100;
const speed = 0x00;
let register, value;
switch (hvacAction) {
    case "mode":
        register = baseAddress + hvacId * 8 + 1;
        value = MODE_MAP[payload];
        break;
    case "fan":
        register = baseAddress + hvacId * 8 + 2;
        value = FAN_MODE_MAP[payload];
        break;
    case "temperature":
        register = baseAddress + hvacId * 8 + 3;
        value = parseFloat(payload);
        break;
    default:
        return null;
}
if (value === undefined || value === null) return null;
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
const crc = crc16(cmd);
const crcLow = crc & 0xFF;
const crcHigh = (crc >> 8) & 0xFF;
msg.payload = Buffer.concat([
    cmd,
    Buffer.from([crcLow, crcHigh])
]);
return msg;
