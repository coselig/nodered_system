const config = msg.payload;
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

return msg;