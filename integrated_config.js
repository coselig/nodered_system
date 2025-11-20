// 整合的 Home Assistant MQTT 配置生成器
// 支援: Lights (單色/雙色), Scenes, Covers (窗簾/捲簾), Climate (空調)

// ============ 設備定義 ============

// 1. 燈光設備
let lights = [
    // 盤A
    { id: "single_11_1", name: "single-11-1" },
    { id: "single_11_2", name: "single-11-2" },
    { id: "single_12_1", name: "single-12-1" },
    { id: "single_12_2", name: "single-12-2" },
    { id: "single_12_3", name: "single-12-3" },
    { id: "single_12_4", name: "single-12-4" },
    { id: "single_13_1", name: "single-13-1" },
    { id: "single_13_2", name: "single-13-2" },
    { id: "single_13_3", name: "single-13-3" },
    { id: "single_13_4", name: "single-13-4" },
    { id: "dual_14_a", name: "dual-14-a" },
    { id: "dual_14_b", name: "dual-14-b" },
    // 盤B
    { id: "single_15_1", name: "single-15-1" },
    { id: "single_15_2", name: "single-15-2" },
    { id: "single_16_1", name: "single-16-1" },
    { id: "single_16_2", name: "single-16-2" },
    { id: "single_17_1", name: "single-17-1" },
    { id: "single_17_2", name: "single-17-2" },
    { id: "single_18_1", name: "single-18-1" },
    { id: "single_18_2", name: "single-18-2" },
    { id: "single_19_1", name: "single-19-1" },
    { id: "single_19_2", name: "single-19-2" },
];

// 2. 情境設備
let scenes = [
    { id: "scene_single_11-1--11-2", name: "走廊間照" },
    { id: "scene_single_12-1", name: "泡茶區" },
    { id: "scene_single_12-2", name: "走道崁燈" },
    { id: "scene_single_12-3--12-4", name: "展示櫃" },
    { id: "scene_single_13-1", name: "會議間照" },
    { id: "scene_single_13-2", name: "冷氣間照" },
    { id: "scene_single_13-3", name: "會議崁燈" },
    { id: "scene_single_15-1", name: "客廳前" },
    { id: "scene_single_15-2", name: "客廳後" },
    { id: "scene_single_16-1--16-2", name: "走道間照" },
    { id: "scene_single_17-1--17-2", name: "廚房" },
    { id: "scene_single_18-1", name: "1F壁燈" },
    { id: "scene_single_18-2", name: "1F地燈" },
    { id: "scene_single_19-1", name: "2F壁燈" },
    { id: "scene_single_19-2", name: "2F地燈" },
    // 場景燈光群組 (用於場景控制)
    { id: "scene_single_11-1--11-2--12-1--12-2--12-3--12-4", name: "公共區燈組" },
    { id: "scene_single_13-1--13-2--13-3", name: "會議室燈組" },
    { id: "scene_dual_14-a--14-b", name: "會議室雙色溫燈組" },
    { id: "scene_single_15-1--15-2--16-1--17-1", name: "二樓燈組" },
    { id: "scene_single_18-1--18-2--19-1--19-2", name: "戶外燈組" },
];

// 3. 窗簾/捲簾設備
let covers = [
    { id: "curtain_21_1-2-3", name: "鐵捲門" },
    { id: "curtain_22_1-2", name: "會議室捲簾" },
    { id: "curtain_23_1-2", name: "布簾" },
    { id: "curtain_23_3-4", name: "沙簾" },
    { id: "curtain_23_5-6-7", name: "排煙窗" },
];

// 4. 空調設備
let climates = [
    { id: "200-1", name: "客廳空調" },
    { id: "200-2", name: "會議室空調" },
    { id: "200-3", name: "玄關空調" },
    { id: "200-9", name: "辦公室測試" }
];

// ============ 配置生成函數 ============

// 生成燈光配置
function generateLightConfigs(lights) {
    return lights.map(light => {
        let parts = light.id.split("_");
        let basePayload = {
            name: light.name,
            unique_id: light.id,
            payload_on: "ON",
            payload_off: "OFF",
            optimistic: true,
            state_topic: `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/state`,
            command_topic: `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/set`,
        };
        
        switch(parts[0]) {
            case "single": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/brightness`;
                basePayload.brightness_command_topic = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/set/brightness`;
                basePayload.brightness_scale = 100;
                break;
            }
            case "dual": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/brightness`;
                basePayload.brightness_command_topic = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/set/brightness`;
                basePayload.brightness_scale = 100;
                basePayload.color_temp_state_topic = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/colortemp`;
                basePayload.color_temp_command_topic = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}/set/colortemp`;
                basePayload.min_mireds = 154; // 6500K
                basePayload.max_mireds = 370; // 2700K
                break;
            }
            case "relay": {
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

// 生成情境配置
function generateSceneConfigs(scenes) {
    return scenes.map(scene => {
        let parts = scene.id.split("_");
        let prefix = `homeassistant/light/${parts[0]}/${parts[1]}/${parts[2]}`;
        let basePayload = {
            name: scene.name,
            unique_id: scene.id,
            payload_on: "ON",
            payload_off: "OFF",
            optimistic: true,
            state_topic: `${prefix}/state`,
            command_topic: `${prefix}/set`,
        };
        
        switch(parts[1]) {
            case "single": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `${prefix}/brightness`;
                basePayload.brightness_command_topic = `${prefix}/set/brightness`;
                basePayload.brightness_scale = 100;
                break;
            }
            case "dual": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `${prefix}/brightness`;
                basePayload.brightness_command_topic = `${prefix}/set/brightness`;
                basePayload.brightness_scale = 100;
                basePayload.color_temp_state_topic = `${prefix}/colortemp`;
                basePayload.color_temp_command_topic = `${prefix}/set/colortemp`;
                basePayload.min_mireds = 154; // 6500K
                basePayload.max_mireds = 370; // 2700K
                break;
            }
            case "relay": {
                break;
            }
        }

        return {
            topic: `homeassistant/light/${scene.id}/config`,
            payload: basePayload,
            retain: true
        };
    });
}

// 生成窗簾配置
function generateCoverConfigs(covers) {
    return covers.map(cover => {
        let part = cover.id.split("_");
        let device_type = part[0];
        let id = part[1];
        let control = (part[2]).split("-");

        let basePayload = {
            name: cover.name,
            unique_id: cover.id,
            optimistic: true,
            retain: true
        };

        let operation_type;
        switch (control.length) {
            case 2: {
                operation_type = "oc";
                basePayload.payload_open = `${control[0]}/${control[1]}`;
                basePayload.payload_close = `${control[1]}/${control[0]}`;
                basePayload.payload_stop = `${control[0]}_${control[1]}/`;
                break;
            }
            case 3: {
                operation_type = "ocs";
                basePayload.payload_open = `${control[0]}/${control[1]}_${control[2]}`;
                basePayload.payload_close = `${control[1]}/${control[0]}_${control[2]}`;
                basePayload.payload_stop = `${control[2]}/${control[0]}_${control[1]}`;
                break;
            }
            default: {
                node.warn("Unknown type of curtain");
                break;
            }
        }
        
        basePayload.command_topic = `homeassistant/cover/${device_type}/${id}/${operation_type}/set`;
        basePayload.state_topic = `homeassistant/cover/${device_type}/${id}/${operation_type}/state`;

        return {
            topic: `homeassistant/cover/${cover.id}/config`,
            payload: basePayload,
            retain: true
        };
    });
}

// 生成空調配置
function generateClimateConfigs(climates) {
    let ui_name = "climate";
    let topic_name = "hvac";

    return climates.map(ac => {
        const parts = ac.id.split("-");
        const s200_id = parts[0];
        const id = parts[1];
        const prefix = `homeassistant/${topic_name}/${s200_id}/${id}`;

        const base = {
            name: ac.name,
            unique_id: ac.id,
            optimistic: true,
            modes: ["off", "cool", "heat", "dry", "fan_only", "auto"],
            mode_command_topic: `${prefix}/mode/set`,
            mode_state_topic: `${prefix}/mode/state`,
            temperature_command_topic: `${prefix}/temperature/set`,
            temperature_state_topic: `${prefix}/temperature/state`,
            min_temp: 16,
            max_temp: 30,
            temp_step: 1,
            current_temperature_topic: `${prefix}/current_temperature`,
            fan_modes: ["auto", "low", "medium", "high"],
            fan_mode_command_topic: `${prefix}/fan/set`,
            fan_mode_state_topic: `${prefix}/fan/state`,
            retain: true,
        };

        return {
            topic: `homeassistant/${ui_name}/${ac.id}/config`,
            payload: base,
            retain: true
        };
    });
}

// ============ 主要執行 ============

// 生成所有配置
let allMessages = [
    ...generateLightConfigs(lights),
    ...generateSceneConfigs(scenes),
    ...generateCoverConfigs(covers),
    ...generateClimateConfigs(climates)
];

// 返回所有訊息
return [allMessages];
