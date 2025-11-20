const MIN_MIRED = 167, MAX_MIRED = 333;

// 場景記憶功能說明
//
// 記憶指令格式 FE 06 08 20 OP SCENE CRC_L CRC_H
// 操作碼 OP
//   0x81 記憶ON狀態
//   0x82 記憶OFF狀態
//   0x83 記憶場景1
//   0x84 記憶場景2
//
// 場景 SCENE
//   0x02 會議室
//   0x03 公共區
//   0xFF 全部
//
// MQTT 記憶主題架構
//   儲存 homeassistant/scene/memory/sceneId/operation/save
//   讀取 homeassistant/scene/memory/sceneId/operation/data
//
// 範例
//   全開記憶   FE 06 08 20 81 FF BE 7F 轉為 homeassistant/scene/memory/0xFF/0x01/save
//   會議室ON   FE 06 08 20 81 02 7F FE 轉為 homeassistant/scene/memory/0x02/0x01/save
//   公共區場景1 FE 06 08 20 83 03 7E XX 轉為 homeassistant/scene/memory/0x03/0x03/save

const HMI_project = [
    // 預留給特殊的完全匹配指令
]

// 動態 pattern 可解析變數值
const HMI_pattern = [
    // H70測試按鈕指令 將測試指令轉換為實際場景指令
    {
        name: "h70_test_command",
        pattern: [0xfe, 0x06, 0x08, 0x20, null, null, null, null],
        parse: (input) => {
            const operation = input[4];  // 0x01=ON 或 0x02=OFF
            const sceneId = input[5];    // 0x02=會議室, 0x03=公共區, 0x04=戶外, 0x05=H40二樓

            const sceneKey = `0x${sceneId.toString(16).padStart(2, '0').toUpperCase()}`;
            const opKey = `0x${operation.toString(16).padStart(2, '0').toUpperCase()}`;

            // 場景名稱對照
            const sceneNames = {
                "0x02": "會議室",
                "0x03": "公共區",
                "0x04": "戶外燈",
                "0x05": "H40二樓"
            };
            const opNames = {
                "0x01": "ON",
                "0x02": "OFF"
            };

            const sceneName = sceneNames[sceneKey] || `未知場景${sceneKey}`;
            const opName = opNames[opKey] || `未知操作${opKey}`;

            node.warn(`H70測試按鈕: ${sceneName} ${opName} (${sceneKey}/${opKey})`);

            return [{
                topic: `homeassistant/scene/${sceneKey}/${opKey}/execute/set`,
                payload: "ON"
            }];
        }
    },
    // 窗簾控制 動態解析
    {
        name: "curtain_control",
        pattern: [null, 0x06, 0x01, 0x9b, 0x00, null, null, null],
        parse: (input) => {
            const curtainId = input[0];  // 0x15 鐵捲門 0x16 會議室捲簾 0x17 布簾 紗簾 排煙窗
            const action = input[5];     // 窗簾動作指令碼

            const CURTAIN_MAP = {
                0x15: { topic: "homeassistant/cover/curtain/21/ocs/set", type: "ocs" },  // 鐵捲門 三態控制
                0x16: { topic: "homeassistant/cover/curtain/22/oc/set", type: "oc" },    // 會議室捲簾 雙態控制
                0x17: { topic: "homeassistant/cover/curtain/23", type: "multi" }         // 布簾 紗簾 排煙窗 多重控制
            };

            const config = CURTAIN_MAP[curtainId];
            if (!config) return null;

            let payload, topicSuffix;

            if (config.type === "ocs") {
                // 鐵捲門 三態控制 開啟 停 關閉
                const ACTION_MAP_OCS = {
                    0x01: "1/2-3",  // 開啟
                    0x04: "2/1-3",  // 停
                    0x02: "3/1-2"   // 關閉
                };
                payload = ACTION_MAP_OCS[action];
                topicSuffix = "/set";
            } else if (config.type === "oc") {
                // 會議室捲簾 雙態控制 開啟 關閉 停
                const ACTION_MAP_OC = {
                    0x01: "1/2",    // 開啟
                    0x02: "2/1",    // 關閉
                    0x03: "1-2/"    // 停
                };
                payload = ACTION_MAP_OC[action];
                topicSuffix = "/set";
            } else if (config.type === "multi") {
                // 布簾 紗簾 排煙窗 多重控制
                const ACTION_MAP_MULTI = {
                    // 布簾 開啟 停 關閉
                    0x01: { suffix: "/oc/set", payload: "1/2" },
                    0x03: { suffix: "/oc/set", payload: "1_2/" },
                    0x02: { suffix: "/oc/set", payload: "2/1" },
                    // 紗簾 開啟 停 關閉
                    0x04: { suffix: "/oc/set", payload: "3/4" },
                    0x0C: { suffix: "/oc/set", payload: "3_4/" },
                    0x08: { suffix: "/oc/set", payload: "4/3" },
                    // 排煙窗 開啟 停 關閉
                    0x10: { suffix: "/ocs/set", payload: "5/6_7" },
                    0x40: { suffix: "/ocs/set", payload: "7/5_6" },
                    0x20: { suffix: "/ocs/set", payload: "6/5_7" }
                };
                const actionConfig = ACTION_MAP_MULTI[action];
                if (!actionConfig) return null;
                topicSuffix = actionConfig.suffix;
                payload = actionConfig.payload;
            }

            if (!payload) return null;

            return [{ topic: config.topic + topicSuffix, payload: payload }];
        }
    },
    // 場景記憶指令 儲存當前燈光狀態
    {
        name: "scene_memory",
        pattern: [0xfe, 0x06, 0x08, 0x20, null, null, null, null],
        parse: (input) => {
            const operation = input[4];  // 0x81 記憶ON 0x82 記憶OFF 0x83 記憶場景1 0x84 記憶場景2
            const sceneId = input[5];    // 0x02 會議室 0x03 公共區 0xff 全部

            // 只處理記憶指令 0x81 到 0x84 其他操作碼交給 scene_control 處理
            if (operation < 0x81 || operation > 0x84) {
                return null;
            }

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
                        "homeassistant/light/single/12/1",
                        "homeassistant/light/single/12/2",
                        "homeassistant/light/single/12/3"
                    ]
                },
                "0xff": {
                    name: "全部", devices: [
                        "homeassistant/light/single/11/1",
                        "homeassistant/light/single/12/1",
                        "homeassistant/light/single/12/2",
                        "homeassistant/light/single/12/3",
                        "homeassistant/light/single/13/1",
                        "homeassistant/light/single/13/2",
                        "homeassistant/light/single/13/3",
                        "homeassistant/light/dual/14/a",
                        "homeassistant/light/dual/14/b"
                    ]
                }
            };

            const sceneKey = `0x${sceneId.toString(16).toUpperCase()}`;
            const opKey = `0x${(operation - 0x80).toString(16).padStart(2, '0').toUpperCase()}`; // 0x81 轉 0x01 0x82 轉 0x02
            const sceneInfo = SCENE_MEMORY_MAP[sceneKey];

            if (!sceneInfo) return null;

            // 發送記憶儲存請求到 MQTT 主題
            // 格式 homeassistant/memory/sceneId/operation/save/set
            // 實際儲存處理由 general command 的 global.set 完成
            const memoryTopic = `homeassistant/memory/${sceneKey}/${opKey}/save/set`;

            return [{
                topic: memoryTopic,
                payload: JSON.stringify({
                    scene_name: `${sceneInfo.name}_${opKey === '0x01' ? 'ON' : opKey === '0x02' ? 'OFF' : opKey === '0x03' ? '場景1' : '場景2'}`,
                    devices: sceneInfo.devices,
                    timestamp: new Date().toISOString(),
                    command: bufferToHexArray(input)
                })
            }];
        }
    },
    // 場景控制 動態解析
    {
        name: "scene_control",
        pattern: [0xfe, 0x06, 0x08, 0x20, null, null, null, null],
        parse: (input) => {
            const operation = input[4];  // 0x01 ON 0x02 OFF 0x03 場景1 0x04 場景2
            const sceneId = input[5];    // 0x02 會議室 0x03 公共區 0xff 全部

            // 記憶指令 0x81 到 0x84 由 scene_memory 處理
            if (operation >= 0x81 && operation <= 0x84) {
                return null;
            }

            // 轉換為 MQTT 主題 實際場景執行由 general_command 處理
            const sceneKey = `0x${sceneId.toString(16).toUpperCase()}`;
            const opKey = `0x${operation.toString(16).padStart(2, '0').toUpperCase()}`;

            return [{
                topic: `homeassistant/scene/${sceneKey}/${opKey}/execute/set`,
                payload: "ON"
            }];
        }
    },
    {
        name: "light_control_unified",
        pattern: [
            0xEE, 0xB1, 0x11, 0x00,
            null,       // byte 4 場景ID 0x1E 公共區 0x1F 會議室 0x20 會議室2
            0x00,
            null,       // byte 6 功能ID 0x0B 0x0D 0x0F 0x11
            0x13, 0x00, 0x00,
            null, null, // bytes 10-11 數值 0x0000 到 0x03E8
            0xFF, 0xFC, 0xFF, 0xFF
        ],
        parse: (input) => {
            const sceneId = input[4];    // 場景ID
            const functionId = input[6]; // 功能ID
            const valueHigh = input[10];
            const valueLow = input[11];
            const raw = (valueHigh << 8) + valueLow;

            // 轉換數值 0 到 1000 對應 0 到 100
            let value = Math.round((raw / 1000) * 100);
            value = clamp(value, 0, 100);
            let state = value > 0 ? "ON" : "OFF";

            // 場景與功能映射表
            const LIGHT_MAP = {
                // 公共區 0x1E
                "0x1E-0x0B": { topic: "homeassistant/light/scene/single/11-1--11-2", type: "brightness" },
                "0x1E-0x0D": { topic: "homeassistant/light/scene/single/12-1", type: "brightness" },
                "0x1E-0x0F": { topic: "homeassistant/light/scene/single/12-2", type: "brightness" },
                "0x1E-0x11": { topic: "homeassistant/light/scene/single/12-3--12-4", type: "brightness" },

                // 會議室 0x1F
                "0x1F-0x0B": { topic: "homeassistant/light/scene/single/14/a", type: "brightness" },
                "0x1F-0x0D": { topic: "homeassistant/light/scene/single/14/a", type: "colortemp" },
                "0x1F-0x0F": { topic: "homeassistant/light/scene/single/14/b", type: "brightness" },
                "0x1F-0x11": { topic: "homeassistant/light/scene/single/14/b", type: "colortemp" },

                // 會議室2 0x20
                "0x20-0x0B": { topic: "homeassistant/light/scene/single/14/a", type: "brightness" },
                "0x20-0x0D": { topic: "homeassistant/light/scene/single/14/a", type: "colortemp" },
                "0x20-0x0F": { topic: "homeassistant/light/scene/single/14/b", type: "brightness" },
                "0x20-0x11": { topic: "homeassistant/light/scene/single/14/b", type: "colortemp" },
            };

            const key = `0x${sceneId.toString(16).toUpperCase()}-0x${functionId.toString(16).toUpperCase()}`;
            const config = LIGHT_MAP[key];

            if (!config) return null;

            const baseTopic = config.topic;
            const controlType = config.type;

            if (controlType === "brightness") {
                return [
                    { topic: `${baseTopic}/set`, payload: state },
                    { topic: `${baseTopic}/set/brightness`, payload: value },
                    { topic: `${baseTopic}/state`, payload: state },
                    { topic: `${baseTopic}/brightness`, payload: value }
                ];
            } else if (controlType === "colortemp") {
                // 色溫控制
                const colortemp = percentToColortemp(value);
                return [
                    { topic: `${baseTopic}/set`, payload: state },
                    { topic: `${baseTopic}/set/colortemp`, payload: colortemp },
                    { topic: `${baseTopic}/state`, payload: state },
                    { topic: `${baseTopic}/colortemp`, payload: colortemp }
                ];
            }

            return null;
        }
    },
    // 空調系統 動態解析
    {
        name: "hvac_power_mode",
        pattern: [0x01, 0x31, null, 0x01, 0x01, null], // 開關
        parse: (input) => {
            const powerValue = input[2]; // 0 關 1 開
            const hvacId = input[5];     // 空調ID 1 2 3
            const mode = powerValue === 0x01 ? "auto" : "off";
            return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/set`, payload: mode }];
        }
    },
    {
        name: "hvac_temperature",
        pattern: [0x01, 0x32, null, 0x01, 0x01, null], // 溫度
        parse: (input) => {
            const tempValue = input[2];  // HEX 值直接等於溫度
            const hvacId = input[5];
            return [{ topic: `homeassistant/hvac/200/${hvacId}/temperature/set`, payload: String(tempValue) }];
        }
    },
    {
        name: "hvac_mode",
        pattern: [0x01, 0x33, null, 0x01, 0x01, null], // 模式 冷暖除濕送風
        parse: (input) => {
            const modeValue = input[2];
            const hvacId = input[5];
            const MODE_MAP = {
                0x00: "cool",      // 冷氣
                0x01: "dry",       // 除濕
                0x02: "fan_only",  // 送風
                0x04: "heat"       // 暖氣
            };
            const mode = MODE_MAP[modeValue];
            if (!mode) return null;
            return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/set`, payload: mode }];
        }
    },
    {
        name: "hvac_fan_speed",
        pattern: [0x01, 0x34, null, 0x01, 0x01, null], // 風量
        parse: (input) => {
            const fanValue = input[2];
            const hvacId = input[5];
            const FAN_MAP = {
                0x03: "medium",  // 中
                0x04: "high",    // 強 或自動 需根據空調ID判斷
                0x07: "low"      // 弱
            };
            const fan = FAN_MAP[fanValue];
            if (!fan) return null;

            // 空調1 用 fan/set 空調2 和3 用 mode/fan
            const topicSuffix = hvacId === 1 ? "fan/set" : "mode/fan";
            return [{ topic: `homeassistant/hvac/200/${hvacId}/${topicSuffix}`, payload: fan }];
        }
    }
];

function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

function percentToColortemp(percent, minMired = MIN_MIRED, maxMired = MAX_MIRED) {
    percent = clamp(Math.round(percent), 0, 100);
    return Math.round(maxMired - ((maxMired - minMired) * percent / 100));
}

function bufferToHexArray(buf) {
    return [...buf].map(v => "0x" + v.toString(16).padStart(2, "0"));
}

// 場景 MQTT 指令生成輔助函數
function genLight(base, state, brightness = null, colortemp = null) {
    const cmds = [
        { topic: `${base}/set`, payload: state },
        { topic: `${base}/state`, payload: state }
    ];
    if (state === "ON" && brightness !== null) {
        cmds.push(
            { topic: `${base}/set/brightness`, payload: brightness },
            { topic: `${base}/brightness`, payload: brightness }
        );
    }
    if (state === "ON" && colortemp !== null) {
        cmds.push(
            { topic: `${base}/set/colortemp`, payload: colortemp },
            { topic: `${base}/colortemp`, payload: colortemp }
        );
    }
    return cmds;
}

const SCENE_MAP = {
    0x0B: "homeassistant/light/scene/single/11-1--11-2",
    0x0D: "homeassistant/light/scene/single/13-1--13-2",
    0x0F: "homeassistant/light/scene/single/15-1--15-2",
    0x11: "homeassistant/light/scene/single/17-1--17-2"
};

function matchPattern(input, pattern) {
    if (input.length !== pattern.length) return false;

    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== null && pattern[i] !== input[i]) {
            return false;
        }
    }
    return true;
}


function arrayEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

// 主程式邏輯
// 錯誤處理 檢查 payload 是否存在
if (!msg.payload || !Buffer.isBuffer(msg.payload)) {
    node.warn("收到無效的 payload，必須是 Buffer");
    return msg;
}

let input = Array.from(msg.payload);
let result = null;

// 步驟1 完全比對
for (const item of HMI_project) {
    if (arrayEqual(input, item.in)) {
        result = item.out;
        break;
    }
}

// 步驟2 pattern 比對
if (!result) {
    for (const p of HMI_pattern) {
        if (matchPattern(input, p.pattern)) {
            result = p.parse(input);
            break;
        }
    }
}

// 步驟3 推入 queue 避免推入空陣列
if (result && Array.isArray(result) && result.length > 0) {
    let mqtt_queue = global.get("mqtt_queue") || [];
    mqtt_queue.push(...result);
    global.set("mqtt_queue", mqtt_queue);

    // 除錯日誌
    node.warn(`收到資料: ${bufferToHexArray(msg.payload)}`);
    node.warn(`佇列目前共有 ${mqtt_queue.length} 個待送 MQTT 指令`);
} else if (result && !Array.isArray(result)) {
    let mqtt_queue = global.get("mqtt_queue") || [];
    mqtt_queue.push(result);
    global.set("mqtt_queue", mqtt_queue);

    node.warn(`收到資料: ${bufferToHexArray(msg.payload)}`);
    node.warn(`佇列目前共有 ${mqtt_queue.length} 個待送 MQTT 指令`);
} else {
    node.warn(`收到資料: ${bufferToHexArray(msg.payload)} 未匹配任何規則`);
}

// 回傳原訊息
return msg;