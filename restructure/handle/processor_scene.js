/**
 * 場景處理器 - 支援燈光群組控制
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 modbus_queue.js
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 支援的 Topic 格式:
 *   homeassistant/light/scene/{sceneType}/{lights}/set
 *   範例: homeassistant/light/scene/single/12-1--12-2/set
 */

// ========== 共用模組 ==========
const debugConfig = global.get('debug_config') || {
    topic: true, cache: true, modbus: true, mqtt: true, scene: true, query: true
};

function debugLog(category, message) {
    if (debugConfig[category]) node.warn(message);
}

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light
const subType = parts[2];        // scene

if (deviceType !== "light" || subType !== "scene") {
    return null;
}

const sceneType = parts[3];  // single, dual
const lightsStr = parts[4];  // 12-1--12-2
const lights = lightsStr.split("--");
const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

debugLog('scene', `=== Scene 處理器 ===`);
debugLog('scene', `場景類型: ${sceneType}`);
debugLog('scene', `燈光列表: ${lights.join(", ")}`);
debugLog('scene', `狀態: ${state}`);

let mqttMessages = [];

// Scene 快取 key 格式: scene_single_12-3--12-4_brightness
const groupBrightnessKey = `scene_${sceneType}_${lightsStr}_brightness`;
const groupColortempKey = `scene_${sceneType}_${lightsStr}_colortemp`;
const groupBrightness = flow.get(groupBrightnessKey);
const groupColortemp = flow.get(groupColortempKey);

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
mqttMessages.push({ topic: `homeassistant/light/scene/${sceneType}/${lightsStr}/state`, payload: state });

node.status({
    fill: state === "ON" ? "yellow" : "grey",
    shape: "ring",
    text: `Scene: ${lights.length} 燈 ${state}`
});

// Scene 不直接產生 Modbus 指令，透過 MQTT 觸發個別燈光
return [[], mqttMessages];
