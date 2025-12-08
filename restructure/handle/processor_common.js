/**
 * 共用模組初始化器
 * 
 * Node Type: function
 * 
 * 用途：
 *   在 Node-RED 啟動時執行一次，將共用常數和函數註冊到 global context
 *   其他處理器可透過 global.get('lib') 取得這些函數
 * 
 * 接線方式：
 *   Inject (啟動時觸發) → light_common → Debug (確認初始化)
 */

// ========== 常數定義 ==========
const CONSTANTS = {
    DEFAULT_BRIGHTNESS: 100,
    DEFAULT_COLORTEMP: 250,
    DEFAULT_WRGB: "255,255,255",
    MIN_MIRED: 167,
    MAX_MIRED: 333,
    BRIGHTNESS_TIME: 0x05,

    CHANNEL_REGISTER_MAP: {
        "1": 0x082A, "2": 0x082B, "3": 0x082C, "4": 0x082D,
        "a": [0x082A, 0x082B], "b": [0x082C, 0x082D]
    },

    CHANNEL_COIL_MAP: {
        "1": 0x0000, "2": 0x0001, "3": 0x0002, "4": 0x0003
    },

    WRGB_REGISTER_MAP: {
        "x": 0x0829, "y": 0x082B, "z": 0x082D
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
    // Debug 輸出
    debugLog: function (category, message) {
        const debugConfig = global.get('debug_config') || DEFAULT_DEBUG_CONFIG;
        if (debugConfig[category]) {
            node.warn(message);
        }
    },

    // 數值範圍限制
    clamp: function (value, min, max) {
        return value < min ? min : value > max ? max : value;
    },

    // 建構 Modbus 0x06 指令 (Write Single Register)
    buildCommand: function (moduleId, reg, value, speed = 0x05) {
        const hi = (reg >> 8) & 0xFF;
        const lo = reg & 0xFF;
        return Buffer.from([moduleId, 0x06, hi, lo, speed, value]);
    },

    // 建構 Modbus 0x05 指令 (Write Single Coil)
    buildCoilCommand: function (moduleId, addr, state) {
        const hi = (addr >> 8) & 0xFF;
        const lo = addr & 0xFF;
        const valHi = state ? 0xFF : 0x00;
        return Buffer.from([moduleId, 0x05, hi, lo, valHi, 0x00]);
    },

    // 建構 Modbus 0x10 指令 (Write Multiple Registers)
    buildMultiCommand: function (moduleId, reg, data) {
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

    // 色溫轉換：Mired → 百分比
    miredToPercent: function (mired) {
        const min = CONSTANTS.MIN_MIRED;
        const max = CONSTANTS.MAX_MIRED;
        mired = this.clamp(Math.round(mired), min, max);
        return Math.round(((max - mired) / (max - min)) * 100);
    },

    // RGB 轉 WRGB
    rgbToWrgb: function (r, g, b, brightness) {
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

    // 解析 WRGB 字串 "R,G,B"
    parseWrgb: function (rgbString) {
        const parts = (rgbString || CONSTANTS.DEFAULT_WRGB).split(",");
        return {
            r: parseInt(parts[0]?.trim(), 10) || 0,
            g: parseInt(parts[1]?.trim(), 10) || 0,
            b: parseInt(parts[2]?.trim(), 10) || 0
        };
    }
};

// ========== 註冊到 Global Context ==========
const lib = {
    CONST: CONSTANTS,
    UTILS: UTILS,
    version: "1.0.0",
    initialized: new Date().toISOString()
};

global.set('lib', lib);
global.set('debug_config', global.get('debug_config') || DEFAULT_DEBUG_CONFIG);

node.status({
    fill: "green",
    shape: "dot",
    text: `初始化完成 v${lib.version}`
});

return {
    payload: {
        message: "共用模組已初始化",
        version: lib.version,
        constants: Object.keys(CONSTANTS),
        utils: Object.keys(UTILS)
    }
};
