const MIN_MIRED = 167, MAX_MIRED = 333;
const HMI_project = [
    //測試用input:玄關開,ouput會議室ON
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x01, 0x04, 0x9e, 0x3c],
        "out": [
            { "topic": "homeassistant/light/single/13/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/brightness", "payload": 100 },

            { "topic": "homeassistant/light/single/13/2/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/brightness", "payload": 100 },

            { "topic": "homeassistant/light/single/13/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/brightness", "payload": 100 },

            { "topic": "homeassistant/light/dual/14/a/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/colortemp", "payload": percentToColortemp(100) },
            { "topic": "homeassistant/light/dual/14/a/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/a/colortemp", "payload": percentToColortemp(100) },

            { "topic": "homeassistant/light/dual/14/b/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/colortemp", "payload": percentToColortemp(100) },
            { "topic": "homeassistant/light/dual/14/b/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/b/colortemp", "payload": percentToColortemp(100) },
        ]
    },
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x02, 0x04, 0x9e, 0xcc],
        "out": [

        ]
    },
    /*==============================場景============================= */
    //全開 0xff 是全部場景
    { "in": [0xfe, 0x06, 0x08, 0x20, 0x01, 0xff, 0xdf, 0xbf], "out": [] },
    //全關
    { "in": [0xfe, 0x06, 0x08, 0x20, 0x02, 0xff, 0xdf, 0x4f], "out": [] },
    //會議室ON
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x01, 0x02, 0x1e, 0x3e],
        "out": [
            { "topic": "homeassistant/light/single/13/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/set/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/brightness", "payload": 60 },

            { "topic": "homeassistant/light/single/13/2/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/set/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/set/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/brightness", "payload": 60 },

            { "topic": "homeassistant/light/dual/14/a/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/colortemp", "payload": percentToColortemp(50) },
            { "topic": "homeassistant/light/dual/14/a/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/a/colortemp", "payload": percentToColortemp(50) },

            { "topic": "homeassistant/light/dual/14/b/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/colortemp", "payload": percentToColortemp(50) },
            { "topic": "homeassistant/light/dual/14/b/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/b/colortemp", "payload": percentToColortemp(50) },
        ]
    },
    //會議室OFF
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x02, 0x02, 0x1e, 0xce],
        "out": [

            { "topic": "homeassistant/light/single/13/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/2/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/3/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "OFF" },

            { "topic": "homeassistant/light/dual/14/a/set", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/b/set", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "OFF" },
        ]
    },
    //會議室1
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x03, 0x02, 0x1f, 0x5e],
        "out": [
            { "topic": "homeassistant/light/single/13/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/brightness", "payload": 100 },

            { "topic": "homeassistant/light/single/13/2/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/brightness", "payload": 100 },

            { "topic": "homeassistant/light/dual/14/a/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/colortemp", "payload": percentToColortemp(100) },
            { "topic": "homeassistant/light/dual/14/a/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/a/colortemp", "payload": percentToColortemp(100) },

            { "topic": "homeassistant/light/dual/14/b/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/colortemp", "payload": percentToColortemp(100) },
            { "topic": "homeassistant/light/dual/14/b/brightness", "payload": 100 },
            { "topic": "homeassistant/light/dual/14/b/colortemp", "payload": percentToColortemp(100) },]
    },
    //會議室2
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x04, 0x02, 0x1d, 0x6e],
        "out": [
            { "topic": "homeassistant/light/single/13/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/2/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/set/brightness", "payload": 10 },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/brightness", "payload": 10 },

            { "topic": "homeassistant/light/dual/14/a/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/colortemp", "payload": percentToColortemp(0) },
            { "topic": "homeassistant/light/dual/14/a/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/a/colortemp", "payload": percentToColortemp(0) },

            { "topic": "homeassistant/light/dual/14/b/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/colortemp", "payload": percentToColortemp(0) },
            { "topic": "homeassistant/light/dual/14/b/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/b/colortemp", "payload": percentToColortemp(0) },]
    },
    //公共區ON
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x01, 0x03, 0xdf, 0xfe],
        "out": [
            { "topic": "homeassistant/light/single/11/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/11/1/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/11/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/11/1/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/1/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/1/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/2/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/2/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/2/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/2/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/3/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/3/brightness", "payload": 50 },
        ]
    },
    //公共區OFF
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x02, 0x03, 0xdf, 0x0e],
        "out": [
            { "topic": "homeassistant/light/single/11/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/11/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/2/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/2/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/3/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/3/state", "payload": "OFF" },
        ]
    },
    //全開
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x01, 0xff, 0xdf, 0xbf],
        "out": [
            { "topic": "homeassistant/light/single/11/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/11/1/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/11/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/11/1/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/1/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/1/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/2/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/2/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/2/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/2/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/3/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/12/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/12/3/brightness", "payload": 50 },
            { "topic": "homeassistant/light/single/13/1/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/set/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/1/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/2/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/set/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/2/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/3/set", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/set/brightness", "payload": 60 },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "ON" },
            { "topic": "homeassistant/light/single/13/3/brightness", "payload": 60 },
            { "topic": "homeassistant/light/dual/14/a/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/a/set/colortemp", "payload": percentToColortemp(50) },
            { "topic": "homeassistant/light/dual/14/a/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/a/colortemp", "payload": percentToColortemp(50) },
            { "topic": "homeassistant/light/dual/14/b/set", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "ON" },
            { "topic": "homeassistant/light/dual/14/b/set/colortemp", "payload": percentToColortemp(50) },
            { "topic": "homeassistant/light/dual/14/b/brightness", "payload": 50 },
            { "topic": "homeassistant/light/dual/14/b/colortemp", "payload": percentToColortemp(50) },]
    },
    //全關
    {
        "in": [0xfe, 0x06, 0x08, 0x20, 0x02, 0xff, 0xdf, 0x4f],
        "out": [
            { "topic": "homeassistant/light/single/11/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/11/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/2/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/2/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/3/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/12/3/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/1/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/1/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/2/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/2/state", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/3/set", "payload": "OFF" },
            { "topic": "homeassistant/light/single/13/3/state", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/a/set", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/a/state", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/b/set", "payload": "OFF" },
            { "topic": "homeassistant/light/dual/14/b/state", "payload": "OFF" },
        ]
    },
    /*================================================
     * 空調指令已移至 HMI_pattern 動態解析
     * 原本 72 行指令縮減為 4 個 pattern
     *================================================*/
    /*窗簾*/
    //鐵捲門-開啟
    { "in": [0x15, 0x06, 0x01, 0x9b, 0x00, 0x01, 0x3b, 0x0d], "out": [{ "topic": "homeassistant/cover/curtain/21/ocs/set", "payload": "1/2-3" }] },
    //鐵捲門-停
    { "in": [0x15, 0x06, 0x01, 0x9b, 0x00, 0x04, 0xfb, 0x0e], "out": [{ "topic": "homeassistant/cover/curtain/21/ocs/set", "payload": "2/1-3" }] },
    //鐵捲門-關閉
    { "in": [0x15, 0x06, 0x01, 0x9b, 0x00, 0x02, 0x7b, 0x0c], "out": [{ "topic": "homeassistant/cover/curtain/21/ocs/set", "payload": "3/1-2" }] },
    //會議室捲簾-開啟
    { "in": [0x16, 0x06, 0x01, 0x9b, 0x00, 0x01, 0x3b, 0x3e], "out": [{ "topic": "homeassistant/cover/curtain/22/oc/set", "payload": "1/2" }] },
    //會議室捲簾-停
    { "in": [0x16, 0x06, 0x01, 0x9b, 0x00, 0x03, 0xba, 0xff], "out": [{ "topic": "homeassistant/cover/curtain/22/oc/set", "payload": "1-2/" }] },
    //會議室捲簾-關閉
    { "in": [0x16, 0x06, 0x01, 0x9b, 0x00, 0x02, 0x7b, 0x3f], "out": [{ "topic": "homeassistant/cover/curtain/22/oc/set", "payload": "2/1" }] },
    /*==========================================
     * 公共區/會議室燈光控制已移至 HMI_pattern 動態解析
     * 原本 16 組固定指令縮減為 1 個通用 pattern
     *==========================================*/
]

/**********************************************
 * 動態 pattern（可解析變數值）
 **********************************************/
const HMI_pattern = [
    {
        name: "light_control_unified",
        pattern: [
            0xEE, 0xB1, 0x11, 0x00,
            null,       // byte 4: 場景ID (0x1E=公共區, 0x1F=會議室, 0x20=會議室2)
            0x00,
            null,       // byte 6: 功能ID (0x0B, 0x0D, 0x0F, 0x11)
            0x13, 0x00, 0x00,
            null, null, // bytes 10-11: 數值 (0x0000-0x03E8)
            0xFF, 0xFC, 0xFF, 0xFF
        ],
        parse: (input) => {
            const sceneId = input[4];    // 場景ID
            const functionId = input[6]; // 功能ID
            const valueHigh = input[10];
            const valueLow = input[11];
            const raw = (valueHigh << 8) + valueLow;

            // 轉換數值 0-1000 → 0-100
            let value = Math.round((raw / 1000) * 100);
            value = clamp(value, 0, 100);
            let state = value > 0 ? "ON" : "OFF";

            // 場景與功能映射表
            const LIGHT_MAP = {
                // 公共區 (0x1E)
                "0x1E-0x0B": { topic: "homeassistant/light/scene/single/11-1--11-2", type: "brightness" },
                "0x1E-0x0D": { topic: "homeassistant/light/scene/single/12-1", type: "brightness" },
                "0x1E-0x0F": { topic: "homeassistant/light/scene/single/12-2", type: "brightness" },
                "0x1E-0x11": { topic: "homeassistant/light/scene/single/12-3--12-4", type: "brightness" },
                
                // 會議室 (0x1F)
                "0x1F-0x0B": { topic: "homeassistant/light/scene/single/14/a", type: "brightness" },
                "0x1F-0x0D": { topic: "homeassistant/light/scene/single/14/a", type: "colortemp" },
                "0x1F-0x0F": { topic: "homeassistant/light/scene/single/14/b", type: "brightness" },
                "0x1F-0x11": { topic: "homeassistant/light/scene/single/14/b", type: "colortemp" },
                
                // 會議室2 (0x20)
                "0x20-0x0B": { topic: "homeassistant/light/scene/single/14/a", type: "brightness" },
                "0x20-0x0D": { topic: "homeassistant/light/scene/single/14/a", type: "colortemp" },
                "0x20-0x0F": { topic: "homeassistant/light/scene/single/14/b", type: "brightness" },
                "0x20-0x11": { topic: "homeassistant/light/scene/single/14/b", type: "colortemp" },
            };

            const key = `0x${sceneId.toString(16).toUpperCase()}-0x${functionId.toString(16).toUpperCase()}`;
            const config = LIGHT_MAP[key];
            
            if (!config) return null;

            const baseTopic = config.topic;
            const controlType = config.type;

            if (controlType === "brightness") {
                return [
                    { topic: `${baseTopic}/set`, payload: state },
                    { topic: `${baseTopic}/set/brightness`, payload: value },
                    { topic: `${baseTopic}/state`, payload: state },
                    { topic: `${baseTopic}/brightness`, payload: value }
                ];
            } else if (controlType === "colortemp") {
                // 色溫控制
                const colortemp = percentToColortemp(value);
                return [
                    { topic: `${baseTopic}/set`, payload: state },
                    { topic: `${baseTopic}/set/colortemp`, payload: colortemp },
                    { topic: `${baseTopic}/state`, payload: state },
                    { topic: `${baseTopic}/colortemp`, payload: colortemp }
                ];
            }
            
            return null;
        }
    },
    // ========== 空調系統（動態解析） ==========
    {
        name: "hvac_power_mode",
        pattern: [0x01, 0x31, null, 0x01, 0x01, null], // 開關
        parse: (input) => {
            const powerValue = input[2]; // 0=關, 1=開
            const hvacId = input[5];     // 空調ID (1,2,3)
            const mode = powerValue === 0x01 ? "auto" : "off";
            return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/set`, payload: mode }];
        }
    },
    {
        name: "hvac_temperature",
        pattern: [0x01, 0x32, null, 0x01, 0x01, null], // 溫度設定
        parse: (input) => {
            const tempValue = input[2];  // HEX 值直接等於溫度
            const hvacId = input[5];
            return [{ topic: `homeassistant/hvac/200/${hvacId}/temperature/set`, payload: String(tempValue) }];
        }
    },
    {
        name: "hvac_mode",
        pattern: [0x01, 0x33, null, 0x01, 0x01, null], // 模式（冷暖除濕送風）
        parse: (input) => {
            const modeValue = input[2];
            const hvacId = input[5];
            const MODE_MAP = {
                0x00: "cool",      // 冷氣
                0x01: "dry",       // 除濕
                0x02: "fan_only",  // 送風
                0x04: "heat"       // 暖氣
            };
            const mode = MODE_MAP[modeValue];
            if (!mode) return null;
            return [{ topic: `homeassistant/hvac/200/${hvacId}/mode/set`, payload: mode }];
        }
    },
    {
        name: "hvac_fan_speed",
        pattern: [0x01, 0x34, null, 0x01, 0x01, null], // 風量
        parse: (input) => {
            const fanValue = input[2];
            const hvacId = input[5];
            const FAN_MAP = {
                0x03: "medium",  // 中
                0x04: "high",    // 強（或自動，需根據空調ID判斷）
                0x07: "low"      // 弱
            };
            const fan = FAN_MAP[fanValue];
            if (!fan) return null;
            
            // 空調1用 fan/set，空調2和3用 mode/fan（根據你的原始設定）
            const topicSuffix = hvacId === 1 ? "fan/set" : "mode/fan";
            return [{ topic: `homeassistant/hvac/200/${hvacId}/${topicSuffix}`, payload: fan }];
        }
    }
];

function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

function percentToColortemp(percent, minMired = MIN_MIRED, maxMired = MAX_MIRED) {
    percent = clamp(Math.round(percent), 0, 100);
    return Math.round(maxMired - ((maxMired - minMired) * percent / 100));
}

function bufferToHexArray(buf) {
    return [...buf].map(v => "0x" + v.toString(16).padStart(2, "0"));
}

const SCENE_MAP = {
    0x0B: "homeassistant/light/scene/single/11-1--11-2",
    0x0D: "homeassistant/light/scene/single/13-1--13-2",
    0x0F: "homeassistant/light/scene/single/15-1--15-2",
    0x11: "homeassistant/light/scene/single/17-1--17-2"
};

function matchPattern(input, pattern) {
    if (input.length !== pattern.length) return false;

    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== null && pattern[i] !== input[i]) {
            return false;
        }
    }
    return true;
}


function arrayEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

/**********************************************
 * 主程式邏輯
 **********************************************/
// 錯誤處理：檢查 payload 是否存在
if (!msg.payload || !Buffer.isBuffer(msg.payload)) {
    node.warn("收到無效的 payload，必須是 Buffer");
    return msg;
}

let input = Array.from(msg.payload);
let result = null;

// 1️⃣ 完全比對
for (const item of HMI_project) {
    if (arrayEqual(input, item.in)) {
        result = item.out;
        break;
    }
}

// 2️⃣ pattern 比對
if (!result) {
    for (const p of HMI_pattern) {
        if (matchPattern(input, p.pattern)) {
            result = p.parse(input);
            break;
        }
    }
}

// 3️⃣ 推入 queue（避免推入空陣列）
if (result && Array.isArray(result) && result.length > 0) {
    let mqtt_queue = global.get("mqtt_queue") || [];
    mqtt_queue.push(...result);
    global.set("mqtt_queue", mqtt_queue);
    
    // Debug log
    node.warn(`收到資料: ${bufferToHexArray(msg.payload)}`);
    node.warn(`queue 目前共有 ${mqtt_queue.length} 個待送 MQTT 指令`);
} else if (result && !Array.isArray(result)) {
    let mqtt_queue = global.get("mqtt_queue") || [];
    mqtt_queue.push(result);
    global.set("mqtt_queue", mqtt_queue);
    
    node.warn(`收到資料: ${bufferToHexArray(msg.payload)}`);
    node.warn(`queue 目前共有 ${mqtt_queue.length} 個待送 MQTT 指令`);
} else {
    node.warn(`收到資料: ${bufferToHexArray(msg.payload)} - 未匹配任何規則`);
}

// 回傳原 msg
return msg;