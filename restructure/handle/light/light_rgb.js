/**
 * RGB 燈光處理器 (純 RGB，無白光通道)
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
 *   homeassistant/light/rgb/{moduleId}/{channel}/set
 *   homeassistant/light/rgb/{moduleId}/{channel}/set/brightness
 *   homeassistant/light/rgb/{moduleId}/{channel}/set/rgb
 * 
 * 與 WRGB 的差異:
 *   - RGB 只有 3 個通道 (R, G, B)，無白光 (W) 通道
 *   - 亮度分配直接按 RGB 比例計算，不提取白光
 *   - Modbus 指令只發送 3 bytes 資料 + 1 byte 填充
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    return null;
}

const { CONST, UTILS } = lib;
const { clamp, buildMultiCommand, parseRgb } = UTILS;
const { DEFAULT_BRIGHTNESS, DEFAULT_WRGB, RGB_REGISTER_MAP } = CONST;

function debugLog(category, message) {
    UTILS.debugLog.call({ warn: node.warn.bind(node) }, category, message);
}

// ========== RGB 亮度計算 (純 RGB，不提取白光) ==========
function rgbToBrightness(r, g, b, brightness) {
    const total = r + g + b;
    if (total === 0) {
        // 若 RGB 都為 0，平均分配亮度
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

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light
const subType = parts[2];        // rgb
const moduleId = parseInt(parts[3]);
const channel = parts[4];

if (deviceType !== "light" || subType !== "rgb") {
    return null;
}

debugLog('topic', `=== RGB 處理器 ===`);
debugLog('topic', `Topic: ${msg.topic}, Payload: ${msg.payload}`);
debugLog('topic', `Module: ${moduleId}, Channel: ${channel}`);

let modbusMessages = [];
let mqttMessages = [];
const baseTopic = `homeassistant/light/rgb/${moduleId}/${channel}`;

const reg = RGB_REGISTER_MAP[channel];
if (!reg) {
    debugLog('modbus', `找不到 RGB 通道 ${channel} 的寄存器`);
    return null;
}

// 處理 set/brightness 或 set/rgb
if (parts.length >= 7 && parts[5] === "set") {
    const attribute = parts[6];
    const key = `rgb_${moduleId}_${channel}_${attribute}`;
    
    if (attribute === "rgb") {
        flow.set(key, msg.payload);
        debugLog('cache', `儲存 ${key} = ${msg.payload}`);
    } else if (attribute === "brightness") {
        const val = Number(msg.payload);
        if (!isNaN(val)) {
            flow.set(key, val);
            debugLog('cache', `儲存 ${key} = ${val}`);
        }
    }
    
    // 亮度或顏色變更時，保持當前開關狀態
    const stateKey = `rgb_${moduleId}_${channel}_state`;
    const state = flow.get(stateKey) || "ON";
    msg.payload = state;
}

// 處理開關指令
let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
flow.set(`rgb_${moduleId}_${channel}_state`, state);

let brightness = flow.get(`rgb_${moduleId}_${channel}_brightness`);
if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
brightness = clamp(Math.round(brightness), 0, 100);

let rgbString = flow.get(`rgb_${moduleId}_${channel}_rgb`);
if (!rgbString) rgbString = DEFAULT_WRGB;

const { r: r_ha, g: g_ha, b: b_ha } = parseRgb(rgbString);

let r, g, b;
if (state === "OFF") {
    r = g = b = 0;
} else {
    const rgb = rgbToBrightness(r_ha, g_ha, b_ha, brightness);
    r = rgb.r;
    g = rgb.g;
    b = rgb.b;
}

// 組 Modbus 0x10 指令 (Write Multiple Registers)
// RGB 指令: 3 bytes 資料 + 1 byte 填充 (0x00)
const cmd = buildMultiCommand(moduleId, reg, [r, g, b, 0x00]);

debugLog('modbus', `=== Modbus 指令 (RGB) ===`);
debugLog('modbus', `原始 RGB: ${r_ha},${g_ha},${b_ha}`);
debugLog('modbus', `輸出 RGB: R=${r}, G=${g}, B=${b}`);
debugLog('modbus', `指令: ${cmd.toString('hex')}`);

modbusMessages.push({ payload: cmd, subType: "rgb", moduleId, channel, state, brightness, rgb: rgbString });
mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
if (state === "ON") {
    mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
    mqttMessages.push({ topic: `${baseTopic}/rgb`, payload: rgbString });
}

node.status({ 
    fill: state === "ON" ? "red" : "grey", 
    shape: "dot", 
    text: `RGB ${moduleId}-${channel}: ${state} ${brightness}%`
});

return [modbusMessages, mqttMessages];
