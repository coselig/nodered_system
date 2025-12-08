/**
 * Feedback 路由器 - 驗證 CRC 並分發到對應處理器
 * 
 * Node Type: function
 * 
 * 前置需求：
 *   必須先執行 common.js 初始化共用模組
 * 
 * 輸入：
 *   msg.payload = Buffer (來自 Serial Port 的原始 Modbus 回應)
 * 
 * 輸出：
 *   Output 1: 燈光回應  → 連接到 feedback_light.js  (0x05, 0x06, 0x10)
 *   Output 2: HVAC 回應 → 連接到 feedback_hvac.js   (0x03 且長度 17)
 *   Output 3: 查詢回應  → 連接到 feedback_query.js  (0x01, 0x03 非 HVAC)
 *   Output 4: Dequeue   → 連接到 modbus_queue       (CRC 失敗時觸發)
 * 
 * 連接架構：
 *   Serial Port → feedback_router → feedback_light  → MQTT out
 *                                 → feedback_hvac   → MQTT out
 *                                 → feedback_query  → MQTT out
 *                                 → modbus_queue (dequeue)
 */

// ========== 載入共用模組 ==========
const lib = global.get('lib');
if (!lib) {
    node.error('共用模組未初始化，請先執行 common.js');
    return null;
}

const { UTILS } = lib;
const { verifyCRC, makeDequeueMsg } = UTILS;

function debugLog(category, message) {
    UTILS.debugLog.call({ warn: node.warn.bind(node) }, category, message);
}

// ========== 主處理邏輯 ==========
const buf = msg.payload;

// 檢查是否為有效的 Modbus 資料
if (!Buffer.isBuffer(buf) || buf.length < 5) {
    debugLog('modbus', "回應格式錯誤或長度不足");
    return null;
}

// 過濾 HMI 資料 (開頭是 0xEE)
if (buf[0] === 0xEE) {
    debugLog('modbus', "略過 HMI 資料 (0xEE 開頭)");
    return null;
}

// CRC 驗證
if (!verifyCRC(buf)) {
    debugLog('modbus', "CRC 驗證失敗，觸發下一個指令");
    debugLog('modbus', `資料: ${buf.toString('hex')}`);
    // CRC 失敗仍觸發 dequeue，避免佇列卡住
    return [null, null, null, makeDequeueMsg()];
}

const moduleId = buf[0];
const funcCode = buf[1];

debugLog('modbus', `=== Feedback Router ===`);
debugLog('modbus', `模組: ${moduleId}, 功能碼: 0x${funcCode.toString(16).padStart(2, '0')}, 長度: ${buf.length}`);

// 根據功能碼和長度分發到對應處理器
let lightMsg = null;
let hvacMsg = null;
let queryMsg = null;

switch (funcCode) {
    case 0x05:  // Write Single Coil (Relay)
    case 0x06:  // Write Single Register (Single/Dual Light)
    case 0x10:  // Write Multiple Registers (WRGB)
        lightMsg = msg;
        debugLog('modbus', `→ 分發到 feedback_light`);
        break;
        
    case 0x03:  // Read Holding Registers
        if (buf.length === 17) {
            // HVAC 回應
            hvacMsg = msg;
            debugLog('modbus', `→ 分發到 feedback_hvac`);
        } else {
            // 燈光查詢回應
            queryMsg = msg;
            debugLog('modbus', `→ 分發到 feedback_query`);
        }
        break;
        
    case 0x01:  // Read Coils (Relay 查詢)
        queryMsg = msg;
        debugLog('modbus', `→ 分發到 feedback_query`);
        break;
        
    default:
        debugLog('modbus', `未知功能碼: 0x${funcCode.toString(16).padStart(2, '0')}`);
        debugLog('modbus', `原始資料: ${buf.toString('hex')}`);
        break;
}

node.status({
    fill: "blue",
    shape: "dot",
    text: `Route: 0x${funcCode.toString(16).padStart(2, '0')} → ${lightMsg ? 'light' : hvacMsg ? 'hvac' : queryMsg ? 'query' : 'unknown'}`
});

// 回傳: [燈光, HVAC, 查詢, Dequeue]
// 正常情況不需要 dequeue，各處理器會自己發送
return [lightMsg, hvacMsg, queryMsg, null];
