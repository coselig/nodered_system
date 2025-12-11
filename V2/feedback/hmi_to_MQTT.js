/**
 * HMI 處理器 - 觸控螢幕指令解析
 */

const MIN_MIRED = 167, MAX_MIRED = 333;

const HMI_pattern = [
    // ========== 空調控制 ==========
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
];

function matchPattern(input, pattern) {
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

for (const p of HMI_pattern) {
    if (matchPattern(input, p.pattern)) {
        result = p.parse(input);
        if (result && Array.isArray(result) && result.length > 0) return [result];
        break;
    }
}
return null;