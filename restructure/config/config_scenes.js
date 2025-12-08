// 情境設備配置生成器
// 支援: 燈光情境群組控制

// ============ 情境設備定義 ============
let scenes = [
    // { id: "scene_single_11-1--11-2", name: "走廊間照" },
    // { id: "scene_single_12-1", name: "泡茶區" },
    // { id: "scene_single_12-2", name: "走道崁燈" },
    // { id: "scene_single_12-3--12-4", name: "展示櫃" },
    // { id: "scene_single_13-1", name: "會議間照" },
    // { id: "scene_single_13-2", name: "冷氣間照" },
    // { id: "scene_single_13-3", name: "會議崁燈" },
    // { id: "scene_single_15-1", name: "客廳前" },
    // { id: "scene_single_15-2", name: "客廳後" },
    // { id: "scene_single_16-1--16-2", name: "走道間照" },
    // { id: "scene_single_17-1--17-2", name: "廚房" },
    // { id: "scene_single_18-1", name: "1F壁燈" },
    // { id: "scene_single_18-2", name: "1F地燈" },
    // { id: "scene_single_19-1", name: "2F壁燈" },
    // { id: "scene_single_19-2", name: "2F地燈" },
    // 場景燈光群組 (用於場景控制)
    // { id: "scene_single_11-1--11-2--12-1--12-2--12-3--12-4", name: "公共區燈組" },
    // { id: "scene_single_13-1--13-2--13-3", name: "會議室燈組" },
    // { id: "scene_dual_14-a--14-b", name: "會議室雙色溫燈組" },
    // { id: "scene_single_15-1--15-2--16-1--17-1--18-1--18-2--19-1--19-2", name: "二樓燈組" },
    // { id: "scene_single_18-1--18-2--19-1--19-2", name: "戶外燈組" },
];

// ============ 配置生成函數 ============
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
            case "rgb": {
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `${prefix}/brightness`;
                basePayload.brightness_command_topic = `${prefix}/set/brightness`;
                basePayload.brightness_scale = 100;
                basePayload.rgb = true;
                basePayload.rgb_state_topic = `${prefix}/rgb`;
                basePayload.rgb_command_topic = `${prefix}/set/rgb`;
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

// ============ 主要執行 ============
let allMessages = generateSceneConfigs(scenes);
return [allMessages];
