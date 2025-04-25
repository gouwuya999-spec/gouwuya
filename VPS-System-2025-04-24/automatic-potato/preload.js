const { contextBridge, ipcRenderer, clipboard } = require('electron');

// 在窗口对象上暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用版本相关
  getAppVersion: async () => {
    console.log('preload: 调用getAppVersion');
    return await ipcRenderer.invoke('get-app-version');
  },
  
  // 服务器管理相关
  saveServer: async (serverData) => {
    console.log('preload: 调用saveServer');
    return await ipcRenderer.invoke('save-server', serverData);
  },
  getServers: async () => {
    console.log('preload: 调用getServers');
    return await ipcRenderer.invoke('get-servers');
  },
  deleteServer: async (id) => {
    console.log('preload: 调用deleteServer');
    return await ipcRenderer.invoke('delete-server', id);
  },
  
  // SSH连接相关
  testSSHConnection: async (serverId) => {
    console.log('preload: 调用testSSHConnection');
    return await ipcRenderer.invoke('test-ssh-connection', serverId);
  },
  openSSHTerminal: async (serverId) => {
    console.log('preload: 调用openSSHTerminal');
    return await ipcRenderer.invoke('open-ssh-terminal', serverId);
  },
  executeSSHCommand: async (params) => {
    console.log('preload: 调用executeSSHCommand', params);
    return await ipcRenderer.invoke('execute-ssh-command', params);
  },
  closeSSHConnection: async (serverId) => {
    console.log('preload: 调用closeSSHConnection');
    return await ipcRenderer.invoke('close-ssh-connection', serverId);
  },
  
  // Wireguard 部署相关
  deployWireguard: (serverId) => ipcRenderer.invoke('deploy-wireguard', serverId),
  executeWireguardScript: (serverId) => ipcRenderer.invoke('execute-wireguard-script', serverId),
  onWireguardDeployProgress: (callback) => ipcRenderer.on('wireguard-deploy-progress', (_, data) => callback(data)),
  // 添加Wireguard peer管理相关
  getWireguardInstances: (serverId) => ipcRenderer.invoke('get-wireguard-instances', serverId),
  getWireguardInstanceDetails: (serverId, instanceName) => ipcRenderer.invoke('get-wireguard-instance-details', serverId, instanceName),
  addWireguardPeer: (serverId, instanceName) => ipcRenderer.invoke('add-wireguard-peer', serverId, instanceName),
  deleteWireguardPeer: (serverId, instanceName, peerNumber) => ipcRenderer.invoke('delete-wireguard-peer', serverId, instanceName, peerNumber),

  // 二维码生成
  generateQRCode: async (data) => {
    console.log('preload: 调用generateQRCode');
    return await ipcRenderer.invoke('generate-qrcode', data);
  },
  
  // 月账单统计相关
  getCurrentMonthBill: async () => {
    console.log('preload: 调用getCurrentMonthBill');
    return await ipcRenderer.invoke('get-current-month-bill');
  },
  getMonthlyBill: async (year, month) => {
    console.log(`preload: 调用getMonthlyBill ${year}/${month}`);
    return await ipcRenderer.invoke('get-monthly-bill', year, month);
  },
  getMonthlyBillSummary: async () => {
    console.log('preload: 调用getMonthlyBillSummary');
    return await ipcRenderer.invoke('get-monthly-bill-summary');
  },
  saveMonthlyBillingToExcel: async () => {
    console.log('preload: 调用saveMonthlyBillingToExcel');
    return await ipcRenderer.invoke('save-monthly-billing-to-excel');
  },
  // 添加单个月度账单导出功能
  saveMonthlyBillToExcel: async (year, month) => {
    console.log(`preload: 调用saveMonthlyBillToExcel ${year}/${month}`);
    return await ipcRenderer.invoke('save-monthly-bill-to-excel', year, month);
  },
  
  // VPS管理相关
  getAllVps: async () => {
    console.log('preload: 调用getAllVps');
    return await ipcRenderer.invoke('get-all-vps');
  },
  saveVps: async (vpsData) => {
    console.log('preload: 调用saveVps');
    return await ipcRenderer.invoke('save-vps', vpsData);
  },
  deleteVps: async (vpsName) => {
    console.log(`preload: 调用deleteVps ${vpsName}`);
    return await ipcRenderer.invoke('delete-vps', vpsName);
  },
  initSampleVpsData: async () => {
    console.log('preload: 调用initSampleVpsData');
    return await ipcRenderer.invoke('init-sample-vps-data');
  },
  updateVpsPrices: async () => {
    console.log('preload: 调用updateVpsPrices');
    return await ipcRenderer.invoke('update-vps-prices');
  },
  
  // 剪贴板操作
  clipboard: {
    readText: () => {
      console.log('preload: 调用clipboard.readText');
      return clipboard.readText();
    },
    writeText: (text) => {
      console.log('preload: 调用clipboard.writeText');
      clipboard.writeText(text);
      return true;
    },
    readHTML: () => {
      console.log('preload: 调用clipboard.readHTML');
      return clipboard.readHTML();
    },
    writeHTML: (html) => {
      console.log('preload: 调用clipboard.writeHTML');
      clipboard.writeHTML(html);
      return true;
    },
    readImage: () => {
      console.log('preload: 调用clipboard.readImage');
      return clipboard.readImage().toDataURL();
    },
    writeImage: (dataURL) => {
      console.log('preload: 调用clipboard.writeImage');
      try {
        const { nativeImage } = require('electron');
        const image = nativeImage.createFromDataURL(dataURL);
        clipboard.writeImage(image);
        return true;
      } catch (error) {
        console.error('写入图片到剪贴板失败:', error);
        return false;
      }
    },
    // 清空剪贴板
    clear: () => {
      console.log('preload: 调用clipboard.clear');
      clipboard.clear();
      return true;
    }
  }
});

// 添加IPC API到window对象
window.electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  saveServer: (serverData) => ipcRenderer.invoke('save-server', serverData),
  getServers: () => ipcRenderer.invoke('get-servers'),
  deleteServer: (id) => ipcRenderer.invoke('delete-server', id),
  testSSHConnection: (serverId) => ipcRenderer.invoke('test-ssh-connection', serverId),
  deployWireguard: (serverId) => ipcRenderer.invoke('deploy-wireguard', serverId),
  openSSHTerminal: (serverId) => ipcRenderer.invoke('open-ssh-terminal', serverId),
  executeSSHCommand: (data) => ipcRenderer.invoke('execute-ssh-command', data),
  closeSSHConnection: (serverId) => ipcRenderer.invoke('close-ssh-connection', serverId),
  executeWireguardScript: (serverId) => ipcRenderer.invoke('execute-wireguard-script', serverId),
  generateQRCode: (data) => ipcRenderer.invoke('generate-qrcode', data),
  getCurrentMonthBill: () => ipcRenderer.invoke('get-current-month-bill'),
  getMonthlyBill: (year, month) => ipcRenderer.invoke('get-monthly-bill', year, month),
  getMonthlyBillSummary: () => ipcRenderer.invoke('get-monthly-bill-summary'),
  saveMonthlyBillingToExcel: () => ipcRenderer.invoke('save-monthly-billing-to-excel'),
  saveMonthlyBillToExcel: (year, month) => ipcRenderer.invoke('save-monthly-bill-to-excel', year, month),
  getAllVps: () => ipcRenderer.invoke('get-all-vps'),
  saveVps: (vpsData) => ipcRenderer.invoke('save-vps', vpsData),
  deleteVps: (vpsName) => ipcRenderer.invoke('delete-vps', vpsName),
  initSampleVpsData: () => ipcRenderer.invoke('init-sample-vps-data'),
  updateVpsPrices: () => ipcRenderer.invoke('update-vps-prices'),
  getWireguardInstances: (serverId) => ipcRenderer.invoke('get-wireguard-instances', serverId),
  getWireguardInstanceDetails: (serverId, instanceName) => ipcRenderer.invoke('get-wireguard-instance-details', serverId, instanceName),
  addWireguardPeer: (serverId, instanceName) => ipcRenderer.invoke('add-wireguard-peer', serverId, instanceName),
  deleteWireguardPeer: (serverId, instanceName, peerNumber) => ipcRenderer.invoke('delete-wireguard-peer', serverId, instanceName, peerNumber)
}; 