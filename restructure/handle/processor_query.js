/**
 * 查詢處理器 - 支援設備狀態查詢
 * 
 * Node Type: function
 * 
 * 輸出：
 *   Output 1: Modbus 指令 → 連接到 crc_builder → modbus_queue
 *   Output 2: MQTT 狀態   → 連接到 MQTT out
 * 
 * 支援的 Topic 格式:
 *   homeassistant/query/single/{moduleId}/{channel}
 *   homeassistant/query/dual/{moduleId}/{channel}
 *   homeassistant/query/relay/{moduleId}/{channel}
 */

// ========== 共用模組 ==========
const debugConfig = global.get('debug_config') || {
    topic: true, cache: true, modbus: true, mqtt: true, scene: true, query: true
};

function debugLog(category, message) {
    if (debugConfig[category]) node.warn(message);
}

// CRC 由 crc_builder.js 處理

const CHANNEL_REGISTER_MAP = {
    "1": 0x082A, "2": 0x082B, "3": 0x082C, "4": 0x082D,
    "a": [0x082A, 0x082B], "b": [0x082C, 0x082D]
};

const CHANNEL_COIL_MAP = { "1": 0x0000, "2": 0x0001, "3": 0x0002, "4": 0x0003 };

// ========== 主處理邏輯 ==========
const parts = String(msg.topic || "").split("/");
const deviceType = parts[1];     // query

if (deviceType !== "query") {
    return null;
}

const querySubType = parts[2];   // single, dual, relay
const moduleId = parseInt(parts[3]);
const channel = parts[4];

debugLog('query', `=== Query 處理器 ===`);
debugLog('query', `類型: ${querySubType}, 模組: ${moduleId}, 通道: ${channel}`);

let frame;
let modbusMessages = [];

if (querySubType === "single" || querySubType === "dual") {
    // 查詢 Single/Dual Light: Read Holding Registers (0x03)
    const reg = CHANNEL_REGISTER_MAP[channel];
    if (!reg) {
        debugLog('query', `找不到通道 ${channel} 的寄存器`);
        return null;
    }

    const startReg = Array.isArray(reg) ? reg[0] : reg;
    const quantity = Array.isArray(reg) ? 2 : 1;

    const regHi = (startReg >> 8) & 0xFF;
    const regLo = startReg & 0xFF;
    const qtyHi = (quantity >> 8) & 0xFF;
    const qtyLo = quantity & 0xFF;

    frame = Buffer.from([moduleId, 0x03, regHi, regLo, qtyHi, qtyLo]);

    debugLog('query', `讀取寄存器: 0x${startReg.toString(16).padStart(4, '0')}, 數量: ${quantity}`);
}
else if (querySubType === "relay") {
    // 查詢 Relay: Read Coils (0x01)
    const addr = CHANNEL_COIL_MAP[channel] || 0x0000;
    const quantity = 4;

    const addrHi = (addr >> 8) & 0xFF;
    const addrLo = addr & 0xFF;
    const qtyHi = (quantity >> 8) & 0xFF;
    const qtyLo = quantity & 0xFF;

    frame = Buffer.from([moduleId, 0x01, addrHi, addrLo, qtyHi, qtyLo]);

    debugLog('query', `讀取線圈: 0x${addr.toString(16).padStart(4, '0')}, 數量: ${quantity}`);
}
else {
    debugLog('query', `不支援的查詢類型: ${querySubType}`);
    return null;
}

const cmd = frame;

debugLog('modbus', `=== Modbus 查詢指令 ===`);
debugLog('modbus', `指令: ${cmd.toString('hex')}`);

const queryMsg = {
    payload: cmd,
    deviceType: "query",
    subType: querySubType,
    moduleId,
    channel,
    queryInfo: { type: querySubType, channel: channel }
};
modbusMessages.push(queryMsg);

node.status({
    fill: "cyan",
    shape: "ring",
    text: `Query ${querySubType} ${moduleId}-${channel}`
});

return [modbusMessages, []];
