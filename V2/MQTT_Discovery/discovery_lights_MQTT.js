let devices = msg.devices || [];

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
