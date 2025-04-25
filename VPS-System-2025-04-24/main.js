const { app, BrowserWindow, ipcMain } = require('electron');
// 读取package.json中的版本号
const packageJson = require('./package.json');
// 添加应用版本号
const APP_VERSION = packageJson.version;
// 隐藏命令行窗口
if (process.platform === 'win32') {
  process.env.ELECTRON_ENABLE_LOGGING = 0;
}
const path = require('path');
// const Store = require('electron-store'); // 注释掉原来的导入
let Store; // 声明Store变量为全局变量
let store; // 声明store变量为全局变量
const QRCode = require('qrcode');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { dialog } = require('electron');

// 存储活跃的SSH连接
const activeSSHConnections = new Map();

// 初始化配置存储 - 将在动态导入后初始化
// const store = new Store(); // 注释掉原来的初始化代码

// 检查并转换私钥格式
function checkAndConvertPrivateKey(privateKeyContent) {
  // 检查是否是PuTTY格式的私钥（以"PuTTY-User-Key-File"开头）
  if (privateKeyContent.includes('PuTTY-User-Key-File')) {
    console.log('检测到PuTTY格式私钥，无法自动转换，请手动转换为OpenSSH格式');
    throw new Error('不支持的私钥格式：PuTTY (ppk)。请使用PuTTYgen转换为OpenSSH格式');
  }
  
  // 检查是否需要转换（非OpenSSH格式，例如是PKCS#1格式，通常以"-----BEGIN RSA PRIVATE KEY-----"开头）
  if (privateKeyContent.includes('-----BEGIN RSA PRIVATE KEY-----') && 
      !privateKeyContent.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
    console.log('检测到RSA PKCS#1格式私钥，尝试使用');
    // 注意：node-ssh应该支持这种格式，所以实际上可能不需要转换
    return privateKeyContent;
  }
  
  // 已经是OpenSSH格式，无需转换
  return privateKeyContent;
}

// 创建主窗口
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // 添加以下设置，隐藏背景窗口
    backgroundColor: '#FFF',
    show: false
  });

  // 等待加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 加载主页面
  mainWindow.loadFile('index.html');
  
  // 开发时打开开发者工具
  // mainWindow.webContents.openDevTools();
}

// 当Electron完成初始化时创建窗口
app.whenReady().then(async () => {
  // 动态导入electron-store模块
  try {
    const storeModule = await import('electron-store');
    Store = storeModule.default || storeModule;
    store = new Store();
    console.log('成功导入electron-store模块');
  } catch (error) {
    console.error('导入electron-store模块失败:', error);
    dialog.showErrorBox('模块加载错误', '无法加载electron-store模块，应用可能无法正常工作。');
  }
  
  createWindow();

  app.on('activate', function () {
    // 在macOS上，当点击dock图标且没有其他窗口打开时
    // 通常会重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出应用程序
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 添加获取版本号的IPC处理
ipcMain.handle('get-app-version', () => {
  return APP_VERSION;
});

// 从渲染进程接收SSH连接请求
ipcMain.handle('save-server', async (event, serverData) => {
  try {
    console.log('接收到保存服务器请求:', serverData);
    const servers = store.get('servers') || [];
    
    // 检查是否有相同ID的服务器，如果有则更新
    const existingIndex = servers.findIndex(s => s.id === serverData.id);
    
    if (existingIndex >= 0) {
      // 更新已存在的服务器
      servers[existingIndex] = serverData;
      console.log(`更新已存在的服务器: ${serverData.name}`);
    } else {
      // 检查是否有相同IP和端口的服务器
      const duplicateIndex = servers.findIndex(s => 
        s.host === serverData.host && 
        parseInt(s.port || 22) === parseInt(serverData.port || 22)
      );
      
      if (duplicateIndex >= 0) {
        // 如果发现重复的服务器，删除旧的
        console.log(`发现重复服务器 ${servers[duplicateIndex].name}，将被替换为 ${serverData.name}`);
        servers.splice(duplicateIndex, 1);
      }
      
      // 添加新服务器
      servers.push(serverData);
    }
    
    store.set('servers', servers);
    console.log('服务器已保存');
    return { success: true };
  } catch (error) {
    console.error('保存服务器失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-servers', async () => {
  try {
    const servers = store.get('servers') || [];
    
    // 服务器去重处理
    const uniqueServers = [];
    const hostPortMap = new Map();
    
    // 首先按照IP:端口分组
    servers.forEach(server => {
      const key = `${server.host}:${server.port || 22}`;
      if (!hostPortMap.has(key)) {
        hostPortMap.set(key, []);
      }
      hostPortMap.get(key).push(server);
    });
    
    // 对于每组相同IP:端口的服务器，只保留最新添加的一个（ID通常包含时间戳）
    hostPortMap.forEach(serverGroup => {
      if (serverGroup.length > 1) {
        console.log(`发现重复服务器: ${serverGroup[0].host}:${serverGroup[0].port || 22}, 数量: ${serverGroup.length}`);
        // 按ID排序，保留最新的一个
        serverGroup.sort((a, b) => b.id.localeCompare(a.id));
      }
      uniqueServers.push(serverGroup[0]);
    });
    
    if (uniqueServers.length < servers.length) {
      console.log(`清理了 ${servers.length - uniqueServers.length} 个重复服务器，剩余 ${uniqueServers.length} 个`);
      // 更新存储
      store.set('servers', uniqueServers);
    }
    
    console.log('获取服务器列表:', uniqueServers.length > 0 ? uniqueServers : servers);
    return uniqueServers.length > 0 ? uniqueServers : servers;
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    return [];
  }
});

ipcMain.handle('delete-server', async (event, id) => {
  try {
    console.log('接收到删除服务器请求:', id);
    const servers = store.get('servers') || [];
    const updatedServers = servers.filter(server => server.id !== id);
    store.set('servers', updatedServers);
    console.log('服务器已删除');
    return { success: true };
  } catch (error) {
    console.error('删除服务器失败:', error);
    return { success: false, error: error.message };
  }
});

// 连接到SSH服务器
async function connectToSSH(server) {
  const ssh = new NodeSSH();
  
  try {
    console.log(`正在连接${server.host}:${server.port || 22}`);
    console.log(`使用用户名: ${server.username}`);
    
    const sshConfig = {
      host: server.host,
      port: server.port || 22,
      username: server.username,
      // 启用详细调试
      debug: true
    };
    
    // 使用私钥或密码
    if (server.privateKeyPath && fs.existsSync(server.privateKeyPath)) {
      console.log(`使用私钥文件: ${server.privateKeyPath}`);
      const privateKeyContent = fs.readFileSync(server.privateKeyPath, 'utf8');
      
      try {
        // 检查并转换私钥格式
        sshConfig.privateKey = checkAndConvertPrivateKey(privateKeyContent);
        
        if (server.passphrase) {
          console.log('私钥已设置密码');
          sshConfig.passphrase = server.passphrase;
        }
      } catch (keyError) {
        console.error('私钥处理错误:', keyError);
        throw keyError;
      }
    } else if (server.password) {
      console.log('使用密码认证');
      sshConfig.password = server.password;
    } else {
      console.log('警告: 未提供任何认证方式');
    }
    
    // 增加连接超时设置
    sshConfig.readyTimeout = 30000; // 30秒超时
    
    // 增加更多调试选项
    sshConfig.tryKeyboard = true; // 尝试键盘交互认证
    
    // 提供多种认证选项
    if (server.password && server.privateKeyPath && fs.existsSync(server.privateKeyPath)) {
      console.log('同时提供密码和私钥认证');
      // 自动使用私钥，并在回调函数中使用密码
      sshConfig.authHandler = (methodsLeft, partialSuccess, callback) => {
        if (methodsLeft.includes('password')) {
          return callback(null, server.password);
        }
        return callback(new Error('No supported authentication methods available'));
      };
    }
    
    // 尝试连接
    console.log('开始SSH连接尝试...');
    await ssh.connect(sshConfig);
    console.log('SSH连接成功');
    
    return { success: true, ssh };
  } catch (error) {
    console.error('SSH连接失败，详细错误:', error);
    let errorMessage = `SSH连接失败: ${error.message}`;
    
    // 分析错误类型，提供更友好的错误信息
    if (error.message.includes('All configured authentication methods failed')) {
      if (server.privateKeyPath && fs.existsSync(server.privateKeyPath)) {
        errorMessage = '私钥认证失败。请检查私钥格式是否正确，以及服务器是否已添加对应公钥';
      } else if (server.password) {
        errorMessage = '密码认证失败。请确认密码是否正确，以及服务器是否允许密码登录';
      } else {
        errorMessage = '认证失败。未提供有效的认证方式';
      }
    } else if (error.message.includes('connect ETIMEDOUT')) {
      errorMessage = '连接超时。请检查服务器地址和端口是否正确，以及防火墙设置';
    } else if (error.message.includes('connect ECONNREFUSED')) {
      errorMessage = '连接被拒绝。请检查SSH服务是否在运行，以及端口是否正确';
    } else if (error.message.includes('Host does not exist')) {
      errorMessage = '主机不存在。请检查服务器地址是否正确';
    } else if (error.message.includes('不支持的私钥格式')) {
      errorMessage = error.message;
    }
    
    return { 
      success: false, 
      error: errorMessage,
      details: error
    };
  }
}

// 获取已部署的Wireguard实例列表
async function getWireguardInstances(ssh) {
  try {
    // 列出所有wireguard配置文件
    const result = await ssh.execCommand('ls -l /etc/wireguard/ | grep ".conf" | awk \'{print $9}\' | sed "s/.conf$//"');
    
    if (result.stdout) {
      // 返回实例名称列表，例如["wg0", "wg1", ...]
      return result.stdout.split('\n').filter(name => name.trim() !== '');
    }
    
    return [];
  } catch (error) {
    console.error('获取Wireguard实例列表失败:', error);
    throw new Error('获取Wireguard实例列表失败: ' + error.message);
  }
}

// 获取Wireguard实例的详细信息
async function getWireguardInstanceDetails(ssh, instanceName) {
  try {
    // 检查配置文件是否存在
    const checkResult = await ssh.execCommand(`test -f /etc/wireguard/${instanceName}.conf && echo "exists" || echo "not exists"`);
    
    if (checkResult.stdout.trim() !== 'exists') {
      throw new Error(`Wireguard实例 ${instanceName} 不存在`);
    }
    
    // 获取实例配置内容
    const configResult = await ssh.execCommand(`cat /etc/wireguard/${instanceName}.conf`);
    
    // 获取实例状态
    const statusResult = await ssh.execCommand(`wg show ${instanceName} 2>/dev/null || echo "接口未激活"`);
    
    // 从VPS配置WG目录下获取peer信息
    const peersResult = await ssh.execCommand(`find /root/VPS配置WG -name "${instanceName}-peer*-client.conf" | sort`);
    
    const peers = [];
    
    if (peersResult.stdout) {
      const peerFiles = peersResult.stdout.split('\n').filter(line => line.trim() !== '');
      
      for (const peerFile of peerFiles) {
        const peerNameMatch = peerFile.match(/-peer(\d+)-client\.conf$/);
        if (peerNameMatch) {
          const peerNumber = peerNameMatch[1];
          const peerContentResult = await ssh.execCommand(`cat "${peerFile}"`);
          
          if (peerContentResult.stdout) {
            // 从配置中提取关键信息
            const addressMatch = peerContentResult.stdout.match(/Address\s*=\s*([0-9a-fA-F:.\/]+)/);
            const publicKeyMatch = peerContentResult.stdout.match(/PublicKey\s*=\s*([A-Za-z0-9+\/=]+)/);
            
            peers.push({
              number: peerNumber,
              file: peerFile,
              address: addressMatch ? addressMatch[1] : '未知',
              publicKey: publicKeyMatch ? publicKeyMatch[1] : '未知',
              config: peerContentResult.stdout
            });
          }
        }
      }
    }
    
    // 提取端口映射范围
    let portMappingRange = null;
    if (configResult.stdout) {
      // 从PostUp命令中提取端口映射范围
      const portRangeMatch = configResult.stdout.match(/for port in \\\$\(seq (\d+) (\d+)\);/);
      if (portRangeMatch) {
        portMappingRange = {
          start: parseInt(portRangeMatch[1]),
          end: parseInt(portRangeMatch[2]),
          count: parseInt(portRangeMatch[2]) - parseInt(portRangeMatch[1]) + 1
        };
      }
      
      // 如果没有从配置中找到，尝试根据实例名称计算
      if (!portMappingRange) {
        // 从实例名称中提取数字，例如从wg0提取0
        const instanceNumberMatch = instanceName.match(/wg(\d+)/);
        if (instanceNumberMatch) {
          const instanceNumber = parseInt(instanceNumberMatch[1]);
          const startPort = 55835 + instanceNumber * 1000;
          const endPort = startPort + 999;
          portMappingRange = {
            start: startPort,
            end: endPort,
            count: 1000,
            note: '根据实例名称推算的映射范围'
          };
        }
      }
    }
    
    return {
      name: instanceName,
      config: configResult.stdout,
      status: statusResult.stdout,
      peers: peers,
      portMappingRange: portMappingRange
    };
  } catch (error) {
    console.error(`获取Wireguard实例 ${instanceName} 详细信息失败:`, error);
    throw new Error(`获取Wireguard实例 ${instanceName} 详细信息失败: ${error.message}`);
  }
}

// 添加新的Wireguard peer
async function addWireguardPeer(ssh, instanceName) {
  try {
    // 检查Wireguard配置文件是否存在
    const checkResult = await ssh.execCommand(`test -f /etc/wireguard/${instanceName}.conf && echo "exists" || echo "not exists"`);
    
    if (checkResult.stdout.trim() !== 'exists') {
      throw new Error(`Wireguard实例 ${instanceName} 不存在`);
    }
    
    // 确保VPS配置WG目录存在
    await ssh.execCommand('mkdir -p /root/VPS配置WG');
    
    // 获取当前peer信息，查找最大peer编号
    const peersResult = await ssh.execCommand(`find /root/VPS配置WG -name "${instanceName}-peer*-client.conf" | sort`);
    
    const peerFiles = peersResult.stdout.split('\n').filter(line => line.trim() !== '');
    let maxPeerNumber = 0;
    
    for (const peerFile of peerFiles) {
      const peerNameMatch = peerFile.match(/-peer(\d+)-client\.conf$/);
      if (peerNameMatch) {
        const peerNumber = parseInt(peerNameMatch[1], 10);
        if (peerNumber > maxPeerNumber) {
          maxPeerNumber = peerNumber;
        }
      }
    }
    
    // 下一个peer编号
    const newPeerNumber = maxPeerNumber + 1;
    console.log(`为Wireguard实例 ${instanceName} 添加新peer: peer${newPeerNumber}`);
    
    // 获取服务器配置信息
    const configResult = await ssh.execCommand(`cat /etc/wireguard/${instanceName}.conf`);
    
    if (!configResult.stdout) {
      throw new Error(`无法读取 ${instanceName} 配置文件`);
    }
    
    // 从配置中提取服务器信息
    const configData = configResult.stdout;
    
    // 改进正则表达式，支持IPv4和IPv6地址格式
    // 但我们只需要IPv4地址，所以仍然使用原来的正则匹配IPv4
    const serverAddressMatch = configData.match(/Address\s*=\s*([0-9.\/]+)/);
    const serverListenPortMatch = configData.match(/ListenPort\s*=\s*(\d+)/);
    const serverPublicKeyResult = await ssh.execCommand(`cat /root/VPS配置WG/${instanceName}-server.pub 2>/dev/null || wg show ${instanceName} public-key`);
    
    if (!serverAddressMatch) {
      throw new Error('无法从配置中提取服务器IPv4地址，请确认配置文件中包含正确的IPv4地址格式');
    }
    
    // 提取服务器IP网段信息和掩码
    const serverNetworkInfo = serverAddressMatch[1].split('/');
    const serverNetwork = serverNetworkInfo[0].split('.');
    const subnetMask = serverNetworkInfo[1] || '24';
    
    // 确定新peer的IP地址 (10.0.x.y)
    // 服务器通常是 10.0.x.1，客户端从 10.0.x.2 开始
    // 查找已分配的IP
    const assignedIPs = new Set();
    
    // 从服务器配置中提取已分配IP - 只匹配IPv4地址
    const peerRegex = /AllowedIPs\s*=\s*([0-9.\/]+)/g;
    let match;
    while ((match = peerRegex.exec(configData)) !== null) {
      const ip = match[1].split('/')[0];
      assignedIPs.add(ip);
    }
    
    // 服务器IP通常是网段的第一个
    assignedIPs.add(`${serverNetwork[0]}.${serverNetwork[1]}.${serverNetwork[2]}.1`);
    
    // 找到未分配的IP
    let newIP;
    for (let i = 2; i < 254; i++) {
      const candidateIP = `${serverNetwork[0]}.${serverNetwork[1]}.${serverNetwork[2]}.${i}`;
      if (!assignedIPs.has(candidateIP)) {
        newIP = candidateIP;
        break;
      }
    }
    
    if (!newIP) {
      throw new Error('无法分配新的IP地址，所有可用IP已分配');
    }
    
    // 生成新的peer密钥对
    await ssh.execCommand(`cd /root/VPS配置WG && wg genkey | tee "${instanceName}-peer${newPeerNumber}.key" | wg pubkey > "${instanceName}-peer${newPeerNumber}.pub"`);
    
    // 获取密钥内容
    const privateKeyResult = await ssh.execCommand(`cat /root/VPS配置WG/${instanceName}-peer${newPeerNumber}.key`);
    const publicKeyResult = await ssh.execCommand(`cat /root/VPS配置WG/${instanceName}-peer${newPeerNumber}.pub`);
    
    if (!privateKeyResult.stdout || !publicKeyResult.stdout) {
      throw new Error('生成密钥对失败');
    }
    
    const privateKey = privateKeyResult.stdout.trim();
    const publicKey = publicKeyResult.stdout.trim();
    
    // 获取公网IP - 从配置文件中提取SNAT规则中使用的公网IP
    // 在多IP环境下，每个Wireguard实例使用特定的公网IP
    let publicIP = '';
    
    // 1. 从配置中查找SNAT规则，提取--to-source后面的IP地址
    const snatMatch = configData.match(/POSTROUTING.*?--to-source\s+([0-9.]+)/);
    if (snatMatch && snatMatch[1]) {
      publicIP = snatMatch[1];
      console.log(`从SNAT规则中提取公网IP: ${publicIP}`);
    }
    
    // 2. 尝试从DNAT规则中提取IP地址
    if (!publicIP) {
      const dnatMatch = configData.match(/DNAT\s+--to-destination\s+([0-9.]+):/);
      if (dnatMatch && dnatMatch[1]) {
        publicIP = dnatMatch[1];
        console.log(`从DNAT规则中提取公网IP: ${publicIP}`);
      }
    }
    
    // 3. 尝试从wg show命令获取endpoint地址
    if (!publicIP) {
      try {
        const endpointResult = await ssh.execCommand(`wg show ${instanceName} endpoints | awk '{print $2}' | cut -d: -f1 | head -n1`);
        const endpoint = endpointResult.stdout.trim();
        
        if (endpoint && endpoint.match(/^[0-9.]+$/)) {
          publicIP = endpoint;
          console.log(`从wg endpoints获取公网IP: ${publicIP}`);
        }
      } catch (err) {
        console.log(`获取wg endpoints失败: ${err.message}`);
      }
    }
    
    // 4. 如果没有从配置规则中找到IP，则尝试使用curl获取
    if (!publicIP) {
      const ipResult = await ssh.execCommand('curl -s -4 ifconfig.me');
      publicIP = ipResult.stdout.trim();
      console.log(`通过curl获取公网IP: ${publicIP}`);
    }
    
    // 5. 如果仍然没有获取到有效的IPv4地址，尝试从接口直接获取
    if (!publicIP.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
      console.log('无法获取有效的IPv4地址，尝试从接口获取');
      
      // 获取对应Wireguard接口的IP地址
      // 首先尝试从PostUp规则中找到外部接口名
      const extIfMatch = configData.match(/-o\s+(\w+)\s+-j\s+SNAT/);
      const extIf = extIfMatch ? extIfMatch[1] : null;
      
      if (extIf) {
        // 如果找到外部接口，则获取该接口的IPv4地址
        const interfaceIPResult = await ssh.execCommand(`ip -4 addr show ${extIf} | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n1`);
        const interfaceIP = interfaceIPResult.stdout.trim();
        
        if (interfaceIP && interfaceIP.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
          console.log(`使用接口${extIf}的IPv4地址: ${interfaceIP}`);
          publicIP = interfaceIP;
        }
      }
      
      // 如果仍然没找到，尝试使用默认接口
      if (!publicIP.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
        // 获取系统默认接口的IPv4地址
        const interfaceIPResult = await ssh.execCommand('ip -4 addr show $(ip route | grep default | awk \'{print $5}\' | head -n1) | grep inet | awk \'{print $2}\' | cut -d/ -f1 | head -n1');
        const interfaceIP = interfaceIPResult.stdout.trim();
        
        if (interfaceIP && interfaceIP.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
          console.log(`使用默认接口的IPv4地址: ${interfaceIP}`);
          publicIP = interfaceIP;
        } else {
          throw new Error('无法获取有效的IPv4地址');
        }
      }
    }
    
    // 最后确认一下是否成功获取了IPv4地址
    if (!publicIP.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) {
      throw new Error(`无法为Wireguard实例 ${instanceName} 获取有效的IPv4地址`);
    }
    
    console.log(`最终使用的公网IP地址: ${publicIP}`);
    
    // 创建客户端配置文件
    const listenPort = serverListenPortMatch ? serverListenPortMatch[1] : '52835';
    const dns = '1.1.1.1'; // 默认DNS
    
    const clientConfig = `[Interface]
PrivateKey = ${privateKey}
Address = ${newIP}/32
DNS = ${dns}

[Peer]
PublicKey = ${serverPublicKeyResult.stdout.trim()}
Endpoint = ${publicIP}:${listenPort}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
    
    // 保存客户端配置
    await ssh.execCommand(`echo "${clientConfig}" > /root/VPS配置WG/${instanceName}-peer${newPeerNumber}-client.conf`);
    
    // 修改服务器配置，添加新peer
    const peerServerConfig = `
[Peer]
PublicKey = ${publicKey}
AllowedIPs = ${newIP}/32
`;
    
    // 追加到服务器配置
    await ssh.execCommand(`echo "${peerServerConfig}" >> /etc/wireguard/${instanceName}.conf`);
    
    // 重启Wireguard服务
    await ssh.execCommand(`systemctl restart wg-quick@${instanceName}`);
    
    return {
      number: newPeerNumber,
      privateKey,
      publicKey,
      ip: newIP,
      config: clientConfig
    };
  } catch (error) {
    console.error(`为Wireguard实例 ${instanceName} 添加peer失败:`, error);
    throw new Error(`添加peer失败: ${error.message}`);
  }
}

// 删除Wireguard peer
async function deleteWireguardPeer(ssh, instanceName, peerNumber) {
  try {
    // 检查Wireguard配置文件是否存在
    const checkResult = await ssh.execCommand(`test -f /etc/wireguard/${instanceName}.conf && echo "exists" || echo "not exists"`);
    
    if (checkResult.stdout.trim() !== 'exists') {
      throw new Error(`Wireguard实例 ${instanceName} 不存在`);
    }
    
    // 检查peer配置文件是否存在
    const checkPeerResult = await ssh.execCommand(`test -f /root/VPS配置WG/${instanceName}-peer${peerNumber}-client.conf && echo "exists" || echo "not exists"`);
    
    if (checkPeerResult.stdout.trim() !== 'exists') {
      throw new Error(`Peer ${peerNumber} 不存在`);
    }
    
    // 获取peer的公钥
    const publicKeyResult = await ssh.execCommand(`cat /root/VPS配置WG/${instanceName}-peer${peerNumber}.pub || echo ""`);
    const publicKey = publicKeyResult.stdout.trim();
    
    if (!publicKey) {
      throw new Error(`无法获取peer ${peerNumber} 的公钥`);
    }
    
    // 从服务器配置中移除peer
    // 使用sed读取配置文件，找到并删除包含该公钥的Peer段落
    const removeCommand = `
    sed -i '/\\[Peer\\]/,/^$/ {
      /PublicKey = ${publicKey}/,/^$/d
    }' /etc/wireguard/${instanceName}.conf
    `;
    
    await ssh.execCommand(removeCommand);
    
    // 删除peer的客户端配置和密钥
    await ssh.execCommand(`rm -f /root/VPS配置WG/${instanceName}-peer${peerNumber}.key /root/VPS配置WG/${instanceName}-peer${peerNumber}.pub /root/VPS配置WG/${instanceName}-peer${peerNumber}-client.conf`);
    
    // 重启Wireguard服务
    await ssh.execCommand(`systemctl restart wg-quick@${instanceName}`);
    
    return {
      success: true,
      message: `成功删除 ${instanceName} 的 peer${peerNumber}`
    };
  } catch (error) {
    console.error(`删除Wireguard实例 ${instanceName} 的peer ${peerNumber} 失败:`, error);
    throw new Error(`删除peer失败: ${error.message}`);
  }
}

// 测试SSH连接
ipcMain.handle('test-ssh-connection', async (event, serverId) => {
  const servers = store.get('servers') || [];
  const server = servers.find(s => s.id === serverId);
  
  if (!server) {
    return { success: false, error: '找不到服务器' };
  }
  
  const result = await connectToSSH(server);
  
  if (result.success && result.ssh) {
    // 关闭连接
    result.ssh.dispose();
  }
  
  return {
    success: result.success,
    error: result.error
  };
});

// Wireguard部署相关
ipcMain.handle('deploy-wireguard', async (event, serverId) => {
  const servers = store.get('servers') || [];
  const server = servers.find(s => s.id === serverId);
  
  if (!server) {
    return { success: false, error: '找不到服务器' };
  }
  
  // 连接SSH
  const connectionResult = await connectToSSH(server);
  
  if (!connectionResult.success) {
    return connectionResult;
  }
  
  const ssh = connectionResult.ssh;
  
  try {
    // 存储连接信息以便后续使用终端
    activeSSHConnections.set(serverId, { ssh, server });
    
    // 发送进度更新
    const sendProgress = (percent, message) => {
      event.sender.send('wireguard-deploy-progress', { 
        serverId, 
        percent, 
        message 
      });
    };
    
    // 自动执行Wireguard部署所需的步骤
    // 1. 设置DNS
    sendProgress(5, '正在设置DNS...');
    await ssh.execCommand('echo "nameserver 1.1.1.1" > /etc/resolv.conf');
    
    // 2. 安装VIM编辑器
    sendProgress(10, '正在安装VIM编辑器...');
    const vimInstallResult = await ssh.execCommand('apt update && apt install -y vim');
    console.log('VIM安装结果:', vimInstallResult);

    // 3. Wireguard脚本内容 - 注意: 修复了转义字符导致的JavaScript解析错误
    sendProgress(15, '正在准备安装脚本...');
    const wireguardScript = `#!/bin/bash
# VPS配置WG.sh
# 本脚本适用于 Ubuntu 22.04，自动安装配置 WireGuard，
# 根据 VPS 外部接口上的公网 IP（主IP及附加IP）分别创建对应的 WG 实例，
# 为每个实例配置 SNAT 出网、双向 FORWARD，以及逐条添加 1000 个端口映射 DNAT 规则，
# 同时生成服务端及客户端配置（含二维码）。
#
# 请以 root 用户运行（例如：sudo bash VPS配置WG.sh）
# 在使用前建议在测试环境中验证！
set -e

# 自动确认相关安装和配置
export DEBIAN_FRONTEND=noninteractive
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections

# 设置DNS（可根据需要修改）
DNS="1.1.1.1"

echo "更新并升级系统软件包..."
apt update && apt upgrade -y

echo "安装 WireGuard、qrencode、ufw、iptables-persistent 和 curl..."
apt install -y wireguard qrencode ufw iptables-persistent curl

echo "开启 IP 转发..."
sysctl -w net.ipv4.ip_forward=1 >/dev/null
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# 修改 UFW 默认转发策略为 ACCEPT
if [ -f /etc/default/ufw ]; then
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
fi

# 自动获取默认外部网络接口
EXT_IF=$(ip route | grep '^default' | awk '{print $5}' | head -n1)
echo "检测到外部网络接口：$EXT_IF"

# 获取该接口上所有IPv4地址（按系统分配顺序）
public_ips=($(ip -o -4 addr show dev "$EXT_IF" | awk '{print $4}' | cut -d/ -f1))
if [ \${#public_ips[@]} -eq 0 ]; then
  echo "未检测到公共IP，退出！"
  exit 1
fi

# 获取实际对外显示的主IP
primary_ip=$(curl -s ifconfig.me)
echo "通过外部检测到的主IP：$primary_ip"

# 调整顺序：将主IP放在首位，其它附加IP依次排列
ordered_ips=()
for ip in "\${public_ips[@]}"; do
  if [ "$ip" == "$primary_ip" ]; then
    ordered_ips=("$ip")
    break
  fi
done
for ip in "\${public_ips[@]}"; do
  if [ "$ip" != "$primary_ip" ]; then
    ordered_ips+=("$ip")
  fi
done
public_ips=("\${ordered_ips[@]}")
echo "最终IP顺序：\${public_ips[@]}"

# 创建保存配置文件的目录，例如 /root/VPS配置WG
WG_DIR="/root/VPS配置WG"
mkdir -p "$WG_DIR"

instance=0
for ip in "\${public_ips[@]}"; do
  # 检查对应的 WireGuard 配置是否已存在，若存在则跳过
  if [ -f "/etc/wireguard/wg\${instance}.conf" ]; then
    echo "检测到 /etc/wireguard/wg\${instance}.conf 已存在，跳过 IP: $ip"
    instance=$((instance+1))
    continue
  fi

  WG_IF="wg\${instance}"
  WG_PORT=$((52835 + instance * 10))
  # 修改端口映射范围：每个实例映射1000个端口，且不重叠
  MAP_PORT_START=$((55835 + instance * 1000))
  MAP_PORT_END=$((MAP_PORT_START + 999))
  # 每个实例使用不同子网：wg0 -> 10.0.1.0/24，wg1 -> 10.0.2.0/24，以此类推
  WG_SUBNET="10.0.$((instance+1)).0/24"
  SERVER_WG_IP="10.0.$((instance+1)).1"

  echo "-------------------------------------------"
  echo "配置 WireGuard 接口：\${WG_IF} (公网 IP: $ip)"
  echo "ListenPort: \${WG_PORT}"
  echo "端口映射范围: \${MAP_PORT_START}-\${MAP_PORT_END} UDP 映射至 \${WG_PORT}"
  echo "子网: \${WG_SUBNET} (服务端 IP: \${SERVER_WG_IP})"
  
  # 生成服务端密钥对
  echo "为 \${WG_IF} 生成服务端密钥..."
  umask 077
  wg genkey | tee "$WG_DIR/\${WG_IF}-server.key" | wg pubkey > "$WG_DIR/\${WG_IF}-server.pub"

  # 自动为每个实例配置 1 个 peer，无需人工输入
  peer_count=1
  
  # 保存服务端配置中的各 peer 配置段
  peer_configs=""

  # 子网内IP分配，服务端占用 .1，从 .2 开始分配给客户端
  peer_ip_index=2  
  for ((p=1; p<=peer_count; p++)); do
    echo "为 \${WG_IF} 的 peer $p 生成密钥..."
    wg genkey | tee "$WG_DIR/\${WG_IF}-peer\${p}.key" | wg pubkey > "$WG_DIR/\${WG_IF}-peer\${p}.pub"
    # 分配 peer IP
    PEER_IP="10.0.$((instance+1)).$peer_ip_index"
    peer_ip_index=$((peer_ip_index+1))

    peer_configs+="
[Peer]
PublicKey = \$(cat "$WG_DIR/\${WG_IF}-peer\${p}.pub")
AllowedIPs = \${PEER_IP}/32
"

    # 生成客户端配置文件，客户端 Address 掩码设为 /32
    CLIENT_CONF="$WG_DIR/\${WG_IF}-peer\${p}-client.conf"
    cat > "$CLIENT_CONF" <<EOF
[Interface]
PrivateKey = \$(cat "$WG_DIR/\${WG_IF}-peer\${p}.key")
Address = \${PEER_IP}/32
DNS = \${DNS}
[Peer]
PublicKey = \$(cat "$WG_DIR/\${WG_IF}-server.pub")
Endpoint = \${ip}:\${WG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
  done

  # 生成服务端配置文件，使用 SNAT 指定出网 IP，并添加双向 FORWARD 规则及1000个端口映射规则
  SERVER_CONF="/etc/wireguard/\${WG_IF}.conf"
  SERVER_PRIVATE_KEY=\$(cat "$WG_DIR/\${WG_IF}-server.key")
  
  cat > "$SERVER_CONF" <<EOF
[Interface]
Address = \${SERVER_WG_IP}/24
ListenPort = \${WG_PORT}
PrivateKey = \${SERVER_PRIVATE_KEY}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; \\
         iptables -t nat -A POSTROUTING -s \${WG_SUBNET} -o \${EXT_IF} -j SNAT --to-source \${ip}; \\
         for port in \\\$(seq \${MAP_PORT_START} \${MAP_PORT_END}); do iptables -t nat -A PREROUTING -p udp --dport \\\$port -j DNAT --to-destination \${ip}:\${WG_PORT}; done
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; \\
           iptables -t nat -D POSTROUTING -s \${WG_SUBNET} -o \${EXT_IF} -j SNAT --to-source \${ip}; \\
           for port in \\\$(seq \${MAP_PORT_START} \${MAP_PORT_END}); do iptables -t nat -D PREROUTING -p udp --dport \\\$port -j DNAT --to-destination \${ip}:\${WG_PORT}; done
EOF

  echo "\${peer_configs}" >> "$SERVER_CONF"
  chmod 600 "$SERVER_CONF" "$WG_DIR/\${WG_IF}-server.key"

  # 设置 systemd 开机自启并启动 WireGuard 接口
  systemctl enable wg-quick@\${WG_IF}
  systemctl restart wg-quick@\${WG_IF}

  # 配置 ufw 防火墙规则
  echo "配置 ufw 防火墙规则..."
  ufw allow 22/tcp
  ufw allow \${WG_PORT}/udp
  ufw allow \${MAP_PORT_START}:\${MAP_PORT_END}/udp

  echo "-------------------------------------------"
  echo "WireGuard 接口：\${WG_IF}"
  echo "公网 IP: $ip"
  echo "服务端 WireGuard IP: \${SERVER_WG_IP}"
  echo "监听端口: \${WG_PORT}"
  echo "1000个端口映射范围: \${MAP_PORT_START}-\${MAP_PORT_END} UDP 映射至 \${WG_PORT}"
  echo "服务端配置文件: \${SERVER_CONF}"
  
  echo "---------- 以下为每个 peer 的客户端配置 ----------"
  for ((p=1; p<=peer_count; p++)); do
      CLIENT_CONF="$WG_DIR/\${WG_IF}-peer\${p}-client.conf"
      echo ">>> Peer $p 客户端配置文件: \${CLIENT_CONF}"
      echo "配置内容："
      cat "$CLIENT_CONF"
      echo "二维码（使用 qrencode 显示）："
      qrencode -t ansiutf8 < "$CLIENT_CONF"
      echo "-------------------------------------------"
  done

  instance=$((instance+1))
done

ufw --force enable
ufw reload

cp "\$0" "$WG_DIR/VPS配置WG.sh"

echo "所有配置已完成，WireGuard 服务已重启并设置为开机自启动。"
echo "请查看 /etc/wireguard/ 下的服务端配置文件，以及 \${WG_DIR} 目录下的客户端配置和二维码."
`;
    
    // 4. 保存脚本到文件
    sendProgress(20, '正在保存脚本到文件...');
    const saveScriptResult = await ssh.execCommand(`cat > /root/VPS动态配置wireguard.sh << 'EOFSCRIPT'\n${wireguardScript}\nEOFSCRIPT`);
    console.log('保存脚本结果:', saveScriptResult);
    
    // 5. 赋予执行权限
    sendProgress(25, '正在赋予脚本执行权限...');
    const chmodResult = await ssh.execCommand('chmod +x /root/VPS动态配置wireguard.sh');
    console.log('赋予执行权限结果:', chmodResult);
    
    // 6. 首次运行脚本
    sendProgress(30, '正在启动Wireguard部署...');
    
    // 以非阻塞方式运行脚本并实时更新进度
    const execScriptPromise = new Promise(async (resolve, reject) => {
      try {
        // 创建进度标记文件用于监控进度
        await ssh.execCommand('echo "0" > /tmp/wg_progress');
        
        // 启动脚本（后台执行）
        ssh.execCommand('nohup sh -c "bash /root/VPS动态配置wireguard.sh > /tmp/wg_output 2>&1 & echo $!" > /tmp/wg_pid').then(result => {
          console.log('脚本启动结果:', result);
        });
        
        // 等待脚本启动
        await new Promise(r => setTimeout(r, 1000));
        
        // 获取脚本PID
        const pidResult = await ssh.execCommand('cat /tmp/wg_pid');
        const pid = pidResult.stdout.trim();
        console.log('脚本PID:', pid);
        
        // 定期检查进度
        let finished = false;
        let lastOutput = '';
        let progressCounter = 30;
        
        const checkInterval = setInterval(async () => {
          if (finished) return;
          
          try {
            // 检查进程是否还在运行
            const psResult = await ssh.execCommand(`ps -p ${pid} -o comm= || echo "notrunning"`);
            const isRunning = !psResult.stdout.includes('notrunning');
            
            // 获取输出
            const outputResult = await ssh.execCommand('cat /tmp/wg_output || echo ""');
            const currentOutput = outputResult.stdout;
            
            // 如果输出有变化，更新进度
            if (currentOutput !== lastOutput) {
              lastOutput = currentOutput;
              
              // 根据输出内容估算进度
              let estimatedProgress = 30; // 起始进度
              
              if (currentOutput.includes('更新并升级系统软件包')) estimatedProgress = 35;
              if (currentOutput.includes('安装 WireGuard')) estimatedProgress = 40;
              if (currentOutput.includes('开启 IP 转发')) estimatedProgress = 45;
              if (currentOutput.includes('检测到外部网络接口')) estimatedProgress = 50;
              if (currentOutput.includes('获取实际对外显示的主IP')) estimatedProgress = 55;
              if (currentOutput.includes('配置 WireGuard 接口')) estimatedProgress = 60;
              if (currentOutput.includes('生成服务端密钥')) estimatedProgress = 65;
              if (currentOutput.includes('生成客户端配置文件')) estimatedProgress = 70;
              if (currentOutput.includes('设置 systemd 开机自启')) estimatedProgress = 80;
              if (currentOutput.includes('配置 ufw 防火墙规则')) estimatedProgress = 85;
              if (currentOutput.includes('二维码')) estimatedProgress = 90;
              if (currentOutput.includes('所有配置已完成')) estimatedProgress = 95;
              
              progressCounter = Math.max(progressCounter, estimatedProgress);
              sendProgress(progressCounter, `正在部署Wireguard (${progressCounter}%)...`);
            }
            
            // 如果进程不再运行，表示部署完成或失败
            if (!isRunning) {
              clearInterval(checkInterval);
              finished = true;
              
              // 先检查是否生成了客户端配置文件
              ssh.execCommand('find /root/VPS配置WG -name "*-peer*-client.conf" 2>/dev/null || echo ""').then(configResult => {
                // 如果找到客户端配置文件，则视为成功
                if (configResult.stdout && configResult.stdout.trim() !== '') {
                  sendProgress(100, '部署完成！发现客户端配置文件');
                  resolve({ success: true, output: currentOutput });
                }
                // 其次检查是否成功完成
                else if (currentOutput.includes('所有配置已完成') || 
                    currentOutput.includes('WireGuard 服务已重启') || 
                    currentOutput.includes('客户端配置文件') ||
                    (currentOutput.includes('配置文件') && currentOutput.includes('wg0-peer1-client.conf'))) {
                  sendProgress(100, '部署完成！');
                  resolve({ success: true, output: currentOutput });
                } else {
                  // 尝试查找错误信息
                  const errorMatch = currentOutput.match(/错误|失败|Error|Failed/i);
                  const errorMsg = errorMatch ? 
                    currentOutput.substring(currentOutput.indexOf(errorMatch[0])) : 
                    '未知错误，请检查日志';
                  
                  sendProgress(100, '部署失败: ' + errorMsg);
                  reject(new Error(errorMsg));
                }
              }).catch(error => {
                console.error('检查客户端配置文件失败:', error);
                
                // 若检查文件失败，使用原有判断逻辑
                if (currentOutput.includes('所有配置已完成') || 
                    currentOutput.includes('WireGuard 服务已重启') || 
                    currentOutput.includes('客户端配置文件')) {
                  sendProgress(100, '部署完成！');
                  resolve({ success: true, output: currentOutput });
                } else {
                  const errorMsg = '检查配置文件失败，部署可能未完成';
                  sendProgress(100, '部署失败: ' + errorMsg);
                  reject(new Error(errorMsg));
                }
              });
            }
          } catch (error) {
            console.error('检查进度失败:', error);
          }
        }, 2000); // 每2秒检查一次
        
        // 设置最大超时时间（10分钟）
        setTimeout(() => {
          if (!finished) {
            clearInterval(checkInterval);
            finished = true;
            sendProgress(100, '部署超时，请手动检查');
            resolve({ success: true, output: '部署操作超时，但可能仍在后台运行。请手动检查部署状态。' });
          }
        }, 10 * 60 * 1000);
      } catch (error) {
        reject(error);
      }
    });
    
    // 等待脚本执行完成
    const execScriptResult = await execScriptPromise;
    console.log('执行脚本结果:', execScriptResult);
    
    // 获取客户端配置文件
    sendProgress(100, '获取客户端配置...');
    const findClientConfigsResult = await ssh.execCommand('find /root/VPS配置WG -name "*-peer*-client.conf" 2>/dev/null || echo "未找到客户端配置"');
    const clientConfigs = [];

    if (findClientConfigsResult.stdout && !findClientConfigsResult.stdout.includes("未找到客户端配置")) {
      const configFiles = findClientConfigsResult.stdout.split('\n').filter(line => line.trim() !== '');
      
      // 读取所有配置文件的内容
      for (const configPath of configFiles) {
        const configResult = await ssh.execCommand(`cat "${configPath}"`);
        if (configResult.stdout) {
          clientConfigs.push({
            path: configPath,
            name: configPath.split('/').pop(),
            content: configResult.stdout
          });
        }
      }
    }

    return {
      success: true,
      output: "Wireguard部署已完成！脚本已自动执行以下步骤：\n1.设置DNS\n2.安装VIM编辑器\n3.保存脚本到VPS动态配置wireguard.sh\n4.赋予执行权限\n5.运行脚本完成部署\n\n您现在可以进入SSH终端查看更多细节和配置信息。",
      clientConfig: clientConfigs.length > 0 ? clientConfigs[0].content : '',
      clientConfigs: clientConfigs,
      debug: {
        notes: "Wireguard部署已自动完成",
        execScriptOutput: execScriptResult
      }
    };
  } catch (error) {
    console.error('Wireguard部署失败:', error);
    
    // 发送失败进度
    event.sender.send('wireguard-deploy-progress', { 
      serverId, 
      percent: 100, 
      message: '部署失败: ' + error.message 
    });
    
    // 确保关闭SSH连接
    if (ssh && !activeSSHConnections.has(serverId)) {
      ssh.dispose();
    }
    
    return {
      success: false,
      error: '操作失败: ' + error.message,
      details: error
    };
  }
});

// 连接到SSH服务器并打开终端会话
ipcMain.handle('open-ssh-terminal', async (event, serverId) => {
  const servers = store.get('servers') || [];
  const server = servers.find(s => s.id === serverId);
  
  if (!server) {
    return { success: false, error: '找不到服务器' };
  }
  
  // 如果已存在连接，先关闭
  if (activeSSHConnections.has(serverId)) {
    const existingConnection = activeSSHConnections.get(serverId);
    if (existingConnection.ssh) {
      existingConnection.ssh.dispose();
    }
    activeSSHConnections.delete(serverId);
  }
  
  // 连接SSH
  const connectionResult = await connectToSSH(server);
  
  if (!connectionResult.success) {
    return connectionResult;
  }
  
  const ssh = connectionResult.ssh;
  
  try {
    // 存储连接信息
    activeSSHConnections.set(serverId, { ssh, server });
    
    return {
      success: true,
      message: 'SSH终端已连接'
    };
  } catch (error) {
    console.error('打开SSH终端失败:', error);
    
    // 确保关闭SSH连接
    if (ssh) {
      ssh.dispose();
    }
    
    return {
      success: false,
      error: '打开SSH终端失败: ' + error.message
    };
  }
});

// 执行SSH命令
ipcMain.handle('execute-ssh-command', async (event, data) => {
  // 兼容两种参数格式：对象格式和分开参数
  let serverId, command;
  
  if (typeof data === 'object' && data !== null) {
    // 新格式：{serverId, command}
    serverId = data.serverId;
    command = data.command;
  } else {
    // 旧格式：直接传递两个参数
    serverId = data;
    command = arguments[2];
  }
  
  console.log(`执行SSH命令，服务器ID: ${serverId}, 命令: ${command}`);
  
  if (!activeSSHConnections.has(serverId)) {
    return { success: false, error: '未连接到服务器' };
  }
  
  const { ssh } = activeSSHConnections.get(serverId);
  
  // 检查是否为交互式命令
  const interactiveCommands = ['vim', 'vi', 'nano', 'emacs', 'top', 'htop', 'less', 'more'];
  const commandBase = command.trim().split(' ')[0];
  
  if (interactiveCommands.includes(commandBase)) {
    return {
      success: false,
      isInteractive: true,
      error: `${commandBase}是交互式命令，不能在此终端中直接运行。请使用非交互式命令或通过标准SSH客户端连接。`,
      alternatives: {
        vim: "查看文件可使用 'cat'，编辑文件可使用 'echo \"内容\" > 文件路径'",
        vi: "查看文件可使用 'cat'，编辑文件可使用 'echo \"内容\" > 文件路径'",
        nano: "查看文件可使用 'cat'，编辑文件可使用 'echo \"内容\" > 文件路径'",
        top: "查看进程可使用 'ps aux'",
        htop: "查看进程可使用 'ps aux'",
        less: "查看文件可使用 'cat'",
        more: "查看文件可使用 'cat'"
      }[commandBase] || "请使用非交互式命令替代"
    };
  }
  
  try {
    console.log(`执行命令: ${command}`);
    const result = await ssh.execCommand(command);
    console.log('命令执行结果:', result);
    
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    };
  } catch (error) {
    console.error('执行命令失败:', error);
    return {
      success: false,
      error: '执行命令失败: ' + error.message
    };
  }
});

// 关闭SSH连接
ipcMain.handle('close-ssh-connection', async (event, serverId) => {
  if (!activeSSHConnections.has(serverId)) {
    return { success: true, message: '没有活跃的连接' };
  }
  
  try {
    const { ssh } = activeSSHConnections.get(serverId);
    ssh.dispose();
    activeSSHConnections.delete(serverId);
    
    return { success: true, message: '连接已关闭' };
  } catch (error) {
    console.error('关闭SSH连接失败:', error);
    return { success: false, error: '关闭SSH连接失败: ' + error.message };
  }
});

// 执行Wireguard脚本
ipcMain.handle('execute-wireguard-script', async (event, serverId) => {
  if (!activeSSHConnections.has(serverId)) {
    return { success: false, error: '未连接到服务器' };
  }
  
  const { ssh } = activeSSHConnections.get(serverId);
  
  try {
    // 获取客户端配置文件信息 - 修改为查找所有客户端配置
    const configCheckCmd = 'find /root/VPS配置WG -name "*-peer*-client.conf" 2>/dev/null || echo "未找到客户端配置文件"';
    const configCheckResult = await ssh.execCommand(configCheckCmd);
    
    if (configCheckResult.stdout && !configCheckResult.stdout.includes("未找到客户端配置文件")) {
      // 已有配置文件，收集所有配置信息
      const configFiles = configCheckResult.stdout.split('\n').filter(line => line.trim() !== '');
      
      // 获取所有配置文件内容
      const clientConfigs = [];
      for (const configFile of configFiles) {
        const configContent = await ssh.execCommand(`cat "${configFile}"`);
        if (configContent.stdout) {
          clientConfigs.push({
            path: configFile,
            name: configFile.split('/').pop(),
            content: configContent.stdout
          });
        }
      }
      
      return {
        success: true,
        output: `已找到以下客户端配置文件:\n${configCheckResult.stdout}\n您可以使用"查找配置"按钮查看详细配置。`,
        clientConfigs: clientConfigs
      };
    } else {
      // 如果没有找到配置文件，提示用户执行部署流程
      return {
        success: true,
        output: "未检测到Wireguard配置文件。您可以在Wireguard标签页选择服务器并点击'Wireguard部署'按钮进行自动部署。",
        clientConfigs: []
      };
    }
  } catch (error) {
    console.error('检查Wireguard配置失败:', error);
    return {
      success: false,
      error: '操作失败: ' + error.message,
      clientConfigs: []
    };
  }
});

// 生成高质量二维码
async function generateQRCode(data) {
  try {
    // 设置QR码选项，生成更高质量的图像
    const qrOptions = {
      errorCorrectionLevel: 'H', // 高纠错级别
      type: 'image/png',
      quality: 1.0,
      margin: 4,
      width: 800, // 更大的尺寸，从500增加到800
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    };
    
    // 生成二维码
    const qrCodeDataURL = await QRCode.toDataURL(data, qrOptions);
    console.log('生成高质量二维码成功');
    return qrCodeDataURL;
  } catch (error) {
    console.error('生成二维码失败:', error);
    throw error;
  }
}

// 处理二维码生成请求
ipcMain.handle('generate-qrcode', async (event, data) => {
  try {
    const qrCodeDataURL = await generateQRCode(data);
    return { success: true, qrCodeImage: qrCodeDataURL };
  } catch (error) {
    console.error('生成二维码失败:', error);
    return { success: false, error: error.message };
  }
});

// 月账单统计相关IPC处理
ipcMain.handle('get-current-month-bill', async () => {
  try {
    // 获取当前年月
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    console.log(`获取当前(${year}年${month}月)账单数据`);
    
    // 调用Python脚本获取当前月账单
    const pythonProcess = spawn('python', [
      'billing_manager.py',
      '--action=get_current_month_bill'
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    // 获取标准错误
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0 && result) {
          try {
            console.log(`获取${year}年${month}月账单原始数据: ${result.slice(0, 200)}...`);
            const data = JSON.parse(result);
            
            // 检查关键数据是否存在
            if (data && typeof data === 'object') {
              console.log(`成功解析账单数据, VPS数量: ${data['VPS数量'] || 0}, 总金额: ${data['月总费用'] || 0}`);
              
              // 检查账单行编码
              if (data['账单行'] && data['账单行'].length > 0) {
                console.log(`首行VPS数据示例: ${JSON.stringify(data['账单行'][0])}`);
              }
              
              resolve({ success: true, data });
            } else {
              console.error('解析月账单数据不完整:', data);
              resolve({ success: false, error: '账单数据不完整', result });
            }
          } catch (parseError) {
            console.error('解析月账单数据失败:', parseError);
            console.error('原始数据片段:', result.slice(0, 500));
            
            // 检查是否包含Unicode转义
            const containsEscapedUnicode = result.includes('\\u');
            if (containsEscapedUnicode) {
              console.error('原始数据包含Unicode转义符，可能需要正确处理');
            }
            
            // 尝试手动修复可能的编码问题
            try {
              const cleanedResult = result.replace(/\\'/g, "'").replace(/\\"/g, '"');
              const data = JSON.parse(cleanedResult);
              console.log('通过清理后成功解析数据');
              resolve({ success: true, data });
            } catch (secondError) {
              resolve({ 
                success: false, 
                error: `解析账单数据失败: ${parseError.message}`, 
                originalError: parseError.message,
                result 
              });
            }
          }
        } else {
          console.error(`获取${year}年${month}月账单失败 (${code}):`, error);
          resolve({ success: false, error: error || '获取账单数据失败', code });
        }
      });
    });
  } catch (error) {
    console.error('获取当前月账单出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-monthly-bill', async (event, year, month) => {
  try {
    console.log(`获取${year}年${month}月账单数据`);
    
    // 确保年月参数为整数
    year = parseInt(year);
    month = parseInt(month);
    
    if (isNaN(year) || isNaN(month)) {
      return { success: false, error: '无效的年月参数' };
    }
    
    // 调用Python脚本获取指定月账单
    const pythonProcess = spawn('python', [
      '-u',  // 添加-u参数确保Python输出不被缓冲
      'billing_manager.py',
      '--action=get_monthly_bill',
      `--year=${year}`,
      `--month=${month}`
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出，使用utf-8编码
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString('utf-8');
    });
    
    // 获取标准错误，使用utf-8编码
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString('utf-8');
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0 && result) {
          try {
            const data = JSON.parse(result);
            // 确保返回的数据中年月与请求的年月一致
            if (data['年份'] === year && data['月份'] === month) {
              resolve({ success: true, data });
            } else {
              console.error('获取月账单不匹配:', data);
              resolve({ 
                success: false, 
                error: `获取的账单年月与请求不匹配: 请求${year}年${month}月，返回${data['年份']}年${data['月份']}月` 
              });
            }
          } catch (parseError) {
            console.error('解析月账单数据失败:', parseError);
            resolve({ success: false, error: '解析账单数据失败', result });
          }
        } else {
          console.error(`获取月账单失败 (${code}):`, error);
          resolve({ success: false, error: error || '获取账单数据失败' });
        }
      });
    });
  } catch (error) {
    console.error('获取月账单出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-monthly-bill-summary', async () => {
  try {
    console.log('获取月账单汇总数据');
    
    // 调用Python脚本获取月账单汇总
    const pythonProcess = spawn('python', [
      '-u',  // 添加-u参数
      'billing_manager.py',
      '--action=get_monthly_bill_summary'
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出，使用utf-8编码
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString('utf-8');
    });
    
    // 获取标准错误，使用utf-8编码
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString('utf-8');
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0 && result) {
          try {
            console.log(`获取月账单汇总原始数据: ${result.slice(0, 200)}...`);
            const data = JSON.parse(result);
            
            // 验证数据是否为数组
            if (Array.isArray(data)) {
              console.log(`成功解析月账单汇总数据, 记录数: ${data.length}`);
              resolve({ success: true, data });
            } else {
              console.error('解析月账单汇总数据格式不正确:', data);
              resolve({ success: false, error: '账单汇总数据格式不正确', result });
            }
          } catch (parseError) {
            console.error('解析月账单汇总数据失败:', parseError);
            console.error('原始数据片段:', result.slice(0, 500));
            
            // 尝试手动修复可能的编码问题
            try {
              const cleanedResult = result.replace(/\\'/g, "'").replace(/\\"/g, '"');
              const data = JSON.parse(cleanedResult);
              console.log('通过清理后成功解析月账单汇总数据');
              resolve({ success: true, data });
            } catch (secondError) {
              resolve({ 
                success: false, 
                error: `解析账单汇总数据失败: ${parseError.message}`, 
                originalError: parseError.message,
                result: result.slice(0, 500) 
              });
            }
          }
        } else {
          console.error(`获取月账单汇总失败 (${code}):`, error);
          resolve({ success: false, error: error || '获取账单汇总数据失败', code });
        }
      });
    });
  } catch (error) {
    console.error('获取月账单汇总出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-monthly-billing-to-excel', async () => {
  try {
    console.log('导出月账单统计到Excel');
    
    // 弹出保存文件对话框
    const saveResult = await dialog.showSaveDialog({
      title: '保存月账单统计',
      defaultPath: '月账单统计.xlsx',
      filters: [
        { name: 'Excel文件', extensions: ['xlsx'] }
      ]
    });
    
    if (saveResult.canceled) {
      return { success: false, error: '用户取消了保存' };
    }
    
    const filePath = saveResult.filePath;
    
    // 调用Python脚本导出Excel
    const pythonProcess = spawn('python', [
      '-u',  // 添加-u参数
      'billing_manager.py',
      '--action=save_monthly_billing_to_excel',
      `--output=${filePath}`
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出，使用utf-8编码
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString('utf-8');
    });
    
    // 获取标准错误，使用utf-8编码
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString('utf-8');
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, filePath });
        } else {
          console.error(`导出月账单统计失败 (${code}):`, error);
          resolve({ success: false, error: error || '导出账单统计数据失败' });
        }
      });
    });
  } catch (error) {
    console.error('导出月账单统计出错:', error);
    return { success: false, error: error.message };
  }
});

// VPS管理相关IPC处理
ipcMain.handle('get-all-vps', async () => {
  try {
    console.log('获取所有VPS数据');
    
    // 调用Python脚本获取所有VPS
    const pythonProcess = spawn('python', [
      '-u',  // 添加-u参数
      'billing_manager.py',
      '--action=get_all_vps'
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出，使用utf-8编码
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString('utf-8');
    });
    
    // 获取标准错误，使用utf-8编码
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString('utf-8');
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0 && result) {
          try {
            console.log(`获取VPS数据原始数据: ${result.slice(0, 200)}...`);
            const data = JSON.parse(result);
            
            // 验证数据是否为数组
            if (Array.isArray(data)) {
              console.log(`成功解析VPS数据, 数量: ${data.length}`);
              
              // 检查第一个VPS的数据格式
              if (data.length > 0) {
                console.log(`首个VPS数据示例: ${JSON.stringify(data[0])}`);
              }
              
              resolve({ success: true, data });
            } else {
              console.error('解析VPS数据格式不正确:', data);
              resolve({ success: false, error: 'VPS数据格式不正确', result });
            }
          } catch (parseError) {
            console.error('解析VPS数据失败:', parseError);
            console.error('原始数据片段:', result.slice(0, 500));
            
            // 尝试手动修复可能的编码问题
            try {
              const cleanedResult = result.replace(/\\'/g, "'").replace(/\\"/g, '"');
              const data = JSON.parse(cleanedResult);
              console.log('通过清理后成功解析VPS数据');
              resolve({ success: true, data });
            } catch (secondError) {
              resolve({ 
                success: false, 
                error: `解析VPS数据失败: ${parseError.message}`, 
                originalError: parseError.message,
                result: result.slice(0, 500)
              });
            }
          }
        } else {
          console.error(`获取VPS数据失败 (${code}):`, error);
          resolve({ success: false, error: error || '获取VPS数据失败', code });
        }
      });
    });
  } catch (error) {
    console.error('获取VPS数据出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-vps', async (event, vpsData) => {
  try {
    console.log('保存VPS数据:', vpsData);
    
    // 将VPS数据转换为JSON字符串
    const vpsDataJson = JSON.stringify(vpsData);
    
    // 调用Python脚本保存VPS
    const pythonProcess = spawn('python', [
      'billing_manager.py',
      '--action=save_vps',
      `--vps_data=${vpsDataJson}`
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    // 获取标准错误
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0 && result) {
          try {
            const data = JSON.parse(result);
            resolve({ success: true, data });
          } catch (parseError) {
            console.error('解析保存VPS结果失败:', parseError);
            resolve({ success: false, error: '解析保存VPS结果失败', result });
          }
        } else {
          console.error(`保存VPS失败 (${code}):`, error);
          resolve({ success: false, error: error || '保存VPS失败' });
        }
      });
    });
  } catch (error) {
    console.error('保存VPS出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-vps', async (event, vpsName) => {
  try {
    console.log(`删除VPS: ${vpsName}`);
    
    // 调用Python脚本删除VPS
    const pythonProcess = spawn('python', [
      'billing_manager.py',
      '--action=delete_vps',
      `--vps_name=${vpsName}`
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    // 获取标准错误
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          console.error(`删除VPS失败 (${code}):`, error);
          resolve({ success: false, error: error || '删除VPS失败' });
        }
      });
    });
  } catch (error) {
    console.error('删除VPS出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('init-sample-vps-data', async () => {
  try {
    console.log('初始化示例VPS数据');
    
    // 调用Python脚本初始化示例数据
    const pythonProcess = spawn('python', [
      'billing_manager.py',
      '--action=init_sample_data'
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    // 获取标准错误
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          console.error(`初始化示例数据失败 (${code}):`, error);
          resolve({ success: false, error: error || '初始化示例数据失败' });
        }
      });
    });
  } catch (error) {
    console.error('初始化示例数据出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-vps-prices', async () => {
  try {
    console.log('更新VPS价格和使用时长');
    
    // 调用Python脚本更新VPS价格
    const pythonProcess = spawn('python', [
      'billing_manager.py',
      '--action=update_prices'
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    // 获取标准错误
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          console.error(`更新VPS价格失败 (${code}):`, error);
          resolve({ success: false, error: error || '更新VPS价格失败' });
        }
      });
    });
  } catch (error) {
    console.error('更新VPS价格出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-monthly-bill-to-excel', async (event, year, month) => {
  try {
    console.log(`导出${year}年${month}月账单到Excel`);
    
    // 弹出保存文件对话框
    const saveResult = await dialog.showSaveDialog({
      title: '保存月账单',
      defaultPath: `${year}年${month}月账单.xlsx`,
      filters: [
        { name: 'Excel文件', extensions: ['xlsx'] }
      ]
    });
    
    if (saveResult.canceled) {
      return { success: false, error: '用户取消了保存' };
    }
    
    const filePath = saveResult.filePath;
    
    // 调用Python脚本导出Excel
    const pythonProcess = spawn('python', [
      '-u',  // 添加-u参数确保输出不被缓冲
      'billing_manager.py',
      '--action=save_monthly_billing_to_excel',
      `--output=${filePath}`,
      `--specific_year=${year}`,
      `--specific_month=${month}`
    ]);
    
    let result = '';
    let error = '';
    
    // 获取标准输出，使用utf-8编码
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString('utf-8');
    });
    
    // 获取标准错误，使用utf-8编码
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString('utf-8');
    });
    
    // 等待进程完成
    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, filePath });
        } else {
          console.error(`导出${year}年${month}月账单失败 (${code}):`, error);
          resolve({ success: false, error: error || '导出账单数据失败' });
        }
      });
    });
  } catch (error) {
    console.error('导出月账单出错:', error);
    return { success: false, error: error.message };
  }
});

// 获取服务器上的Wireguard实例列表
ipcMain.handle('get-wireguard-instances', async (event, serverId) => {
  if (!activeSSHConnections.has(serverId)) {
    // 尝试连接服务器
    const servers = store.get('servers') || [];
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return { success: false, error: '找不到服务器' };
    }
    
    // 连接SSH
    const connectionResult = await connectToSSH(server);
    
    if (!connectionResult.success) {
      return connectionResult;
    }
    
    // 存储连接信息
    activeSSHConnections.set(serverId, { ssh: connectionResult.ssh, server });
  }
  
  const { ssh } = activeSSHConnections.get(serverId);
  
  try {
    // 获取已部署的Wireguard实例列表
    const instances = await getWireguardInstances(ssh);
    
    return {
      success: true,
      instances
    };
  } catch (error) {
    console.error('获取Wireguard实例列表失败:', error);
    return {
      success: false,
      error: '获取Wireguard实例列表失败: ' + error.message
    };
  }
});

// 获取Wireguard实例详细信息
ipcMain.handle('get-wireguard-instance-details', async (event, serverId, instanceName) => {
  if (!activeSSHConnections.has(serverId)) {
    // 尝试连接服务器
    const servers = store.get('servers') || [];
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return { success: false, error: '找不到服务器' };
    }
    
    // 连接SSH
    const connectionResult = await connectToSSH(server);
    
    if (!connectionResult.success) {
      return connectionResult;
    }
    
    // 存储连接信息
    activeSSHConnections.set(serverId, { ssh: connectionResult.ssh, server });
  }
  
  const { ssh } = activeSSHConnections.get(serverId);
  
  try {
    // 获取Wireguard实例详细信息
    const details = await getWireguardInstanceDetails(ssh, instanceName);
    
    return {
      success: true,
      details
    };
  } catch (error) {
    console.error(`获取Wireguard实例 ${instanceName} 详细信息失败:`, error);
    return {
      success: false,
      error: `获取Wireguard实例 ${instanceName} 详细信息失败: ${error.message}`
    };
  }
});

// 为Wireguard实例添加peer
ipcMain.handle('add-wireguard-peer', async (event, serverId, instanceName) => {
  if (!activeSSHConnections.has(serverId)) {
    // 尝试连接服务器
    const servers = store.get('servers') || [];
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return { success: false, error: '找不到服务器' };
    }
    
    // 连接SSH
    const connectionResult = await connectToSSH(server);
    
    if (!connectionResult.success) {
      return connectionResult;
    }
    
    // 存储连接信息
    activeSSHConnections.set(serverId, { ssh: connectionResult.ssh, server });
  }
  
  const { ssh } = activeSSHConnections.get(serverId);
  
  try {
    // 添加新的peer
    const peer = await addWireguardPeer(ssh, instanceName);
    
    // 为配置生成二维码
    const qrCodeDataURL = await generateQRCode(peer.config);
    
    return {
      success: true,
      peer,
      qrCode: qrCodeDataURL
    };
  } catch (error) {
    console.error(`为Wireguard实例 ${instanceName} 添加peer失败:`, error);
    return {
      success: false,
      error: `添加peer失败: ${error.message}`
    };
  }
});

// 删除Wireguard peer
ipcMain.handle('delete-wireguard-peer', async (event, serverId, instanceName, peerNumber) => {
  if (!activeSSHConnections.has(serverId)) {
    // 尝试连接服务器
    const servers = store.get('servers') || [];
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return { success: false, error: '找不到服务器' };
    }
    
    // 连接SSH
    const connectionResult = await connectToSSH(server);
    
    if (!connectionResult.success) {
      return connectionResult;
    }
    
    // 存储连接信息
    activeSSHConnections.set(serverId, { ssh: connectionResult.ssh, server });
  }
  
  const { ssh } = activeSSHConnections.get(serverId);
  
  try {
    // 删除peer
    const result = await deleteWireguardPeer(ssh, instanceName, peerNumber);
    
    return {
      success: true,
      message: result.message
    };
  } catch (error) {
    console.error(`删除Wireguard实例 ${instanceName} 的peer ${peerNumber} 失败:`, error);
    return {
      success: false,
      error: `删除peer失败: ${error.message}`
    };
  }
});
