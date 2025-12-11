//port1:冷氣指令
//port2:一樓
//port3:二樓
switch ((msg.payload)[0]) {
    case "200": return [msg, null, null];
    case "11":
    case "12":
    case "13":
    case "14": return [null, msg, null];
    case "15":
    case "16":
    case "17":
    case "18":
    case "19": return [null, null, msg];
    default: return [null, null, null];
}