/**
 * 窗簾處理器 - 支援窗簾/捲簾/排煙窗
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 modbus_queue.js
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 支援的 Topic 格式:
 *   homeassistant/cover/general/{moduleId}/set
 *   payload: "1_2/3" 表示開啟 relay 1 和 2，關閉 relay 3
 */

// CRC 由 crc_builder.js 處理

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // cover
const subType = parts[2];        // general, curtain
const moduleId = parseInt(parts[3]);

if (deviceType !== "cover") {
    return null;
}

let modbusMessages = [];

// 格式: homeassistant/cover/general/12/set
// payload: "1_2/3" 表示開啟 relay 1 和 2，關閉 relay 3

const relays = String(msg.payload).split("/");
const on_relays = relays[0] ? relays[0].split("_").map(Number).filter(n => !isNaN(n)) : [];
const off_relays = (relays[1] && relays[1].length > 0) ? relays[1].split("_").map(Number).filter(n => !isNaN(n)) : [];

let output = 0x00;
for (let relay of on_relays) {
    output |= (1 << (relay - 1));
}
for (let relay of off_relays) {
    output &= ~(1 << (relay - 1));
}

const cmd = Buffer.from([moduleId, 0x06, 0x01, 0x9b, 0x10, output]);

modbusMessages.push({ payload: cmd, deviceType, moduleId, on_relays, off_relays });

node.status({
    fill: "blue",
    shape: "dot",
    text: `Cover: ON[${on_relays}] OFF[${off_relays}]`
});

return [modbusMessages, []];
