/**
 * 通用資料debug - 調試工具函數
 * 提供清空和顯示快取及佇列的功能
 */

switch (msg.command) {
    case "clear_flow_cache": {
        const keys = flow.keys();
        keys.forEach(k => flow.set(k, undefined));
        node.warn(`Flow context cleared: ${keys.length} keys removed.`);
        return;
    }
    case "show_flow_cache": {
        const keys = flow.keys();
        keys.forEach(k => {
            node.warn(`${k}:${flow.get(k)}`);
        });
        return;
    }
    case "clear_mqtt_queue":{
        let queue = global.get("mqtt_queue") || [];
        node.warn(`clear mqtt_queue of ${queue.length} data`);
        global.set("mqtt_queue",[]);
        return;
    }
    case "show_mqtt_queue": {
        let queue = global.get("mqtt_queue") || [];
        queue.forEach((item, index) => {
            node.warn(`第 ${index + 1} 筆: ${JSON.stringify(item)}`);
        });
        return;
    }
    case "show_modbus_queue": {
        let queue = global.get("modbus_queue") || [];
        node.warn(`modbus_queue 共有 ${queue.length} 筆資料`);
        queue.forEach((item, index) => {
            if (item.payload && Buffer.isBuffer(item.payload)) {
                node.warn(`第 ${index + 1} 筆: Buffer ${item.payload.toString('hex')}`);
            } else {
                node.warn(`第 ${index + 1} 筆: ${JSON.stringify(item)}`);
            }
        });
        return;
    }
    case "clear_modbus_queue": {
        let queue = global.get("modbus_queue") || [];
        node.warn(`clear modbus_queue of ${queue.length} data`);
        global.set("modbus_queue", []);
        return;
    }
    default: {
        node.error("Unknown command", msg.command);
        return;
    }
}
