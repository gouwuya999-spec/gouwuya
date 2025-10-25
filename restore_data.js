const fs = require('fs');
const path = require('path');

// 数据恢复脚本
async function restoreData() {
  try {
    console.log('开始数据恢复...');
    
    // 动态导入electron-store
    const { default: ElectronStore } = await import('electron-store');
    const store = new ElectronStore({
      name: 'vps-management-config',
      projectName: 'vps-management-system',
      encoding: 'utf8'
    });
    
    // 检查是否有备份数据
    const backupPath = path.join(__dirname, 'data_backup.json');
    if (fs.existsSync(backupPath)) {
      console.log('发现备份数据，正在恢复...');
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      
      if (backupData.servers) {
        store.set('servers', backupData.servers);
        console.log('服务器数据已恢复');
      }
      
      if (backupData.vps_data) {
        store.set('vps_data', backupData.vps_data);
        console.log('VPS数据已恢复');
      }
    } else {
      console.log('未发现备份数据，创建示例数据...');
      
      // 创建示例服务器数据
      const sampleServers = [
        {
          id: 'server-001',
          name: '示例服务器1',
          host: '192.168.1.100',
          port: 22,
          username: 'root',
          password: 'password123'
        }
      ];
      
      // 创建示例VPS数据
      const sampleVps = [
        {
          name: '示例VPS1',
          purchase_date: '2024/01/01',
          use_nat: false,
          status: '在用',
          price_per_month: 20,
          ip_address: '192.168.1.101',
          country: '中国'
        }
      ];
      
      store.set('servers', sampleServers);
      store.set('vps_data', sampleVps);
      
      console.log('示例数据已创建');
    }
    
    // 验证数据
    const servers = store.get('servers', []);
    const vpsData = store.get('vps_data', []);
    
    console.log('当前服务器数量:', servers.length);
    console.log('当前VPS数量:', vpsData.length);
    
    console.log('数据恢复完成！');
    
  } catch (error) {
    console.error('数据恢复失败:', error);
  }
}

restoreData().catch(error => {
  console.error('数据恢复过程中出现错误:', error);
  process.exit(1);
});
