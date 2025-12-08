// 燈光設備配置生成器
// 支援: 單色(single), 雙色溫(dual), WRGB, RGB, Relay

// ============ 燈光設備定義 ============
let lights = [
    // 盤A
    { id: "single_11_1", name: "走廊間照" },
    { id: "single_12_1", name: "泡茶區" },
    { id: "single_12_2", name: "走道崁燈/地間照" },
    { id: "single_12_3", name: "展示櫃" },
    { id: "single_13_1", name: "會議間照" },
    { id: "single_13_2", name: "冷氣間照" },
    { id: "single_13_3", name: "會議崁燈" },
    { id: "dual_14_a", name: "軌道燈" },
    { id: "dual_14_b", name: "吊燈" },
    // 盤B
    { id: "single_15_1", name: "客廳前" },
    { id: "single_15_2", name: "客廳後" },
    { id: "single_16_2", name: "走道間照" },
    { id: "single_17_1", name: "廚房" },
    { id: "single_18_1", name: "1F地燈" },
    { id: "single_18_2", name: "1F壁燈" },
    { id: "single_19_1", name: "2F壁燈" },
    { id: "single_19_2", name: "2F地燈" },
    // WRGB 燈光 (含白光通道)
    { id: "wrgb_2_x", name: "WRGB燈-2" },
    { id: "wrgb_11_x", name: "WRGB燈-11" },
    // RGB 燈光 (純RGB，無白光通道)
    { id: "rgb_11_x", name: "RGB燈-11" },
];

// ============ 配置生成函數 ============
function generateLightConfigs(lights) {
    return lights.map(light => {
        let parts = light.id.split("_");
        let lightType = parts[0]; // single, dual, relay, rgb
        let moduleId = parts[1];
        let channel = parts[2];
        
        let basePayload = {
            name: light.name,
            unique_id: light.id,
            payload_on: "ON",
            payload_off: "OFF",
            optimistic: true,
            state_topic: `homeassistant/light/${lightType}/${moduleId}/${channel}/state`,
            command_topic: `homeassistant/light/${lightType}/${moduleId}/${channel}/set`,
        };
        
        switch(lightType) {
            case "single": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/brightness`;
                basePayload.brightness_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/brightness`;
                basePayload.brightness_scale = 100;
                break;
            }
            case "dual": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/brightness`;
                basePayload.brightness_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/brightness`;
                basePayload.brightness_scale = 100;
                basePayload.color_temp_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/colortemp`;
                basePayload.color_temp_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/colortemp`;
                basePayload.min_mireds = 154; // 6500K
                basePayload.max_mireds = 370; // 2700K
                break;
            }
            case "wrgb": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/brightness`;
                basePayload.brightness_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/brightness`;
                basePayload.brightness_scale = 100;
                basePayload.rgb = true;
                basePayload.rgb_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/rgb`;
                basePayload.rgb_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/rgb`;
                break;
            }
            case "rgb": {
                // RGB 燈光 (純RGB，無白光通道)
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/brightness`;
                basePayload.brightness_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/brightness`;
                basePayload.brightness_scale = 100;
                basePayload.rgb = true;
                basePayload.rgb_state_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/rgb`;
                basePayload.rgb_command_topic = `homeassistant/light/${lightType}/${moduleId}/${channel}/set/rgb`;
                break;
            }
            case "relay": {
                // Relay 只需開關，沒有亮度
                break;
            }
        }

        return {
            topic: `homeassistant/light/${light.id}/config`,
            payload: basePayload,
            retain: true
        };
    });
}

// ============ 主要執行 ============
let allMessages = generateLightConfigs(lights);
return [allMessages];
