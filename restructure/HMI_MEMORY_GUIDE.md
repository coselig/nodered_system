# HMI 記憶功能整合指南

## 📋 功能說明

HMI 記憶功能已整合到主處理程序（`full_processor.js`），實現統一的狀態記憶與場景執行。

## 🔄 運作流程

```
HMI 記憶按鈕 (0x81-0x88)
    ↓
HMI Processor 解析
    ↓
發布 MQTT: homeassistant/memory/{sceneId}/{operation}/save/set
    ↓
Full Processor 接收並處理
    ↓
讀取所有設備當前狀態 → 儲存到 Flow Cache
    ↓
完成！記憶已儲存


HMI 測試按鈕 (場景執行)
    ↓
HMI Processor 解析
    ↓
發布 MQTT: homeassistant/scene/{sceneId}/{operation}/execute/set
    ↓
Full Processor 接收並處理
    ↓
從 Flow Cache 讀取記憶 → 恢復所有設備狀態
    ↓
發送 MQTT 控制指令 → 更新設備
    ↓
完成！場景已執行
```

## 🎯 記憶場景定義

### 場景 ID 映射

| HMI 按鈕 | Scene ID | 場景名稱 | 包含設備 |
|---------|----------|---------|---------|
| 0x81 / 0x82 | 0x02 | 會議室 | 13-1, 13-2, 13-3 (Single)<br>14-a, 14-b (Dual) |
| 0x83 / 0x84 | 0x03 | 公共區 | 11-1, 11-2 (Single)<br>12-1, 12-2, 12-3, 12-4 (Single) |
| 0x85 / 0x86 | 0x04 | 戶外 | 18-1, 18-2 (Single)<br>19-1, 19-2 (Single) |
| 0x87 / 0x88 | 0x05 | H40二樓 | 15-1, 15-2, 16-1, 16-2 (Single)<br>17-1, 17-2, 18-1, 18-2 (Single)<br>19-1, 19-2 (Single) |

### 操作類型

| 操作碼 | 操作類型 | 說明 |
|-------|---------|------|
| 0x01 | ON | 儲存/執行 開啟狀態 |
| 0x02 | OFF | 儲存/執行 關閉狀態 |

## 📝 MQTT Topic 格式

### 1. 儲存記憶

**Topic**: `homeassistant/memory/{sceneId}/{operation}/save/set`

**Payload** (JSON):
```json
{
    "scene_name": "會議室_ON",
    "devices": [
        "homeassistant/light/single/13/1",
        "homeassistant/light/single/13/2",
        "homeassistant/light/dual/14/a"
    ],
    "timestamp": "2025-11-25T13:45:30.123Z"
}
```

**範例**:
```
Topic: homeassistant/memory/0x02/0x01/save/set
Payload: {"scene_name": "會議室_ON", "devices": [...], "timestamp": "..."}
```

### 2. 執行記憶場景

**Topic**: `homeassistant/scene/{sceneId}/{operation}/execute/set`

**Payload**: `"ON"` (任意值皆可)

**範例**:
```
Topic: homeassistant/scene/0x02/0x01/execute/set
Payload: ON
```

## 💾 Cache 資料結構

### 記憶資料儲存格式

**Cache Key**: `memory_{sceneId}_{operation}`

**範例**: `memory_0x02_0x01` (會議室 ON 狀態)

**資料結構**:
```javascript
{
    scene_name: "會議室_ON",
    timestamp: "2025-11-25T13:45:30.123Z",
    devices: {
        "homeassistant/light/single/13/1": {
            state: "ON",
            brightness: 80,
            colortemp: undefined
        },
        "homeassistant/light/dual/14/a": {
            state: "ON",
            brightness: 60,
            colortemp: 250
        }
    }
}
```

### 設備狀態儲存

每個設備的狀態分別儲存：

**Single Light**:
- `single_13_1_state`: "ON" / "OFF"
- `single_13_1_brightness`: 0-100

**Dual Light**:
- `dual_14_a_state`: "ON" / "OFF"
- `dual_14_a_brightness`: 0-100
- `dual_14_a_colortemp`: 167-333 (mired)

## 🔍 Debug 訊息

啟用 cache 和 scene debug：
```javascript
global.set('debug_config', {
    topic: true,
    cache: true,
    scene: true,
    hmi: true
});
```

### 儲存記憶時的 Debug 輸出

```
=== 儲存記憶 memory_0x02_0x01 ===
場景名稱: 會議室_ON
設備數量: 5
  homeassistant/light/single/13/1: ON 80%
  homeassistant/light/single/13/2: ON 75%
  homeassistant/light/single/13/3: ON 90%
  homeassistant/light/dual/14/a: ON 60% 250K
  homeassistant/light/dual/14/b: ON 55% 280K
✅ 記憶已儲存: memory_0x02_0x01
```

### 執行記憶時的 Debug 輸出

```
=== 執行記憶場景 memory_0x02_0x01 ===
場景名稱: 會議室_ON
儲存時間: 2025-11-25T13:45:30.123Z
  homeassistant/light/single/13/1: ON 80%
  homeassistant/light/single/13/2: ON 75%
  homeassistant/light/single/13/3: ON 90%
  homeassistant/light/dual/14/a: ON 60% 250K
  homeassistant/light/dual/14/b: ON 55% 280K
```

## 🧪 測試步驟

### 測試 1: 儲存記憶

1. **手動調整設備狀態**:
   ```
   發送: homeassistant/light/single/13/1/set → ON
   發送: homeassistant/light/single/13/1/set/brightness → 80
   發送: homeassistant/light/dual/14/a/set → ON
   發送: homeassistant/light/dual/14/a/set/brightness → 60
   發送: homeassistant/light/dual/14/a/set/colortemp → 250
   ```

2. **按下 HMI 記憶按鈕** (或手動發送 MQTT):
   ```
   Topic: homeassistant/memory/0x02/0x01/save/set
   Payload: {
       "scene_name": "會議室_ON",
       "devices": [
           "homeassistant/light/single/13/1",
           "homeassistant/light/dual/14/a"
       ],
       "timestamp": "2025-11-25T14:00:00.000Z"
   }
   ```

3. **確認記憶已儲存**:
   - 檢查 Node-RED Debug 訊息
   - Node 狀態顯示: `記憶: 會議室_ON (2個設備)`

### 測試 2: 執行記憶

1. **手動修改設備狀態** (測試恢復):
   ```
   發送: homeassistant/light/single/13/1/set → OFF
   發送: homeassistant/light/dual/14/a/set/brightness → 20
   ```

2. **按下 HMI 測試按鈕** (或手動發送 MQTT):
   ```
   Topic: homeassistant/scene/0x02/0x01/execute/set
   Payload: ON
   ```

3. **確認設備恢復到記憶狀態**:
   - 檢查設備狀態是否恢復
   - Node 狀態顯示: `執行記憶: 會議室_ON (2個設備)`

### 測試 3: HMI 整合測試

1. **透過 HMI 觸控螢幕**:
   - 調整燈光亮度、色溫到想要的狀態
   - 按下記憶按鈕 (0x81 - 會議室 ON)
   - 修改燈光狀態
   - 按下測試按鈕 (場景 0x02 操作 0x01)
   - 確認燈光恢復到記憶狀態

## ⚠️ 注意事項

1. **記憶容量**: 
   - 每個場景 ID + 操作組合都是獨立的記憶
   - 總共可儲存 4 × 2 = 8 組記憶 (4個場景 × 2種操作)

2. **記憶持久性**:
   - 記憶儲存在 Flow Context 中
   - Node-RED 重啟後會消失
   - 如需持久化，需啟用 Context Storage

3. **設備狀態**:
   - 只記憶 Light 設備 (Single/Dual)
   - 不記憶 Relay、Cover、HVAC
   - 如需支援其他設備類型，需擴充程式碼

4. **執行順序**:
   - 先更新 Cache
   - 再發送 MQTT 指令
   - 確保狀態一致性

## 🔧 擴充建議

### 啟用持久化儲存

在 `settings.js` 中設定:
```javascript
contextStorage: {
    default: {
        module: "localfilesystem"
    }
}
```

修改儲存方式:
```javascript
// 使用 context.global 而不是 flow
context.global.set(memoryKey, memoryRecord);
```

### 支援更多設備類型

在記憶儲存區塊中新增:
```javascript
if (devType === "cover") {
    // 儲存 Cover 狀態
} else if (devType === "climate") {
    // 儲存 HVAC 狀態
}
```

### 增加記憶管理功能

新增 Topic:
- `homeassistant/memory/list` - 列出所有記憶
- `homeassistant/memory/{id}/delete` - 刪除記憶
- `homeassistant/memory/{id}/export` - 匯出記憶

## 📊 系統狀態

| 功能 | 狀態 | 說明 |
|-----|------|-----|
| HMI 記憶儲存 | ✅ 已整合 | 透過 MQTT 處理 |
| HMI 記憶執行 | ✅ 已整合 | 透過 MQTT 處理 |
| Single Light | ✅ 支援 | 記憶 state + brightness |
| Dual Light | ✅ 支援 | 記憶 state + brightness + colortemp |
| Relay | ❌ 未支援 | 可擴充 |
| Cover | ❌ 未支援 | 可擴充 |
| HVAC | ❌ 未支援 | 可擴充 |
| 持久化儲存 | ❌ 未啟用 | 需設定 Context Storage |

## 🎉 完成！

HMI 記憶功能已完整整合到主處理程序，現在可以：
- 透過 HMI 按鈕儲存和執行場景
- 透過 MQTT 手動觸發記憶功能
- 統一管理所有設備的狀態記憶
- Debug 訊息清楚顯示運作狀態

需要測試或有問題請隨時提出！
