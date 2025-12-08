/**
 * 系統共用模組 - 統一初始化共用常數和函數到 global context
 * 
 * Node Type: function
 * 
 * 用途：
 *   在 Node-RED 啟動時執行一次，將共用常數和函數註冊到 global context
 *   處理器和 Feedback 都透過 global.get('lib') 取得這些函數
 * 
 * 接線方式：
 *   Inject (啟動時觸發, 延遲 0.1 秒) → common.js
 *   輸出可不接，或接 Debug 節點確認初始化成功
 * 
 * 使用方式：
 *   const lib = global.get('lib');
 *   const { CONST, UTILS } = lib;
 */

// ========== 常數定義 ==========
const CONST = {
    // === 預設值 ===
    DEFAULT_BRIGHTNESS: 100,
    DEFAULT_COLORTEMP: 250,
    DEFAULT_WRGB: "255,255,255",
    BRIGHTNESS_TIME: 0x05,
    
    // === 色溫範圍 ===
    MIN_MIRED: 167,
    MAX_MIRED: 333,
    
    // === Single Light 寄存器映射 (0x06 Write Single Register) ===
    SINGLE_REGISTER_MAP: {
        "1": 0x082A,
        "2": 0x082B,
        "3": 0x082C,
        "4": 0x082D
    },
    
    // === Dual Light 寄存器映射 (每通道兩個寄存器: 亮度, 色溫) ===
    DUAL_REGISTER_MAP: {
        "a": [0x082A, 0x082B],
        "b": [0x082C, 0x082D]
    },
    
    // === Relay Coil 映射 (0x05 Write Single Coil) ===
    RELAY_COIL_MAP: {
        "1": 0x0000,
        "2": 0x0001,
        "3": 0x0002,
        "4": 0x0003
    },
    
    // === WRGB 寄存器映射 (0x10 Write Multiple Registers) ===
    WRGB_REGISTER_MAP: {
        "x": 0x0829,
        "y": 0x082B,
        "z": 0x082D
    },
    
    // === Feedback 用：寄存器反查映射 ===
    REGISTER_TO_SINGLE: {
        0x082A: { type: "single", channel: "1" },
        0x082B: { type: "single", channel: "2" },
        0x082C: { type: "single", channel: "3" },
        0x082D: { type: "single", channel: "4" }
    },
    
    REGISTER_TO_DUAL: {
        0x082A: { type: "dual", channel: "a", attribute: "brightness" },
        0x082B: { type: "dual", channel: "a", attribute: "colortemp" },
        0x082C: { type: "dual", channel: "b", attribute: "brightness" },
        0x082D: { type: "dual", channel: "b", attribute: "colortemp" }
    },
    
    COIL_TO_RELAY: {
        0x0000: { channel: "1" },
        0x0001: { channel: "2" },
        0x0002: { channel: "3" },
        0x0003: { channel: "4" }
    },
    
    REGISTER_TO_WRGB: {
        0x0829: "x",
        0x082B: "y",
        0x082D: "z"
    },
    
    // === HVAC 映射 ===
    HVAC_MODE_MAP: {
        0: "cool",
        1: "heat",
        2: "dry",
        3: "fan_only",
        4: "off"
    },
    
    HVAC_FAN_MAP: {
        0: "auto",
        1: "low",
        2: "medium",
        3: "high"
    }
};

// ========== DEBUG 控制 ==========
const DEFAULT_DEBUG_CONFIG = {
    topic: true,
    cache: true,
    modbus: true,
    mqtt: true,
    scene: true,
    query: true
};

// ========== 工具函數 ==========
const UTILS = {
    // === Debug 輸出 ===
    debugLog: function(category, message) {
        const debugConfig = global.get('debug_config') || DEFAULT_DEBUG_CONFIG;
        if (debugConfig[category] && this.warn) {
            this.warn(message);
        }
    },
    
    // === 數值範圍限制 ===
    clamp: function(value, min, max) {
        return value < min ? min : value > max ? max : value;
    },
    
    // === CRC16 計算 ===
    crc16: function(buf) {
        let crc = 0xFFFF;
        for (const b of buf) {
            crc ^= b;
            for (let i = 0; i < 8; i++) {
                crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
            }
        }
        return crc;
    },
    
    // === CRC16 驗證 ===
    verifyCRC: function(buf) {
        let crc = 0xFFFF;
        for (let i = 0; i < buf.length - 2; i++) {
            crc ^= buf[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
            }
        }
        const lo = crc & 0xFF;
        const hi = (crc >> 8) & 0xFF;
        return lo === buf[buf.length - 2] && hi === buf[buf.length - 1];
    },
    
    // === 附加 CRC 到 Buffer ===
    appendCRC: function(buf) {
        const crc = this.crc16(buf);
        const lo = crc & 0xFF;
        const hi = (crc >> 8) & 0xFF;
        return Buffer.concat([buf, Buffer.from([lo, hi])]);
    },
    
    // === 建構 Modbus 0x06 指令 (Write Single Register) ===
    buildCommand: function(moduleId, reg, value, speed = CONST.BRIGHTNESS_TIME) {
        const hi = (reg >> 8) & 0xFF;
        const lo = reg & 0xFF;
        return Buffer.from([moduleId, 0x06, hi, lo, speed, value]);
    },
    
    // === 建構 Modbus 0x05 指令 (Write Single Coil) ===
    buildCoilCommand: function(moduleId, addr, state) {
        const hi = (addr >> 8) & 0xFF;
        const lo = addr & 0xFF;
        const valHi = state ? 0xFF : 0x00;
        return Buffer.from([moduleId, 0x05, hi, lo, valHi, 0x00]);
    },
    
    // === 建構 Modbus 0x10 指令 (Write Multiple Registers) ===
    buildMultiCommand: function(moduleId, reg, data) {
        const regHi = (reg >> 8) & 0xFF;
        const regLo = reg & 0xFF;
        const regCount = Math.ceil(data.length / 2);
        return Buffer.from([
            moduleId, 0x10, regHi, regLo,
            0x00, regCount,
            data.length,
            ...data
        ]);
    },
    
    // === 色溫轉換：Mired → 百分比 ===
    miredToPercent: function(mired) {
        const min = CONST.MIN_MIRED;
        const max = CONST.MAX_MIRED;
        mired = this.clamp(Math.round(mired), min, max);
        return Math.round(((max - mired) / (max - min)) * 100);
    },
    
    // === 色溫轉換：百分比 → Mired ===
    percentToMired: function(percent) {
        return Math.round(CONST.MAX_MIRED - (percent / 100) * (CONST.MAX_MIRED - CONST.MIN_MIRED));
    },
    
    // === RGB 轉 WRGB ===
    rgbToWrgb: function(r, g, b, brightness) {
        const w = Math.min(r, g, b);
        let rOut = r - w;
        let gOut = g - w;
        let bOut = b - w;
        let wOut = w;
        
        const total = rOut + gOut + bOut + wOut;
        if (total === 0) {
            return { r: 0, g: 0, b: 0, w: brightness };
        }
        
        return {
            r: Math.round(brightness * rOut / total),
            g: Math.round(brightness * gOut / total),
            b: Math.round(brightness * bOut / total),
            w: Math.round(brightness * wOut / total)
        };
    },
    
    // === 解析 RGB/WRGB 字串 "R,G,B" ===
    parseRgb: function(rgbString) {
        const parts = (rgbString || CONST.DEFAULT_WRGB).split(",");
        return {
            r: parseInt(parts[0]?.trim(), 10) || 0,
            g: parseInt(parts[1]?.trim(), 10) || 0,
            b: parseInt(parts[2]?.trim(), 10) || 0
        };
    },
    
    // === 產生 Dequeue 訊息 ===
    makeDequeueMsg: function() {
        return { topic: "modbus/queue/dequeue", payload: "next" };
    }
};

// ========== 註冊到 Global Context ==========
const lib = {
    CONST: CONST,
    UTILS: UTILS,
    version: "2.0.0",
    initialized: new Date().toISOString()
};

global.set('lib', lib);
global.set('debug_config', global.get('debug_config') || DEFAULT_DEBUG_CONFIG);

node.status({
    fill: "green",
    shape: "dot",
    text: `共用模組 v${lib.version} 已載入`
});

return {
    payload: {
        message: "共用模組已初始化",
        version: lib.version,
        constants: Object.keys(CONST),
        utils: Object.keys(UTILS)
    }
};
