// Node-RED Function 節點：CRC16 驗證過濾器
// 輸入：msg.payload = Buffer
// 通過驗證才往下傳遞，不通過則不傳遞

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

function verifyCRC(buf) {
    let crc = 0xFFFF;
    for (let i = 0; i < buf.length - 2; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
        }
    }
    const crcLow = crc & 0xFF;
    const crcHigh = (crc >> 8) & 0xFF;
    return (crcLow === buf[buf.length - 2]) && (crcHigh === buf[buf.length - 1]);
}

if (Buffer.isBuffer(msg.payload) && verifyCRC(msg.payload)) {
    return msg;
} else {
    // 驗證失敗不往下傳
    return null;
}
