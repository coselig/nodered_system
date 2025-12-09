/**
 * 命名規則：
 * relay_id_channel  → 例如 relay_11_1
 * single_id_channel → 例如 single_11_2
 * dual_id_channel   → 例如 dual_12_a、dual_12_b
 */

let devices = [
    { path: "single/11/1", name: "後嵌燈" },
    { path: "single/11/2", name: "中嵌燈" },
    { path: "single/11/3", name: "前嵌燈" },
    { path: "single/11/4", name: "Logo" },
    { path: "single/12/1", name: "後燈條" },
    { path: "single/12/3", name: "前燈條" },
];

let msgs;

if (msg.action === "clear") {
    // 強制全部清除
    msgs = devices.map(dev => {
        let uid = dev.path.replace(/\//g, "_");
        return {
            topic: `homeassistant/light/${uid}/config`,
            payload: "",
            retain: true
        };
    });
} else if (msg.action === "add") {
    // 原本 add 的流程
    msgs = devices.map(dev => {
        let uid = dev.path.replace(/\//g, "_");
        let topic = `homeassistant/light/${uid}/config`;
        let basePayload = {
            name: dev.name,
            unique_id: uid,
            object_id: uid,
            payload_on: "ON",
            payload_off: "OFF",
            optimistic: true,
            state_topic: `homeassistant/light/${dev.path}/state`,
            command_topic: `homeassistant/light/${dev.path}/set`
        };

        if (dev.path.startsWith("single/")) {
            basePayload.brightness = true;
            basePayload.brightness_state_topic = `homeassistant/light/${dev.path}/brightness`;
            basePayload.brightness_command_topic = `homeassistant/light/${dev.path}/set/brightness`;
            basePayload.brightness_scale = 100;
        } else if (dev.path.startsWith("dual/")) {
            basePayload.brightness = true;
            basePayload.brightness_state_topic = `homeassistant/light/${dev.path}/brightness`;
            basePayload.brightness_command_topic = `homeassistant/light/${dev.path}/set/brightness`;
            basePayload.brightness_scale = 100;
            basePayload.color_temp_state_topic = `homeassistant/light/${dev.path}/colortemp`;
            basePayload.color_temp_command_topic = `homeassistant/light/${dev.path}/set/colortemp`;
            basePayload.min_mireds = 154;  // 6500K
            basePayload.max_mireds = 370;  // 2700K
        }

        return {
            topic,
            payload: JSON.stringify(basePayload),
            retain: true
        };
    });
}

return [msgs];
