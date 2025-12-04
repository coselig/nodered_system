#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
從 all_nodes.json 同步程式碼到各個獨立的 .js 檔案
"""

import json

data = json.load(open('all_nodes.json', 'r', encoding='utf-8'))

# 節點ID對應檔案名稱
mapping = {
    'd8c7fca129c0e7f0': 'full_processor.js',
    'e6b674a0681a3bb3': 'feedback_processor.js',
    '683ef3ca9947575a': 'hmi_processor.js',
    '13396d4cc0048456': 'general_configuration.js',
    'acb4f6f4af7a5af9': 'polling_query.js',
    'c41f6a015aa6a17e': 'modbus_queue.js',
    '0d999f877353c7d3': 'debug_config.js',
    '140431411aaa924a': 'clear_cache.js',
    '7afed5cb1b3ea888': 'show_cache.js'
}

synced = 0
for node in data:
    node_id = node.get('id')
    if node_id in mapping and node.get('func'):
        filename = mapping[node_id]
        node_name = node.get('name', 'Unknown')
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(node.get('func'))
        print(f"OK: {filename} <- {node_name}")
        synced += 1

print(f"\n同步完成: {synced} 個檔案")
