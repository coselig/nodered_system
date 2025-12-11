/**
 * 單色溫（single）控制：產生 Modbus 指令（不含 CRC）
 * 支援 payload = { "state": "ON" | "OFF", "brightness": number }
 *
 * 輸出：
 *   msg.payload = Buffer (不含 CRC 的 Modbus 指令)
 *
 * 使用方式：
 *   請串接 crc_builder 節點處理 CRC
 */

const DEFAULT_BRIGHTNESS = 100;
const BRIGHTNESS_TIME = 0x05;

const CHANNEL_REGISTER_MAP = {
    "1": 0x082A,
    "2": 0x082B,
    "3": 0x082C,
    "4": 0x082D
};

// ...existing code...

/* ========================== 主流程 =========================== */
const topic = String(msg.topic || "");
const parts = topic.split("/");

if (parts.length !== 6) return null;
if (parts[0] !== "homeassistant") return null;
if (parts[1] !== "light") return null;
if (parts[2] !== "single") return null;
if (parts[5] !== "set") return null;

const slaveId = Number(parts[3]);
const channel = parts[4];

if (!Number.isInteger(slaveId) || slaveId <= 0) return null;
const reg = CHANNEL_REGISTER_MAP[channel];
if (!reg) return null;

/* ------------------------ 解析 payload ------------------------ */
let isOn = false;
let brightnessFromPayload = null;

if (typeof msg.payload === "object" && msg.payload !== null) {
    // JSON 格式 {"state":"ON","brightness":112}
    if (typeof msg.payload.state === "string") {
        isOn = (msg.payload.state.toUpperCase() === "ON");
    }
    if (typeof msg.payload.brightness === "number") {
        brightnessFromPayload = msg.payload.brightness;
    }
} else if (typeof msg.payload === "string") {
    isOn = (msg.payload.toUpperCase() === "ON");
} else if (typeof msg.payload === "boolean") {
    isOn = msg.payload;
}

/* ------------------------ 亮度處理 ------------------------ */
const brightnessKey = `single_${slaveId}_${channel}_brightness`;
let useBrightness = null;

// payload 有 brightness → 用 payload 同時更新快取
if (typeof brightnessFromPayload === "number") {
    useBrightness = Math.round(brightnessFromPayload);
    flow.set(brightnessKey, useBrightness);

    // 否則用快取
} else {
    useBrightness = flow.get(brightnessKey);
    if (typeof useBrightness !== "number") {
        useBrightness = DEFAULT_BRIGHTNESS;
    }
}

// 範圍保護 0~100
useBrightness = Math.min(100, Math.max(0, useBrightness));

// OFF = 0、ON = 亮度
const value = isOn ? useBrightness : 0x00;

/* ------------------------ 組 Modbus 指令 ------------------------ */
const hi = (reg >> 8) & 0xFF;
const lo = reg & 0xFF;

const cmd = Buffer.from([
    slaveId,
    0x06,
    hi,
    lo,
    BRIGHTNESS_TIME,
    value
]);

// 只輸出不含 CRC 的 Modbus 指令
msg.payload = cmd;
return msg;
