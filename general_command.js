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

// CRC
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

// 主流程
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // light cover hvac memory scene query

// 處理 flow 快取更新 homeassistant/device_type/subType/id/channel/set/attribute
// 範例 homeassistant/light/single/13/1/set/brightness
if (parts[5] === "set" && parts.length >= 7) {
    const subType = parts[2];
    const moduleId = parts[3];
    const channel = parts[4];
    const attribute = parts[6];  // brightness colortemp 等

    const key = `${subType}_${moduleId}_${channel}_${attribute}`;
    const val = Number(msg.payload);

    if (!isNaN(val)) {
        flow.set(key, val);
        node.status({ fill: "green", shape: "ring", text: `${key} = ${val}` });
    }
    return null;
}

switch (deviceType) {
    case "light": {
        const subType = parts[2];      // single, dual, relay, scene
        const moduleId = parseInt(parts[3]);  // 模組 ID
        const channel = parts[4];      // 通道 ID

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

                msg.payload = generalCommandBuild(frame);
                node.send(msg);
                return null;
            }
            case "single": {
                // 狀態 ON 或 OFF
                let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

                let brightness = getBrightness(subType, moduleId, channel, state);
                // 取得對應寄存器
                const reg = CHANNEL_REGISTER_MAP[channel];
                if (!reg) return null;
                // 高低位元組
                const hi = (reg >> 8) & 0xFF;
                const lo = reg & 0xFF;
                // 組 Modbus 指令
                const cmd = Buffer.from([moduleId, 0x06, hi, lo, BRIGHTNESS_TIME, brightness]);
                msg.payload = generalCommandBuild(cmd);
                node.send(msg);
                return null;
            }
            case "dual": {
                const regs = CHANNEL_REGISTER_MAP[channel];
                if (!regs) return null;

                let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
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
                node.send({ payload: cmdBrightness });
                node.send({ payload: cmdColortemp });

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
                        for (let i = 0; i < lights.length; i++) {
                            let light_id = lights[i].split("-")[0];
                            let light_chanel = lights[i].split("-")[1];

                            let stateMsg = { ...msg };
                            stateMsg.topic = `homeassistant/light/${parts[3]}/${light_id}/${light_chanel}/state`;
                            mqtt_queue.push(stateMsg);

                            let brightnessMsg = { ...msg };
                            brightnessMsg.topic = `homeassistant/light/${parts[3]}/${light_id}/${light_chanel}/set/brightness`;
                            brightnessMsg.payload = groupBrightness;
                            mqtt_queue.push(brightnessMsg);

                            let brightnessStateMsg = { ...msg };
                            brightnessStateMsg.topic = `homeassistant/light/${parts[3]}/${light_id}/${light_chanel}/brightness`;
                            brightnessStateMsg.payload = groupBrightness;
                            mqtt_queue.push(brightnessStateMsg);

                            let setMsg = { ...msg };
                            setMsg.topic = `homeassistant/light/${parts[3]}/${light_id}/${light_chanel}/set`;
                            mqtt_queue.push(setMsg);
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
        node.send(msg);
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
        node.send(msg);
        return null;
    }
    case "memory": {
        // 記憶儲存處理
        // 主題格式 homeassistant/memory/sceneId/operation/save/set
        const sceneId = parts[2];      // 0x02 0x03 0xFF
        const operation = parts[3];    // 0x01 0x02 0x03 0x04
        const action = parts[4];       // save

        if (action === "save") {
            // 儲存到 global context
            const memoryKey = `homeassistant/memory/${sceneId}/${operation}`;
            const memoryData = JSON.parse(msg.payload);

            global.set(memoryKey, memoryData);

            // 發送確認通知
            let mqtt_queue = global.get("mqtt_queue") || [];
            mqtt_queue.push({
                topic: `homeassistant/memory/${sceneId}/${operation}/saved`,
                payload: JSON.stringify({ status: "saved", timestamp: new Date().toISOString() })
            });
            global.set("mqtt_queue", mqtt_queue);

            node.warn(`記憶已儲存: ${memoryKey}`);
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
            node.warn(`執行記憶場景: ${memoryKey}`);

            // 從 memoryData 解析並發送到 mqtt_queue
            // 這裡需要根據儲存的格式來解析
            // 假設 memoryData.devices 是設備列表
            for (const deviceTopic of memoryData.devices) {
                // 發送場景觸發到各設備
                mqtt_queue.push({
                    topic: `${deviceTopic}/set`,
                    payload: "ON"
                });
            }
        } else {
            // 使用預設場景配置
            node.warn(`執行預設場景: ${sceneId}/${operation}`);

            const SCENE_DEFAULT = {
                "0x02": {
                    "0x01": ["homeassistant/light/single/13/1", "homeassistant/light/single/13/2", "homeassistant/light/single/13/3", "homeassistant/light/dual/14/a", "homeassistant/light/dual/14/b"],
                    "0x02": ["homeassistant/light/single/13/1", "homeassistant/light/single/13/2", "homeassistant/light/single/13/3", "homeassistant/light/dual/14/a", "homeassistant/light/dual/14/b"]
                },
                "0x03": {
                    "0x01": ["homeassistant/light/single/11/1", "homeassistant/light/single/12/1", "homeassistant/light/single/12/2", "homeassistant/light/single/12/3"],
                    "0x02": ["homeassistant/light/single/11/1", "homeassistant/light/single/12/1", "homeassistant/light/single/12/2", "homeassistant/light/single/12/3"]
                },
                "0xFF": {
                    "0x01": ["homeassistant/light/single/11/1", "homeassistant/light/single/12/1", "homeassistant/light/single/12/2", "homeassistant/light/single/12/3", "homeassistant/light/single/13/1", "homeassistant/light/single/13/2", "homeassistant/light/single/13/3", "homeassistant/light/dual/14/a", "homeassistant/light/dual/14/b"],
                    "0x02": ["homeassistant/light/single/11/1", "homeassistant/light/single/12/1", "homeassistant/light/single/12/2", "homeassistant/light/single/12/3", "homeassistant/light/single/13/1", "homeassistant/light/single/13/2", "homeassistant/light/single/13/3", "homeassistant/light/dual/14/a", "homeassistant/light/dual/14/b"]
                }
            };

            const devices = SCENE_DEFAULT[sceneId]?.[operation];
            if (devices) {
                const state = operation === "0x02" ? "OFF" : "ON";
                for (const deviceTopic of devices) {
                    mqtt_queue.push({
                        topic: `${deviceTopic}/set`,
                        payload: state
                    });
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


        // 放入 mqtt_queue
        let mqtt_queue = global.get("mqtt_queue") || [];
        mqtt_queue.push({ payload: cmdBuffer, deviceID: moduleId, type: "query", deviceType: "query", subType, channel });
        global.set("mqtt_queue", mqtt_queue);

        node.status({ fill: "blue", shape: "dot", text: `queue length ${mqtt_queue.length}` });
        return null;
    }
    default: {
        node.warn(`unknown device type: ${deviceType}`);
        return null;
    }
}