#!/usr/bin/env python3
"""同步 feedback_processor.js 到 all_nodes.json"""

import json
import re

# 讀取 feedback_processor.js
with open('feedback_processor.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# 移除檔案頭註解
match = re.search(r'\*/\s*\n(.+)', js_content, re.DOTALL)
if match:
    func_code = match.group(1).strip()
else:
    func_code = js_content.strip()

# 讀取 all_nodes.json
with open('all_nodes.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)

# 找到 Feedback 處理器節點
updated = False
for node in nodes:
    name = node.get('name', '')
    if name.startswith('Feedback'):
        node['func'] = func_code
        updated = True
        print(f'Updated: {name} (id: {node.get("id")})')
        break

if updated:
    with open('all_nodes.json', 'w', encoding='utf-8') as f:
        json.dump(nodes, f, indent=4, ensure_ascii=False)
    print('Done! all_nodes.json updated.')
else:
    print('No Feedback processor found!')
