// 窗簾/捲簾設備配置生成器
// 支援: 窗簾(curtain), 捲簾, 排煙窗

// ============ 窗簾設備定義 ============
let covers = [
    { path: "curtain/21/1-2-3", name: "鐵捲門" },
    { path: "curtain/22/1-2", name: "會議室捲簾" },
    { path: "curtain/23/1-2", name: "布簾" },
    { path: "curtain/23/3-4", name: "沙簾" },
    { path: "curtain/23/5-6-7", name: "排煙窗" },
];


// ============ 註冊/清除邏輯 ============
let msgs;

if (msg.action === "clear") {
    // 強制全部清除
    msgs = covers.map(cover => {
        let uid = cover.path.replace(/\//g, "_");
        return {
            topic: `homeassistant/cover/${uid}/config`,
            payload: "",
            retain: true
        };
    });
} else if (msg.action === "add") {
    // 新增註冊
    msgs = covers.map(cover => {
        let uid = cover.path.replace(/\//g, "_");
        let part = cover.path.split("/");
        let device_type = part[0];
        let id = part[1];
        let control = (part[2]).split("-");

        let basePayload = {
            name: cover.name,
            unique_id: uid,
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
            topic: `homeassistant/cover/${uid}/config`,
            payload: JSON.stringify(basePayload),
            retain: true
        };
    });
}

return [msgs];
