// HVAC Feedback 解析器（獨立版，符合 discovery_climate_MQTT.js 的 topic 規則）
// 輸入：msg.payload = Buffer (17 bytes, 已驗證 CRC)
// 輸出：MQTT 狀態陣列 [{ topic, payload }...]

// === 狀態對應表 ===
const HVAC_MODE_MAP = {
    0: "cool",
    1: "heat",
    2: "dry",
    3: "fan_only",
    4: "off"
};
const HVAC_FAN_MAP = {
    0: "auto",
    1: "low",
    2: "medium",
    3: "high"
};

// === 解析主程式 ===
const buf = msg.payload;
if (!Buffer.isBuffer(buf) || buf.length !== 17) return null;

const moduleId = buf[0];
const funcCode = buf[1];
if (funcCode !== 0x03) return null;

const power_state = buf.readUInt16BE(3);
const mode_state = buf.readUInt16BE(5);
const fan_mode_state = buf.readUInt16BE(7);
const temperature_state = buf.readUInt16BE(9);
const current_temperature_state = buf.readUInt16BE(11);
const hvac_id = buf.readUInt8(14) / 8;

// topic path: homeassistant/hvac/<brand>/<moduleId>/<hvac_id>
const brand = "hitachi"; // 依 discovery_climate_MQTT.js
const baseTopic = `homeassistant/hvac/${brand}/${moduleId}/${hvac_id}`;

const mode_state_str = (power_state === 0) ? "off" : (HVAC_MODE_MAP[mode_state] || "off");
const fan_mode_state_str = HVAC_FAN_MAP[fan_mode_state] || "auto";

let mqttMessages = [];
mqttMessages.push({ topic: `${baseTopic}/mode/state`, payload: mode_state_str });
mqttMessages.push({ topic: `${baseTopic}/fan/state`, payload: fan_mode_state_str });
mqttMessages.push({ topic: `${baseTopic}/temperature/state`, payload: temperature_state });
mqttMessages.push({ topic: `${baseTopic}/current_temperature`, payload: current_temperature_state });

return [mqttMessages];
