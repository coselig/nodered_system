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
    "x": 0x0829,
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



// ------------------------ 亮度與顏色快取 ------------------------

let minLevel = 13;  // 你設定的最低亮度
let maxLevel = 100; // 最大亮度

let rawBrightness = flow.get(`rgb_${slaveId}_brightness`);
let brightness = Math.round(minLevel + (rawBrightness / 100) * (maxLevel - minLevel));

let rawRGB = flow.get(`rgb_${slaveId}_rgb`);


const rgbArray = (rawRGB.split(",")).map(val => parseInt(val.trim(), 10));
let [r_ha, g_ha, b_ha] = rgbArray;

node.status({ fill: "red", shape: "ring", text: `${r_ha},${g_ha},${b_ha}` });
// 使用解構賦值快速取得 R, G, B
let redBrightness = Math.round(brightness * r_ha / (r_ha + g_ha + b_ha));
let greenBrightness = Math.round(brightness * g_ha / (r_ha + g_ha + b_ha));
let blueBrightness = Math.round(brightness * b_ha / (r_ha + g_ha + b_ha));

let r, g, b;


if (msg.payload == "OFF") {
    r = g = b = 0;
}
else {
    r = redBrightness;
    g = greenBrightness;
    b = blueBrightness;
};


const cmd = Buffer.from([
    slaveId,
    0x10,
    0x08,
    0x29,
    0x00,
    0x02,
    0x04,
    r,
    g,
    b,
    0x00,
]);

msg.payload = cmd;
return msg;
