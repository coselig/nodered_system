/**
 * feedback - 處理設備回饋資料
 * 解析 Modbus 設備返回的狀態資料
 */

let buf = msg.payload;

/*============================================crc=======================================================*/
// CRC 校驗
function calculateCRC(buffer) {
    let crc = 0xFFFF;
    for (let pos = 0; pos < buffer.length - 2; pos++) {
        crc ^= buffer.readUInt8(pos);
        for (let i = 8; i !== 0; i--) {
            if ((crc & 0x0001) !== 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

function isValidCRC(buffer) {
    let receivedCRC = (buffer.readUInt8(buffer.length - 1) << 8) | buffer.readUInt8(buffer.length - 2);
    let calculatedCRC = calculateCRC(buffer);
    return receivedCRC === calculatedCRC;
}

// 僅當長度正確且CRC校驗成功時返回消息
// node.warn(`crc ${isValidCRC(buf) ? "pass" : "failed"}`);
/*========================================================================================================*/

let length = buf.length;

// node.warn(`raw bytes: `);
// node.warn({raw: buf});
// node.warn(`BE: ${buf.readInt16BE(2)}, LE: ${buf.readInt16LE(2)}`);


switch (buf[1]) {
    case 0x03: {
        switch (buf.readInt16BE(2)) {
            case 2090:
            case 2091:
            case 2092:
            case 2093:
            case 2094: {
                let id = buf.readInt8(0);
                let value = buf.readInt8(5);
                if (value) {
                    msg.payload = `ON`;
                }
                else {
                    msg.payload = `OFF`;
                }
                let channel = buf.readInt16BE(2) - 2090
                msg.topic = `homeassistant/light/single/${id}/${channel}/brightness`;
                // node.warn(`單色溫調光 send: ${msg.topic}`);
                // node.warn({ raw: msg.topic });
                return null;
            }
            default: {
                // node.warn(`unknown usage: ${buf.readInt16BE(2)}`)
            }
        }
        break;
    }
    default: {
        // node.warn(`Unknown function code: ${buf[1]}`);
    }
}

// for (let i =0; i<buf.length;i++) {
//     node.warn(`${buf[i]}`)
// }

return null;
