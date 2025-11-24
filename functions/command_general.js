/**
 * command(General) - 通用命令處理函數
 * 處理來自 Home Assistant 的 MQTT 命令並轉換為 Modbus 指令
 */

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_COLORTEMP = 250;
const MIN_MIRED = 167, MAX_MIRED = 333;
const BRIGHTNESS_TIME = 0x05;
const CHANNEL_REGISTER_MAP = {
    "1": 0x082A,
    "2": 0x082B,
    "3": 0x082C,
    "4": 0x082D,
    "a": [0x082A, 0x082B],
    "b": [0x082C, 0x082D],
};

// CRC 驗證
function verifyCRC(buf) {
    let crc = 0xFFFF;
    for (let i = 0; i < buf.length - 2; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
        }
    }
    const lo = crc & 0xFF;
    const hi = (crc >> 8) & 0xFF;
    return lo === buf[buf.length - 2] && hi === buf[buf.length - 1];
}

function printBinary(output) {
    node.warn(`${output.toString(2).padStart(8, "0")}`);
}

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

function getBrightness(subType, moduleId, channel, state) {
    let brightness = flow.get(`${subType}_${moduleId}_${channel}_brightness`);
    if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
    // 限制亮度範圍
    brightness = (state === "ON") ? clamp(Math.round(brightness), 0, 100) : 0x00;
    return brightness;
}

// 自動處理 modbus_queue 的輔助函數（目前沒用到，但保留）
function triggerModbusQueueProcessor() {
    node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);
}

// 主流程
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light cover hvac memory scene query

switch (deviceType) {
    case "light": {
        const subType = parts[2];           // single, dual, relay, scene
        const moduleId = parseInt(parts[3]);
        const channel = parts[4];

        // 🔹在 light 裡處理 set/brightness、set/colortemp
        // 範例: homeassistant/light/single/13/1/set/brightness
        if (parts.length >= 7 && parts[5] === "set") {
            const attribute = parts[6];     // brightness / colortemp 等
            const key = `${subType}_${moduleId}_${channel}_${attribute}`;
            const val = Number(msg.payload);

            if (!isNaN(val)) {
                flow.set(key, val);
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: `${key} = ${val}`
                });
            }

            // 若不是亮度/色溫，就單純當 cache 用，不往下發指令
            if (attribute !== "brightness" && attribute !== "colortemp") {
                return null;
            }

            // 亮度 / 色溫：順便幫忙補一發 /set，讓它走原本 single/dual 的邏輯
            const stateKey = `${subType}_${moduleId}_${channel}_state`;
            let state = flow.get(stateKey);

            // 🔧 修正：收到亮度/色溫指令時，智能判斷開關狀態
            if (attribute === "brightness") {
                // 亮度 > 0 自動開燈，亮度 = 0 關燈
                if (val > 0) {
                    state = "ON";
                    flow.set(stateKey, "ON");
                } else {
                    state = "OFF";
                    flow.set(stateKey, "OFF");
                }
            } else if (attribute === "colortemp") {
                // 色溫調整時，如果燈是關的就開燈
                if (!state || state === "OFF") {
                    state = "ON";
                    flow.set(stateKey, "ON");
                }
            }

            // 如果狀態仍未知（理論上不會發生），預設為 ON
            if (!state) {
                state = "ON";
                flow.set(stateKey, "ON");
            }

            msg.topic = `homeassistant/light/${subType}/${moduleId}/${channel}/set`;
            msg.payload = state;
            // 不 return，繼續往下跑 switch(subType)
        }

        switch (subType) {
            case "relay": {
                const CHANNEL_COIL_MAP = {
                    "1": 0x0000,
                    "2": 0x0001,
                    "3": 0x0002,
                    "4": 0x0003,
                };
                const addr = CHANNEL_COIL_MAP[channel];
                if (addr === undefined) return null;

                // Coil 寫入值 ON 為 0xFF00 OFF 為 0x0000
                const valHi = (msg.payload === "ON") ? 0xFF : 0x00;
                const valLo = 0x00;

                // 高低位位址
                const hi = (addr >> 8) & 0xFF;
                const lo = addr & 0xFF;

                // 組 Modbus 指令 0x05 Write Single Coil
                const frame = Buffer.from([moduleId, 0x05, hi, lo, valHi, valLo]);
                const state = (msg.payload === "ON") ? "ON" : "OFF";

                // 記錄狀態到 flow context
                const stateKey = `${subType}_${moduleId}_${channel}_state`;
                flow.set(stateKey, state);

                // 推入 modbus_queue 統一管理發送
                let modbus_queue = global.get("modbus_queue") || [];
                modbus_queue.push({ payload: generalCommandBuild(frame) });
                global.set("modbus_queue", modbus_queue);

                // 發送 MQTT 狀態更新給 Home Assistant
                let mqtt_queue = global.get("mqtt_queue") || [];
                const baseTopic = `homeassistant/light/${subType}/${moduleId}/${channel}`;
                mqtt_queue.push({ topic: `${baseTopic}/state`, payload: state });
                global.set("mqtt_queue", mqtt_queue);

                // 發送觸發訊息給 modbus_queue_processor
                node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);
                return null;
            }
            case "single": {
                // 狀態 ON 或 OFF
                let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

                // 記錄狀態到 flow context
                const stateKey = `${subType}_${moduleId}_${channel}_state`;
                flow.set(stateKey, state);

                let brightness = getBrightness(subType, moduleId, channel, state);
                // 取得對應寄存器
                const reg = CHANNEL_REGISTER_MAP[channel];
                if (!reg) return null;
                // 高低位元組
                const hi = (reg >> 8) & 0xFF;
                const lo = reg & 0xFF;
                // OFF 狀態使用 speed=0x00 立即執行，ON 狀態使用 BRIGHTNESS_TIME
                const speed = (state === "OFF") ? 0x00 : BRIGHTNESS_TIME;
                // 組 Modbus 指令
                const cmd = Buffer.from([moduleId, 0x06, hi, lo, speed, brightness]);

                // 推入 modbus_queue 統一管理發送
                let modbus_queue = global.get("modbus_queue") || [];
                modbus_queue.push({ payload: generalCommandBuild(cmd) });
                global.set("modbus_queue", modbus_queue);

                // 發送 MQTT 狀態更新給 Home Assistant
                let mqtt_queue = global.get("mqtt_queue") || [];
                const baseTopic = `homeassistant/light/${subType}/${moduleId}/${channel}`;
                mqtt_queue.push({ topic: `${baseTopic}/state`, payload: state });
                if (state === "ON") {
                    mqtt_queue.push({ topic: `${baseTopic}/brightness`, payload: brightness });
                }
                global.set("mqtt_queue", mqtt_queue);

                // 發送觸發訊息給 modbus_queue_processor
                node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);
                return null;
            }
            case "dual": {
                const regs = CHANNEL_REGISTER_MAP[channel];
                if (!regs) return null;

                let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

                // 記錄狀態到 flow context
                const stateKey = `${subType}_${moduleId}_${channel}_state`;
                flow.set(stateKey, state);

                const brKey = `${subType}_${moduleId}_${channel}_brightness`;
                const ctKey = `${subType}_${moduleId}_${channel}_colortemp`;

                let brightness = flow.get(brKey);
                if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
                brightness = clamp(Math.round(brightness), 0, 100);

                let colortemp = flow.get(ctKey);
                if (typeof colortemp !== "number") colortemp = DEFAULT_COLORTEMP;
                colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
                const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);

                function buildCommand(moduleId, reg, value, speed = 0x05) {
                    const hi = (reg >> 8) & 0xFF;
                    const lo = reg & 0xFF;
                    const cmd = Buffer.from([moduleId, 0x06, hi, lo, speed, value]);
                    return generalCommandBuild(cmd);
                }

                const brValue = (state === "ON") ? brightness : 0;
                const cmdBrightness = buildCommand(moduleId, regs[0], brValue);
                const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);

                // 推入 modbus_queue 統一管理發送
                let modbus_queue = global.get("modbus_queue") || [];
                modbus_queue.push({ payload: cmdBrightness });
                modbus_queue.push({ payload: cmdColortemp });
                global.set("modbus_queue", modbus_queue);

                // 發送 MQTT 狀態更新給 Home Assistant
                let mqtt_queue = global.get("mqtt_queue") || [];
                const baseTopic = `homeassistant/light/${subType}/${moduleId}/${channel}`;
                mqtt_queue.push({ topic: `${baseTopic}/state`, payload: state });
                if (state === "ON") {
                    mqtt_queue.push({ topic: `${baseTopic}/brightness`, payload: brightness });
                    mqtt_queue.push({ topic: `${baseTopic}/colortemp`, payload: colortemp });
                }
                global.set("mqtt_queue", mqtt_queue);

                // 發送觸發訊息給 modbus_queue_processor
                node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);

                return null;
            }
            case "wrgb": {
                return null;
            }
            case "scene": {
                let mqtt_queue = global.get("mqtt_queue");
                switch (parts[3]) {
                    case "single": {
                        let lights = (parts[4]).split("--");
                        let groupBrightness = flow.get(`${subType}_${parts[3]}_${parts[4]}_brightness`);
                        const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

                        for (let i = 0; i < lights.length; i++) {
                            let lightId = lights[i].split("-")[0];
                            let lightChannel = lights[i].split("-")[1];

                            // 更新 flow context 狀態
                            const stateKey = `${parts[3]}_${lightId}_${lightChannel}_state`;
                            flow.set(stateKey, state);
                            if (state === "ON" && groupBrightness !== undefined) {
                                const brightnessKey = `${parts[3]}_${lightId}_${lightChannel}_brightness`;
                                flow.set(brightnessKey, groupBrightness);
                            }

                            // 更新實際設備狀態
                            let stateMsg = { ...msg };
                            stateMsg.topic = `homeassistant/light/${parts[3]}/${lightId}/${lightChannel}/state`;
                            mqtt_queue.push(stateMsg);

                            let brightnessMsg = { ...msg };
                            brightnessMsg.topic = `homeassistant/light/${parts[3]}/${lightId}/${lightChannel}/set/brightness`;
                            brightnessMsg.payload = groupBrightness;
                            mqtt_queue.push(brightnessMsg);

                            let brightnessStateMsg = { ...msg };
                            brightnessStateMsg.topic = `homeassistant/light/${parts[3]}/${lightId}/${lightChannel}/brightness`;
                            brightnessStateMsg.payload = groupBrightness;
                            mqtt_queue.push(brightnessStateMsg);

                            let setMsg = { ...msg };
                            setMsg.topic = `homeassistant/light/${parts[3]}/${lightId}/${lightChannel}/set`;
                            mqtt_queue.push(setMsg);

                            // 更新對應的場景設備UI狀態
                            let sceneStateMsg = { ...msg };
                            sceneStateMsg.topic = `homeassistant/light/scene/${parts[3]}/${lightId}-${lightChannel}/state`;
                            mqtt_queue.push(sceneStateMsg);

                            let sceneBrightnessMsg = { ...msg };
                            sceneBrightnessMsg.topic = `homeassistant/light/scene/${parts[3]}/${lightId}-${lightChannel}/brightness`;
                            sceneBrightnessMsg.payload = groupBrightness;
                            mqtt_queue.push(sceneBrightnessMsg);
                        }

                        // 更新組合型場景設備UI
                        const sceneGroups = [
                            { ids: ["11-1", "11-2"], sceneId: "11-1--11-2" },  // 走廊間照
                            { ids: ["12-3", "12-4"], sceneId: "12-3--12-4" },  // 展示櫃
                            { ids: ["16-1", "16-2"], sceneId: "16-1--16-2" },  // 走道間照
                            { ids: ["17-1", "17-2"], sceneId: "17-1--17-2" },  // 廚房
                            { ids: ["18-1", "18-2"], sceneId: "18-1--18-2" },  // 1F壁燈/地燈組合
                            { ids: ["19-1", "19-2"], sceneId: "19-1--19-2" }   // 2F壁燈/地燈組合
                        ];

                        for (const group of sceneGroups) {
                            const allIncluded = group.ids.every(id => lights.includes(id));
                            if (allIncluded) {
                                let groupSceneStateMsg = { ...msg };
                                groupSceneStateMsg.topic = `homeassistant/light/scene/${parts[3]}/${group.sceneId}/state`;
                                mqtt_queue.push(groupSceneStateMsg);

                                let groupSceneBrightnessMsg = { ...msg };
                                groupSceneBrightnessMsg.topic = `homeassistant/light/scene/${parts[3]}/${group.sceneId}/brightness`;
                                groupSceneBrightnessMsg.payload = groupBrightness;
                                mqtt_queue.push(groupSceneBrightnessMsg);
                            }
                        }

                        return null;
                    }
                    case "dual": {
                        let lights = (parts[4]).split("--");
                        let groupBrightness = flow.get(`${subType}_${parts[3]}_${parts[4]}_brightness`);
                        let groupColortemp = flow.get(`${subType}_${parts[3]}_${parts[4]}_colortemp`);
                        const state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

                        for (let i = 0; i < lights.length; i++) {
                            let lightId = lights[i].split("-")[0];
                            let lightChannel = lights[i].split("-")[1];

                            // 更新 flow context 狀態
                            const stateKey = `${parts[3]}_${lightId}_${lightChannel}_state`;
                            flow.set(stateKey, state);
                            if (state === "ON") {
                                if (groupBrightness !== undefined) {
                                    const brightnessKey = `${parts[3]}_${lightId}_${lightChannel}_brightness`;
                                    flow.set(brightnessKey, groupBrightness);
                                }
                                if (groupColortemp !== undefined) {
                                    const colortempKey = `${parts[3]}_${lightId}_${lightChannel}_colortemp`;
                                    flow.set(colortempKey, groupColortemp);
                                }
                            }

                            // 更新實際設備狀態
                            let stateMsg = { ...msg };
                            stateMsg.topic = `homeassistant/light/dual/${lightId}/${lightChannel}/state`;
                            mqtt_queue.push(stateMsg);

                            let brightnessMsg = { ...msg };
                            brightnessMsg.topic = `homeassistant/light/dual/${lightId}/${lightChannel}/set/brightness`;
                            brightnessMsg.payload = groupBrightness;
                            mqtt_queue.push(brightnessMsg);

                            let brightnessStateMsg = { ...msg };
                            brightnessStateMsg.topic = `homeassistant/light/dual/${lightId}/${lightChannel}/brightness`;
                            brightnessStateMsg.payload = groupBrightness;
                            mqtt_queue.push(brightnessStateMsg);

                            if (groupColortemp !== undefined) {
                                let colortempMsg = { ...msg };
                                colortempMsg.topic = `homeassistant/light/dual/${lightId}/${lightChannel}/set/colortemp`;
                                colortempMsg.payload = groupColortemp;
                                mqtt_queue.push(colortempMsg);

                                let colortempStateMsg = { ...msg };
                                colortempStateMsg.topic = `homeassistant/light/dual/${lightId}/${lightChannel}/colortemp`;
                                colortempStateMsg.payload = groupColortemp;
                                mqtt_queue.push(colortempStateMsg);
                            }

                            let setMsg = { ...msg };
                            setMsg.topic = `homeassistant/light/dual/${lightId}/${lightChannel}/set`;
                            mqtt_queue.push(setMsg);

                            // 更新對應的場景設備UI狀態
                            let sceneStateMsg = { ...msg };
                            sceneStateMsg.topic = `homeassistant/light/scene/${parts[3]}/${lightId}-${lightChannel}/state`;
                            mqtt_queue.push(sceneStateMsg);

                            let sceneBrightnessMsg = { ...msg };
                            sceneBrightnessMsg.topic = `homeassistant/light/scene/${parts[3]}/${lightId}-${lightChannel}/brightness`;
                            sceneBrightnessMsg.payload = groupBrightness;
                            mqtt_queue.push(sceneBrightnessMsg);

                            if (groupColortemp !== undefined) {
                                let sceneColortempMsg = { ...msg };
                                sceneColortempMsg.topic = `homeassistant/light/scene/${parts[3]}/${lightId}-${lightChannel}/colortemp`;
                                sceneColortempMsg.payload = groupColortemp;
                                mqtt_queue.push(sceneColortempMsg);
                            }
                        }
                        return null;
                    }
                    default: {
                        node.warn(`receive scene:${parts[3]}`);
                        return null;
                    }
                }
            }
            default: {
                node.warn(`unknown light subtype: ${subType}`);
                return null;
            }
        }
    }

    case "cover": {
        // 格式 開啟的relay_開啟的relay/關閉的relay_關閉的relay
        // payload 範例 1_2/3 表示開啟 relay 1 和 2 關閉 relay 3
        const moduleId = parseInt(parts[3]);  // 模組 ID

        let relays = msg.payload.split("/");
        let on_relays = relays[0] ? relays[0].split("_").map(Number) : [];
        let off_relays = (relays[1] && relays[1].length > 0) ? relays[1].split("_").map(Number) : [];

        // 計算 bit mask
        let output = 0x00;

        // 打開 on_relays
        for (let relay of on_relays) {
            output |= (1 << (relay - 1));  // relay 1 對應 bit 0
        }

        // 清除 off_relays 對應的 bit
        for (let relay of off_relays) {
            output &= ~(1 << (relay - 1)); // relay 2 對應 bit 1 置 0
        }
        const frame = Buffer.from([moduleId, 0x06, 0x01, 0x9b, 0x10, output]);
        msg.payload = generalCommandBuild(frame);
        // 推入 modbus_queue 統一管理發送
        let modbus_queue = global.get("modbus_queue") || [];
        modbus_queue.push(msg);
        global.set("modbus_queue", modbus_queue);
        // 發送觸發訊息給 modbus_queue_processor
        node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);
        return null;
    }

    case "hvac": {
        const s200Id = parseInt(parts[2]);      // S200 模組 ID
        const hvacId = parseInt(parts[3]);      // HVAC 設備 ID 1 2 3
        const hvacAction = parts[4];            // mode fan temperature
        const payload = msg.payload;

        const baseAddress = 0x100;
        const speed = 0x00; // 統一 transition speed

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

        switch (hvacAction) {
            case "mode":
                register = baseAddress + hvacId * 8 + 1;
                value = modeMap[payload];
                break;

            case "fan":
                register = baseAddress + hvacId * 8 + 2;
                value = fanModeMap[payload];
                break;

            case "temperature":
                register = baseAddress + hvacId * 8 + 3;
                value = parseFloat(payload);
                break;

            default:
                node.warn("Unknown HVAC action: " + hvacAction);
                return null;
        }

        if (value === undefined || value === null) {
            node.warn("Invalid HVAC value: " + payload);
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

        msg.payload = generalCommandBuild(frame);
        // 推入 modbus_queue 統一管理發送
        let modbus_queue = global.get("modbus_queue") || [];
        modbus_queue.push(msg);
        global.set("modbus_queue", modbus_queue);
        // 發送觸發訊息給 modbus_queue_processor
        node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);
        return null;
    }

    case "memory": {
        // 記憶儲存處理
        // 主題格式 homeassistant/memory/sceneId/operation/save/set
        const sceneId = parts[2];      // 0x02 0x03 0xFF
        const operation = parts[3];    // 0x01 0x02 0x03 0x04
        const action = parts[4];       // save

        if (action === "save") {
            const memoryKey = `homeassistant/memory/${sceneId}/${operation}`;

            // payload 可能已經是 object 或是 string
            const requestData = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;

            // 讀取每個設備的當前狀態
            const devicesWithState = [];
            node.warn(`=== 開始記憶儲存 ${memoryKey} ===`);

            for (const deviceTopic of requestData.devices) {
                // deviceTopic 格式: homeassistant/light/single/13/1
                const deviceParts = deviceTopic.split("/");
                const subType = deviceParts[2];  // single, dual
                const moduleId = deviceParts[3];
                const channel = deviceParts[4];

                // 讀取 flow context 中的狀態
                const stateKey = `${subType}_${moduleId}_${channel}_state`;
                const brightnessKey = `${subType}_${moduleId}_${channel}_brightness`;
                const colortempKey = `${subType}_${moduleId}_${channel}_colortemp`;

                const state = flow.get(stateKey) || "OFF";
                const brightness = flow.get(brightnessKey) || DEFAULT_BRIGHTNESS;

                node.warn(`  讀取 ${moduleId}-${channel}: state=${state}, brightness=${brightness}`);

                const deviceState = {
                    topic: deviceTopic,
                    state: state,
                    brightness: brightness
                };

                // 如果是 dual 類型，還要記錄色溫
                if (subType === "dual") {
                    const colortemp = flow.get(colortempKey) || DEFAULT_COLORTEMP;
                    deviceState.colortemp = colortemp;
                    node.warn(`    色溫=${colortemp}`);
                }

                devicesWithState.push(deviceState);
            }

            // 儲存包含實際狀態的資料
            const memoryData = {
                scene_name: requestData.scene_name,
                devices: devicesWithState,
                timestamp: new Date().toISOString()
            };

            global.set(memoryKey, memoryData);

            // 發送確認通知
            let mqtt_queue = global.get("mqtt_queue") || [];
            mqtt_queue.push({
                topic: `homeassistant/memory/${sceneId}/${operation}/saved`,
                payload: JSON.stringify({
                    status: "saved",
                    timestamp: memoryData.timestamp,
                    device_count: devicesWithState.length
                })
            });
            global.set("mqtt_queue", mqtt_queue);

            node.warn(`記憶已儲存: ${memoryKey} (${devicesWithState.length}個設備)`);
        }
        return null;
    }

    case "scene": {
        // 場景執行處理
        // 主題格式 homeassistant/scene/sceneId/operation/execute/set
        const sceneId = parts[2];      // 0x02 0x03 0xFF
        const operation = parts[3];    // 0x01 0x02 0x03 0x04
        const action = parts[4];       // execute

        if (action !== "execute") return null;

        let mqtt_queue = global.get("mqtt_queue") || [];

        // 優先從記憶讀取場景資料
        const memoryKey = `homeassistant/memory/${sceneId}/${operation}`;
        const memoryData = global.get(memoryKey);

        if (memoryData && memoryData.devices) {
            // 使用記憶資料執行場景
            node.warn(`=== 執行記憶場景: ${memoryKey} (${memoryData.devices.length}個設備) ===`);
            node.warn(`  記憶時間: ${memoryData.timestamp}`);

            // 恢復每個設備的記憶狀態
            for (const device of memoryData.devices) {
                const deviceTopic = device.topic;
                const deviceParts = deviceTopic.split("/");
                const subType = deviceParts[2];  // single, dual
                const moduleId = deviceParts[3];
                const channel = deviceParts[4];

                node.warn(`  恢復 ${moduleId}-${channel}: state=${device.state}, brightness=${device.brightness}`);

                // 根據記憶的狀態設定亮度
                if (device.state === "ON" && device.brightness !== undefined) {
                    mqtt_queue.push({
                        topic: `${deviceTopic}/set/brightness`,
                        payload: device.brightness
                    });
                }

                // 如果是 dual 類型且有色溫資料
                if (subType === "dual" && device.colortemp !== undefined) {
                    mqtt_queue.push({
                        topic: `${deviceTopic}/set/colortemp`,
                        payload: device.colortemp
                    });
                    node.warn(`    色溫=${device.colortemp}`);
                }

                // 發送開關狀態
                mqtt_queue.push({
                    topic: `${deviceTopic}/set`,
                    payload: device.state
                });
            }
        } else {
            // 使用預設場景配置
            node.warn(`執行預設場景: ${sceneId}/${operation}`);

            // 場景預設配置 根據場景表格設定
            const SCENE_DEFAULT = {
                // 會議室場景 群組2
                "0x02": {
                    "0x01": [  // 會議室ON 60% - 使用場景燈群組
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set/brightness", payload: 60 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/colortemp", payload: 250 },
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set", payload: "ON" },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set", payload: "ON" }
                    ],
                    "0x02": [  // 會議室OFF 0%
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set", payload: "OFF" },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set", payload: "OFF" }
                    ],
                    "0x03": [  // 會議室100% 100%
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set/brightness", payload: 100 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/brightness", payload: 100 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/colortemp", payload: 250 },
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set", payload: "ON" },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set", payload: "ON" }
                    ],
                    "0x04": [  // 會議室場景2 混合
                        { topic: "homeassistant/light/scene/single/13-1--13-2/set", payload: "OFF" },
                        { topic: "homeassistant/light/scene/single/13-3/set/brightness", payload: 10 },
                        { topic: "homeassistant/light/scene/single/13-3/set", payload: "ON" },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/colortemp", payload: 333 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set", payload: "ON" }
                    ]
                },
                // 公共區場景 群組3
                "0x03": {
                    "0x01": [  // 公共區ON 50%
                        { topic: "homeassistant/light/scene/single/11-1--11-2--12-1--12-2--12-3--12-4/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/single/11-1--11-2--12-1--12-2--12-3--12-4/set", payload: "ON" }
                    ],
                    "0x02": [  // 公共區OFF 0%
                        { topic: "homeassistant/light/scene/single/11-1--11-2--12-1--12-2--12-3--12-4/set", payload: "OFF" }
                    ]
                },
                // 戶外燈場景 群組4
                "0x04": {
                    "0x01": [  // 戶外燈ON 50%
                        { topic: "homeassistant/light/scene/single/18-1--18-2--19-1--19-2/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/single/18-1--18-2--19-1--19-2/set", payload: "ON" }
                    ],
                    "0x02": [  // 戶外燈OFF 0%
                        { topic: "homeassistant/light/scene/single/18-1--18-2--19-1--19-2/set", payload: "OFF" }
                    ]
                },
                // 二楼場景 群組5 (H40)
                "0x05": {
                    "0x01": [  // S1 全開 50%
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set", payload: "ON" }
                    ],
                    "0x02": [  // S2 全關 0%
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set", payload: "OFF" }
                    ],
                    "0x03": [  // S3 舒适 0% (全关)
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set", payload: "OFF" }
                    ],
                    "0x04": [  // S4 用餐 0% (全关)
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set", payload: "OFF" }
                    ],
                    "0x05": [  // S5 影音 0% (全关)
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set", payload: "OFF" }
                    ],
                    "0x06": [  // S6 睡眠 0% (全关)
                        { topic: "homeassistant/light/scene/single/15-1--15-2--16-1--16-2--17-1--17-2--18-1--18-2--19-1--19-2/set", payload: "OFF" }
                    ]
                },
                // 全部場景 群組255
                "0xFF": {
                    "0x01": [  // 全開 各區預設亮度
                        { topic: "homeassistant/light/scene/single/11-1--11-2--12-1--12-2--12-3--12-4/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set/brightness", payload: 60 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/brightness", payload: 50 },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set/colortemp", payload: 250 },
                        { topic: "homeassistant/light/scene/single/11-1--11-2--12-1--12-2--12-3--12-4/set", payload: "ON" },
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set", payload: "ON" },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set", payload: "ON" }
                    ],
                    "0x02": [  // 全關
                        { topic: "homeassistant/light/scene/single/11-1--11-2--12-1--12-2--12-3--12-4/set", payload: "OFF" },
                        { topic: "homeassistant/light/scene/single/13-1--13-2--13-3/set", payload: "OFF" },
                        { topic: "homeassistant/light/scene/dual/14-a--14-b/set", payload: "OFF" }
                    ]
                }
            };

            const commands = SCENE_DEFAULT[sceneId]?.[operation];
            if (commands) {
                for (const cmd of commands) {
                    mqtt_queue.push(cmd);
                }
            }
        }

        global.set("mqtt_queue", mqtt_queue);
        return null;
    }

    case "query": {
        const subType = parts[2];      // light cover
        const moduleId = parseInt(parts[3]);  // 模組 ID
        const channel = parts[4];      // 通道 ID

        node.warn(`received query topic: ${msg.topic}`);
        let frame;
        switch (subType) {
            case "light": {
                node.warn(`query light: ${msg.topic}`);
                // light 讀取線圈或亮度狀態
                const CHANNEL_COIL_MAP = { "1": 0x0000, "2": 0x0001, "3": 0x0002, "4": 0x0003 };
                const addr = CHANNEL_COIL_MAP[channel];
                node.warn(`channel: ${channel}, addr: ${addr}`);
                if (addr === undefined) return null;

                const functionCode = 0x01; // Read Coils
                const quantity = 4;
                const startHi = (addr >> 8) & 0xFF;
                const startLo = addr & 0xFF;
                const quantityHi = (quantity >> 8) & 0xFF;
                const quantityLo = quantity & 0xFF;

                frame = Buffer.from([moduleId, functionCode, startHi, startLo, quantityHi, quantityLo]);
                node.warn(`frame: ${[moduleId, functionCode, startHi, startLo, quantityHi, quantityLo]}`);
                node.warn(`frame:${frame.toString('hex')}`);
                break;
            }
            case "cover": {
                // cover 讀取狀態
                const regHi = 0x01; // 起始寄存器
                const regLo = 0x9B;
                const functionCode = 0x03; // Read Holding Registers
                const quantityHi = 0x00;
                const quantityLo = 0x02; // 讀兩個暫存
                frame = Buffer.from([moduleId, functionCode, regHi, regLo, quantityHi, quantityLo]);
                break;
            }
            default: {
                node.warn(`unknown query subtype: ${subType}`);
                return null;
            }
        }
        const cmdBuffer = generalCommandBuild(frame);

        // 放入 modbus_queue 統一管理發送
        let modbus_queue = global.get("modbus_queue") || [];
        modbus_queue.push({ payload: cmdBuffer, deviceID: moduleId, type: "query", deviceType: "query", subType, channel });
        global.set("modbus_queue", modbus_queue);

        node.status({ fill: "blue", shape: "dot", text: `modbus queue length ${modbus_queue.length}` });
        // 發送觸發訊息給 modbus_queue_processor
        node.send([null, { topic: "trigger_modbus_queue", payload: "process" }]);
        return null;
    }

    default: {
        node.warn(`unknown device type: ${deviceType}`);
        return null;
    }
}
