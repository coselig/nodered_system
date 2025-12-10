/**
 * 雙色溫（dual）控制：產生兩筆 Modbus 指令（含 CRC16）
 * Topic: homeassistant/light/dual/{id}/{channel}/set
 * Payload: "ON" | "OFF" | boolean | number
 *
 * 指令格式：
 * [SLAVE_ID, 0x06, REG_HI, REG_LO, DIMMING_SPEED, VALUE, CRC_LOW, CRC_HIGH]
 *
 * 通道寄存器：
 * a → 2090 (0x082A, 亮度), 2091 (0x082B, 色溫)
 * b → 2092 (0x082C, 亮度), 2093 (0x082D, 色溫)
 */

const DEFAULT_BRIGHTNESS = 100; // 0~100
const DEFAULT_COLORTEMP = 250; // mired (≈4000K)
const MIN_MIRED = 167, MAX_MIRED = 333;
const DIMMING_SPEED = 0x05;

const CHANNEL_REGISTER_MAP = {
    "a": [0x082A, 0x082B], // brightness, colortemp
    "b": [0x082C, 0x082D]
};

// CRC16
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

// 建立單筆 0x06 指令
function buildCommand(id, reg, value) {
    const hi = (reg >> 8) & 0xFF;
    const lo = reg & 0xFF;
    let cmd = Buffer.from([id, 0x06, hi, lo, DIMMING_SPEED, value]);
    const crc = crc16(cmd);
    return Buffer.concat([cmd, Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF])]);
}

// ===================== 主流程 =====================
const parts = String(msg.topic || "").split("/");
if (parts.length < 6 || parts[2] !== "dual" || parts[5] !== "set") return null;

const slaveId = parseInt(parts[3]) || 0;
const chStr = (parts[4] || "").toLowerCase();
const regs = CHANNEL_REGISTER_MAP[chStr];
if (!regs) return null;

// 狀態判斷
let state = "OFF";
if (msg.payload === "ON") state = "ON";

// 讀取快取
const brKey = `dual_${slaveId}_${chStr}_brightness`;
const ctKey = `dual_${slaveId}_${chStr}_colortemp`;

let brightness = flow.get(brKey);
if (typeof brightness !== "number") brightness = DEFAULT_BRIGHTNESS;
brightness = Math.max(0, Math.min(100, Math.round(brightness)));

let colortemp = flow.get(ctKey);
if (typeof colortemp !== "number") colortemp = DEFAULT_COLORTEMP;
colortemp = Math.max(MIN_MIRED, Math.min(MAX_MIRED, Math.round(colortemp)));

// OFF = 亮度歸 0
const brValue = (state === "ON") ? brightness : 0;

// 色溫轉換 (mired → 0~100)
const ctPercent = Math.round(((MAX_MIRED - colortemp) / (MAX_MIRED - MIN_MIRED)) * 100);

// 產生兩筆指令
const cmdBrightness = buildCommand(slaveId, regs[0], brValue);
const cmdColortemp = buildCommand(slaveId, regs[1], ctPercent);

// 輸出兩筆
node.send({ payload: cmdBrightness });
node.send({ payload: cmdColortemp });

return null;
