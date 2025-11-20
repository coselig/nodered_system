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

function getBrightness(device_sub_type, id, chanel, state) {
    let brightness = flow.get(`${device_sub_type}_${id}_${chanel}_brightness`);
    if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
    // 限制亮度範圍
    brightness = (state === "ON") ? clamp(Math.round(brightness), 0, 100) : 0x00;
    return brightness;
}

// ===================== 主流程 =====================
const parts = String(msg.topic || "").split("/");
const device_type = parts[1];
const device_sub_type = parts[2];// 光的類型 single, dual, relay
const id = parseInt(parts[3]);// 模組id
const chanel = parts[4];//通道 id
switch (device_type) {
    case "light": {
        switch (device_sub_type) {
            case "relay": {
                const CHANNEL_COIL_MAP = {
                    "1": 0x0000,
                    "2": 0x0001,
                    "3": 0x0002,
                    "4": 0x0003,
                };
                const addr = CHANNEL_COIL_MAP[chanel];
                if (addr === undefined) return null;

                // Coil 寫入值 (ON = 0xFF00, OFF = 0x0000)
                const valHi = (msg.payload === "ON") ? 0xFF : 0x00;
                const valLo = 0x00;

                // 高低位位址
                const hi = (addr >> 8) & 0xFF;
                const lo = addr & 0xFF;

                // 組 Modbus 指令 (0x05 = Write Single Coil)
                const frame = Buffer.from([id, 0x05, hi, lo, valHi, valLo]);

                msg.payload = generalCommandBuild(frame);
                node.send(msg);
                return null;
            }
            case "single": {
                // 狀態 (ON / OFF)
                let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";

                let brightness = getBrightness(device_sub_type, id, chanel, state);
                // 取得對應寄存器
                const reg = CHANNEL_REGISTER_MAP[chanel];
                if (!reg) return null;
                // 高低位元組
                const hi = (reg >> 8) & 0xFF;
                const lo = reg & 0xFF;
                // 組 Modbus 指令
                const cmd = Buffer.from([id, 0x06, hi, lo, BRIGHTNESS_TIME, brightness]);
                msg.payload = generalCommandBuild(cmd);
                node.send(msg);
                return null;
            }
            case "dual": {
                const regs = CHANNEL_REGISTER_MAP[chanel];
                if (!regs) return null;

                let state = (msg.payload === "ON" || msg.payload === true) ? "ON" : "OFF";
                const brKey = `${device_sub_type}_${id}_${chanel}_brightness`;
                const ctKey = `${device_sub_type}_${id}_${chanel}_colortemp`;

                let brightness = flow.get(brKey);
                if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
                brightness = clamp(Math.round(brightness), 0, 100);

                let colortemp = flow.get(ctKey);
                if (typeof colortemp !== "number") colortemp = DEFAULT_COLORTEMP;
                colortemp = clamp(Math.round(colortemp), MIN_MIRED, MAX_MIRED);
                const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);
                function buildCommand(id, reg, value, speed = 0x05) {
                    const hi = (reg >> 8) & 0xFF;
                    const lo = reg & 0xFF;
                    const cmd = Buffer.from([id, 0x06, hi, lo, speed, value]);
                    return generalCommandBuild(cmd);
                }
                const brValue = (state === "ON") ? brightness : 0;
                const cmdBrightness = buildCommand(id, regs[0], brValue);
                const cmdColortemp = buildCommand(id, regs[1], ctPercent);
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
                        let groupBrightness = flow.get(`${device_sub_type}_${parts[3]}_${parts[4]}_brightness`);
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
                `unknown device:${device_sub_type}`
                return null;
            }
        }
    }
    case "cover": {
        /*
        格式:
        要開的_要開的/要關的_要關的_要關的
        */
        // let mqtt_queue = global.get("mqtt_queue");

        // function sendState(id, chanel, state) {
        //     mqtt_queue.push({
        //         topic: `homeassistant/light/relay/${id}/${chanel}/state`,
        //         payload: state
        //     });
        // }

        let relays = msg.payload.split("/");
        let on_relays = relays[0] ? relays[0].split("_").map(Number) : [];
        let off_relays = (relays[1] && relays[1].length > 0) ? relays[1].split("_").map(Number) : [];

        // 計算 bit mask
        let output = 0x00;

        // 打開 on_relays
        for (let relay of on_relays) {
            output |= (1 << (relay - 1));  // relay 1 -> bit 0
        }

        // 清除 off_relays 對應的 bit
        for (let relay of off_relays) {
            output &= ~(1 << (relay - 1)); // relay 2 -> bit 1 置0
        }
        const frame = Buffer.from([id, 0x06, 0x01, 0x9b, 0x10, output]);
        msg.payload = generalCommandBuild(frame);
        node.send(msg);
        return null;
    }
    case "hvac": {
        const s200_id = parseInt(parts[2]);
        const hvacAction = parts[4];
        const id = parseInt(parts[3]);  // 裝置的 modbus id
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
                register = baseAddress + id * 8 + 1;
                value = modeMap[payload];
                break;

            case "fan":
                register = baseAddress + id * 8 + 2;
                value = fanModeMap[payload];
                break;

            case "temperature":
                register = baseAddress + id * 8 + 3;
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

        // id, 0x06, regHi, regLo, speed, value
        const frame = Buffer.from([
            s200_id,
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
    case "query": {
        node.warn(`received topic:${msg.topic}`);

        let frame;
        switch (device_sub_type) {
            case "light": {
                node.warn(`in light:${msg.topic}`);
                // light 讀取線圈/亮度狀態
                const CHANNEL_COIL_MAP = { "1": 0x0000, "2": 0x0001, "3": 0x0002, "4": 0x0003 };
                const addr = CHANNEL_COIL_MAP[chanel];
                node.warn(`chanel: ${chanel}, addr: ${addr}`);
                if (addr === undefined) return null;

                const functionCode = 0x01; // Read Coils
                const quantity = 4;
                const startHi = (addr >> 8) & 0xFF;
                const startLo = addr & 0xFF;
                const quantityHi = (quantity >> 8) & 0xFF;
                const quantityLo = quantity & 0xFF;

                frame = Buffer.from([id, functionCode, startHi, startLo, quantityHi, quantityLo]);
                node.warn(`frame:${[id, functionCode, startHi, startLo, quantityHi, quantityLo]}`);
                node.warn(`frame:${frame.toString('hex')}`);
                break;
            }
            case "cover": {
                // cover 讀取狀態 (假設也是線圈或寄存器)
                const regHi = 0x01; // 假設起始寄存器
                const regLo = 0x9B;
                const functionCode = 0x03; // Read Holding Registers
                const quantityHi = 0x00;
                const quantityLo = 0x02; // 讀兩個暫存
                frame = Buffer.from([id, functionCode, regHi, regLo, quantityHi, quantityLo]);
                break;
            }
            default: {
                node.warn(`unknown query device_type: ${device_sub_type}`);
                return null;
            }
        }
        const cmdBuffer = generalCommandBuild(frame);


        // 放入 mqtt_queue
        let mqtt_queue = global.get("mqtt_queue") || [];
        mqtt_queue.push({ payload: cmdBuffer, deviceID: id, type: "query", device_type, device_sub_type, chanel });
        global.set("mqtt_queue", mqtt_queue);

        node.status({ fill: "blue", shape: "dot", text: `queue length ${mqtt_queue.length}` });
        return null;
    }
    default: {
        node.warn(`unknown device:${device_type}`);
        return null;
    }
}