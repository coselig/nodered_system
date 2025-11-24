# Node-RED 功能模組化說明

本目錄包含從 Node-RED flow 中提取的各個功能模組，便於單獨維護和修改。

## 📁 檔案結構

### 核心功能模組

1. **command_general.js** (838行)
   - 主要指令處理器，處理 MQTT → Modbus 轉換
   - 支援設備類型：
     - 燈光控制 (light): single, dual, relay, scene
     - 窗簾控制 (cover)
     - 空調控制 (hvac)
     - 場景記憶 (memory)
     - 場景執行 (scene)
     - 設備查詢 (query)

2. **mqtt_queue.js** (35行)
   - MQTT 訊息佇列處理器
   - 以 50ms 間隔循序發送訊息
   - 避免 MQTT broker 負載過高

3. **modbus_queue.js** (43行)
   - Modbus 指令佇列處理器
   - 以 1000ms 間隔發送指令
   - 防止 Modbus 設備來不及處理

4. **hmi_processor.js** (大型檔案)
   - HMI 觸控面板指令解析器
   - 支援功能：
     - 窗簾控制 (curtain_control)
     - 場景記憶與執行 (scene_unified)
     - 燈光統一控制 (light_control_unified)
     - 空調系統控制 (hvac_*)

### 回饋處理模組

5. **feedback.js** (80行)
   - Modbus 設備回饋資料解析
   - CRC 校驗驗證
   - 單色溫調光設備狀態解析

6. **feedback_hvac.js** (90行)
   - 空調設備回饋解析
   - 解析項目：
     - 電源狀態
     - 運轉模式 (cool/heat/dry/fan_only/off)
     - 風速模式 (auto/low/medium/high)
     - 設定溫度 & 當前溫度

### 配置與工具

7. **general_configuration.js** (305行)
   - Home Assistant MQTT Discovery 配置生成器
   - 自動產生設備配置：
     - 燈光設備 (單色/雙色溫)
     - 場景設備
     - 窗簾/捲簾設備
     - 空調設備

8. **debug_tools.js** (52行)
   - 除錯工具集
   - 功能：
     - `clear_flow_cache` - 清空 flow context
     - `show_flow_cache` - 顯示 flow context
     - `clear_mqtt_queue` - 清空 MQTT 佇列
     - `show_mqtt_queue` - 顯示 MQTT 佇列
     - `show_modbus_queue` - 顯示 Modbus 佇列
     - `clear_modbus_queue` - 清空 Modbus 佇列

## 🔧 使用方式

### 在 Node-RED 中使用

這些 JavaScript 檔案是從 Node-RED function node 中提取的原始碼，可以透過以下方式使用：

1. **直接複製貼上**
   - 開啟對應的 function node
   - 將檔案內容複製到 function node 的程式碼編輯區

2. **外部模組引用**（需要額外設定）
   - 在 Node-RED settings.js 中設定 functionExternalModules
   - 使用 require() 引入模組

### 修改流程

1. 找到要修改的功能對應檔案
2. 直接編輯 `.js` 檔案
3. 複製修改後的內容到 Node-RED function node
4. 部署 (Deploy) 更新

## 📊 系統架構

```
MQTT 訂閱
    ↓
command_general.js (指令解析)
    ↓
modbus_queue.js (Modbus 佇列管理)
    ↓
Modbus 設備
    ↓
feedback.js / feedback_hvac.js (回饋解析)
    ↓
mqtt_queue.js (MQTT 佇列管理)
    ↓
MQTT 發布 → Home Assistant
```

```
HMI 觸控面板
    ↓
hmi_processor.js (HMI 指令解析)
    ↓
mqtt_queue.js (MQTT 佇列管理)
    ↓
MQTT 發布
```

## 🔑 關鍵變數

### Global Context
- `mqtt_queue` - MQTT 訊息佇列
- `modbus_queue` - Modbus 指令佇列
- `modbus_queue_processing` - Modbus 處理鎖定旗標

### Flow Context
- `{subType}_{moduleId}_{channel}_state` - 設備開關狀態
- `{subType}_{moduleId}_{channel}_brightness` - 亮度值
- `{subType}_{moduleId}_{channel}_colortemp` - 色溫值

### Memory Context (Global)
- `homeassistant/memory/{sceneId}/{operation}` - 場景記憶資料

## 💡 常用修改範例

### 修改 MQTT 發送間隔
編輯 `mqtt_queue.js` 第 14 行：
```javascript
setTimeout(sendNext, 50);  // 改為所需的毫秒數
```

### 修改 Modbus 發送間隔
編輯 `modbus_queue.js` 第 20 行：
```javascript
setTimeout(sendNext, 1000);  // 改為所需的毫秒數
```

### 新增燈光設備
編輯 `general_configuration.js` 燈光設備陣列：
```javascript
let lights = [
    { id: "single_20_1", name: "新增燈光-20-1" },
    // ... 其他設備
];
```

### 修改場景配置
編輯 `command_general.js` 中的 `SCENE_DEFAULT` 物件

## ⚠️ 注意事項

1. **Node-RED Context 依賴**
   - 這些程式碼使用 Node-RED 的 `node`, `msg`, `flow`, `global` 物件
   - 無法在 Node-RED 外部環境直接執行

2. **CRC 計算**
   - Modbus 通訊使用 CRC16-Modbus 校驗
   - 已內建於各個模組中

3. **佇列機制**
   - MQTT 和 Modbus 都使用佇列避免訊息衝突
   - 修改間隔時需考慮設備回應速度

4. **版本管理**
   - 建議使用 Git 管理這些檔案
   - 修改前先備份原始版本

## 📝 授權

本專案程式碼僅供內部使用和參考。

---
最後更新：2025-01-14
