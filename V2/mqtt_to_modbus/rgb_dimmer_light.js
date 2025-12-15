/**
 * RGB 調光燈（rgb_dimmer）控制：產生 Modbus 指令（不含 CRC）
 * 支援 payload = { "state": "ON" | "OFF", "brightness": number, "rgb": "R,G,B" }
 *
 * 輸出：
 *   msg.payload = Buffer (不含 CRC 的 Modbus 指令)
 *
 * 使用方式：
 *   請串接 crc_builder 節點處理 CRC
 */

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_RGB = "255,255,255"; // 預設白光
const BRIGHTNESS_TIME = 0x05;

const CHANNEL_REGISTER_MAP = {
    "1": 0x0830,
    "2": 0x0834,
    "3": 0x0838,
    "4": 0x083C
};

// ========================== 主流程 ===========================
const topic = String(msg.topic || "");
const parts = topic.split("/");

// 支援 homeassistant/light/rgb/+/+/set (允許多於6段)
if (parts.length < 6) return null;
if (parts[0] !== "homeassistant") return null;
if (parts[1] !== "light") return null;
if (parts[2] !== "rgb") return null;
if (parts[5] !== "set") return null;

const slaveId = Number(parts[3]);
const channel = parts[4];
if (!Number.isInteger(slaveId) || slaveId <= 0) return null;
const reg = CHANNEL_REGISTER_MAP[channel];
if (!reg) return null;

// ------------------------ 解析 payload ------------------------
let isOn = false;
let brightnessFromPayload = null;
let rgbFromPayload = null;

if (typeof msg.payload === "object" && msg.payload !== null) {
    // JSON 格式 {"state":"ON","brightness":112,"rgb":"255,128,0"}
    if (typeof msg.payload.state === "string") {
        isOn = (msg.payload.state.toUpperCase() === "ON");
    }
    if (typeof msg.payload.brightness === "number") {
        brightnessFromPayload = msg.payload.brightness;
    }
    if (typeof msg.payload.rgb === "string") {
        rgbFromPayload = msg.payload.rgb;
    }
} else if (typeof msg.payload === "string") {
    isOn = (msg.payload.toUpperCase() === "ON");
} else if (typeof msg.payload === "boolean") {
    isOn = msg.payload;
}

// ------------------------ 亮度與顏色快取 ------------------------
const brightnessKey = `rgb_${slaveId}_${channel}_brightness`;
const rgbKey = `rgb_${slaveId}_${channel}_rgb`;

let useBrightness = null;
let useRgb = null;

if (typeof brightnessFromPayload === "number") {
    useBrightness = Math.round(brightnessFromPayload);
    flow.set(brightnessKey, useBrightness);
} else {
    useBrightness = flow.get(brightnessKey);
    if (typeof useBrightness !== "number") {
        useBrightness = DEFAULT_BRIGHTNESS;
    }
}
useBrightness = Math.min(100, Math.max(0, useBrightness));

if (typeof rgbFromPayload === "string") {
    useRgb = rgbFromPayload;
    flow.set(rgbKey, useRgb);
} else {
    useRgb = flow.get(rgbKey);
    if (typeof useRgb !== "string") {
        useRgb = DEFAULT_RGB;
    }
}

// ------------------------ RGB 亮度計算 ------------------------
function parseRgb(str) {
    const arr = String(str).split(",").map(x => parseInt(x, 10));
    return {
        r: Math.max(0, Math.min(255, arr[0] || 0)),
        g: Math.max(0, Math.min(255, arr[1] || 0)),
        b: Math.max(0, Math.min(255, arr[2] || 0))
    };
}

function rgbToBrightness(r, g, b, brightness) {
    const total = r + g + b;
    if (total === 0) {
        const avg = Math.round(brightness / 3);
        return { r: avg, g: avg, b: avg };
    }
    // 亮度最小值映射 (13-100)
    const minLevel = 13;
    const maxLevel = 100;
    const mappedBrightness = Math.round(minLevel + (brightness / 100) * (maxLevel - minLevel));
    return {
        r: Math.round(mappedBrightness * r / total),
        g: Math.round(mappedBrightness * g / total),
        b: Math.round(mappedBrightness * b / total)
    };
}

const { r: r_ha, g: g_ha, b: b_ha } = parseRgb(useRgb);
let r, g, b;
if (!isOn) {
    r = g = b = 0;
} else {
    const rgb = rgbToBrightness(r_ha, g_ha, b_ha, useBrightness);
    r = rgb.r;
    g = rgb.g;
    b = rgb.b;
}

// ------------------------ 組 Modbus 指令 ------------------------
const hi = (reg >> 8) & 0xFF;
const lo = reg & 0xFF;

const cmd = Buffer.from([
    slaveId,
    0x10, // function code for write multiple registers
    hi,
    lo,
    BRIGHTNESS_TIME,
    r,
    g,
    b,
    0x00 // 填充
]);

msg.payload = cmd;
return msg;
