/**
 * HMI 處理器 - 觸控螢幕指令解析
 * 
 * Node ID: hmi_processor
 * Node Type: function
 * 
 * 此檔案從 test_full_integrated.json 自動提取
 */

const MIN_MIRED = 167, MAX_MIRED = 333;

const HMI_pattern = [
    // ========== 空調控制 ==========
    // HMI 不會直接控制冷氣，需要 Node-RED 發送 Modbus 指令
    // 這裡發送 set 指令讓 processor_hvac.js 處理
    // ⚠️ 注意：這些是舊格式，可能不再使用
    {
        name: "hvac_power_mode",
        pattern: [0x01, 0x31, null, 0x01, 0x01, null],
        parse: (input) => {
            const powerValue = input[2];
            const hvacId = input[5];
            const mode = powerValue === 0x01 ? "cool" : "off";  // 開機預設冷氣模式
            return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/mode/set`, payload: mode }];
        }
    },
    {
        name: "hvac_temperature",
        pattern: [0x01, 0x32, null, 0x01, 0x01, null],
        parse: (input) => {
            const tempValue = input[2];
            const hvacId = input[5];
            return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/temperature/set`, payload: String(tempValue) }];
        }
    },
    {
        name: "hvac_mode",
        pattern: [0x01, 0x33, null, 0x01, 0x01, null],
        parse: (input) => {
            const modeValue = input[2];
            const hvacId = input[5];
            const MODE_MAP = {
                0x00: "cool",
                0x01: "dry",
                0x02: "fan_only",
                0x04: "heat"
            };
            const mode = MODE_MAP[modeValue];
            if (!mode) return null;
            return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/mode/set`, payload: mode }];
        }
    },
    {
        name: "hvac_fan_speed",
        pattern: [0x01, 0x34, null, 0x01, 0x01, null],
        parse: (input) => {
            const fanValue = input[2];
            const hvacId = input[5];
            const FAN_MAP = {
                0x03: "medium",
                0x04: "high",
                0x05: "auto",
                0x07: "low"
            };
            const fan = FAN_MAP[fanValue];
            if (!fan) return null;
            return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/fan/set`, payload: fan }];
        }
    },
    // HMI 實際格式 - 溫度控制（ASCII 字串格式）
    // HMI 不會直接控制冷氣，發送 set 指令讓 processor_hvac.js 處理
    // 格式: [0xEE, 0x00, 0x00, 0xB1, 0x12, 0x00, 0x2C, 0x00, 0x1F, 0x00, 0x02, '3', '1', ...]
    {
        name: "hvac_temperature_ascii",
        pattern: [0xEE, 0x00, 0x00, 0xB1, 0x12, 0x00, 0x2C, 0x00, 0x1F, 0x00, null],
        parse: (input) => {
            // input[10] 是長度，後面是 ASCII 溫度字串
            const length = input[10];
            if (length < 1 || input.length < 11 + length) return null;

            // 提取 ASCII 溫度字串並轉換
            let tempStr = '';
            for (let i = 0; i < length; i++) {
                tempStr += String.fromCharCode(input[11 + i]);
            }

            const temperature = parseInt(tempStr);
            if (isNaN(temperature)) return null;

            // 假設 HVAC ID = 1（可能需要從其他地方判斷）
            const hvacId = 1;

            return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/temperature/set`, payload: String(temperature) }];
        }
    },
    // HMI 實際格式 - 模式/風速控制
    // HMI 不會直接控制冷氣，發送 set 指令讓 processor_hvac.js 處理
    // 格式: [0xEE, 0x00, 0x65, 0xB1, 0x11, 0x00, 0x2C, 0x00, byte8, 0x10, 0x01, 0x01, ...]
    // byte8 決定模式或風速
    {
        name: "hvac_mode_fanspeed",
        pattern: [0xEE, 0x00, 0x65, 0xB1, 0x11, 0x00, 0x2C, 0x00, null, null, null, null],
        parse: (input) => {
            const byte8 = input[8];   // 關鍵位置：決定模式或風速
            const byte9 = input[9];   // 通常是 0x10
            const byte10 = input[10]; // 通常是 0x01
            const byte11 = input[11]; // 通常是 0x01

            // 假設 HVAC ID = 1
            const hvacId = 1;

            // 開關控制（基於 byte8 和 byte11）
            if (byte8 === 0x0A) {
                // byte11 決定開關：0x00=關機, 0x01=開機
                const powerState = byte11 === 0x01 ? "cool" : "off";  // 開機預設為冷氣模式
                return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/mode/set`, payload: powerState }];
            }

            // 模式映射（基於 byte8）
            const MODE_MAP = {
                0x0D: "cool",      // 冷氣
                0x10: "heat",      // 暖氣
                0x0E: "dry",       // 除濕
                0x0F: "fan_only"   // 送風
            };

            // 風速映射（基於 byte8）
            const FAN_MAP = {
                0x13: "low",       // 低速
                0x12: "medium",    // 中速
                0x11: "high",      // 高速
                0x14: "auto"       // 自動
            };

            // 先檢查是否為模式控制
            const mode = MODE_MAP[byte8];
            if (mode) {
                return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/mode/set`, payload: mode }];
            }

            // 再檢查是否為風速控制
            const fan = FAN_MAP[byte8];
            if (fan) {
                return [{ topic: `homeassistant/hvac/hitachi/200/${hvacId}/fan/set`, payload: fan }];
            }
            return null;
        }
    }
];

function matchPattern(input, pattern) {
    // 允許 input 長度大於等於 pattern（支援可變長度資料）
    if (input.length < pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== null && pattern[i] !== input[i]) {
            return false;
        }
    }
    return true;
}

function bufferToHexArray(buf) {
    return [...buf].map(v => "0x" + v.toString(16).padStart(2, "0").toUpperCase());
}

if (!msg.payload || !Buffer.isBuffer(msg.payload)) {
    return null;
}

let input = Array.from(msg.payload);
let result = null;
let matchedPattern = null;

let isHVAC = false;
let foundPattern = false;
for (const p of HMI_pattern) {
    if (matchPattern(input, p.pattern)) {
        matchedPattern = p.name;
        isHVAC = /^hvac_/.test(p.name);
        node.warn('[HMI] 符合 pattern: ' + p.name + (isHVAC ? '（冷氣）' : '（非冷氣）'));
        result = p.parse(input);
        foundPattern = true;
        break;
    }
}
if (!foundPattern) {
}

if (result && Array.isArray(result) && result.length > 0) {
    return [result];
} else {
    return null;
}