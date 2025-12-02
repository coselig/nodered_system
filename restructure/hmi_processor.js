/**
 * HMI 處理器 - 觸控螢幕指令解析
 * 
 * Node ID: hmi_processor
 * Node Type: function
 * 
 * 此檔案從 test_full_integrated.json 自動提取
 */

const MIN_MIRED = 167, MAX_MIRED = 333;

// Debug 控制
const debugConfig = global.get('debug_config') || {
    topic: true,
    cache: true,
    modbus: true,
    mqtt: true,
    scene: true,
    query: true,
    hmi: true
};

function debugLog(category, message) {
    if (debugConfig[category]) {
        node.warn(message);
    }
}

const HMI_pattern = [
    // 窗簾控制（暫時停用 - 直接發 MQTT）
    // {
    //     name: "curtain_control",
    //     pattern: [null, 0x06, 0x01, 0x9b, 0x00, null, null, null],
    //     parse: (input) => {
    //         const curtainId = input[0];
    //         const action = input[5];

    //         const CURTAIN_MAP = {
    //             0x15: { topic: "homeassistant/cover/curtain/21/ocs/set", type: "ocs" },
    //             0x16: { topic: "homeassistant/cover/curtain/22/oc/set", type: "oc" },
    //             0x17: { topic: "homeassistant/cover/curtain/23", type: "multi" }
    //         };

    //         const config = CURTAIN_MAP[curtainId];
    //         if (!config) return null;

    //         let payload, topicSuffix;

    //         if (config.type === "ocs") {
    //             const ACTION_MAP_OCS = {
    //                 0x01: "1/2-3",
    //                 0x04: "2/1-3",
    //                 0x02: "3/1-2"
    //             };
    //             payload = ACTION_MAP_OCS[action];
    //             topicSuffix = "/set";
    //         } else if (config.type === "oc") {
    //             const ACTION_MAP_OC = {
    //                 0x01: "1/2",
    //                 0x02: "2/1",
    //                 0x03: "1-2/"
    //             };
    //             payload = ACTION_MAP_OC[action];
    //             topicSuffix = "/set";
    //         } else if (config.type === "multi") {
    //             const ACTION_MAP_MULTI = {
    //                 0x01: { suffix: "/oc/set", payload: "1/2" },
    //                 0x03: { suffix: "/oc/set", payload: "1_2/" },
    //                 0x02: { suffix: "/oc/set", payload: "2/1" },
    //                 0x04: { suffix: "/oc/set", payload: "3/4" },
    //                 0x0C: { suffix: "/oc/set", payload: "3_4/" },
    //                 0x08: { suffix: "/oc/set", payload: "4/3" },
    //                 0x10: { suffix: "/ocs/set", payload: "5/6_7" },
    //                 0x40: { suffix: "/ocs/set", payload: "7/5_6" },
    //                 0x20: { suffix: "/ocs/set", payload: "6/5_7" }
    //             };
    //             const actionConfig = ACTION_MAP_MULTI[action];
    //             if (!actionConfig) return null;
    //             topicSuffix = actionConfig.suffix;
    //             payload = actionConfig.payload;
    //         }

    //         if (!payload) return null;
    //         return [{ topic: config.topic + topicSuffix, payload: payload }];
    //     }
    // },
    // 場景控制（含測試按鈕）- 狀態同步模式
    {
        name: "scene_unified",
        pattern: [0xfe, 0x06, 0x08, 0x20, null, null, null, null],
        parse: (input) => {
            const operation = input[4];
            const sceneId = input[5];

            // 記憶指令處理
            if (operation >= 0x81 && operation <= 0x88) {
                const MEMORY_TO_TEST_MAP = {
                    0x81: { sceneId: "0x02", operation: "0x01" },
                    0x82: { sceneId: "0x02", operation: "0x02" },
                    0x83: { sceneId: "0x03", operation: "0x01" },
                    0x84: { sceneId: "0x03", operation: "0x02" },
                    0x85: { sceneId: "0x04", operation: "0x01" },
                    0x86: { sceneId: "0x04", operation: "0x02" },
                    0x87: { sceneId: "0x05", operation: "0x01" },
                    0x88: { sceneId: "0x05", operation: "0x02" }
                };

                const SCENE_MEMORY_MAP = {
                    "0x02": {
                        name: "會議室", devices: [
                            "homeassistant/light/single/13/1",
                            "homeassistant/light/single/13/2",
                            "homeassistant/light/single/13/3",
                            "homeassistant/light/dual/14/a",
                            "homeassistant/light/dual/14/b"
                        ]
                    },
                    "0x03": {
                        name: "公共區", devices: [
                            "homeassistant/light/single/11/1",
                            "homeassistant/light/single/11/2",
                            "homeassistant/light/single/12/1",
                            "homeassistant/light/single/12/2",
                            "homeassistant/light/single/12/3",
                            "homeassistant/light/single/12/4"
                        ]
                    },
                    "0x04": {
                        name: "戶外", devices: [
                            "homeassistant/light/single/18/1",
                            "homeassistant/light/single/18/2",
                            "homeassistant/light/single/19/1",
                            "homeassistant/light/single/19/2"
                        ]
                    },
                    "0x05": {
                        name: "H40二樓", devices: [
                            "homeassistant/light/single/15/1",
                            "homeassistant/light/single/15/2",
                            "homeassistant/light/single/16/1",
                            "homeassistant/light/single/16/2",
                            "homeassistant/light/single/17/1",
                            "homeassistant/light/single/17/2",
                            "homeassistant/light/single/18/1",
                            "homeassistant/light/single/18/2",
                            "homeassistant/light/single/19/1",
                            "homeassistant/light/single/19/2"
                        ]
                    }
                };

                const mapping = MEMORY_TO_TEST_MAP[operation];
                if (!mapping) return null;

                const targetSceneId = mapping.sceneId;
                const targetOperation = mapping.operation;
                const sceneInfo = SCENE_MEMORY_MAP[targetSceneId];
                if (!sceneInfo) return null;

                const opNames = { "0x01": "ON", "0x02": "OFF" };
                const opName = opNames[targetOperation] || targetOperation;
                const memoryTopic = `homeassistant/memory/${targetSceneId}/${targetOperation}/save/set`;
                const buttonNum = operation - 0x80;

                debugLog('hmi', `HMI記憶按鈕${buttonNum} → ${sceneInfo.name}_${opName}`);

                return [{
                    topic: memoryTopic,
                    payload: JSON.stringify({
                        scene_name: `${sceneInfo.name}_${opName}`,
                        devices: sceneInfo.devices,
                        timestamp: new Date().toISOString()
                    })
                }];
            }

            // 測試按鈕處理（test_buttons.md 8組）- 狀態同步模式
            const TEST_BUTTONS = [
                { op: 0x01, id: 0x05 }, // H40二樓 ON
                { op: 0x02, id: 0x05 }, // H40二樓 OFF
                { op: 0x01, id: 0x02 }, // 會議室 ON
                { op: 0x02, id: 0x02 }, // 會議室 OFF
                { op: 0x01, id: 0x03 }, // 公共區 ON
                { op: 0x02, id: 0x03 }, // 公共區 OFF
                { op: 0x01, id: 0x04 }, // 戶外燈 ON
                { op: 0x02, id: 0x04 }  // 戶外燈 OFF
            ];
            for (const btn of TEST_BUTTONS) {
                if (operation === btn.op && sceneId === btn.id) {
                    const sceneKey = `0x${sceneId.toString(16).padStart(2, '0').toUpperCase()}`;
                    const opKey = `0x${operation.toString(16).padStart(2, '0').toUpperCase()}`;
                    debugLog('hmi', `HMI場景狀態: 場景${sceneKey} 操作${opKey}`);
                    return [{
                        topic: `homeassistant/scene/${sceneKey}/${opKey}/state`,
                        payload: "ON"
                    }];
                }
            }

            // 一般場景控制 - 狀態同步模式
            const sceneKey = `0x${sceneId.toString(16).toUpperCase()}`;
            const opKey = `0x${operation.toString(16).padStart(2, '0').toUpperCase()}`;
            return [{
                topic: `homeassistant/scene/${sceneKey}/${opKey}/state`,
                payload: "ON"
            }];
        }
    },
    // 燈光控制 - 狀態同步模式（HMI 直接控制設備，這裡只更新 HA 狀態）
    {
        name: "light_control_unified",
        pattern: [0xEE, 0xB1, 0x11, 0x00, null, 0x00, null, 0x13, 0x00, 0x00, null, null, 0xFF, 0xFC, 0xFF, 0xFF],
        parse: (input) => {
            const sceneId = input[4];
            const functionId = input[6];
            const valueHigh = input[10];
            const valueLow = input[11];
            const raw = (valueHigh << 8) + valueLow;

            let value = Math.round((raw / 1000) * 100);
            value = value < 0 ? 0 : value > 100 ? 100 : value;
            let state = value > 0 ? "ON" : "OFF";

            const LIGHT_MAP = {
                "0x1E-0x0B": { topic: "homeassistant/light/scene/single/11-1--11-2", type: "brightness" },
                "0x1E-0x0D": { topic: "homeassistant/light/scene/single/12-1", type: "brightness" },
                "0x1E-0x0F": { topic: "homeassistant/light/scene/single/12-2", type: "brightness" },
                "0x1E-0x11": { topic: "homeassistant/light/scene/single/12-3--12-4", type: "brightness" },
                "0x1F-0x0B": { topic: "homeassistant/light/dual/14/a", type: "brightness" },
                "0x1F-0x0D": { topic: "homeassistant/light/dual/14/a", type: "colortemp" },
                "0x1F-0x0F": { topic: "homeassistant/light/dual/14/b", type: "brightness" },
                "0x1F-0x11": { topic: "homeassistant/light/dual/14/b", type: "colortemp" }
            };

            const key = `0x${sceneId.toString(16).toUpperCase()}-0x${functionId.toString(16).toUpperCase()}`;
            const config = LIGHT_MAP[key];
            if (!config) return null;

            const baseTopic = config.topic;

            if (config.type === "brightness") {
                debugLog('hmi', `HMI燈光狀態: ${baseTopic} 亮度=${value}%`);
                return [
                    { topic: `${baseTopic}/state`, payload: state },
                    { topic: `${baseTopic}/brightness`, payload: value }
                ];
            } else if (config.type === "colortemp") {
                const colortemp = Math.round(MAX_MIRED - ((MAX_MIRED - MIN_MIRED) * value / 100));
                debugLog('hmi', `HMI燈光狀態: ${baseTopic} 色溫=${colortemp} mired`);
                return [
                    { topic: `${baseTopic}/colortemp`, payload: colortemp }
                ];
            }
            return null;
        }
    },
    // 空調控制（狀態同步模式：HMI 直接控制設備，這裡只更新 HA 狀態）
    // ⚠️ 注意：這些是舊格式，可能不再使用
    {
        name: "hvac_power_mode",
        pattern: [0x01, 0x31, null, 0x01, 0x01, null],
        parse: (input) => {
            const powerValue = input[2];
            const hvacId = input[5];
            const mode = powerValue === 0x01 ? "auto" : "off";
            debugLog('hmi', `HMI空調狀態(舊): ${hvacId} 模式=${mode}`);
            return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/state`, payload: mode }];
        }
    },
    {
        name: "hvac_temperature",
        pattern: [0x01, 0x32, null, 0x01, 0x01, null],
        parse: (input) => {
            const tempValue = input[2];
            const hvacId = input[5];
            debugLog('hmi', `HMI空調狀態: ${hvacId} 溫度=${tempValue}°C`);
            return [{ topic: `homeassistant/hvac/200/${hvacId}/temperature/state`, payload: String(tempValue) }];
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
            debugLog('hmi', `HMI空調狀態: ${hvacId} 模式=${mode}`);
            return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/state`, payload: mode }];
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
            debugLog('hmi', `HMI空調狀態(舊): ${hvacId} 風量=${fan}`);
            return [{ topic: `homeassistant/hvac/200/${hvacId}/fan/state`, payload: fan }];
        }
    },
    // HMI 實際格式 - 溫度控制（ASCII 字串格式）
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

            debugLog('hmi', `HMI空調狀態: ${hvacId} 溫度=${temperature}°C (ASCII: "${tempStr}")`);
            return [{ topic: `homeassistant/hvac/200/${hvacId}/temperature/state`, payload: String(temperature) }];
        }
    },
    // HMI 實際格式 - 模式/風速控制
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
                debugLog('hmi', `HMI空調狀態: ${hvacId} 電源=${powerState === "off" ? "關" : "開"}`);
                return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/state`, payload: powerState }];
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
                debugLog('hmi', `HMI空調狀態: ${hvacId} 模式=${mode}`);
                return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/state`, payload: mode }];
            }

            // 再檢查是否為風速控制
            const fan = FAN_MAP[byte8];
            if (fan) {
                debugLog('hmi', `HMI空調狀態: ${hvacId} 風速=${fan}`);
                return [{ topic: `homeassistant/hvac/200/${hvacId}/fan/state`, payload: fan }];
            }

            // 記錄未知格式以便調試
            debugLog('hmi', `HMI空調未知格式: byte8=0x${byte8.toString(16).padStart(2, '0').toUpperCase()}`);
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
    debugLog('hmi', "HMI收到無效的 payload");
    return null;
}

let input = Array.from(msg.payload);
let result = null;

for (const p of HMI_pattern) {
    if (matchPattern(input, p.pattern)) {
        result = p.parse(input);
        break;
    }
}

if (result && Array.isArray(result) && result.length > 0) {
    debugLog('hmi', `HMI收到: ${bufferToHexArray(msg.payload)} → ${result.length} 個 MQTT 指令`);
    return [result];
} else {
    debugLog('hmi', `HMI收到: ${bufferToHexArray(msg.payload)} (未匹配)`);
    return null;
}