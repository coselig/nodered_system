/**
 * 命名規則：
 * type: single、dual、wrgb、rgb、relay
 * module_id: Modbus Slave ID (十進位字串)
 * channel:
 * - single: 1、2、3...
 * - dual: a、b
 * - wrgb/rgb: x
 * - relay: 1、2、3...
 * 註冊範例:
 * { type: "single", module_id: "11", channel: "1", name: "走廊間照" }
 * { type: "dual", module_id: "14", channel: "a", name: "軌道燈" }
 * { type: "wrgb", module_id: "2", channel: "x", name: "WRGB燈-2" }
 * { type: "rgb", module_id: "11", channel: "x", name: "RGB燈-11" }
 * { type: "relay", module_id: "21", channel: "1", name: "繼電器-1" }
 */

msg.devices = [
    // 盤A
    { type: "single", module_id: "11", channel: "1", name: "走廊間照" },
    { type: "single", module_id: "12", channel: "1", name: "泡茶區" },
    { type: "single", module_id: "12", channel: "2", name: "走道崁燈/地間照" },
    { type: "single", module_id: "12", channel: "3", name: "展示櫃" },
    { type: "single", module_id: "13", channel: "1", name: "會議間照" },
    { type: "single", module_id: "13", channel: "2", name: "冷氣間照" },
    { type: "single", module_id: "13", channel: "3", name: "會議崁燈" },
    { type: "dual", module_id: "14", channel: "a", name: "軌道燈" },
    { type: "dual", module_id: "14", channel: "b", name: "吊燈" },
    // 盤B
    { type: "single", module_id: "15", channel: "1", name: "客廳前" },
    { type: "single", module_id: "15", channel: "2", name: "客廳後" },
    { type: "single", module_id: "16", channel: "1", name: "走道間照" },
    { type: "single", module_id: "17", channel: "1", name: "廚房" },
    { type: "single", module_id: "18", channel: "1", name: "1F地燈" },
    { type: "single", module_id: "18", channel: "2", name: "1F壁燈" },
    { type: "single", module_id: "19", channel: "1", name: "2F壁燈" },
    { type: "single", module_id: "19", channel: "2", name: "2F地燈" },
    // WRGB
    { type: "wrgb", module_id: "2", channel: "x", name: "WRGB燈-2" },
    { type: "wrgb", module_id: "11", channel: "x", name: "WRGB燈-11" },
    // RGB
    { type: "rgb", module_id: "11", channel: "x", name: "RGB燈-11" },
];
return msg;
