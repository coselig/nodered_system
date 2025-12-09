// 窗簾/捲簾設備配置生成器
// 支援: 窗簾(curtain), 捲簾, 排煙窗

// ============ 窗簾設備定義 ============
let covers = [
    { id: "curtain_21_1-2-3", name: "鐵捲門" },
    { id: "curtain_22_1-2", name: "會議室捲簾" },
    { id: "curtain_23_1-2", name: "布簾" },
    { id: "curtain_23_3-4", name: "沙簾" },
    { id: "curtain_23_5-6-7", name: "排煙窗" },
];

// ============ 配置生成函數 ============
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

// ============ 主要執行 ============
let allMessages = generateCoverConfigs(covers);
return [allMessages];
