// 空調設備配置生成器
// 支援: HVAC 空調控制

// ============ 空調設備定義 ============
let climates = [
    { id: "200-1", name: "客廳空調" },
    { id: "200-2", name: "會議室空調" },
    { id: "200-3", name: "玄關空調" },
    { id: "200-9", name: "辦公室測試" }
];

// ============ 配置生成函數 ============
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
let allMessages = generateClimateConfigs(climates);
return [allMessages];
