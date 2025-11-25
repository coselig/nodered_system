# Test Full Integrated - 模組化拆解

此資料夾包含從 `test_full_integrated.json` 拆解出來的獨立模組。

## 📁 檔案結構

### 處理器函數 (Processors)

#### 1. `full_processor.js` / `full_processor.json`
**完整處理器 - 主要控制邏輯**

支援的設備類型：
- ✅ **Single Light** - 單色溫燈光控制
- ✅ **Dual Light** - 雙色溫燈光控制（亮度 + 色溫）
- ✅ **Relay** - 繼電器控制
- ✅ **Scene** - 場景控制（多燈聯動）
- ✅ **Cover** - 窗簾/捲簾控制
- ✅ **Query** - 設備狀態查詢

功能特性：
- 接收 MQTT 控制指令
- 轉換為 Modbus TCP 指令
- 快取管理（狀態、亮度、色溫）
- 獨立屬性調整（亮度/色溫不互相干擾）
- Debug 分類輸出

#### 2. `feedback_processor.js` / `feedback_processor.json`
**Feedback 處理器 - 回應解析**

功能：
- 解析 Modbus TCP 回應
- 更新快取狀態
- 發布 MQTT 狀態通知
- 支援 Query 查詢結果解析
- 自動狀態同步

寄存器映射：
- Single Light: `0x082A-0x082D` (4 個通道)
- Dual Light: 
  - Channel a: `0x082A` (亮度), `0x082B` (色溫)
  - Channel b: `0x082C` (亮度), `0x082D` (色溫)
- Relay: Coils `0x0000-0x0003`

#### 3. `hmi_processor.js` / `hmi_processor.json`
**HMI 處理器 - 觸控螢幕指令解析**

支援的 HMI 指令格式：
- **窗簾控制**: `[moduleId, 0x06, 0x01, 0x9b, 0x00, action, ...]`
  - action: `0x15` (開啟), `0x16` (關閉), `0x17` (停止)
  
- **場景控制**: `[0xfe, 0x06, 0x08, 0x20, operation, sceneId, ...]`
  - operation: `0x01` (開啟), `0x02` (關閉)
  
- **燈光控制**: `[0xEE, 0xB1, 0x11, 0x00, sceneId, 0x00, functionId, ...]`
  - functionId: `0x00` (切換), `0x01` (亮度+), `0x02` (亮度-)
  
- **HVAC 控制**: `[0x01, 0x31-0x34, value, 0x01, 0x01, hvacId]`
  - `0x31`: 電源模式
  - `0x32`: 溫度設定
  - `0x33`: 運轉模式
  - `0x34`: 風速設定

輸出：轉換為標準 MQTT 指令

### 配置檔案

#### `node_configs.json`
包含所有 Node-RED 節點配置：

- **MQTT In/Out**: 連接 Home Assistant (192.168.1.233:1883)
- **TCP Request**: Modbus TCP 連線 (192.168.1.208:502)
- **TCP In**: HMI 觸控螢幕輸入 (Port 8888)
- **Debug 節點**: 各類除錯輸出
- **Inject 節點**: Debug 控制開關
- **Group**: 流程群組設定

#### `all_nodes.json`
完整的 Node-RED flow 定義（原始檔案的完整副本）

## 🔧 使用方式

### 1. 查看函數邏輯
直接開啟 `.js` 檔案查看和編輯處理器邏輯：

```javascript
// full_processor.js
// 可以在這裡修改、測試、重構
```

### 2. 匯入 Node-RED
使用 `.json` 檔案匯入 Node-RED：

**方式一：匯入完整 Flow**
```
Node-RED UI → Menu → Import → 選擇 all_nodes.json
```

**方式二：匯入單一節點**
```
Node-RED UI → Menu → Import → 選擇 full_processor.json
```

### 3. 模組化開發
將 `.js` 檔案引入其他專案：

```javascript
// 在 Node.js 專案中使用
const fullProcessor = require('./restructure/full_processor.js');
```

## 🛠️ 維護建議

### 同步更新
修改 `.js` 檔案後，需同步更新到 `.json`：

```python
# 使用 Python 腳本同步
import json

with open('full_processor.json', 'r', encoding='utf-8') as f:
    node = json.load(f)

with open('full_processor.js', 'r', encoding='utf-8') as f:
    # 跳過註解區塊
    lines = f.readlines()
    start_idx = next(i for i, line in enumerate(lines) if '*/' in line) + 1
    func_code = ''.join(lines[start_idx:]).lstrip()

node['func'] = func_code

with open('full_processor.json', 'w', encoding='utf-8') as f:
    json.dump(node, f, indent=4, ensure_ascii=False)
```

### 測試流程
1. 修改 `.js` 檔案
2. 同步到 `.json`
3. 匯入 Node-RED 測試
4. 確認功能正常
5. 提交版本控制

## 📋 重要修復紀錄

### Dual Light 色溫調整修復 (2024)
**問題**：調整色溫時會同時發送亮度指令，導致色溫變更被覆蓋

**解決方案**：在 `full_processor.js` 中增加獨立處理邏輯
```javascript
if (subType === "dual" && attribute === "colortemp") {
    // 只發送色溫指令，不觸發完整控制流程
    const cmdColortemp = buildCommand(moduleId, regs[1], ctPercent);
    return [modbusMessages, []];
}
```

**效果**：色溫調整獨立運作，不影響亮度狀態

## 🔗 相關檔案

- 原始檔案: `../functions/unitest/test_full_integrated.json`
- 函數庫: `../functions/` (其他處理器函數)
- 文件: `../SunWave協定筆記.md`

## 📞 支援

如有問題請參考：
- SunWave 協定文件
- Node-RED 官方文件
- Modbus TCP 規範
