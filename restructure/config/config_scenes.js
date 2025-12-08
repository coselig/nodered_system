// 情境設備配置生成器
// 支援: 燈光(single/dual/wrgb/relay)、窗簾(cover) 情境群組控制

// ============ 情境設備定義 ============
// ID 格式: scene_{deviceType}_{module-channel}--{module-channel}...
// deviceType: single, dual, wrgb, relay, cover
//
// 燈光範例:
//   scene_single_11-1--11-2       單色溫燈群組
//   scene_dual_14-a--14-b         雙色溫燈群組
//   scene_wrgb_2-x--11-x          WRGB燈群組
//   scene_relay_10-1--10-2        Relay開關群組
//
// 窗簾範例:
//   scene_cover_22-oc--23-oc      窗簾群組 (oc = open/close)

let scenes = [
    // === 燈光場景 ===
    // { id: "scene_single_11-1--11-2", name: "走廊間照" },
    // { id: "scene_single_12-1", name: "泡茶區" },
    // { id: "scene_single_12-2", name: "走道崁燈" },
    // { id: "scene_single_12-3--12-4", name: "展示櫃" },
    // { id: "scene_single_13-1--13-2--13-3", name: "會議室燈組" },
    // { id: "scene_dual_14-a--14-b", name: "會議室雙色溫燈組" },
    
    // === WRGB 場景 ===
    // { id: "scene_wrgb_2-x--11-x", name: "WRGB燈組" },
    
    // === Relay 場景 ===
    // { id: "scene_relay_10-1--10-2--10-3", name: "Relay開關組" },
    
    // === 窗簾場景 ===
    // { id: "scene_cover_22-oc--23-oc", name: "窗簾群組" },
];

// ============ 配置生成函數 ============
function generateSceneConfigs(scenes) {
    return scenes.map(scene => {
        let parts = scene.id.split("_");
        // parts[0] = "scene"
        // parts[1] = deviceType (single, dual, wrgb, relay, cover)
        // parts[2] = devices (11-1--11-2)
        let deviceType = parts[1];
        let devices = parts[2];
        
        // 根據設備類型決定 HA 實體類型
        let haEntityType = (deviceType === "cover") ? "cover" : "light";
        let prefix = `homeassistant/${haEntityType}/scene/${deviceType}/${devices}`;
        
        let basePayload = {
            name: scene.name,
            unique_id: scene.id,
            optimistic: true,
            state_topic: `${prefix}/state`,
            command_topic: `${prefix}/set`,
        };
        
        switch(deviceType) {
            case "single": {
                // 單色溫燈: 開關 + 亮度
                basePayload.payload_on = "ON";
                basePayload.payload_off = "OFF";
                basePayload.brightness = true;
                basePayload.brightness_state_topic = `${prefix}/brightness`;
                basePayload.brightness_command_topic = `${prefix}/set/brightness`;
                basePayload.brightness_scale = 100;
                break;
            }
            case "dual": {
                // 雙色溫燈: 開關 + 亮度 + 色溫
                basePayload.payload_on = "ON";
                basePayload.payload_off = "OFF";
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
            case "wrgb": {
                // WRGB燈: 開關 + 亮度 + RGB顏色
                basePayload.payload_on = "ON";
                basePayload.payload_off = "OFF";
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
                // Relay開關: 純開關
                basePayload.payload_on = "ON";
                basePayload.payload_off = "OFF";
                break;
            }
            case "cover": {
                // 窗簾: 開/關/停
                basePayload.payload_open = "OPEN";
                basePayload.payload_close = "CLOSE";
                basePayload.payload_stop = "STOP";
                break;
            }
        }

        return {
            topic: `homeassistant/${haEntityType}/${scene.id}/config`,
            payload: basePayload,
            retain: true
        };
    });
}

// ============ 主要執行 ============
let allMessages = generateSceneConfigs(scenes);
return [allMessages];
