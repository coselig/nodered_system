# System V2 vs Restructure 對比

## 📊 模組對比表

| 模組名稱 | restructure | system_v2 | 主要差異 |
|---------|-------------|-----------|---------|
| Full Processor | ✅ | ✅ | V2 新增 Memory + Scene 執行功能 |
| Feedback Processor | ✅ | ✅ | 基本相同 |
| HMI Processor | ✅ | ✅ | V2 場景改為觸發輪詢模式 |
| Polling Query | ✅ (functions/) | ✅ | V2 擴展到 24 個設備 |
| General Config | ✅ (functions/) | ✅ | V2 註冊更多設備 |
| Debug Tools | ✅ (functions/) | ❌ | 未包含在 V2 |
| Modbus Queue | ✅ (functions/) | ❌ | V2 直接發送 |
| MQTT Queue | ✅ (functions/) | ❌ | V2 直接發送 |

## 🆕 System V2 新增功能

### 1. 場景記憶系統
```
Topic: homeassistant/memory/{sceneId}/{operation}/save/set
Payload: {
  "scene_name": "會議室_ON",
  "devices": [...],
  "timestamp": "2024-12-02T..."
}
```

**功能：**
- 儲存任意設備組合的當前狀態
- 支援 4 個場景 × 2 種操作 (ON/OFF) = 8 組記憶
- 透過 Flow Context 儲存

### 2. 場景執行
```
Topic: homeassistant/scene/{sceneId}/{operation}/execute/set
Payload: (任意)
```

**功能：**
- 一鍵執行儲存的場景記憶
- 自動發送 MQTT 指令到所有設備
- 不需要經過 Modbus（直接控制）

### 3. 記憶查詢
```
Topic: homeassistant/memory/query/all
Payload: (任意)
```

**功能：**
- 查詢所有已儲存的記憶
- 返回記憶摘要 + 完整設備詳情
- 顯示設備數量和儲存時間

### 4. HMI 觸發輪詢
```
HMI 場景按鈕按下 → 觸發輪詢查詢 → 查詢所有 24 個設備
```

**舊模式 (restructure)：**
- 場景按鈕 → 發布場景狀態
- 僅更新 HA UI 場景狀態
- 不查詢實際設備狀態

**新模式 (system_v2)：**
- 場景按鈕 → 觸發完整輪詢
- 查詢所有 24 個設備的實際狀態
- 確保 HA UI 與設備完全同步

### 5. 擴展的輪詢範圍

**restructure (12 個設備)：**
```javascript
// 僅盤B
15-1, 15-2        // 客廳
16-1, 16-2        // 走道
17-1, 17-2        // 廚房
18-1, 18-2        // 1F 燈
19-1, 19-2        // 2F 燈
14-a, 14-b        // 會議室雙色溫
```

**system_v2 (24 個設備)：**
```javascript
// 盤A (12 個)
11-1, 11-2        // 走廊間照
12-1, 12-2, 12-3, 12-4  // 泡茶區、走道崁燈、展示櫃
13-1, 13-2, 13-3, 13-4  // 會議間照、冷氣間照、會議崁燈
14-a, 14-b        // 會議室雙色溫

// 盤B (12 個)
15-1, 15-2        // 客廳
16-1, 16-2        // 走道
17-1, 17-2        // 廚房
18-1, 18-2        // 1F 燈
19-1, 19-2        // 2F 燈
```

## ❌ System V2 移除的功能

### 1. Debug Tools (debug_tools.js)
- **原因：** 已整合到各個 Processor 中
- **替代方案：** 使用 Debug 控制 (global.debug_config)

### 2. Modbus Queue (modbus_queue.js)
- **原因：** V2 採用直接發送模式
- **影響：** 無排隊機制，可能有衝突風險
- **建議：** 如需要高並發，請重新加入

### 3. MQTT Queue (mqtt_queue.js)
- **原因：** MQTT Broker 自帶排隊機制
- **影響：** 無本地排隊，依賴 Broker
- **建議：** 通常不需要

## 🔄 架構差異

### Restructure 架構
```
MQTT In
  ↓
Full Processor
  ↓
[Modbus Queue] ← 排隊機制
  ↓
TCP Request → Modbus
  ↓
Feedback Processor
  ↓
[MQTT Queue] ← 排隊機制
  ↓
MQTT Out
```

### System V2 架構
```
MQTT In
  ↓
Full Processor
  ↓
TCP Request → Modbus (直接發送)
  ↓
Feedback Processor
  ↓
MQTT Out (直接發送)
```

**優點：**
- ✅ 更簡潔的流程
- ✅ 更低的延遲
- ✅ 更少的節點

**缺點：**
- ⚠️ 無排隊機制，可能衝突
- ⚠️ 高並發時可能遺失指令

## 📈 效能對比

| 項目 | restructure | system_v2 |
|------|------------|-----------|
| 節點數量 | ~15 個 | ~10 個 |
| 延遲 | 較高 (有排隊) | 較低 (直接) |
| 可靠性 | 高 (有排隊) | 中 (無排隊) |
| 記憶體使用 | 較高 | 較低 |
| 功能完整性 | 基本 | **完整** (含場景記憶) |
| 輪詢設備數 | 12 個 | **24 個** |

## 💡 選擇建議

### 選擇 Restructure 如果：
1. ✅ 需要可靠的排隊機制
2. ✅ 高並發控制 (多個 HA 自動化同時觸發)
3. ✅ 不需要場景記憶功能
4. ✅ 只需要部分設備輪詢

### 選擇 System V2 如果：
1. ✅ 需要場景記憶/執行功能
2. ✅ 需要完整的 24 個設備輪詢
3. ✅ HMI 觸發輪詢功能
4. ✅ 更低的延遲優先
5. ✅ 並發需求不高

## 🔧 遷移建議

### 從 Restructure 升級到 System V2

**步驟：**

1. **備份現有流程**
   ```powershell
   Copy-Item "c:\Users\admin\Desktop\yun\restructure" -Destination "c:\Users\admin\Desktop\yun\restructure_backup" -Recurse
   ```

2. **保留 Queue 功能（可選）**
   - 複製 `modbus_queue.js` 到 system_v2
   - 在 Full Processor 和 TCP Request 之間插入

3. **更新輪詢列表**
   - 檢查 `polling_query.js` 中的設備列表
   - 確認所有設備都已註冊

4. **測試場景記憶**
   - 透過 MQTT 發送 save 指令
   - 驗證記憶已儲存
   - 測試執行功能

5. **調整輪詢間隔**
   - 根據實際需求調整 Inject 節點
   - 建議：15-30 秒

### 從 System V2 降級到 Restructure

**原因：**
- 需要更可靠的排隊機制
- 不需要場景記憶功能
- 並發控制問題

**步驟：**

1. **匯入 Restructure JSON**
   - 使用原始的 restructure 配置

2. **加入 Queue 節點**
   - 使用 `modbus_queue.js`
   - 使用 `mqtt_queue.js`

3. **調整輪詢列表**
   - 如需要完整 24 個設備
   - 手動更新 polling_query.js

## 📋 功能對照表

| 功能 | restructure | system_v2 | 備註 |
|------|------------|-----------|------|
| 單色燈控制 | ✅ | ✅ | 相同 |
| 雙色溫燈控制 | ✅ | ✅ | 相同 |
| 繼電器控制 | ✅ | ✅ | 相同 |
| 窗簾控制 | ✅ | ✅ | 相同 |
| HVAC 控制 | ✅ | ✅ | V2 支援動態模組 ID |
| 設備查詢 | ✅ | ✅ | 相同 |
| 定時輪詢 | ✅ (12 個) | ✅ (24 個) | V2 擴展 |
| HMI 窗簾控制 | ✅ | ✅ | 相同 |
| HMI 場景按鈕 | 狀態同步 | 觸發輪詢 | **不同** |
| HMI 燈光控制 | Query 模式 | 觸發輪詢 | **不同** |
| HMI 空調控制 | ✅ | ✅ | 相同 |
| 場景記憶儲存 | ❌ | ✅ | **V2 新增** |
| 場景執行 | ❌ | ✅ | **V2 新增** |
| 記憶查詢 | ❌ | ✅ | **V2 新增** |
| Modbus 排隊 | ✅ | ❌ | V2 移除 |
| MQTT 排隊 | ✅ | ❌ | V2 移除 |
| Debug 工具 | ✅ | 整合 | 分散到各模組 |

## 🎯 總結

**System V2 定位：**
- 完整功能版本
- 支援場景記憶系統
- 24 個設備完整輪詢
- HMI 觸發輪詢模式
- 適合單一控制源使用

**Restructure 定位：**
- 基礎穩定版本
- 可靠的排隊機制
- 部分設備輪詢
- HMI 狀態同步模式
- 適合多控制源併發使用

**建議：**
- 一般家庭使用 → **System V2**
- 商業/多用戶環境 → **Restructure + Queue**
- 需要場景記憶 → **System V2**
- 需要高並發 → **Restructure**

---

**更新日期：** 2024-12-02  
**版本：** 1.0
