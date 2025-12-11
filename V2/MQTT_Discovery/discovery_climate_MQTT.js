// 空調設備配置生成器
// 支援: HVAC 空調控制

// ============ 空調設備定義 ============
let devices = msg.devices || [];

// ============ 註冊/清除邏輯 ============
let msgs = devices.map(dev => {
    let path = `${dev.type}/${dev.module_id}/${dev.channel}`;
    let unique_id = `${dev.type}_${dev.module_id}_${dev.channel}`;
    let topic = `homeassistant/climate/${unique_id}/config`;
    let payload;

    if (msg.action === "clear") {
        payload = "";
    } else if (msg.action === "add") {
        payload = {
            name: dev.name,
            unique_id: unique_id,
            modes: ["off", "cool", "heat", "dry", "fan_only", "auto"],
            mode_command_topic: `homeassistant/hvac/${path}/mode/set`,
            mode_state_topic: `homeassistant/hvac/${path}/mode/state`,
            temperature_command_topic: `homeassistant/hvac/${path}/temperature/set`,
            temperature_state_topic: `homeassistant/hvac/${path}/temperature/state`,
            min_temp: 16,
            max_temp: 30,
            temp_step: 1,
            current_temperature_topic: `homeassistant/hvac/${path}/current_temperature`,
            fan_modes: ["auto", "low", "medium", "high"],
            fan_mode_command_topic: `homeassistant/hvac/${path}/fan/set`,
            fan_mode_state_topic: `homeassistant/hvac/${path}/fan/state`,
            retain: true,
            optimistic: true
        };
        payload = JSON.stringify(payload);
    }

    return { topic, payload };
});

return [msgs];
