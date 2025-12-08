/**
 * 場景處理器 - 支援多種設備群組控制
 * 
 * Node Type: function
 * 
 * 運作方式：
 *   場景處理器不直接產生 Modbus 指令，而是透過 MQTT 觸發個別設備處理器。
 *   這樣可以避免重複 Modbus 邏輯，且每個設備的指令邏輯只需維護一處。
 * 
 *   流程：
 *   processor_scene → MQTT out → MQTT in → 個別處理器 → crc_builder → modbus_queue
 * 
 * 輸出：
 *   Output 1: (未使用，保留供未來擴展)
 *   Output 2: MQTT 訊息 → 連接到 MQTT out
 * 
 * 支援的設備類型:
 *   - single: 單色溫燈 (亮度)
 *   - dual:   雙色溫燈 (亮度 + 色溫)
 *   - wrgb:   WRGB燈   (亮度 + RGB顏色)
 *   - relay:  繼電器    (純開關)
 *   - cover:  窗簾      (開/關/停)
 * 
 * 支援的 Topic 格式:
 *   homeassistant/light/scene/{sceneType}/{devices}/set
 *   homeassistant/light/scene/{sceneType}/{devices}/set/brightness
 *   homeassistant/light/scene/{sceneType}/{devices}/set/colortemp
 *   homeassistant/light/scene/{sceneType}/{devices}/set/rgb
 *   homeassistant/cover/scene/cover/{devices}/set
 * 
 * 範例:
 *   homeassistant/light/scene/single/12-1--12-2/set
 *   homeassistant/light/scene/wrgb/2-x--11-x/set/rgb
 *   homeassistant/cover/scene/cover/22-oc--23-oc/set
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
const haEntityType = parts[1];   // light 或 cover
const subType = parts[2];        // scene

if (subType !== "scene") {
    return null;
}

const sceneType = parts[3];  // single, dual, wrgb, relay, cover
const devicesStr = parts[4]; // 12-1--12-2 或 22-oc--23-oc
const devices = devicesStr.split("--");

debugLog('scene', `=== Scene 處理器 ===`);
debugLog('scene', `HA 實體類型: ${haEntityType}`);
debugLog('scene', `場景類型: ${sceneType}`);
debugLog('scene', `設備列表: ${devices.join(", ")}`);
debugLog('scene', `Payload: ${msg.payload}`);

let mqttMessages = [];

// 場景快取 key 前綴
const scenePrefix = `scene_${sceneType}_${devicesStr}`;

// ========== 處理屬性設定 (brightness/colortemp/rgb) ==========
if (parts.length >= 7 && parts[5] === "set") {
    const attribute = parts[6];
    const key = `${scenePrefix}_${attribute}`;
    flow.set(key, msg.payload);
    debugLog('cache', `儲存場景屬性: ${key} = ${msg.payload}`);

    // 屬性變更後，同步到所有子設備
    for (let device of devices) {
        const [deviceId, deviceChannel] = device.split("-");
        const deviceKey = `${sceneType}_${deviceId}_${deviceChannel}_${attribute}`;
        flow.set(deviceKey, msg.payload);
        debugLog('cache', `同步子設備: ${deviceKey} = ${msg.payload}`);

        // 發送屬性更新到個別設備
        if (haEntityType === "light") {
            const attrTopic = `homeassistant/light/${sceneType}/${deviceId}/${deviceChannel}/set/${attribute}`;
            mqttMessages.push({ topic: attrTopic, payload: msg.payload });
        }
    }

    // 更新場景屬性狀態
    const stateTopic = `homeassistant/${haEntityType}/scene/${sceneType}/${devicesStr}/${attribute}`;
    mqttMessages.push({ topic: stateTopic, payload: msg.payload });

    node.status({
        fill: "blue",
        shape: "ring",
        text: `Scene ${attribute}: ${devices.length} 設備`
    });

    return [[], mqttMessages];
}

// ========== 處理窗簾場景 ==========
if (sceneType === "cover") {
    const command = String(msg.payload).toUpperCase(); // OPEN, CLOSE, STOP

    debugLog('scene', `窗簾場景指令: ${command}`);

    for (let device of devices) {
        // device 格式: 22-oc 或 23-ocs
        const [deviceId, controlType] = device.split("-");

        // 轉發到個別窗簾
        // 需要將 OPEN/CLOSE/STOP 轉換為窗簾控制格式
        const coverTopic = `homeassistant/cover/curtain/${deviceId}/${controlType}/set`;

        // 窗簾的 payload 格式根據 config_covers.js:
        // OPEN: "1/2" 或 "1/2_3"
        // CLOSE: "2/1" 或 "2/1_3"  
        // STOP: "1_2/" 或 "3/1_2"
        // 這裡簡化為發送標準 HA 指令，由 processor_cover 處理轉換
        mqttMessages.push({ topic: coverTopic, payload: command });
    }

    // 更新場景狀態
    const statePayload = (command === "OPEN") ? "open" : (command === "CLOSE") ? "closed" : "stopped";
    mqttMessages.push({
        topic: `homeassistant/cover/scene/cover/${devicesStr}/state`,
        payload: statePayload
    });

    node.status({
        fill: command === "STOP" ? "yellow" : "blue",
        shape: "ring",
        text: `Cover Scene: ${devices.length} 窗簾 ${command}`
    });

    return [[], mqttMessages];
}

// ========== 處理燈光場景 (single, dual, wrgb, relay) ==========
const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

debugLog('scene', `燈光狀態: ${state}`);

// 讀取場景儲存的屬性
const groupBrightness = flow.get(`${scenePrefix}_brightness`);
const groupColortemp = flow.get(`${scenePrefix}_colortemp`);
const groupRgb = flow.get(`${scenePrefix}_rgb`);

// 發送指令到每個燈光
for (let device of devices) {
    const [deviceId, deviceChannel] = device.split("-");

    // 根據場景類型，先更新個別設備的快取
    if (state === "ON") {
        if (groupBrightness !== undefined && (sceneType === "single" || sceneType === "dual" || sceneType === "wrgb")) {
            flow.set(`${sceneType}_${deviceId}_${deviceChannel}_brightness`, groupBrightness);
            debugLog('cache', `更新快取: ${sceneType}_${deviceId}_${deviceChannel}_brightness = ${groupBrightness}`);
        }
        if (groupColortemp !== undefined && sceneType === "dual") {
            flow.set(`${sceneType}_${deviceId}_${deviceChannel}_colortemp`, groupColortemp);
            debugLog('cache', `更新快取: ${sceneType}_${deviceId}_${deviceChannel}_colortemp = ${groupColortemp}`);
        }
        if (groupRgb !== undefined && sceneType === "wrgb") {
            flow.set(`${sceneType}_${deviceId}_${deviceChannel}_rgb`, groupRgb);
            debugLog('cache', `更新快取: ${sceneType}_${deviceId}_${deviceChannel}_rgb = ${groupRgb}`);
        }
    }

    // 發送開關指令到個別設備（會使用剛更新的快取）
    const lightTopic = `homeassistant/light/${sceneType}/${deviceId}/${deviceChannel}/set`;
    mqttMessages.push({ topic: lightTopic, payload: state });
}

// 更新場景本身的狀態
mqttMessages.push({
    topic: `homeassistant/light/scene/${sceneType}/${devicesStr}/state`,
    payload: state
});

// 如果是 ON，也更新場景的屬性狀態
if (state === "ON") {
    if (groupBrightness !== undefined) {
        mqttMessages.push({
            topic: `homeassistant/light/scene/${sceneType}/${devicesStr}/brightness`,
            payload: groupBrightness
        });
    }
    if (groupColortemp !== undefined && sceneType === "dual") {
        mqttMessages.push({
            topic: `homeassistant/light/scene/${sceneType}/${devicesStr}/colortemp`,
            payload: groupColortemp
        });
    }
    if (groupRgb !== undefined && sceneType === "wrgb") {
        mqttMessages.push({
            topic: `homeassistant/light/scene/${sceneType}/${devicesStr}/rgb`,
            payload: groupRgb
        });
    }
}

// 設定狀態顯示
const statusColors = {
    single: "yellow",
    dual: "yellow",
    wrgb: "magenta",
    relay: "green"
};

node.status({
    fill: state === "ON" ? (statusColors[sceneType] || "yellow") : "grey",
    shape: "ring",
    text: `Scene ${sceneType}: ${devices.length} 燈 ${state}`
});

// Scene 不直接產生 Modbus 指令，透過 MQTT 觸發個別設備
return [[], mqttMessages];
