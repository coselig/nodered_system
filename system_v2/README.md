# System V2 - 完整智能家居控制系統

這是從 `test_full_integrated.json` 提取的完整模組化系統，支援所有設備類型。

## 📂 檔案結構

```
system_v2/
├── full_processor.js           # 完整處理器 - MQTT → Modbus 轉換
├── feedback_processor.js       # 回饋處理器 - Modbus → MQTT 狀態更新
├── hmi_processor.js           # HMI 處理器 - 觸控螢幕指令解析
├── polling_query.js           # 輪詢查詢 - 定期查詢所有設備狀態
├── general_configuration.js   # 設備註冊配置 - HA MQTT Discovery
└── README.md                  # 本文件
```

## 🎯 系統架構

### 資料流程圖

```
┌─────────────────────┐
│  Home Assistant UI  │
│   (MQTT 控制)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│   MQTT Broker       │◄────┤  HMI 觸控螢幕       │
│   (192.168.1.233)   │     │  (TCP 8888)         │
└──────────┬──────────┘     └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Full Processor     │
│  完整處理器         │
│  ┌───────────────┐  │
│  │ Light (單/雙)  │  │
│  │ Cover (窗簾)   │  │
│  │ HVAC (空調)    │  │
│  │ Scene (場景)   │  │
│  │ Memory (記憶)  │  │
│  │ Query (查詢)   │  │
│  └───────────────┘  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Modbus TCP         │
│  (192.168.1.229)    │
│  Port: 1030         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Feedback Processor │
│  回饋處理器         │
│  ┌───────────────┐  │
│  │ 狀態解析       │  │
│  │ 快取更新       │  │
│  │ MQTT 發布      │  │
│  └───────────────┘  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  MQTT → HA UI       │
│  狀態更新           │
└─────────────────────┘
```

### 輔助功能流程

```
┌─────────────────────┐
│  Polling Query      │  ← 每 20 秒自動觸發
│  輪詢查詢           │  ← 或由 HMI 觸發
└──────────┬──────────┘
           │
           ▼
   (發送 24 個查詢指令)
           │
           ▼
┌─────────────────────┐
│  Full Processor     │
│  (Query Mode)       │
└──────────┬──────────┘
           │
           ▼
   (Modbus 0x03 讀取)
           │
           ▼
┌─────────────────────┐
│  Feedback Processor │
│  (解析並更新狀態)   │
└─────────────────────┘
```

## 🔧 模組說明

### 1. Full Processor (完整處理器)

**功能：** 接收 MQTT 指令，轉換為 Modbus 指令

**支援設備類型：**
- ✅ **Light (Single)** - 單色燈光
  - Topic: `homeassistant/light/single/{module}/{channel}/set`
  - 支援亮度調整 (0-100%)

- ✅ **Light (Dual)** - 雙色溫燈光
  - Topic: `homeassistant/light/dual/{module}/{channel}/set`
  - 支援亮度 + 色溫 (167-333 mired)

- ✅ **Light (Relay)** - 繼電器開關
  - Topic: `homeassistant/light/relay/{module}/{channel}/set`
  - 僅支援 ON/OFF

- ✅ **Light (Scene)** - 場景燈光群組
  - Topic: `homeassistant/light/scene/{type}/{lights}/set`
  - 例如: `scene/single/12-1--12-2/set`

- ✅ **Cover** - 窗簾/捲簾/排煙窗
  - Topic: `homeassistant/cover/general/{module}/set`
  - Payload: `"1_2/3"` (開啟 1,2 / 關閉 3)

- ✅ **HVAC** - 空調控制
  - Topic: `homeassistant/hvac/{s200Id}/{hvacId}/{action}/set`
  - Action: mode, temperature, fan

- ✅ **Scene** - 場景執行 (含記憶)
  - Topic: `homeassistant/scene/{sceneId}/{operation}/execute/set`

- ✅ **Memory** - 場景記憶儲存
  - Topic: `homeassistant/memory/{sceneId}/{operation}/save/set`

- ✅ **Query** - 設備狀態查詢
  - Topic: `homeassistant/query/{type}/{module}/{channel}`

**輸出：**
- Output 1: Modbus 指令 (Buffer)
- Output 2: MQTT 狀態更新訊息

---

### 2. Feedback Processor (回饋處理器)

**功能：** 解析 Modbus 回應，更新設備狀態到 MQTT

**處理的 Modbus 功能碼：**
- `0x03` - Read Holding Registers (燈光查詢 / HVAC 狀態)
- `0x06` - Write Single Register (燈光控制確認)
- `0x05` - Write Single Coil (繼電器確認)
- `0x01` - Read Coils (繼電器查詢)

**特殊處理：**
- ✅ 自動過濾 HMI 資料 (0xEE 開頭)
- ✅ CRC 驗證
- ✅ 快取管理 (OFF 時保留亮度值)
- ✅ HVAC 狀態解析 (17 bytes)

**輸出：**
- Output 1: Feedback 資訊 (含原始資料)
- Output 2: MQTT 狀態更新訊息

---

### 3. HMI Processor (觸控螢幕處理器)

**功能：** 解析 HMI 觸控螢幕的 TCP 指令

**支援的 HMI 操作：**
- 🪟 **窗簾控制** - 鐵捲門、會議室捲簾、多組窗簾
  - 模式：Query 觸發 (HMI 直接控制設備，發送 query 讓 HA 更新)

- 🎬 **場景按鈕** - 測試按鈕、記憶按鈕
  - **新模式：觸發輪詢查詢** (2024更新)
  - 所有場景按鈕按下 → 觸發完整輪詢 (24 個設備)
  - Topic: `homeassistant/polling/trigger`
  - Payload: `"query_all"`

- 💡 **燈光調整** - 亮度/色溫調整
  - **單色燈 (帶數值)**: 觸發 Query 查詢
  - **雙色溫燈**: 狀態同步模式
  - **舊格式控制**: 觸發輪詢查詢

- ❄️ **空調控制** - 溫度/模式/風量
  - 模式：狀態同步 (HMI 控制設備，這裡更新 HA)

**Pattern 列表：** (共 11 個)
1. `curtain_control` - 窗簾控制 (Query 模式)
2. `scene_unified` - 場景按鈕 (觸發輪詢)
3. `light_control_unified` - 燈光控制舊格式 (觸發輪詢)
4. `dual_light` - 雙色溫燈新格式 (狀態同步)
5. `single_light_with_value` - 單色燈帶數值 (Query 模式)
6. `single_light_control` - 單色燈控制新格式 (觸發輪詢)
7. `single_light_value` - 單色燈 ASCII 數值 (觸發輪詢)
8. `hvac_power_mode` - 空調電源/模式 (狀態同步)
9. `hvac_temperature` - 空調溫度 (狀態同步)
10. `hvac_mode` - 空調模式 (狀態同步)
11. `hvac_fan_speed` - 空調風速 (狀態同步)

**輸出：**
- Output 1: MQTT 指令陣列

---

### 4. Polling Query (輪詢查詢)

**功能：** 定期查詢所有設備狀態，確保 HA 與實際設備同步

**觸發方式：**
1. **定期觸發** - Inject 節點每 20 秒
2. **HMI 觸發** - 場景按鈕按下時
   - 接收 Topic: `homeassistant/polling/trigger`
   - Payload: `"query_all"`

**查詢範圍：** (共 24 個設備)
- 盤A: 10 個單色燈 + 2 個雙色溫燈
- 盤B: 12 個單色燈

**設備列表：**
```javascript
// 盤A
11-1, 11-2        // 走廊間照
12-1, 12-2, 12-3, 12-4  // 泡茶區、走道崁燈、展示櫃
13-1, 13-2, 13-3, 13-4  // 會議間照、冷氣間照、會議崁燈
14-a, 14-b        // 會議室雙色溫燈 (軌道燈、吊燈)

// 盤B
15-1, 15-2        // 客廳前、客廳後
16-1, 16-2        // 走道間照
17-1, 17-2        // 廚房
18-1, 18-2        // 1F 壁燈、地燈
19-1, 19-2        // 2F 壁燈、地燈
```

**輸出：**
- Output 1: 24 個 Query MQTT 訊息陣列

---

### 5. General Configuration (設備註冊)

**功能：** 生成 Home Assistant MQTT Discovery 配置

**註冊的設備：**
- 17 個燈光設備 (單色 + 雙色溫)
- 5 個窗簾/捲簾設備
- 4 個空調設備

**使用方式：**
1. 點擊「註冊虛擬裝置」按鈕
2. 自動發送所有 Discovery 訊息到 MQTT
3. HA 自動識別並創建設備

**輸出：**
- Output 1: MQTT Discovery 訊息陣列

---

## 🔌 Node-RED 連接方式

### 基本流程配置

```
[MQTT In: homeassistant/+/+/+/+/set/#]
          ↓
[Full Processor] ─┬→ [Debug: Modbus 指令]
                  │
                  ├→ [TCP Request: Modbus] → [Feedback Processor] ─┬→ [Debug: 解析結果]
                  │                                                 │
                  └→ [MQTT Out: 狀態發布] ←──────────────────────┘
                     ↑
                     └── (直接狀態更新，不需經過 Modbus)
```

### HMI 流程配置

```
[TCP In: HMI 8888]
          ↓
[HMI Processor]
          ↓
[MQTT Out: 指令/查詢]
```

### 輪詢流程配置

```
[Inject: 每 20 秒] ──→ [Polling Query] → [MQTT Out: 查詢指令]
                                               ↓
[MQTT In: polling/trigger] ──→ [Polling Query] ─┘
```

---

## 📝 使用範例

### 1. 控制單色燈

**MQTT 指令：**
```
Topic: homeassistant/light/single/11/1/set
Payload: ON
```

**結果：**
1. Full Processor 生成 Modbus 0x06 指令
2. 發送到 Modbus TCP (11 號模組，通道 1)
3. Feedback Processor 解析回應
4. 發布狀態到 `homeassistant/light/single/11/1/state` → `ON`

### 2. 調整雙色溫燈亮度

**MQTT 指令：**
```
Topic: homeassistant/light/dual/14/a/set/brightness
Payload: 75
```

**結果：**
1. Full Processor 儲存亮度快取 (75%)
2. 繼續處理為開燈指令
3. 發送 Modbus 指令 (亮度 75%)

### 3. 控制窗簾

**MQTT 指令：**
```
Topic: homeassistant/cover/general/21/set
Payload: "1_2/3"
```

**結果：**
1. Full Processor 解析：開啟 Relay 1, 2 / 關閉 Relay 3
2. 生成 Bit Mask: `0b00000011` (開) + `0b11111011` (關) = `0b00000011`
3. 發送 Modbus 0x06 指令到寄存器 0x019B

### 4. HMI 按下場景按鈕

**HMI 資料：** `FE 06 08 20 01 02 xx xx`

**結果：**
1. HMI Processor 匹配 `scene_unified` pattern
2. 發布 `homeassistant/polling/trigger` → `"query_all"`
3. Polling Query 收到觸發
4. 發送 24 個查詢指令
5. Feedback Processor 更新所有設備狀態

### 5. 輪詢查詢所有設備

**觸發：** 每 20 秒自動

**結果：**
1. Polling Query 生成 24 個查詢指令
2. Full Processor 轉換為 Modbus 0x03 讀取指令
3. Feedback Processor 解析所有回應
4. 更新所有設備狀態到 HA

---

## 🛠️ Debug 控制

系統支援動態 Debug 控制，透過 Global Context 設定：

```javascript
global.set('debug_config', {
    topic: true,        // 顯示收到的 Topic
    cache: true,        // 顯示快取操作
    modbus: true,       // 顯示 Modbus 指令詳情
    mqtt: true,         // 顯示 MQTT 狀態回報
    scene: true,        // 顯示 Scene 處理
    query: true,        // 顯示 Query 查詢
    hmi: true           // 顯示 HMI 處理
});
```

**快速切換：**
- **Debug 全開** - 所有訊息
- **Debug 全關** - 關閉所有訊息
- **只看 Modbus** - 僅 Modbus 指令

---

## 🔄 與 restructure 的差異

| 項目 | restructure (舊版) | system_v2 (新版) |
|------|-------------------|------------------|
| 場景記憶 | ❌ 不支援 | ✅ 完整支援 (儲存/執行) |
| 場景執行 | ❌ 不支援 | ✅ 完整支援 |
| 記憶查詢 | ❌ 不支援 | ✅ 支援查詢所有記憶 |
| HMI 場景處理 | 狀態同步 | **觸發輪詢** (更新模式) |
| 窗簾 Query | ✅ 支援 | ✅ 支援 |
| HVAC 支援 | ✅ 支援 | ✅ 支援 + 模組 ID 動態 |
| 輪詢觸發 | 僅定時 | **定時 + HMI 觸發** |
| 設備數量 | 12 個 | **24 個** (完整覆蓋) |

---

## 📦 部署方式

### 方法一：Node-RED 匯入 JSON

1. 開啟原始的 `test_full_integrated.json` 檔案
2. 複製整個 JSON 內容
3. Node-RED → Import → Clipboard
4. 貼上 JSON → Import

### 方法二：使用分離的 JS 檔案

1. 將各個 `.js` 檔案複製到可存取的位置
2. 在 Node-RED Function 節點中，使用 `eval()` 或 `require()` 載入
3. 或直接複製檔案內容到 Function 節點

---

## ⚙️ 系統參數

### Modbus TCP
- **IP:** 192.168.1.229
- **Port:** 1030
- **Timeout:** 依設定

### MQTT Broker
- **IP:** 192.168.1.233
- **Port:** 1883
- **Client ID:** 自動

### HMI TCP
- **Port:** 8888 (接收)
- **連線:** Server 或 Client 模式

### 輪詢間隔
- **預設:** 20 秒
- **可調整:** Inject 節點的 Repeat 設定

---

## 🎯 重點功能

### ✨ 新增功能（相較於 restructure）

1. **場景記憶系統**
   - 儲存任意設備組合的狀態
   - 支援 ON/OFF 兩組記憶
   - 一鍵執行記憶場景

2. **記憶查詢功能**
   - 查詢所有已儲存的記憶
   - 顯示記憶內容和設備數量
   - 支援清除記憶

3. **HMI 觸發輪詢**
   - 場景按鈕觸發完整輪詢
   - 確保所有設備狀態同步
   - 避免單一查詢遺漏

4. **完整設備覆蓋**
   - 24 個燈光設備完整註冊
   - 盤A + 盤B 全部支援
   - 輪詢查詢覆蓋所有設備

5. **動態 HVAC 支援**
   - 支援 0-255 任意模組 ID
   - 自動識別 HVAC 回應格式
   - 完整的模式/風速/溫度控制

---

## 📚 相關文件

- `SunWave協定筆記.md` - SunWave 協定說明
- `test_buttons.md` - HMI 測試按鈕定義
- `current_node.json` - 目前使用的節點配置

---

## 🐛 已知問題 / 待改進

1. ⚠️ **窗簾查詢回應格式未定義**
   - 目前只發送 Query，未處理回應

2. ⚠️ **記憶系統無持久化**
   - 重啟 Node-RED 會丟失所有記憶
   - 建議：使用 Context Store 持久化

3. ⚠️ **輪詢流量較大**
   - 24 個設備 × 20 秒 = 每秒 1.2 個查詢
   - HMI 觸發時會額外產生 24 個查詢
   - 建議：根據實際需求調整間隔

4. ⚠️ **HVAC 回應解析重複**
   - `未處理的回應` 區塊與正常 HVAC 解析重複
   - 建議：簡化邏輯

---

## 📄 授權

本專案僅供內部使用，請勿外傳。

---

## 📞 聯絡資訊

如有問題或建議，請聯繫系統管理員。

---

**最後更新：** 2024-12-02  
**版本：** 2.0 (完整版)
