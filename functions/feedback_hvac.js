/**
 * feedback_hvac - 處理 HVAC 空調設備回饋資料
 * 解析空調狀態並發送到 MQTT
 */

let buf = msg.payload; // 假設 buf 是包含所需數據的緩衝區

// 確保緩衝區長度正確
if (buf.length !== 17) {
    return null;
}

// 讀取 8 位元和 16 位元數據
let s200_id = buf.readUInt8(0);
let fc = buf.readUInt8(1);
let len = buf.readUInt8(2);

let power_state = buf.readUInt16BE(3);
let mode_state = buf.readUInt16BE(5);
let fan_mode_state = buf.readUInt16BE(7);
let temperature_state = buf.readUInt16BE(9);
let current_temperature_state = buf.readUInt16BE(11);

let hvac_id = buf.readUInt8(14) / 8;

let crc16_lo = buf.readUInt8(15);
let crc16_hi = buf.readUInt8(16);

// CRC 校驗
function calculateCRC(buffer) {
    let crc = 0xFFFF;
    for (let pos = 0; pos < buffer.length - 2; pos++) {
        crc ^= buffer.readUInt8(pos);
        for (let i = 8; i !== 0; i--) {
            if ((crc & 0x0001) !== 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

function isValidCRC(buffer) {
    let receivedCRC = (buffer.readUInt8(buffer.length - 1) << 8) | buffer.readUInt8(buffer.length - 2);
    let calculatedCRC = calculateCRC(buffer);
    return receivedCRC === calculatedCRC;
}

// 僅當長度正確且CRC校驗成功時返回消息
if (!isValidCRC(buf)) {
    return null;
}

// 對應數字和字符串的映射
const modeMap = {
    0: "cool",
    1: "heat",
    2: "dry",
    3: "fan_only",
    4: "off"
};

const fanModeMap = {
    0: "auto",
    1: "low",
    2: "medium",
    3: "high"
};

// 當 power_state 為 0 時，將 mode_state 設為 "off"
let mode_state_str = (power_state === 0) ? "off" : modeMap[mode_state];
let fan_mode_state_str = fanModeMap[fan_mode_state];

// 返回對應的MQTT消息

node.send({ payload: mode_state_str, topic: `homeassistant/hvac/200/${hvac_id}/mode/state` });
node.send({ payload: fan_mode_state_str, topic: `homeassistant/hvac/200/${hvac_id}/fan_mode/state` });
node.send({ payload: temperature_state, topic: `homeassistant/hvac/200/${hvac_id}/temperature/state` });
node.send({ payload: current_temperature_state, topic: `homeassistant/hvac/200/${hvac_id}/current_temperature` });
return;
