const Store = require('electron-store');

// 测试数据存储
function testDataStorage() {
  try {
    console.log('开始测试数据存储...');
    
    const store = new Store({
      name: 'vps-management-config',
      encoding: 'utf8'
    });
    
    // 测试保存数据
    const testServer = {
      id: 'test-123',
      name: '测试服务器',
      host: '192.168.1.100',
      port: 22,
      username: 'root',
      password: 'test123'
    };
    
    console.log('保存测试服务器数据...');
    store.set('servers', [testServer]);
    
    // 测试读取数据
    console.log('读取服务器数据...');
    const servers = store.get('servers', []);
    console.log('读取到的服务器数据:', servers);
    
    // 测试VPS数据
    const testVps = {
      name: '测试VPS',
      purchase_date: '2024/01/01',
      use_nat: false,
      status: '在用',
      price_per_month: 20,
      ip_address: '192.168.1.101',
      country: '中国'
    };
    
    console.log('保存测试VPS数据...');
    store.set('vps_data', [testVps]);
    
    const vpsData = store.get('vps_data', []);
    console.log('读取到的VPS数据:', vpsData);
    
    console.log('数据存储测试完成！');
    
  } catch (error) {
    console.error('数据存储测试失败:', error);
  }
}

testDataStorage();
