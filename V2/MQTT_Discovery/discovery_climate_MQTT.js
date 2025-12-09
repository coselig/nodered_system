// 空調設備配置生成器
// 支援: HVAC 空調控制

// ============ 空調設備定義 ============
let devices = [
    { path: "hitachi/200/1", name: "客廳空調" },
    { path: "hitachi/200/2", name: "會議室空調" },
    { path: "hitachi/200/3", name: "玄關空調" },
    // { path: "hitachi/200/9", name: "辦公室測試" },
];

// ============ 註冊/清除邏輯 ============
let msgs = devices.map(dev => {
    let uid = dev.path.replace(/\//g, "_");
    let topic = `homeassistant/climate/${uid}/config`;
    let payload;

    if (msg.action === "clear") {
        payload = "";
    } else if (msg.action === "add") {
        payload = {
            name: dev.name,
            unique_id: uid,
            modes: ["off", "cool", "heat", "dry", "fan_only", "auto"],
            mode_command_topic: `homeassistant/hvac/${dev.path}/mode/set`,
            mode_state_topic: `homeassistant/hvac/${dev.path}/mode/state`,
            temperature_command_topic: `homeassistant/hvac/${dev.path}/temperature/set`,
            temperature_state_topic: `homeassistant/hvac/${dev.path}/temperature/state`,
            min_temp: 16,
            max_temp: 30,
            temp_step: 1,
            current_temperature_topic: `homeassistant/hvac/${dev.path}/current_temperature`,
            fan_modes: ["auto", "low", "medium", "high"],
            fan_mode_command_topic: `homeassistant/hvac/${dev.path}/fan/set`,
            fan_mode_state_topic: `homeassistant/hvac/${dev.path}/fan/state`,
            retain: true,
            optimistic: true
        };
        payload = JSON.stringify(payload);
    }

    return { topic, payload, retain: true };
});

return [msgs];
