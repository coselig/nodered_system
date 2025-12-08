/**
 * 完整處理器 - 支援所有設備類型
 * 
 * Node ID: 50313094f488b340
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 modbus_queue.js（入隊）
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 流程：
 *   MQTT In → full_processor → modbus_queue → Serial Out
 *                                    ↑
 *   Serial In → feedback_processor ──┘ (dequeue)
 */

// 完整版處理器：支援 Single/Dual/Relay 燈光、Cover、Scene

// Debug 控制 (透過 global context 設定)
const debugConfig = global.get('debug_config') || {
    topic: true,        // 顯示收到的 Topic
    cache: true,        // 顯示快取操作
    modbus: true,       // 顯示 Modbus 指令詳情
    mqtt: true,         // 顯示 MQTT 狀態回報
    scene: true,        // 顯示 Scene 處理
    query: true         // 顯示 Query 查詢
};

function debugLog(category, message) {
    if (debugConfig[category]) {
        node.warn(message);
    }
}

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_COLORTEMP = 250;
const MIN_MIRED = 167;
const MAX_MIRED = 333;
const BRIGHTNESS_TIME = 0x05;
const CHANNEL_REGISTER_MAP = {
    "1": 0x082A,
    "2": 0x082B,
    "3": 0x082C,
    "4": 0x082D,
    "a": [0x082A, 0x082B],
    "b": [0x082C, 0x082D]
};
const CHANNEL_COIL_MAP = {
    "1": 0x0000,
    "2": 0x0001,
    "3": 0x0002,
    "4": 0x0003
};

function generalCommandBuild(frame) {
    function crc16(buf) {
        let crc = 0xFFFF;
        for (const b of buf) {
            crc ^= b;
            for (let i = 0; i < 8; i++) {
                crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
            }
        }
        return crc;
    }
    const crc = crc16(frame);
    return Buffer.concat([frame, Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF])]);
}

function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

function buildCommand(moduleId, reg, value, speed = 0x05) {
    const hi = (reg >> 8) & 0xFF;
    const lo = reg & 0xFF;
    const cmd = Buffer.from([moduleId, 0x06, hi, lo, speed, value]);
    return generalCommandBuild(cmd);
}

const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light, cover, memory
const subType = parts[2];        // single, dual, relay, scene, general
const moduleId = parseInt(parts[3]);
const channel = parts[4];

debugLog('topic', `=== 收到訊息 ===`);
debugLog('topic', `Topic: ${msg.topic}`);
debugLog('topic', `Payload: ${msg.payload}`);
debugLog('topic', `Device: ${deviceType}, SubType: ${subType}, Module: ${moduleId}, Channel: ${channel}`);

let modbusMessages = [];
let mqttMessages = [];

// ========== MEMORY DEVICE (記憶功能 + 查詢) ==========
if (deviceType === "memory") {
    const sceneId = parts[2];      // 0x02, 0x03, query, etc.
    const operation = parts[3];    // 0x01 (ON), 0x02 (OFF), all
    const action = parts[4];       // save, execute, get

    // ===== MEMORY QUERY (查詢所有記憶) =====
    if (sceneId === "query" && operation === "all") {
        // 格式: homeassistant/memory/query/all
        debugLog('cache', `=== 查詢所有記憶狀態 ===`);

        const SCENE_NAMES = {
            "0x02": "會議室",
            "0x03": "公共區",
            "0x04": "戶外",
            "0x05": "H40二樓"
        };

        const OPERATION_NAMES = {
            "0x01": "ON",
            "0x02": "OFF"
        };

        let allMemories = [];
        let totalCount = 0;

        // 檢查所有可能的記憶組合
        for (const sceneId of Object.keys(SCENE_NAMES)) {
            for (const operation of Object.keys(OPERATION_NAMES)) {
                const memoryKey = `memory_${sceneId}_${operation}`;
                const memoryRecord = flow.get(memoryKey);

                if (memoryRecord) {
                    const deviceCount = Object.keys(memoryRecord.devices || {}).length;
                    const sceneName = SCENE_NAMES[sceneId];
                    const opName = OPERATION_NAMES[operation];

                    allMemories.push({
                        key: memoryKey,
                        scene_id: sceneId,
                        operation: operation,
                        scene_name: memoryRecord.scene_name,
                        display_name: `${sceneName}_${opName}`,
                        device_count: deviceCount,
                        timestamp: memoryRecord.timestamp,
                        devices: memoryRecord.devices
                    });

                    totalCount++;

                    debugLog('cache', `✅ ${memoryKey}: ${memoryRecord.scene_name} (${deviceCount}個設備) - ${memoryRecord.timestamp}`);
                }
            }
        }

        if (totalCount === 0) {
            debugLog('cache', `⚠️ 沒有找到任何記憶`);
        } else {
            debugLog('cache', `📊 總共找到 ${totalCount} 組記憶`);
        }

        // 輸出記憶摘要
        const summary = {
            total_count: totalCount,
            memories: allMemories.map(m => ({
                key: m.key,
                display_name: m.display_name,
                device_count: m.device_count,
                timestamp: m.timestamp
            })),
            timestamp: new Date().toISOString()
        };

        node.status({
            fill: "blue",
            shape: "ring",
            text: `記憶查詢: ${totalCount} 組`
        });

        // 返回完整的記憶資料供 Debug 檢視
        return [[{
            payload: summary,
            allMemories: allMemories  // 完整資料（包含設備詳情）
        }], []];
    }

    // ===== MEMORY SAVE (儲存記憶) =====
    if (action === "save") {
        // 格式: homeassistant/memory/{sceneId}/{operation}/save/set
        // payload: JSON { scene_name, devices, timestamp }

        // 儲存記憶：讀取所有設備當前狀態並儲存
        let memoryData;
        try {
            // 如果 payload 已經是 object，直接使用；否則解析 JSON
            if (typeof msg.payload === 'object' && msg.payload !== null) {
                memoryData = msg.payload;
            } else {
                memoryData = JSON.parse(msg.payload);
            }
        } catch (e) {
            debugLog('topic', `記憶指令 JSON 解析失敗: ${e.message}`);
            return null;
        }

        const devices = memoryData.devices || [];
        const memoryKey = `memory_${sceneId}_${operation}`;
        const savedStates = {};

        debugLog('cache', `=== 儲存記憶 ${memoryKey} ===`);
        debugLog('cache', `場景名稱: ${memoryData.scene_name}`);
        debugLog('cache', `設備數量: ${devices.length}`);

        // 讀取每個設備的當前狀態
        for (const deviceTopic of devices) {
            const deviceParts = deviceTopic.split("/");
            const devType = deviceParts[1];        // light
            const devSubType = deviceParts[2];     // single, dual
            const devModuleId = deviceParts[3];    // 13, 14
            const devChannel = deviceParts[4];     // 1, a, b

            if (devType === "light") {
                const stateKey = `${devSubType}_${devModuleId}_${devChannel}_state`;
                const brightnessKey = `${devSubType}_${devModuleId}_${devChannel}_brightness`;
                const colortempKey = `${devSubType}_${devModuleId}_${devChannel}_colortemp`;

                const state = flow.get(stateKey) || "OFF";
                const brightness = flow.get(brightnessKey) || DEFAULT_BRIGHTNESS;
                const colortemp = flow.get(colortempKey) || DEFAULT_COLORTEMP;

                savedStates[deviceTopic] = {
                    state,
                    brightness,
                    colortemp: devSubType === "dual" ? colortemp : undefined
                };

                debugLog('cache', `  ${deviceTopic}: ${state} ${brightness}%${devSubType === 'dual' ? ` ${colortemp}K` : ''}`);
            }
        }

        // 儲存記憶資料
        const memoryRecord = {
            scene_name: memoryData.scene_name,
            timestamp: memoryData.timestamp || new Date().toISOString(),
            devices: savedStates
        };

        flow.set(memoryKey, memoryRecord);
        debugLog('cache', `✅ 記憶已儲存: ${memoryKey}`);

        node.status({
            fill: "blue",
            shape: "dot",
            text: `記憶: ${memoryData.scene_name} (${devices.length}個設備)`
        });

        return null;
    }
}

// ========== SCENE DEVICE (場景執行，包含記憶執行) ==========
if (deviceType === "scene") {
    // 格式: homeassistant/scene/{sceneId}/{operation}/execute/set
    const sceneId = parts[2];      // 0x02, 0x03, etc.
    const operation = parts[3];    // 0x01 (ON), 0x02 (OFF)
    const action = parts[4];       // execute

    if (action === "execute") {
        // 執行記憶場景
        const memoryKey = `memory_${sceneId}_${operation}`;
        const memoryRecord = flow.get(memoryKey);

        if (!memoryRecord) {
            debugLog('scene', `⚠️ 找不到記憶: ${memoryKey}`);
            return null;
        }

        debugLog('scene', `=== 執行記憶場景 ${memoryKey} ===`);
        debugLog('scene', `場景名稱: ${memoryRecord.scene_name}`);
        debugLog('scene', `儲存時間: ${memoryRecord.timestamp}`);

        const devices = memoryRecord.devices || {};
        const deviceTopics = Object.keys(devices);

        // 對每個設備發送 MQTT 指令
        for (const deviceTopic of deviceTopics) {
            const savedState = devices[deviceTopic];
            const deviceParts = deviceTopic.split("/");
            const devSubType = deviceParts[2];     // single, dual
            const devModuleId = deviceParts[3];
            const devChannel = deviceParts[4];

            // 先更新快取
            const stateKey = `${devSubType}_${devModuleId}_${devChannel}_state`;
            const brightnessKey = `${devSubType}_${devModuleId}_${devChannel}_brightness`;

            flow.set(stateKey, savedState.state);
            flow.set(brightnessKey, savedState.brightness);

            if (devSubType === "dual" && savedState.colortemp !== undefined) {
                const colortempKey = `${devSubType}_${devModuleId}_${devChannel}_colortemp`;
                flow.set(colortempKey, savedState.colortemp);
            }

            debugLog('scene', `  ${deviceTopic}: ${savedState.state} ${savedState.brightness}%${savedState.colortemp ? ` ${savedState.colortemp}K` : ''}`);

            // 發送控制指令
            mqttMessages.push({
                topic: `${deviceTopic}/set`,
                payload: savedState.state
            });
        }

        node.status({
            fill: "yellow",
            shape: "ring",
            text: `執行記憶: ${memoryRecord.scene_name} (${deviceTopics.length}個設備)`
        });

        // 直接返回 MQTT 訊息，不需要 Modbus
        return [[], mqttMessages];
    }
}

// ========== LIGHT DEVICE ==========
if (deviceType === "light") {
    const baseTopic = `homeassistant/light/${subType}/${moduleId}/${channel}`;

    // 處理 set/brightness 和 set/colortemp 和 set/rgb
    if (parts.length >= 7 && parts[5] === "set") {
        const attribute = parts[6];
        // Scene 的 key 格式不同：scene_single_12-3--12-4_brightness
        let key;
        if (subType === "scene") {
            key = `scene_${parts[3]}_${parts[4]}_${attribute}`;
        } else {
            key = `${subType}_${moduleId}_${channel}_${attribute}`;
        }
        
        // RGB 的 rgb 屬性使用字串，其他使用數值
        if (attribute === "rgb") {
            flow.set(key, msg.payload);  // 儲存為字串 "R,G,B"
            debugLog('cache', `儲存 ${key} = ${msg.payload}`);
        } else {
            const val = Number(msg.payload);
            if (!isNaN(val)) {
                flow.set(key, val);
                debugLog('cache', `儲存 ${key} = ${val}`);
            }
        }

        if (attribute === "brightness" || attribute === "colortemp" || attribute === "rgb") {
            // 對於 dual 燈光的色溫調整，只發送色溫指令，不觸發完整控制流程
            if (subType === "dual" && attribute === "colortemp") {
                const regs = CHANNEL_REGISTER_MAP[channel];
                if (!regs) {
                    debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
                    return null;
                }

                let colortemp = val;
                colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
                const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);

                const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);

                debugLog('modbus', `=== Modbus 指令 (Dual Colortemp Only) ===`);
                debugLog('modbus', `色溫: ${cmdColortemp.toString('hex')}`);

                modbusMessages.push({ payload: cmdColortemp, subType, moduleId, channel, colortemp });

                node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: `${moduleId}-${channel}: Colortemp ${colortemp}K`
                });

                return [modbusMessages, []];
            }

            // 亮度或色溫變更時，保持當前開關狀態不變
            // 0% 不會自動變成 OFF，需要明確發送 OFF 指令才會關閉
            const stateKey = `${subType}_${moduleId}_${channel}_state`;
            const state = flow.get(stateKey) || "ON";
            msg.topic = `homeassistant/light/${subType}/${moduleId}/${channel}/set`;
            msg.payload = state;
        } else {
            return null;
        }
    }

    // ===== RELAY =====
    if (subType === "relay") {
        const addr = CHANNEL_COIL_MAP[channel];
        if (addr === undefined) {
            debugLog('modbus', `找不到 Relay 通道 ${channel}`);
            return null;
        }

        const state = (msg.payload === "ON") ? "ON" : "OFF";
        const valHi = (msg.payload === "ON") ? 0xFF : 0x00;
        const valLo = 0x00;
        const hi = (addr >> 8) & 0xFF;
        const lo = addr & 0xFF;
        const frame = Buffer.from([moduleId, 0x05, hi, lo, valHi, valLo]);
        const cmd = generalCommandBuild(frame);

        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        debugLog('modbus', `=== Modbus 指令 (Relay) ===`);
        debugLog('modbus', `Coil 地址: 0x${addr.toString(16).padStart(4, '0')}`);
        debugLog('modbus', `指令: ${cmd.toString('hex')}`);

        modbusMessages.push({ payload: cmd, subType, moduleId, channel, state });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });

        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `Relay ${moduleId}-${channel}: ${state}`
        });
    }

    // ===== SINGLE =====
    else if (subType === "single") {
        const reg = CHANNEL_REGISTER_MAP[channel];
        if (!reg) {
            debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
            return null;
        }

        let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        let brightness = flow.get(`${subType}_${moduleId}_${channel}_brightness`);
        if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
        brightness = clamp(Math.round(brightness), 0, 100);

        const brValue = (state === "ON") ? brightness : 0;
        const speed = (state === "OFF") ? 0x00 : BRIGHTNESS_TIME;
        const cmd = buildCommand(moduleId, reg, brValue, speed);

        debugLog('modbus', `=== Modbus 指令 (Single) ===`);
        debugLog('modbus', `指令: ${cmd.toString('hex')}`);

        modbusMessages.push({ payload: cmd, subType, moduleId, channel, state, brightness });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
        }

        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `${moduleId}-${channel}: ${state} ${brightness}%`
        });
    }

    // ===== DUAL =====
    else if (subType === "dual") {
        const regs = CHANNEL_REGISTER_MAP[channel];
        if (!regs) {
            debugLog('modbus', `找不到通道 ${channel} 的寄存器`);
            return null;
        }

        let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        let brightness = flow.get(`${subType}_${moduleId}_${channel}_brightness`);
        if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
        brightness = clamp(Math.round(brightness), 0, 100);

        let colortemp = flow.get(`${subType}_${moduleId}_${channel}_colortemp`);
        if (typeof colortemp !== "number") colortemp = DEFAULT_COLORTEMP;
        colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
        const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);

        const brValue = (state === "ON") ? brightness : 0;
        const cmdBrightness = buildCommand(moduleId, regs[0], brValue);
        const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);

        debugLog('modbus', `=== Modbus 指令 (Dual) ===`);
        debugLog('modbus', `亮度: ${cmdBrightness.toString('hex')}`);
        debugLog('modbus', `色溫: ${cmdColortemp.toString('hex')}`);

        modbusMessages.push({ payload: cmdBrightness, subType, moduleId, channel, state, brightness, colortemp });
        modbusMessages.push({ payload: cmdColortemp, subType, moduleId, channel, state, brightness, colortemp });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
            mqttMessages.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
        }

        node.status({
            fill: state === "ON" ? "green" : "grey",
            shape: "dot",
            text: `${moduleId}-${channel}: ${state} ${brightness}% ${colortemp}K`
        });
    }

    // ===== RGB =====
    else if (subType === "rgb") {
        // RGB 使用 0x10 (Write Multiple Registers) 寫入 2 個寄存器 (4 bytes: R, G, B, W)
        const RGB_REGISTER_MAP = { "x": 0x0829, "y": 0x082B, "z": 0x082D };
        const DEFAULT_RGB = "255,255,255";

        const reg = RGB_REGISTER_MAP[channel];
        if (!reg) {
            debugLog('modbus', `找不到 RGB 通道 ${channel} 的寄存器`);
            return null;
        }

        let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
        const stateKey = `${subType}_${moduleId}_${channel}_state`;
        flow.set(stateKey, state);

        // 取得亮度 (0-100)
        let brightness = flow.get(`${subType}_${moduleId}_${channel}_brightness`);
        if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
        brightness = clamp(Math.round(brightness), 0, 100);

        // 取得 RGB 值 (格式: "R,G,B")
        let rgbString = flow.get(`${subType}_${moduleId}_${channel}_rgb`);
        if (!rgbString) rgbString = DEFAULT_RGB;

        const rgbArray = rgbString.split(",").map(val => parseInt(val.trim(), 10));
        let [r_ha, g_ha, b_ha] = rgbArray;

        let r, g, b, w;
        if (state === "OFF") {
            // 關燈：全部設為 0
            r = g = b = w = 0;
        } else {
            // 開燈：使用 WRGB 演算法
            // 1. 計算白光成分（取 RGB 三色的最小值作為白光）
            w = Math.min(r_ha, g_ha, b_ha);
            // 2. 將原 RGB 扣除白光成分
            r = r_ha - w;
            g = g_ha - w;
            b = b_ha - w;
            // 3. 按照亮度比例縮放
            const totalWeight = r + g + b + w;
            if (totalWeight === 0) {
                r = g = b = 0;
                w = brightness;
            } else {
                w = Math.round(brightness * w / totalWeight);
                r = Math.round(brightness * r / totalWeight);
                g = Math.round(brightness * g / totalWeight);
                b = Math.round(brightness * b / totalWeight);
            }
        }

        // 組 Modbus 0x10 指令 (Write Multiple Registers)
        // 格式: [Module ID] [0x10] [Reg Hi] [Reg Lo] [Qty Hi] [Qty Lo] [Byte Count] [Data...]
        const regHi = (reg >> 8) & 0xFF;
        const regLo = reg & 0xFF;
        const frame = Buffer.from([
            moduleId, 0x10, regHi, regLo,
            0x00, 0x02,  // 寫入 2 個寄存器
            0x04,        // 4 bytes 資料
            r, g, b, w
        ]);
        const cmd = generalCommandBuild(frame);

        debugLog('modbus', `=== Modbus 指令 (RGB) ===`);
        debugLog('modbus', `原始 RGB: ${r_ha},${g_ha},${b_ha}`);
        debugLog('modbus', `WRGB 輸出: R=${r}, G=${g}, B=${b}, W=${w}`);
        debugLog('modbus', `指令: ${cmd.toString('hex')}`);

        modbusMessages.push({ payload: cmd, subType, moduleId, channel, state, brightness, rgb: rgbString });
        mqttMessages.push({ topic: `${baseTopic}/state`, payload: state });
        if (state === "ON") {
            mqttMessages.push({ topic: `${baseTopic}/brightness`, payload: brightness });
            mqttMessages.push({ topic: `${baseTopic}/rgb`, payload: rgbString });
        }

        node.status({
            fill: state === "ON" ? "magenta" : "grey",
            shape: "dot",
            text: `RGB ${moduleId}-${channel}: ${state} ${brightness}%`
        });
    }

    // ===== SCENE =====
    else if (subType === "scene") {
        const sceneType = parts[3];  // single, dual
        const lights = parts[4].split("--");  // 12-1--12-2
        const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

        // Scene 快取 key 格式: scene_single_12-3--12-4_brightness
        const groupBrightnessKey = `scene_${sceneType}_${parts[4]}_brightness`;
        const groupColortempKey = `scene_${sceneType}_${parts[4]}_colortemp`;
        const groupBrightness = flow.get(groupBrightnessKey);
        const groupColortemp = flow.get(groupColortempKey);

        debugLog('scene', `=== Scene 控制 ===`);
        debugLog('scene', `場景類型: ${sceneType}`);
        debugLog('scene', `燈光列表: ${lights.join(", ")}`);
        debugLog('scene', `狀態: ${state}`);

        // 發送指令到每個燈光
        for (let light of lights) {
            const [lightId, lightChannel] = light.split("-");

            // 先直接更新個別燈光的快取（不透過 MQTT）
            if (state === "ON" && groupBrightness !== undefined) {
                flow.set(`${sceneType}_${lightId}_${lightChannel}_brightness`, groupBrightness);
                debugLog('scene', `更新快取: ${sceneType}_${lightId}_${lightChannel}_brightness = ${groupBrightness}`);
            }
            if (state === "ON" && groupColortemp !== undefined && sceneType === "dual") {
                flow.set(`${sceneType}_${lightId}_${lightChannel}_colortemp`, groupColortemp);
                debugLog('scene', `更新快取: ${sceneType}_${lightId}_${lightChannel}_colortemp = ${groupColortemp}`);
            }

            // 然後發送開關指令（會使用剛更新的快取）
            const lightTopic = `homeassistant/light/${sceneType}/${lightId}/${lightChannel}/set`;
            mqttMessages.push({ topic: lightTopic, payload: state });
        }

        // 更新場景本身的狀態
        mqttMessages.push({ topic: `homeassistant/light/scene/${sceneType}/${parts[4]}/state`, payload: state });

        node.status({
            fill: state === "ON" ? "yellow" : "grey",
            shape: "ring",
            text: `Scene: ${lights.length} 燈 ${state}`
        });
    }
}

// ========== COVER DEVICE ==========
else if (deviceType === "cover") {
    // 格式: homeassistant/cover/general/12/set
    // payload: "1_2/3" 表示開啟 relay 1 和 2，關閉 relay 3

    const relays = msg.payload.split("/");
    const on_relays = relays[0] ? relays[0].split("_").map(Number) : [];
    const off_relays = (relays[1] && relays[1].length > 0) ? relays[1].split("_").map(Number) : [];

    let output = 0x00;
    for (let relay of on_relays) {
        output |= (1 << (relay - 1));
    }
    for (let relay of off_relays) {
        output &= ~(1 << (relay - 1));
    }

    const frame = Buffer.from([moduleId, 0x06, 0x01, 0x9b, 0x10, output]);
    const cmd = generalCommandBuild(frame);

    debugLog('modbus', `=== Modbus 指令 (Cover) ===`);
    debugLog('modbus', `開啟 Relay: ${on_relays.join(", ")}`);
    debugLog('modbus', `關閉 Relay: ${off_relays.join(", ")}`);
    debugLog('modbus', `Bit Mask: 0b${output.toString(2).padStart(8, '0')} (0x${output.toString(16).padStart(2, '0')})`);
    debugLog('modbus', `指令: ${cmd.toString('hex')}`);

    modbusMessages.push({ payload: cmd, deviceType, moduleId, on_relays, off_relays });

    node.status({
        fill: "blue",
        shape: "dot",
        text: `Cover: ON[${on_relays}] OFF[${off_relays}]`
    });
}

// ========== HVAC DEVICE (空調控制) ==========
else if (deviceType === "hvac") {
    // 格式: homeassistant/hvac/{s200Id}/{hvacId}/{action}/set
    // 範例: homeassistant/hvac/200/1/mode/set (payload: "cool")
    //       homeassistant/hvac/200/1/temperature/set (payload: 25)
    //       homeassistant/hvac/200/1/fan/set (payload: "auto")

    const s200Id = parseInt(parts[2]);      // S200 模組 ID (通常是 200)
    const hvacId = parseInt(parts[3]);      // HVAC 設備 ID (1, 2, 3...)
    const hvacAction = parts[4];            // mode, fan, temperature
    const payload = msg.payload;

    const baseAddress = 0x100;
    const speed = 0x00; // HVAC 統一使用 0x00 (立即執行)

    const modeMap = {
        "cool": 0,
        "heat": 1,
        "dry": 2,
        "fan_only": 3,
        "off": 4
    };

    const fanModeMap = {
        "auto": 0,
        "low": 1,
        "medium": 2,
        "high": 3
    };

    let register, value;

    debugLog('topic', `=== HVAC 控制 ===`);
    debugLog('topic', `S200 ID: ${s200Id}, HVAC ID: ${hvacId}, 動作: ${hvacAction}, 值: ${payload}`);

    switch (hvacAction) {
        case "mode":
            register = baseAddress + hvacId * 8 + 1;
            value = modeMap[payload];
            debugLog('modbus', `模式設定: ${payload} -> ${value}`);
            break;

        case "fan":
            register = baseAddress + hvacId * 8 + 2;
            value = fanModeMap[payload];
            debugLog('modbus', `風速設定: ${payload} -> ${value}`);
            break;

        case "temperature":
            register = baseAddress + hvacId * 8 + 3;
            value = parseFloat(payload);
            debugLog('modbus', `溫度設定: ${value}°C`);
            break;

        default:
            debugLog('topic', `未知的 HVAC 動作: ${hvacAction}`);
            return null;
    }

    if (value === undefined || value === null) {
        debugLog('topic', `無效的 HVAC 值: ${payload}`);
        return null;
    }

    const regHi = (register >> 8) & 0xFF;
    const regLo = register & 0xFF;

    // s200Id, 0x06, regHi, regLo, speed, value
    const frame = Buffer.from([
        s200Id,
        0x06,
        regHi,
        regLo,
        speed,
        value
    ]);

    const cmd = generalCommandBuild(frame);

    debugLog('modbus', `=== Modbus 指令 (HVAC) ===`);
    debugLog('modbus', `寄存器: 0x${register.toString(16).padStart(4, '0')}`);
    debugLog('modbus', `指令: ${cmd.toString('hex')}`);

    modbusMessages.push({ payload: cmd, deviceType, s200Id, hvacId, hvacAction, value });

    node.status({
        fill: "orange",
        shape: "dot",
        text: `HVAC ${hvacId}: ${hvacAction}=${payload}`
    });
}


// ========== QUERY DEVICE (查詢) ==========
else if (deviceType === "query") {
    // 格式: homeassistant/query/{subType}/{moduleId}/{channel}
    // subType: single, dual, relay

    const querySubType = subType;  // single, dual, relay

    debugLog('query', `=== Query 查詢 ===`);
    debugLog('query', `類型: ${querySubType}, 模組: ${moduleId}, 通道: ${channel}`);

    let frame;

    if (querySubType === "single" || querySubType === "dual") {
        // 查詢 Single/Dual Light: Read Holding Registers (0x03)
        const reg = CHANNEL_REGISTER_MAP[channel];
        if (!reg) {
            debugLog('query', `找不到通道 ${channel} 的寄存器`);
            return null;
        }

        const startReg = Array.isArray(reg) ? reg[0] : reg;  // dual 取第一個寄存器
        const quantity = Array.isArray(reg) ? 2 : 1;  // dual 讀 2 個，single 讀 1 個

        const regHi = (startReg >> 8) & 0xFF;
        const regLo = startReg & 0xFF;
        const qtyHi = (quantity >> 8) & 0xFF;
        const qtyLo = quantity & 0xFF;

        frame = Buffer.from([moduleId, 0x03, regHi, regLo, qtyHi, qtyLo]);

        debugLog('query', `讀取寄存器: 0x${startReg.toString(16).padStart(4, '0')}, 數量: ${quantity}`);
    }
    else if (querySubType === "relay") {
        // 查詢 Relay: Read Coils (0x01)
        const addr = CHANNEL_COIL_MAP[channel] || 0x0000;
        const quantity = 4;  // 讀取 4 個 coils

        const addrHi = (addr >> 8) & 0xFF;
        const addrLo = addr & 0xFF;
        const qtyHi = (quantity >> 8) & 0xFF;
        const qtyLo = quantity & 0xFF;

        frame = Buffer.from([moduleId, 0x01, addrHi, addrLo, qtyHi, qtyLo]);

        debugLog('query', `讀取線圈: 0x${addr.toString(16).padStart(4, '0')}, 數量: ${quantity}`);
    }
    else {
        debugLog('query', `不支援的查詢類型: ${querySubType}`);
        return null;
    }

    const cmd = generalCommandBuild(frame);

    debugLog('modbus', `=== Modbus 查詢指令 ===`);
    debugLog('modbus', `指令: ${cmd.toString('hex')}`);

    // 將查詢資訊附加到每個訊息中，供 Feedback 使用
    const queryMsg = {
        payload: cmd,
        deviceType: "query",
        subType: querySubType,
        moduleId,
        channel,
        queryInfo: { type: querySubType, channel: channel }
    };
    modbusMessages.push(queryMsg);

    node.status({
        fill: "cyan",
        shape: "ring",
        text: `Query ${querySubType} ${moduleId}-${channel}`
    });
}


else {
    debugLog('topic', `不支援的設備類型: ${deviceType}`);
    return null;
}

// 返回: [Modbus 指令, MQTT 狀態]
return [modbusMessages, mqttMessages];