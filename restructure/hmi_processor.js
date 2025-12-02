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
    // 窗簾/鐵捲門控制 - 觸發 HA 查詢模式（HMI 直接控制設備，發送 query 讓 HA 更新狀態）
    {
        name: "curtain_control",
        pattern: [null, 0x06, 0x01, 0x9b, 0x00, null, null, null],
        parse: (input) => {
            const curtainId = input[0];
            const action = input[5];

            const CURTAIN_MAP = {
                0x15: { topic: "homeassistant/cover/curtain/21/query" },  // 鐵捲門
                0x16: { topic: "homeassistant/cover/curtain/22/query" },  // 會議室捲簾
                0x17: { topic: "homeassistant/cover/curtain/23/query" }   // 多組窗簾
            };

            const config = CURTAIN_MAP[curtainId];
            if (!config) return null;

            debugLog('hmi', `HMI窗簾操作: curtainId=0x${curtainId.toString(16).toUpperCase()} action=0x${action.toString(16).toUpperCase()} → 發送query`);
            return [{ topic: config.topic, payload: "query" }];
        }
    },
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
                const memoryTopic = `homeassistant/memory/${targetSceneId}/${targetOperation}/save/state`;
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
    // 雙色溫燈控制 - 新格式 0x11 帶數值(狀態同步) ⚠️ 必須放在 single_light_control 之前!
    {
        name: "dual_light",
        pattern: [0xEE, 0x00, 0x65, 0xB1, 0x11, 0x00, 0x1F, 0x00, null, 0x13, 0x00, 0x00, null, null, 0xFF, 0xFC, 0xFF, 0xFF],
        parse: (input) => {
            const functionId = input[8];   // byte[8]: 功能ID (0x0B=亮度, 0x0D=色溫)
            const valueHigh = input[12];   // byte[12-13]: 數值 0-1000
            const valueLow = input[13];
            const raw = (valueHigh << 8) + valueLow;

            // 映射: 0x0B=A亮度, 0x0D=A色溫, 0x0F=B亮度, 0x11=B色溫
            const DUAL_MAP = {
                0x0B: { topic: "homeassistant/light/dual/14/a", type: "brightness" },
                0x0D: { topic: "homeassistant/light/dual/14/a", type: "colortemp" },
                0x0F: { topic: "homeassistant/light/dual/14/b", type: "brightness" },
                0x11: { topic: "homeassistant/light/dual/14/b", type: "colortemp" }
            };

            const config = DUAL_MAP[functionId];
            if (!config) return null;

            const baseTopic = config.topic;

            if (config.type === "brightness") {
                const brightness = Math.round((raw / 1000) * 100);
                const state = brightness > 0 ? "ON" : "OFF";
                debugLog('hmi', `HMI雙色溫燈亮度: ${baseTopic} 亮度=${brightness}%`);
                return [
                    { topic: `${baseTopic}/state`, payload: state },
                    { topic: `${baseTopic}/brightness`, payload: brightness }
                ];
            } else if (config.type === "colortemp") {
                const percentage = Math.round((raw / 1000) * 100);
                const colortemp = Math.round(MAX_MIRED - ((MAX_MIRED - MIN_MIRED) * percentage / 100));
                debugLog('hmi', `HMI雙色溫燈色溫: ${baseTopic} 色溫=${colortemp} mired (${percentage}%)`);
                return [
                    { topic: `${baseTopic}/colortemp`, payload: colortemp }
                ];
            }

            return null;
        }
    },
    // 單色燈帶數值控制 - 新格式 0x11 帶數值(狀態同步) ⚠️ 必須放在 single_light_control 之前!
    {
        name: "single_light_with_value",
        pattern: [0xEE, 0x00, 0x65, 0xB1, 0x11, 0x00, null, 0x00, null, 0x13, 0x00, 0x00, null, null, 0xFF, 0xFC, 0xFF, 0xFF],
        parse: (input) => {
            const sceneId = input[6];      // byte[6]: 場景ID
            const functionId = input[8];   // byte[8]: 功能ID
            const valueHigh = input[12];   // byte[12-13]: 數值 0-1000
            const valueLow = input[13];
            const raw = (valueHigh << 8) + valueLow;

            // 映射表: 單燈 + scene
            const SINGLE_MAP = {
                // Scene 0x1E - 走廊區域
                "0x1E-0x0B": { 
                    topic: "homeassistant/light/single/11/1", 
                    sceneTopic: "homeassistant/light/scene/single/11-1--11-2",
                    name: "走廊間照" 
                },
                "0x1E-0x0D": { 
                    topic: "homeassistant/light/single/12/1", 
                    sceneTopic: "homeassistant/light/scene/single/12-1",
                    name: "泡茶區" 
                },
                "0x1E-0x0F": { 
                    topic: "homeassistant/light/single/12/2", 
                    sceneTopic: "homeassistant/light/scene/single/12-2",
                    name: "走道崁燈" 
                },
                "0x1E-0x11": { 
                    topic: "homeassistant/light/single/12/3", 
                    sceneTopic: "homeassistant/light/scene/single/12-3--12-4",
                    name: "展示櫃" 
                },
                // Scene 0x20 - 會議室區域
                "0x20-0x0B": { 
                    topic: "homeassistant/light/single/13/1", 
                    sceneTopic: "homeassistant/light/scene/single/13-1",
                    name: "會議間照" 
                },
                "0x20-0x0D": { 
                    topic: "homeassistant/light/single/13/2", 
                    sceneTopic: "homeassistant/light/scene/single/13-2",
                    name: "冷氣間照" 
                },
                "0x20-0x0F": { 
                    topic: "homeassistant/light/single/13/3", 
                    sceneTopic: "homeassistant/light/scene/single/13-3",
                    name: "會議崁燈" 
                }
            };

            const key = `0x${sceneId.toString(16).toUpperCase().padStart(2, '0')}-0x${functionId.toString(16).toUpperCase().padStart(2, '0')}`;
            const config = SINGLE_MAP[key];
            if (!config) {
                debugLog('hmi', `HMI單色燈未匹配: key="${key}" sceneId=${sceneId}(0x${sceneId.toString(16).toUpperCase()}) functionId=${functionId}(0x${functionId.toString(16).toUpperCase()})`);
                return null;
            }

            const brightness = Math.round((raw / 1000) * 100);
            const state = brightness > 0 ? "ON" : "OFF";
            
            debugLog('hmi', `HMI單色燈亮度: ${config.name} ${config.topic} 亮度=${brightness}%`);
            
            const commands = [
                { topic: `${config.topic}/state`, payload: state },
                { topic: `${config.topic}/brightness`, payload: brightness }
            ];
            
            // 同步 scene 狀態
            if (config.sceneTopic) {
                commands.push(
                    { topic: `${config.sceneTopic}/state`, payload: state },
                    { topic: `${config.sceneTopic}/brightness`, payload: brightness }
                );
            }
            
            return commands;
        }
    },
    // 單色燈控制 - 新格式 0x11 控制指令(觸發查詢)
    {
        name: "single_light_control",
        pattern: [0xEE, 0x00, 0x65, 0xB1, 0x11, 0x00, null, 0x00, null, 0x13, 0x00, 0x00],
        parse: (input) => {
            const sceneId = input[6];      // byte[6]: 場景ID (例如 0x1E)
            const functionId = input[8];   // byte[8]: 功能ID (例如 0x0B)

            const CORRIDOR_MAP = {
                "0x1E-0x0B": "homeassistant/light/scene/single/11-1--11-2",
                "0x1E-0x0D": "homeassistant/light/scene/single/12-1",
                "0x1E-0x0F": "homeassistant/light/scene/single/12-2",
                "0x1E-0x11": "homeassistant/light/scene/single/12-3--12-4",
                "0x1F-0x0B": "homeassistant/light/dual/14/a",  // 會議室 A 亮度
                "0x1F-0x0F": "homeassistant/light/dual/14/b"   // 會議室 B 亮度
            };

            const key = `0x${sceneId.toString(16).toUpperCase()}-0x${functionId.toString(16).toUpperCase()}`;
            const baseTopic = CORRIDOR_MAP[key];

            if (!baseTopic) return null;

            debugLog('hmi', `HMI單色燈狀態: 場景0x${sceneId.toString(16).toUpperCase()} 功能0x${functionId.toString(16).toUpperCase()} → 同步狀態`);
            return [{ topic: `${baseTopic}/state`, payload: "ON" }];
        }
    },
    // 單色燈設定值 - 新格式 0x12 ASCII 字串(觸發查詢)
    {
        name: "single_light_value",
        pattern: [0xEE, 0x00, 0x65, 0xB1, 0x12, 0x00, null, 0x00, null, 0x00, null],
        parse: (input) => {
            const sceneId = input[6];      // byte[6]: 場景ID (例如 0x1E)
            const functionId = input[8];   // byte[8]: 功能ID (例如 0x15)
            const length = input[10];      // byte[10]: ASCII 字串長度

            const CORRIDOR_MAP = {
                "0x1E-0x15": "homeassistant/light/scene/single/11-1--11-2",
                "0x1E-0x17": "homeassistant/light/scene/single/12-1",
                "0x1E-0x19": "homeassistant/light/scene/single/12-2",
                "0x1E-0x1B": "homeassistant/light/scene/single/12-3--12-4",
                "0x1F-0x1D": "homeassistant/light/dual/14/a",  // 會議室 A 亮度值
                "0x1F-0x21": "homeassistant/light/dual/14/b"   // 會議室 B 亮度值
            };

            const key = `0x${sceneId.toString(16).toUpperCase()}-0x${functionId.toString(16).toUpperCase()}`;
            const baseTopic = CORRIDOR_MAP[key];

            if (!baseTopic) return null;

            // 提取 ASCII 數值（亮度百分比）
            if (length > 0 && input.length >= 11 + length) {
                let valueStr = '';
                for (let i = 0; i < length; i++) {
                    valueStr += String.fromCharCode(input[11 + i]);
                }
                const brightness = parseInt(valueStr);
                if (!isNaN(brightness)) {
                    debugLog('hmi', `HMI單色燈亮度: 場景0x${sceneId.toString(16).toUpperCase()} 功能0x${functionId.toString(16).toUpperCase()} 亮度=${brightness}%`);
                    return [
                        { topic: `${baseTopic}/state`, payload: brightness > 0 ? "ON" : "OFF" },
                        { topic: `${baseTopic}/brightness`, payload: brightness }
                    ];
                }
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
let matchedPattern = null;

for (const p of HMI_pattern) {
    if (matchPattern(input, p.pattern)) {
        matchedPattern = p.name;
        debugLog('hmi', `✓ 匹配到 pattern: ${p.name}`);
        result = p.parse(input);
        if (result) {
            debugLog('hmi', `✓ parse 成功,返回 ${result.length} 個指令`);
        } else {
            debugLog('hmi', `✗ parse 返回 null`);
        }
        break;
    }
}

if (result && Array.isArray(result) && result.length > 0) {
    debugLog('hmi', `HMI收到: ${bufferToHexArray(msg.payload)} → ${result.length} 個 MQTT 指令`);
    return [result];
} else {
    debugLog('hmi', `HMI收到: ${bufferToHexArray(msg.payload)} (${matchedPattern ? `匹配 ${matchedPattern} 但 parse 失敗` : '未匹配'})`);
    return null;
}