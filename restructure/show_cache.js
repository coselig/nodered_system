node.warn("=== Flow Context 內容 ===");
const keys = flow.keys();
const filtered = keys.filter(k => 
    k.startsWith('single_') || 
    k.startsWith('dual_') || 
    k.startsWith('relay_') || 
    k.startsWith('scene_')
);

if (filtered.length === 0) {
    node.warn("目前沒有任何快取資料");
} else {
    // 分類顯示
    const groups = {
        single: [],
        dual: [],
        relay: [],
        scene: []
    };
    
    filtered.forEach(k => {
        const value = flow.get(k);
        if (k.startsWith('single_')) groups.single.push(`${k}: ${value}`);
        else if (k.startsWith('dual_')) groups.dual.push(`${k}: ${value}`);
        else if (k.startsWith('relay_')) groups.relay.push(`${k}: ${value}`);
        else if (k.startsWith('scene_')) groups.scene.push(`${k}: ${value}`);
    });
    
    if (groups.single.length > 0) {
        node.warn("--- Single ---");
        groups.single.forEach(s => node.warn(s));
    }
    if (groups.dual.length > 0) {
        node.warn("--- Dual ---");
        groups.dual.forEach(s => node.warn(s));
    }
    if (groups.relay.length > 0) {
        node.warn("--- Relay ---");
        groups.relay.forEach(s => node.warn(s));
    }
    if (groups.scene.length > 0) {
        node.warn("--- Scene ---");
        groups.scene.forEach(s => node.warn(s));
    }
    
    node.warn(`=== 共 ${filtered.length} 筆快取 ===`);
}
return msg;