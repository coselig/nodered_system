/**
 * CRC16 指令建構器
 * 
 * Node Type: function
 * 
 * 輸入：
 *   msg.payload = Buffer (不含 CRC 的 Modbus 指令)
 * 
 * 輸出：
 *   msg.payload = Buffer (含 CRC 的完整 Modbus 指令)
 * 
 * 使用方式：
 *   processor_light → crc_builder → modbus_queue
 */

function crc16(buf) {
    let crc = 0xFFFF;
    for (const b of buf) {
        crc ^= b;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
        }
    }
    return crc;
}

// 確保 payload 是 Buffer
let frame = msg.payload;
if (!Buffer.isBuffer(frame)) {
    if (Array.isArray(frame)) {
        frame = Buffer.from(frame);
    } else {
        node.warn("輸入必須是 Buffer 或 Array");
        return null;
    }
}

const crc = crc16(frame);
msg.payload = Buffer.concat([frame, Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF])]);

return msg;
