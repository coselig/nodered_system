/**
 * 命名規則：
 * type: single、dual、wrgb、rgb、relay
 * module_id: Modbus Slave ID (十進位字串)
 * channel:
 * - single: 1、2、3...
 * - dual: a、b
 * - wrgb/rgb: x
 * - relay: 1、2、3...
 * 註冊範例:
 * { type: "single", module_id: "11", channel: "1", name: "走廊間照" }
 * { type: "dual", module_id: "14", channel: "a", name: "軌道燈" }
 * { type: "wrgb", module_id: "2", channel: "x", name: "WRGB燈-2" }
 * { type: "rgb", module_id: "11", channel: "x", name: "RGB燈-11" }
 * { type: "relay", module_id: "21", channel: "1", name: "繼電器-1" }
 */

let devices = [
    // 盤A
    { type: "single", module_id: "11", channel: "1", name: "走廊間照" },
    { type: "single", module_id: "12", channel: "1", name: "泡茶區" },
    { type: "single", module_id: "12", channel: "2", name: "走道崁燈/地間照" },
    { type: "single", module_id: "12", channel: "3", name: "展示櫃" },
    { type: "single", module_id: "13", channel: "1", name: "會議間照" },
    { type: "single", module_id: "13", channel: "2", name: "冷氣間照" },
    { type: "single", module_id: "13", channel: "3", name: "會議崁燈" },
    { type: "dual", module_id: "14", channel: "a", name: "軌道燈" },
    { type: "dual", module_id: "14", channel: "b", name: "吊燈" },
    // 盤B
    { type: "single", module_id: "15", channel: "1", name: "客廳前" },
    { type: "single", module_id: "15", channel: "2", name: "客廳後" },
    { type: "single", module_id: "16", channel: "1", name: "走道間照" },
    { type: "single", module_id: "17", channel: "1", name: "廚房" },
    { type: "single", module_id: "18", channel: "1", name: "1F地燈" },
    { type: "single", module_id: "18", channel: "2", name: "1F壁燈" },
    { type: "single", module_id: "19", channel: "1", name: "2F壁燈" },
    { type: "single", module_id: "19", channel: "2", name: "2F地燈" },
    // WRGB
    { type: "wrgb", module_id: "2", channel: "x", name: "WRGB燈-2" },
    { type: "wrgb", module_id: "11", channel: "x", name: "WRGB燈-11" },
    // RGB
    { type: "rgb", module_id: "11", channel: "x", name: "RGB燈-11" },
];

const LIGHT_TYPE_MAPPING = {
    single: {
        brightness: true,
        brightness_scale: 100,
        getExtra: (path) => ({
            brightness_state_topic: `homeassistant/light/${path}/brightness`,
            brightness_command_topic: `homeassistant/light/${path}/set/brightness`
        })
    },
    dual: {
        brightness: true,
        brightness_scale: 100,
        min_mireds: 154,
        max_mireds: 370,
        getExtra: (path) => ({
            brightness_state_topic: `homeassistant/light/${path}/brightness`,
            brightness_command_topic: `homeassistant/light/${path}/set/brightness`,
            color_temp_state_topic: `homeassistant/light/${path}/colortemp`,
            color_temp_command_topic: `homeassistant/light/${path}/set/colortemp`
        })
    },
    wrgb: {
        brightness: true,
        brightness_scale: 100,
        rgb: true,
        getExtra: (path) => ({
            brightness_state_topic: `homeassistant/light/${path}/brightness`,
            brightness_command_topic: `homeassistant/light/${path}/set/brightness`,
            rgb_state_topic: `homeassistant/light/${path}/rgb`,
            rgb_command_topic: `homeassistant/light/${path}/set/rgb`
        })
    },
    rgb: {
        brightness: true,
        brightness_scale: 100,
        rgb: true,
        getExtra: (path) => ({
            brightness_state_topic: `homeassistant/light/${path}/brightness`,
            brightness_command_topic: `homeassistant/light/${path}/set/brightness`,
            rgb_state_topic: `homeassistant/light/${path}/rgb`,
            rgb_command_topic: `homeassistant/light/${path}/set/rgb`
        })
    }
};

let msgs;

if (msg.action === "clear") {
    // 強制全部清除
    msgs = devices.map(dev => {
        let path = `${dev.type}/${dev.module_id}/${dev.channel}`;
        let uid = path.replaceAll("/", "_");
        return {
            topic: `homeassistant/light/${uid}/config`,
            payload: "",
            retain: false,
        };
    });
} else if (msg.action === "add") {
    // 原本 add 的流程
    msgs = devices.map(dev => {
        let path = `${dev.type}/${dev.module_id}/${dev.channel}`;
        let uid = path.replaceAll("/", "_");
        let topic = `homeassistant/light/${uid}/config`;
        let typeConfig = LIGHT_TYPE_MAPPING[dev.type] || {};
        let basePayload = Object.assign({
            name: dev.name,
            unique_id: uid,
            object_id: uid,
            payload_on: "ON",
            payload_off: "OFF",
            optimistic: true,
            state_topic: `homeassistant/light/${path}/state`,
            command_topic: `homeassistant/light/${path}/set`
        }, typeConfig, typeConfig.getExtra ? typeConfig.getExtra(path) : {});
        delete basePayload.getExtra;
        return {
            topic,
            payload: JSON.stringify(basePayload),
            retain: false
        };
    });
}

return [msgs];
