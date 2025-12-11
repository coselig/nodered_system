/**
 * P404 查詢指令產生器（不含 CRC）
 * 輸出：msg.payload = Buffer (不含 CRC 的 Modbus 指令)
 *
 * 使用方式：請串接 crc_builder 節點處理 CRC
 */

// 獲取當前設備 ID
var deviceID = msg.deviceID;

// 設定參數
var functionCode = 0x03;           // 功能碼：讀取保持暫存器(Holding Register)
var startAddress = 2090;            // 起始地址
var quantity = 4;                  // 讀取數量

// 將起始地址和數量轉換為兩個字節
var startAddressHigh = (startAddress >> 8) & 0xFF; // 高位
var startAddressLow = startAddress & 0xFF;        // 低位
var quantityHigh = (quantity >> 8) & 0xFF;        // 高位
var quantityLow = quantity & 0xFF;               // 低位

// 組裝指令（不含 CRC）
var message = [
    deviceID,            // 設備地址
    functionCode,        // 功能碼
    startAddressHigh,    // 起始地址高位
    startAddressLow,     // 起始地址低位
    quantityHigh,        // 數量高位
    quantityLow          // 數量低位
];

// 將指令存入 msg.payload
msg.payload = Buffer.from(message);
return msg;