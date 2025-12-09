/**
 * 雙色溫（dual）調光控制：產生 Modbus 指令（含 CRC16）
 * 支援 payload = { "state": "ON" | "OFF", "brightness": number, "colortemp": number }
 */

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_COLORTEMP = 50;
const BRIGHTNESS_TIME = 0x05;
const COLORTEMP_TIME = 0x06;

const CHANNEL_REGISTER_MAP = {
    "a": { brightness: 0x0830, colortemp: 0x0831 },
    "b": { brightness: 0x0832, colortemp: 0x0833 }
};

/* ------------------------ CRC-16 MODBUS ------------------------ */
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

/* ========================== 主流程 =========================== */
const topic = String(msg.topic || "");
const parts = topic.split("/");

if (parts.length !== 6) return null;
if (parts[0] !== "homeassistant") return null;
if (parts[1] !== "light") return null;
if (parts[2] !== "dual") return null;
if (parts[5] !== "set") return null;

const slaveId = Number(parts[3]);
const channel = parts[4];

if (!Number.isInteger(slaveId) || slaveId <= 0) return null;
const regMap = CHANNEL_REGISTER_MAP[channel];
if (!regMap) return null;

/* ------------------------ 解析 payload ------------------------ */
let isOn = false;
let brightnessFromPayload = null;
let colortempFromPayload = null;

if (typeof msg.payload === "object" && msg.payload !== null) {
    // JSON 格式 {"state":"ON","brightness":112,"colortemp":60}
    if (typeof msg.payload.state === "string") {
        isOn = (msg.payload.state.toUpperCase() === "ON");
    }
    if (typeof msg.payload.brightness === "number") {
        brightnessFromPayload = msg.payload.brightness;
    }
    if (typeof msg.payload.colortemp === "number") {
        colortempFromPayload = msg.payload.colortemp;
    }
} else if (typeof msg.payload === "string") {
    isOn = (msg.payload.toUpperCase() === "ON");
} else if (typeof msg.payload === "boolean") {
    isOn = msg.payload;
}

/* ------------------------ 亮度/色溫處理 ------------------------ */
const brightnessKey = `dual_${slaveId}_${channel}_brightness`;
const colortempKey = `dual_${slaveId}_${channel}_colortemp`;
let useBrightness = null;
let useColortemp = null;

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

if (typeof colortempFromPayload === "number") {
    useColortemp = Math.round(colortempFromPayload);
    flow.set(colortempKey, useColortemp);
} else {
    useColortemp = flow.get(colortempKey);
    if (typeof useColortemp !== "number") {
        useColortemp = DEFAULT_COLORTEMP;
    }
}
useColortemp = Math.min(100, Math.max(0, useColortemp));

// OFF = 0，ON = 亮度/色溫
const valueBrightness = isOn ? useBrightness : 0x00;
const valueColortemp = isOn ? useColortemp : 0x00;

/* ------------------------ 組 Modbus 指令 ------------------------ */
function buildCmd(reg, time, value) {
    const hi = (reg >> 8) & 0xFF;
    const lo = reg & 0xFF;
    return Buffer.from([
        slaveId,
        0x06,
        hi,
        lo,
        time,
        value
    ]);
}

const cmdBrightness = buildCmd(regMap.brightness, BRIGHTNESS_TIME, valueBrightness);
const cmdColortemp = buildCmd(regMap.colortemp, COLORTEMP_TIME, valueColortemp);

/* ------------------------ 加 CRC ------------------------ */
function addCRC(cmd) {
    const crc = crc16(cmd);
    const crcLow = crc & 0xFF;
    const crcHigh = (crc >> 8) & 0xFF;
    return Buffer.concat([cmd, Buffer.from([crcLow, crcHigh])]);
}

const outBrightness = addCRC(cmdBrightness);
const outColortemp = addCRC(cmdColortemp);

msg.payload = [outBrightness, outColortemp];

return msg;
