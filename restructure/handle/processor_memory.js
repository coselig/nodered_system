/**
 * 記憶處理器 - 支援場景記憶儲存與查詢
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 crc_builder → modbus_queue
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 支援的 Topic 格式:
 *   homeassistant/memory/query/all           - 查詢所有記憶
 *   homeassistant/memory/{sceneId}/{operation}/save/set - 儲存記憶
 *   homeassistant/scene/{sceneId}/{operation}/execute/set - 執行記憶場景
 */

// ========== 共用模組 ==========
const debugConfig = global.get('debug_config') || {
    topic: true, cache: true, modbus: true, mqtt: true, scene: true, query: true
};

function debugLog(category, message) {
    if (debugConfig[category]) node.warn(message);
}

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_COLORTEMP = 250;

// ========== 常數定義 ==========
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

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // memory, scene

let mqttMessages = [];

// ========== MEMORY DEVICE (記憶功能 + 查詢) ==========
if (deviceType === "memory") {
    const sceneId = parts[2];      // 0x02, 0x03, query, etc.
    const operation = parts[3];    // 0x01 (ON), 0x02 (OFF), all
    const action = parts[4];       // save, execute, get

    // ===== MEMORY QUERY (查詢所有記憶) =====
    if (sceneId === "query" && operation === "all") {
        debugLog('cache', `=== 查詢所有記憶狀態 ===`);

        let allMemories = [];
        let totalCount = 0;

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

        node.status({ fill: "blue", shape: "ring", text: `記憶查詢: ${totalCount} 組` });

        return [[{ payload: summary, allMemories: allMemories }], []];
    }

    // ===== MEMORY SAVE (儲存記憶) =====
    if (action === "save") {
        let memoryData;
        try {
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

        for (const deviceTopic of devices) {
            const deviceParts = deviceTopic.split("/");
            const devType = deviceParts[1];
            const devSubType = deviceParts[2];
            const devModuleId = deviceParts[3];
            const devChannel = deviceParts[4];

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

        const memoryRecord = {
            scene_name: memoryData.scene_name,
            timestamp: memoryData.timestamp || new Date().toISOString(),
            devices: savedStates
        };

        flow.set(memoryKey, memoryRecord);
        debugLog('cache', `✅ 記憶已儲存: ${memoryKey}`);

        node.status({ fill: "blue", shape: "dot", text: `記憶: ${memoryData.scene_name} (${devices.length}個設備)` });

        return null;
    }
}

// ========== SCENE DEVICE (場景執行，包含記憶執行) ==========
if (deviceType === "scene") {
    const sceneId = parts[2];
    const operation = parts[3];
    const action = parts[4];

    if (action === "execute") {
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

        for (const deviceTopic of deviceTopics) {
            const savedState = devices[deviceTopic];
            const deviceParts = deviceTopic.split("/");
            const devSubType = deviceParts[2];
            const devModuleId = deviceParts[3];
            const devChannel = deviceParts[4];

            // 更新快取
            flow.set(`${devSubType}_${devModuleId}_${devChannel}_state`, savedState.state);
            flow.set(`${devSubType}_${devModuleId}_${devChannel}_brightness`, savedState.brightness);

            if (devSubType === "dual" && savedState.colortemp !== undefined) {
                flow.set(`${devSubType}_${devModuleId}_${devChannel}_colortemp`, savedState.colortemp);
            }

            debugLog('scene', `  ${deviceTopic}: ${savedState.state} ${savedState.brightness}%${savedState.colortemp ? ` ${savedState.colortemp}K` : ''}`);

            mqttMessages.push({
                topic: `${deviceTopic}/set`,
                payload: savedState.state
            });
        }

        node.status({ fill: "yellow", shape: "ring", text: `執行記憶: ${memoryRecord.scene_name} (${deviceTopics.length}個設備)` });

        return [[], mqttMessages];
    }
}

return null;
