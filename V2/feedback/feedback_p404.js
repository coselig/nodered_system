// === Channel 對應 byte 映射（根據通道決定亮度與色溫位元）===
const channelByteMap = {
    // 雙色溫通道（含亮度與色溫）
    "a": { type: "dual", brightnessByte: 4, colortempByte: 6 },
    "b": { type: "dual", brightnessByte: 8, colortempByte: 10 },
    // 單色溫通道（只有亮度）
    "1": { type: "single", brightnessByte: 4 },
    "2": { type: "single", brightnessByte: 6 },
    "3": { type: "single", brightnessByte: 8 },
    "4": { type: "single", brightnessByte: 10 },
};

// === 燈具配置清單 ===
// 每筆燈具包含名稱、Modbus ID、通道編號（channel）
const lights = [
    { name: "B2-1", id: 11, channel: "1" },
    { name: "B2-2", id: 11, channel: "2" },
    { name: "B2-3", id: 11, channel: "3" },
    { name: "B2-4", id: 11, channel: "4" },
    { name: "B2-5", id: 12, channel: "1" },
    { name: "B2-6", id: 12, channel: "3" },

];

// === 色溫轉換：Modbus 數值 → mired（HA 使用）===
function getColortempHA(modbusValue) {
    const MIRED_MIN = 154;// 6500K
    const MIRED_MAX = 370;// 2700K
    return Math.round(MIRED_MAX + modbusValue / 100 * (MIRED_MIN - MIRED_MAX));
}

// === Modbus CRC 驗證函式 ===
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

// === 主程式開始 ===
const buffer = msg.payload;

// === 基礎防錯檢查 ===
if (!Buffer.isBuffer(buffer)) return null;       // 資料必須是 Buffer
if (buffer.length !== 13) return null;           // 長度需為 13 bytes（固定格式）

const id = buffer[0];                            // 裝置 ID
const funcCode = buffer[1];                      // 功能碼，應為 0x03
const byteCount = buffer[2];                     // 資料長度，應為 13

if (funcCode !== 0x03 || byteCount !== 8) return null;
if (!verifyCRC(buffer)) return null;             // CRC 驗證失敗則丟棄

// === 開始解析每筆燈具 ===
const mqttMsgs = [];

for (const light of lights) {
    if (light.id !== id) continue;  // 僅處理此封包對應的 ID

    const info = channelByteMap[light.channel];
    if (!info) continue;  // channel 無對應定義則跳過

    const deviceID = light.id;
    const channel = light.channel;
    const type = info.type;
    const brightness = buffer[info.brightnessByte];

    // 組合 MQTT topic 路徑
    const stateTopic = `homeassistant/light/${type}/${deviceID}/${channel}`;
    const setTopic = `${stateTopic}/set`;

    // === 雙色溫燈具處理邏輯 ===
    if (type === "dual") {
        // ✅ 根據亮度決定 ON/OFF 狀態，並決定是否送亮度指令
        if (brightness === 0) {
            mqttMsgs.push({ topic: `${stateTopic}/state`, payload: "OFF" });
        } else {
            mqttMsgs.push(
                { topic: `${stateTopic}/state`, payload: "ON" },
                { topic: `${stateTopic}/brightness`, payload: brightness.toString() },
                { topic: `${setTopic}/brightness`, payload: brightness.toString() }
            );
        }

        // ✅ 無論亮度為何都送 colortemp
        const colortempModbus = buffer[info.colortempByte];
        const colortempMired = getColortempHA(colortempModbus);

        mqttMsgs.push(
            { topic: `${stateTopic}/colortemp`, payload: colortempMired.toString() },
            { topic: `${setTopic}/colortemp`, payload: colortempMired.toString() }
        );
    }

    // === 單色溫燈具處理邏輯 ===
    if (type === "single") {
        if (brightness === 0) {
            mqttMsgs.push({ topic: `${stateTopic}/state`, payload: "OFF" });
        } else {
            mqttMsgs.push(
                { topic: `${stateTopic}/state`, payload: "ON" },
                { topic: `${stateTopic}/brightness`, payload: brightness.toString() },
                { topic: `${setTopic}/brightness`, payload: brightness.toString() }
            );
        }
    }
}

// === 輸出所有組合的 MQTT 訊息陣列 ===
return [mqttMsgs];
