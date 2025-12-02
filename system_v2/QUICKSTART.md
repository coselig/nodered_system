# System V2 快速開始指南

## 🚀 5 分鐘快速部署

### 步驟 1：確認環境

**需求：**
- Node-RED 已安裝並運行
- MQTT Broker (192.168.1.233:1883)
- Modbus TCP 設備 (192.168.1.229:1030)
- HMI 觸控螢幕 (可選，TCP 8888)

### 步驟 2：建立基本流程

#### 2.1 MQTT 輸入節點
```
節點類型: mqtt in
名稱: MQTT 訂閱所有控制
主題: homeassistant/+/+/+/+/set/#
QoS: 0
Broker: 192.168.1.233:1883
```

#### 2.2 Full Processor
```
節點類型: function
名稱: 完整處理器 (All Devices)
程式碼: 複製 full_processor.js 的內容
輸出數: 2
初始化: node.warn("=== 初始化完整測試系統 ===");
```

#### 2.3 TCP Request
```
節點類型: tcp request
名稱: TCP → Modbus
伺服器: 192.168.1.229
埠: 1030
回傳: buffer
逾時: (使用預設)
```

#### 2.4 Feedback Processor
```
節點類型: function
名稱: Feedback 處理器 + 狀態解析
程式碼: 複製 feedback_processor.js 的內容
輸出數: 2
```

#### 2.5 MQTT 輸出節點
```
節點類型: mqtt out
名稱: MQTT 發布狀態
QoS: 0
Retain: true
Broker: 192.168.1.233:1883
```

### 步驟 3：連接節點

```
[MQTT In] → [Full Processor]
                ├─ Output 1 → [TCP Request] → [Feedback Processor]
                │                                  ├─ Output 1 → [Debug: Feedback 解析]
                │                                  └─ Output 2 → [MQTT Out]
                └─ Output 2 → [MQTT Out]
```

### 步驟 4：設置 Debug 節點（可選）

```
[Full Processor Output 1] → [Debug: Modbus 指令]
[Feedback Processor Output 1] → [Debug: Feedback 解析]
[MQTT Out] → [Debug: MQTT 狀態回報]
```

### 步驟 5：新增輪詢查詢

#### 5.1 Inject 節點
```
節點類型: inject
名稱: 輪詢
重複: interval - 每 20 秒
首次延遲: 0.1 秒
啟動時注入: 啟用
```

#### 5.2 Polling Query
```
節點類型: function
名稱: 輪詢
程式碼: 複製 polling_query.js 的內容
```

#### 5.3 連接
```
[Inject: 每 20 秒] → [Polling Query] → [MQTT Out]
```

### 步驟 6：新增 HMI 支援（可選）

#### 6.1 TCP In 節點
```
節點類型: tcp in
名稱: HMI 輸入 (TCP)
類型: Client 或 Server
主機: 192.168.1.229
埠: 8888
輸出: buffer (stream)
```

#### 6.2 HMI Processor
```
節點類型: function
名稱: HMI 處理器
程式碼: 複製 hmi_processor.js 的內容
```

#### 6.3 連接
```
[TCP In: HMI 8888] → [HMI Processor] → [MQTT Out]
```

### 步驟 7：註冊設備到 Home Assistant

#### 7.1 Inject 節點
```
節點類型: inject
名稱: 註冊虛擬裝置
Payload: (空)
注入一次: 按鈕
```

#### 7.2 General Configuration
```
節點類型: function
名稱: 註冊裝置
程式碼: 複製 general_configuration.js 的內容
```

#### 7.3 連接
```
[Inject: 註冊虛擬裝置] → [General Configuration] → [MQTT Out]
```

#### 7.4 執行註冊
1. 按下「註冊虛擬裝置」按鈕
2. 等待 MQTT 發送完成
3. 檢查 Home Assistant → 設定 → 裝置與服務 → MQTT
4. 應該看到所有設備（17 個燈光 + 5 個窗簾 + 4 個空調）

---

## 🎮 基本測試

### 測試 1：控制單色燈

**方法：** 透過 MQTT Explorer 或 HA UI

```
Topic: homeassistant/light/single/11/1/set
Payload: ON
```

**預期結果：**
1. Debug 顯示 Modbus 指令
2. 燈光實際亮起
3. 收到狀態回報: `homeassistant/light/single/11/1/state` → `ON`

### 測試 2：調整亮度

```
Topic: homeassistant/light/single/11/1/set/brightness
Payload: 75
```

**預期結果：**
1. 快取更新為 75%
2. 燈光亮度調整到 75%
3. 收到亮度回報: `homeassistant/light/single/11/1/brightness` → `75`

### 測試 3：控制雙色溫燈

```
Topic: homeassistant/light/dual/14/a/set
Payload: ON
```

**預期結果：**
1. 同時發送亮度 + 色溫指令
2. 燈光亮起並設定色溫
3. 收到狀態 + 亮度 + 色溫回報

### 測試 4：輪詢查詢

**方法：** 等待 20 秒或手動觸發

**預期結果：**
1. Debug 顯示 24 個查詢指令
2. 收到所有設備的狀態回報
3. HA UI 更新所有設備狀態

### 測試 5：HMI 控制（需要實體 HMI）

**方法：** 在 HMI 上按場景按鈕

**預期結果：**
1. HMI Processor 顯示: "HMI場景按鈕: ... → 觸發輪詢"
2. 發布 `homeassistant/polling/trigger` → `query_all`
3. Polling Query 觸發
4. 查詢所有 24 個設備
5. HA UI 完全同步

---

## 🐛 故障排除

### 問題 1：設備不回應

**檢查：**
1. Modbus TCP 連線是否正常？
   ```powershell
   Test-NetConnection -ComputerName 192.168.1.229 -Port 1030
   ```
2. Full Processor 是否有輸出？
3. TCP Request 是否有錯誤？

**解決：**
- 確認 Modbus 設備 IP 和埠
- 檢查網路連線
- 查看 Debug 節點的輸出

### 問題 2：狀態不更新

**檢查：**
1. MQTT Broker 是否連線？
2. Feedback Processor 是否有輸出？
3. MQTT Out 節點是否連接正確？

**解決：**
- 確認 MQTT Broker IP 和埠
- 檢查 Topic 格式是否正確
- 啟用 Debug 節點查看輸出

### 問題 3：輪詢不執行

**檢查：**
1. Inject 節點是否啟用？
2. Polling Query 是否有輸出？
3. 時間間隔設定是否正確？

**解決：**
- 檢查 Inject 節點的「重複」設定
- 手動按 Inject 按鈕測試
- 查看 Debug 節點輸出

### 問題 4：HMI 無反應

**檢查：**
1. TCP In 節點是否連線？
2. HMI Processor 是否有輸出？
3. HMI 設備 IP 是否正確？

**解決：**
- 確認 HMI TCP 模式（Client 或 Server）
- 檢查 HMI 設備的 IP 和埠
- 查看 HMI Processor 的 Debug 輸出

### 問題 5：記憶功能不工作

**檢查：**
1. Flow Context 是否啟用？
2. 儲存指令格式是否正確？
3. 設備 Topic 是否正確？

**解決：**
- 確認 msg.payload 是 JSON 格式
- 檢查設備 Topic 是否存在
- 使用「查詢所有記憶」功能驗證

---

## 📊 效能調整

### 調整輪詢間隔

**預設：** 20 秒

**建議：**
- 低流量環境：15 秒
- 一般使用：20-30 秒
- 高流量環境：30-60 秒

**修改方式：**
1. 編輯 Inject 節點
2. 修改「重複」→「interval」
3. 重新部署

### 減少輪詢設備數量

**修改 polling_query.js：**
```javascript
const QUERY_DEVICES = [
    // 只保留需要的設備
    { type: "single", moduleId: 11, channel: "1" },
    // ...
];
```

### 啟用/停用 Debug 訊息

**全域控制：**
```javascript
global.set('debug_config', {
    topic: false,       // 關閉 Topic 顯示
    cache: false,       // 關閉快取顯示
    modbus: true,       // 保留 Modbus 顯示
    mqtt: false,        // 關閉 MQTT 顯示
    scene: false,       // 關閉 Scene 顯示
    query: false,       // 關閉 Query 顯示
    hmi: false          // 關閉 HMI 顯示
});
```

**快速切換：**
使用預設的 Debug 控制節點（Inject + Function）

---

## 🎓 進階功能

### 1. 場景記憶儲存

**MQTT 指令：**
```json
Topic: homeassistant/memory/0x02/0x01/save/set
Payload: {
  "scene_name": "會議室_ON",
  "devices": [
    "homeassistant/light/single/13/1",
    "homeassistant/light/single/13/2",
    "homeassistant/light/dual/14/a"
  ],
  "timestamp": "2024-12-02T15:30:00.000Z"
}
```

### 2. 場景執行

**MQTT 指令：**
```
Topic: homeassistant/scene/0x02/0x01/execute/set
Payload: (任意)
```

### 3. 查詢所有記憶

**MQTT 指令：**
```
Topic: homeassistant/memory/query/all
Payload: (任意)
```

### 4. 手動觸發輪詢

**MQTT 指令：**
```
Topic: homeassistant/polling/trigger
Payload: query_all
```

---

## 📚 下一步

1. **閱讀完整文件：** `README.md`
2. **了解差異：** `COMPARISON.md`
3. **查看協定：** `../SunWave協定筆記.md`
4. **HMI 定義：** `../test_buttons.md`

---

## 💬 常見問題

**Q: 可以同時使用 restructure 和 system_v2 嗎？**  
A: 不建議。兩者會衝突，建議只部署其中一個。

**Q: 如何備份場景記憶？**  
A: 使用「查詢所有記憶」功能，將結果儲存為 JSON 檔案。

**Q: HMI 觸發輪詢會增加多少流量？**  
A: 每次按場景按鈕 = 24 個查詢 = 約 2 秒完成。

**Q: 可以加入 Queue 機制嗎？**  
A: 可以。參考 `restructure/modbus_queue.js` 並插入到 Full Processor 和 TCP Request 之間。

**Q: 支援其他 Modbus 設備嗎？**  
A: 需要修改 Full Processor 和 Feedback Processor，新增對應的設備類型處理。

---

**祝你部署順利！** 🎉

如有問題，請查看 Debug 輸出或聯繫系統管理員。
