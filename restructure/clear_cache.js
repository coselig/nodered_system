const keys = flow.keys();
let count = 0;
keys.forEach(k => {
    if (k.startsWith('single_') || k.startsWith('dual_') || k.startsWith('relay_') || k.startsWith('scene_')) {
        flow.set(k, undefined);
        node.warn(`清除: ${k}`);
        count++;
    }
});
node.warn(`=== 已清除 ${count} 筆快取 ===`);
node.status({
    fill: "blue",
    shape: "ring",
    text: `已清除 ${count} 筆`
});
return msg;