// 窗簾/捲簾設備配置生成器
// 支援: 窗簾(curtain), 捲簾, 排煙窗

// ============ 窗簾設備定義 ============
let devices = msg.devices[
    { type: "cover", module_id: 21, channel: "1-2-3", name: "鐵捲門" },
    { type: "cover", module_id: 22, channel: "1-2", name: "會議室捲簾" },
    { type: "cover", module_id: 23, channel: "1-2", name: "布簾" },
    { type: "cover", module_id: 23, channel: "3-4", name: "沙簾" },
    { type: "cover", module_id: 23, channel: "5-6-7", name: "排煙窗" }
];


// ============ 註冊/清除邏輯 ============

let msgs;

if (msg.action === "clear") {
    let msgs = devices.map(dev => {
        let path = `${dev.type}/${dev.module_id}/${dev.channel}`;
        let unique_id = `${dev.type}_${dev.module_id}_${dev.channel}`;
        let topic = `homeassistant/cover/${unique_id}/config`;
        let payload;
    });
} else if (msg.action === "add") {
    payload = {
        name: dev.name,
        unique_id: unique_id,
        retain: true,
        optimistic: true
    };

    switch (dev.channel.split("-").length) {
        case 2: {
            payload.command_topic = `homeassistant/cover/${dev.type}/${dev.module_id}/${dev.channel}/oc/set`;
            break;
        }
        case 3: {
            payload.command_topic = `homeassistant/cover/${dev.type}/${dev.module_id}/${dev.channel}/ocs/set`;
            break;
        }
        default: {
            node.warn("Unknown type of curtain");
            break;
        }
    }
}

if (msg.action === "clear") {
    // 強制全部清除
    msgs = devices.map(cover => {
        let uid = cover.path.replace(/\//g, "_");
        return {
            topic: `homeassistant/cover/${uid}/config`,
            payload: "",
            retain: true
        };
    });
} else if (msg.action === "add") {
    // 新增註冊
    msgs = devices.map(cover => {
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
