// 空調設備清單（function node，可獨立管理）
// 輸出：msg.devices = [ ... ]

msg.devices = [
    { type: "hitachi", module_id: "200", channel: "1", name: "客廳空調" },
    { type: "hitachi", module_id: "200", channel: "2", name: "會議室空調" },
    { type: "hitachi", module_id: "200", channel: "3", name: "玄關空調" },
    // { type: "hitachi", module_id: "200", channel: "9", name: "辦公室測試" },
];
return msg;
