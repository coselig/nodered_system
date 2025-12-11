/**
 * HMI 處理器 - 觸控螢幕指令解析（優化版）
 */

const MODE_MAP = {
    0x00: "cool",
    0x01: "dry",
    0x02: "fan_only",
    0x04: "heat"
};
const FAN_MAP = {
    0x03: "medium",
    0x04: "high",
    0x05: "auto",
    0x07: "low"
};

const HMI_PATTERN = [
    {
        pattern: [0x01, 0x31, null, 0x01, 0x01, null],
        topic: (input) => `homeassistant/hvac/hitachi/200/${input[5]}/mode/set`,
        payload: (input) => input[2] === 0x01 ? "cool" : "off"
    },
    {
        pattern: [0x01, 0x32, null, 0x01, 0x01, null],
        topic: (input) => `homeassistant/hvac/hitachi/200/${input[5]}/temperature/set`,
        payload: (input) => String(input[2])
    },
    {
        pattern: [0x01, 0x33, null, 0x01, 0x01, null],
        topic: (input) => `homeassistant/hvac/hitachi/200/${input[5]}/mode/set`,
        payload: (input) => MODE_MAP[input[2]]
    },
    {
        pattern: [0x01, 0x34, null, 0x01, 0x01, null],
        topic: (input) => `homeassistant/hvac/hitachi/200/${input[5]}/fan/set`,
        payload: (input) => FAN_MAP[input[2]]
    }
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

if (!msg.payload || !Buffer.isBuffer(msg.payload)) {
    return null;
}

const input = Array.from(msg.payload);
for (const p of HMI_PATTERN) {
    if (matchPattern(input, p.pattern)) {
        const topic = p.topic(input);
        const payload = p.payload(input);
        if (topic && payload !== undefined && payload !== null) {
            return [[{ topic, payload }]];
        }
        break;
    }
}
return null;