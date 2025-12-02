"""
System V2 匯出工具
將所有 JS 模組檔案轉換為 Node-RED Flow JSON

使用方式：
python export_to_json.py

輸出：system_v2_flow.json
"""

import json
import os
import random
from pathlib import Path


def generate_id():
    """生成唯一的 Node ID"""
    return ''.join(random.choices('0123456789abcdef', k=16))


def read_js_file(filename):
    """讀取 JS 檔案內容"""
    file_path = Path(__file__).parent / filename
    if not file_path.exists():
        print(f"❌ 找不到檔案: {filename}")
        return None
    
    content = file_path.read_text(encoding='utf-8')
    print(f"✅ 讀取: {filename} ({len(content)} bytes)")
    return content


def main():
    # MQTT Broker 配置
    mqtt_broker_id = generate_id()

    # 創建 Node-RED Flow JSON
    flow = {
        "id": generate_id(),
        "type": "tab",
        "label": "System V2 - 完整智能家居控制系統",
        "disabled": False,
        "info": "從 system_v2 模組自動生成\n支援所有設備類型：Light, Cover, HVAC, Scene, Memory"
    }

    # Group 容器
    main_group_id = generate_id()
    main_group = {
        "id": main_group_id,
        "type": "group",
        "z": flow["id"],
        "name": "完整整合系統 (System V2)",
        "style": {
            "label": True,
            "stroke": "#7c3aed",
            "fill": "#f3e8ff",
            "fill-opacity": "0.5"
        },
        "nodes": [],
        "x": 14,
        "y": 39,
        "w": 1252,
        "h": 682
    }

    nodes = []

    # ========== 1. MQTT In 節點 ==========
    mqtt_in_id = generate_id()
    nodes.append({
        "id": mqtt_in_id,
        "type": "mqtt in",
        "z": flow["id"],
        "g": main_group_id,
        "name": "MQTT 訂閱所有控制",
        "topic": "homeassistant/+/+/+/+/set/#",
        "qos": "0",
        "datatype": "auto-detect",
        "broker": mqtt_broker_id,
        "nl": False,
        "rap": True,
        "rh": 0,
        "inputs": 0,
        "x": 130,
        "y": 180,
        "wires": [[]]
    })

    # ========== 2. Full Processor 節點 ==========
    full_processor_id = generate_id()
    full_processor_code = read_js_file('full_processor.js')
    if not full_processor_code:
        print('❌ 無法讀取 full_processor.js')
        return

    nodes.append({
        "id": full_processor_id,
        "type": "function",
        "z": flow["id"],
        "g": main_group_id,
        "name": "完整處理器 (All Devices)",
        "func": full_processor_code,
        "outputs": 2,
        "timeout": 0,
        "noerr": 0,
        "initialize": 'node.warn("=== 初始化 System V2 ===");',
        "finalize": "",
        "libs": [],
        "x": 350,
        "y": 180,
        "wires": [[], []]
    })

    # 連接 MQTT In → Full Processor
    nodes[0]["wires"][0].append(full_processor_id)

    # ========== 3. TCP Request 節點 ==========
    tcp_request_id = generate_id()
    nodes.append({
        "id": tcp_request_id,
        "type": "tcp request",
        "z": flow["id"],
        "g": main_group_id,
        "name": "TCP → Modbus",
        "server": "192.168.1.229",
        "port": "1030",
        "out": "time",
        "ret": "buffer",
        "splitc": "0",
        "newline": "",
        "trim": False,
        "tls": "",
        "x": 620,
        "y": 180,
        "wires": [[]]
    })

    # 連接 Full Processor Output 1 → TCP Request
    nodes[1]["wires"][0].append(tcp_request_id)

    # ========== 4. Feedback Processor 節點 ==========
    feedback_processor_id = generate_id()
    feedback_processor_code = read_js_file('feedback_processor.js')
    if not feedback_processor_code:
        print('❌ 無法讀取 feedback_processor.js')
        return

    nodes.append({
        "id": feedback_processor_id,
        "type": "function",
        "z": flow["id"],
        "g": main_group_id,
        "name": "Feedback 處理器",
        "func": feedback_processor_code,
        "outputs": 2,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 840,
        "y": 180,
        "wires": [[], []]
    })

    # 連接 TCP Request → Feedback Processor
    nodes[2]["wires"][0].append(feedback_processor_id)

    # ========== 5. MQTT Out 節點 ==========
    mqtt_out_id = generate_id()
    nodes.append({
        "id": mqtt_out_id,
        "type": "mqtt out",
        "z": flow["id"],
        "g": main_group_id,
        "name": "MQTT 發布狀態",
        "topic": "",
        "qos": "0",
        "retain": "true",
        "respTopic": "",
        "contentType": "",
        "userProps": "",
        "correl": "",
        "expiry": "",
        "broker": mqtt_broker_id,
        "x": 1100,
        "y": 180,
        "wires": []
    })

    # 連接 Full Processor Output 2 → MQTT Out
    nodes[1]["wires"][1].append(mqtt_out_id)
    # 連接 Feedback Processor Output 2 → MQTT Out
    nodes[3]["wires"][1].append(mqtt_out_id)

    # ========== 6. Debug 節點們 ==========
    debug_modbus_id = generate_id()
    nodes.append({
        "id": debug_modbus_id,
        "type": "debug",
        "z": flow["id"],
        "g": main_group_id,
        "name": "Modbus 指令",
        "active": True,
        "tosidebar": True,
        "console": False,
        "tostatus": False,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 620,
        "y": 100,
        "wires": []
    })

    debug_feedback_id = generate_id()
    nodes.append({
        "id": debug_feedback_id,
        "type": "debug",
        "z": flow["id"],
        "g": main_group_id,
        "name": "Feedback 解析",
        "active": True,
        "tosidebar": True,
        "console": False,
        "tostatus": False,
        "complete": "feedback",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 1100,
        "y": 100,
        "wires": []
    })

    debug_mqtt_id = generate_id()
    nodes.append({
        "id": debug_mqtt_id,
        "type": "debug",
        "z": flow["id"],
        "g": main_group_id,
        "name": "MQTT 狀態回報",
        "active": True,
        "tosidebar": True,
        "console": False,
        "tostatus": False,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 1100,
        "y": 240,
        "wires": []
    })

    # 連接 Debug 節點
    nodes[1]["wires"][0].append(debug_modbus_id)
    nodes[3]["wires"][0].append(debug_feedback_id)
    nodes[3]["wires"][1].append(debug_mqtt_id)

    # ========== 7. HMI TCP In 節點 ==========
    hmi_tcp_in_id = generate_id()
    nodes.append({
        "id": hmi_tcp_in_id,
        "type": "tcp in",
        "z": flow["id"],
        "g": main_group_id,
        "name": "HMI 輸入 (TCP)",
        "server": "client",
        "host": "192.168.1.229",
        "port": "8888",
        "datamode": "stream",
        "datatype": "buffer",
        "newline": "",
        "topic": "",
        "trim": False,
        "base64": False,
        "tls": "",
        "x": 130,
        "y": 300,
        "wires": [[]]
    })

    # ========== 8. HMI Processor 節點 ==========
    hmi_processor_id = generate_id()
    hmi_processor_code = read_js_file('hmi_processor.js')
    if not hmi_processor_code:
        print('❌ 無法讀取 hmi_processor.js')
        return

    nodes.append({
        "id": hmi_processor_id,
        "type": "function",
        "z": flow["id"],
        "g": main_group_id,
        "name": "HMI 處理器",
        "func": hmi_processor_code,
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 330,
        "y": 300,
        "wires": [[]]
    })

    # 連接 HMI TCP In → HMI Processor → MQTT Out
    nodes[8]["wires"][0].append(hmi_processor_id)
    nodes[9]["wires"][0].append(mqtt_out_id)

    # ========== 9. Polling Inject 節點 ==========
    polling_inject_id = generate_id()
    nodes.append({
        "id": polling_inject_id,
        "type": "inject",
        "z": flow["id"],
        "g": main_group_id,
        "name": "輪詢 (每20秒)",
        "props": [],
        "repeat": "20",
        "crontab": "",
        "once": True,
        "onceDelay": 0.1,
        "topic": "",
        "x": 140,
        "y": 400,
        "wires": [[]]
    })

    # ========== 10. Polling Query 節點 ==========
    polling_query_id = generate_id()
    polling_query_code = read_js_file('polling_query.js')
    if not polling_query_code:
        print('❌ 無法讀取 polling_query.js')
        return

    nodes.append({
        "id": polling_query_id,
        "type": "function",
        "z": flow["id"],
        "g": main_group_id,
        "name": "輪詢查詢 (24 設備)",
        "func": polling_query_code,
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 360,
        "y": 400,
        "wires": [[]]
    })

    # 連接 Polling Inject → Polling Query → MQTT Out
    nodes[10]["wires"][0].append(polling_query_id)
    nodes[11]["wires"][0].append(mqtt_out_id)

    # ========== 11. MQTT In (Polling Trigger) 節點 ==========
    polling_trigger_in_id = generate_id()
    nodes.append({
        "id": polling_trigger_in_id,
        "type": "mqtt in",
        "z": flow["id"],
        "g": main_group_id,
        "name": "輪詢觸發器",
        "topic": "homeassistant/polling/trigger",
        "qos": "0",
        "datatype": "auto-detect",
        "broker": mqtt_broker_id,
        "nl": False,
        "rap": True,
        "rh": 0,
        "inputs": 0,
        "x": 140,
        "y": 440,
        "wires": [[]]
    })

    # 連接 Polling Trigger → Polling Query
    nodes[12]["wires"][0].append(polling_query_id)

    # ========== 12. General Configuration Inject 節點 ==========
    config_inject_id = generate_id()
    nodes.append({
        "id": config_inject_id,
        "type": "inject",
        "z": flow["id"],
        "g": main_group_id,
        "name": "註冊虛擬裝置",
        "props": [],
        "repeat": "",
        "crontab": "",
        "once": False,
        "onceDelay": 0.1,
        "topic": "",
        "x": 140,
        "y": 520,
        "wires": [[]]
    })

    # ========== 13. General Configuration 節點 ==========
    general_config_id = generate_id()
    general_config_code = read_js_file('general_configuration.js')
    if not general_config_code:
        print('❌ 無法讀取 general_configuration.js')
        return

    nodes.append({
        "id": general_config_id,
        "type": "function",
        "z": flow["id"],
        "g": main_group_id,
        "name": "設備註冊配置",
        "func": general_config_code,
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 340,
        "y": 520,
        "wires": [[]]
    })

    # 連接 Config Inject → General Config → MQTT Out
    nodes[13]["wires"][0].append(general_config_id)
    nodes[14]["wires"][0].append(mqtt_out_id)

    # ========== 14. Comment 節點 ==========
    comment_id = generate_id()
    nodes.append({
        "id": comment_id,
        "type": "comment",
        "z": flow["id"],
        "g": main_group_id,
        "name": "System V2 完整智能家居控制系統",
        "info": "支援設備類型：\n✅ Light (Single/Dual/Relay)\n✅ Cover (窗簾/捲簾)\n✅ HVAC (空調)\n✅ Scene (場景記憶/執行)\n✅ Memory (記憶儲存/查詢)\n✅ Query (設備查詢)\n\n新功能：\n🆕 場景記憶系統\n🆕 HMI 觸發輪詢\n🆕 24 個設備完整輪詢\n🆕 記憶查詢功能",
        "x": 200,
        "y": 60,
        "wires": []
    })

    # ========== Debug 控制 Group ==========
    debug_group_id = generate_id()
    debug_group = {
        "id": debug_group_id,
        "type": "group",
        "z": flow["id"],
        "name": "Debug 控制",
        "style": {
            "label": True,
            "stroke": "#999999",
            "fill": "#ffffff",
            "fill-opacity": "0.5"
        },
        "nodes": [],
        "x": 14,
        "y": 741,
        "w": 492,
        "h": 162
    }

    # Debug 控制節點
    debug_on_id = generate_id()
    nodes.append({
        "id": debug_on_id,
        "type": "inject",
        "z": flow["id"],
        "g": debug_group_id,
        "name": "Debug 全開",
        "props": [{"p": "payload"}],
        "repeat": "",
        "crontab": "",
        "once": False,
        "onceDelay": 0.1,
        "topic": "",
        "payload": '{"topic":true,"cache":true,"modbus":true,"mqtt":true,"scene":true,"query":true,"hmi":true}',
        "payloadType": "json",
        "x": 100,
        "y": 800,
        "wires": [[]]
    })

    debug_off_id = generate_id()
    nodes.append({
        "id": debug_off_id,
        "type": "inject",
        "z": flow["id"],
        "g": debug_group_id,
        "name": "Debug 全關",
        "props": [{"p": "payload"}],
        "repeat": "",
        "crontab": "",
        "once": False,
        "onceDelay": 0.1,
        "topic": "",
        "payload": '{"topic":false,"cache":false,"modbus":false,"mqtt":false,"scene":false,"query":false,"hmi":false}',
        "payloadType": "json",
        "x": 100,
        "y": 840,
        "wires": [[]]
    })

    debug_set_id = generate_id()
    debug_set_code = """const config = msg.payload;
global.set('debug_config', config);

node.warn('=== Debug 配置已更新 ===');
node.warn(`Topic: ${config.topic ? 'ON' : 'OFF'}`);
node.warn(`Cache: ${config.cache ? 'ON' : 'OFF'}`);
node.warn(`Modbus: ${config.modbus ? 'ON' : 'OFF'}`);
node.warn(`MQTT: ${config.mqtt ? 'ON' : 'OFF'}`);
node.warn(`Scene: ${config.scene ? 'ON' : 'OFF'}`);
node.warn(`Query: ${config.query ? 'ON' : 'OFF'}`);
node.warn(`HMI: ${config.hmi ? 'ON' : 'OFF'}`);

node.status({
    fill: 'green',
    shape: 'dot',
    text: `已更新 Debug 配置`
});

return msg;"""

    nodes.append({
        "id": debug_set_id,
        "type": "function",
        "z": flow["id"],
        "g": debug_group_id,
        "name": "設定 Debug 配置",
        "func": debug_set_code,
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 320,
        "y": 820,
        "wires": [[]]
    })

    # 連接 Debug 控制
    nodes[16]["wires"][0].append(debug_set_id)
    nodes[17]["wires"][0].append(debug_set_id)

    # 更新 Debug Group 的節點列表
    debug_group["nodes"] = [debug_on_id, debug_off_id, debug_set_id]

    # 更新 Main Group 的節點列表
    main_group["nodes"] = [n["id"] for n in nodes if n.get("g") == main_group_id]

    # ========== MQTT Broker 配置節點 ==========
    mqtt_broker = {
        "id": mqtt_broker_id,
        "type": "mqtt-broker",
        "name": "MQTT Broker",
        "broker": "192.168.1.233",
        "port": "1883",
        "clientid": "",
        "autoConnect": True,
        "usetls": False,
        "protocolVersion": "4",
        "keepalive": "60",
        "cleansession": True,
        "autoUnsubscribe": True,
        "birthTopic": "",
        "birthQos": "0",
        "birthPayload": "",
        "birthMsg": {},
        "closeTopic": "",
        "closeQos": "0",
        "closePayload": "",
        "closeMsg": {},
        "willTopic": "",
        "willQos": "0",
        "willPayload": "",
        "willMsg": {},
        "userProps": "",
        "sessionExpiry": ""
    }

    # 組合最終的 Flow JSON
    final_flow = [
        flow,
        main_group,
        debug_group,
        *nodes,
        mqtt_broker
    ]

    # 寫入 JSON 檔案
    output_file = Path(__file__).parent / 'system_v2_flow.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_flow, f, indent=2, ensure_ascii=False)

    print('\n✅ 匯出完成！')
    print(f'📁 輸出檔案: {output_file}')
    print(f'📊 總節點數: {len(nodes) + 3} (含 Flow, Groups, Broker)')
    print('\n📝 匯入方式:')
    print('1. 開啟 Node-RED')
    print('2. 右上角選單 → Import')
    print('3. 選擇 "select a file to import"')
    print(f'4. 選擇 {output_file.name}')
    print('5. 點擊 Import')
    print('\n🎉 完成後即可使用 System V2！')


if __name__ == '__main__':
    main()
