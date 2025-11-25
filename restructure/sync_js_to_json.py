"""
同步工具 - 將修改後的 .js 檔案同步回 .json

使用方式:
    python sync_js_to_json.py
    
功能:
    1. 讀取所有 .js 檔案
    2. 移除檔案頭部的註解區塊
    3. 更新對應的 .json 檔案中的 func 欄位
    4. 可選：重新組合成完整的 test_full_integrated.json
"""

import json
import os
from pathlib import Path

def extract_func_from_js(js_path):
    """從 .js 檔案提取函數內容（移除檔案頭註解）"""
    with open(js_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 找到註解區塊結束位置
    start_idx = 0
    for i, line in enumerate(lines):
        if '*/' in line:
            start_idx = i + 1
            break
    
    # 提取函數內容
    func_code = ''.join(lines[start_idx:]).lstrip('\n')
    return func_code

def sync_js_to_json(restructure_dir):
    """同步所有 .js 檔案到對應的 .json"""
    
    js_files = list(Path(restructure_dir).glob('*_processor.js'))
    
    for js_path in js_files:
        json_path = js_path.with_suffix('.json')
        
        if not json_path.exists():
            print(f'⚠️  找不到對應的 JSON: {json_path.name}')
            continue
        
        # 提取函數內容
        func_code = extract_func_from_js(js_path)
        
        # 更新 JSON
        with open(json_path, 'r', encoding='utf-8') as f:
            node = json.load(f)
        
        node['func'] = func_code
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(node, f, indent=4, ensure_ascii=False)
        
        print(f'✅ {js_path.name} → {json_path.name}')

def rebuild_full_json(restructure_dir, output_path):
    """重新組合完整的 test_full_integrated.json"""
    
    all_nodes_path = Path(restructure_dir) / 'all_nodes.json'
    
    with open(all_nodes_path, 'r', encoding='utf-8') as f:
        nodes = json.load(f)
    
    # 更新處理器節點
    processors = {
        '50313094f488b340': 'full_processor.json',
        'c543b1d15612a8c6': 'feedback_processor.json',
        'hmi_processor': 'hmi_processor.json'
    }
    
    for node in nodes:
        node_id = node.get('id')
        
        if node_id in processors:
            json_file = Path(restructure_dir) / processors[node_id]
            
            if json_file.exists():
                with open(json_file, 'r', encoding='utf-8') as f:
                    updated_node = json.load(f)
                
                # 更新 func 欄位
                if 'func' in updated_node:
                    node['func'] = updated_node['func']
                    print(f'✅ 更新節點: {node.get("name", node_id)}')
    
    # 儲存
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(nodes, f, indent=4, ensure_ascii=False)
    
    print(f'\n📁 完整 JSON 已儲存至: {output_path}')

if __name__ == '__main__':
    restructure_dir = r'c:\Users\admin\Desktop\yun\restructure'
    
    print('=== 同步 JS → JSON ===\n')
    sync_js_to_json(restructure_dir)
    
    print('\n=== 重建完整 JSON ===\n')
    output_path = r'c:\Users\admin\Desktop\yun\functions\unitest\test_full_integrated_rebuilt.json'
    rebuild_full_json(restructure_dir, output_path)
    
    print('\n✅ 所有同步完成！')
