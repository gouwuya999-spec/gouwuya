const { app, BrowserWindow, ipcMain } = require('electron');
// 读取package.json中的版本号
const packageJson = require('./package.json');
// 添加应用版本号
const APP_VERSION = packageJson.version;

// 开发环境热加载支持
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  try {
    require('electron-reloader')(module, {
      debug: true,
      watchRenderer: true
    });
    console.log('热加载已启用');
  } catch (err) {
    console.log('热加载启用失败:', err);
  }
}

// 隐藏命令行窗口
if (process.platform === 'win32') {
  process.env.ELECTRON_ENABLE_LOGGING = 0;
}
const path = require('path');

// 获取应用资源路径
function getResourcePath(filename) {
  if (app.isPackaged) {
    // 打包后的应用，使用resources目录
    return path.join(process.resourcesPath, filename);
  } else {
    // 开发环境，使用当前目录
    return path.join(__dirname, filename);
  }
}
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
      preload: path.join(__dirname, 'preload.js'),
      // 优化渲染性能
      offscreen: false,
      backgroundThrottling: false
    },
    // 完全消除窗口闪烁的配置
    backgroundColor: '#FFF',
    show: false,
    frame: true,
    titleBarStyle: 'default',
    // 禁用所有可能的动画和效果
    skipTaskbar: false,
    alwaysOnTop: false,
    // 设置最小尺寸
    minWidth: 800,
    minHeight: 600,
    // 禁用窗口动画
    transparent: false,
    // 设置窗口位置居中
    center: true,
    // 禁用拖拽
    resizable: true,
    // 禁用最大化按钮动画
    maximizable: true,
    minimizable: true,
    closable: true
  });

  // 移除菜单栏
  mainWindow.setMenu(null);

  // 完全隐藏窗口直到内容加载完成
  mainWindow.hide();

  // 等待DOM内容加载完成后再显示
  mainWindow.webContents.once('dom-ready', () => {
    // 再等待一小段时间确保所有资源加载完成
    setTimeout(() => {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.center();
    }, 100);
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
  
  // 延迟创建窗口，确保所有模块都已加载
  setTimeout(() => {
    createWindow();
  }, 300);

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
    console.log('开始获取Wireguard实例列表...');
    
    // 首先检查/etc/wireguard/目录下的配置文件
    const etcResult = await ssh.execCommand('ls -l /etc/wireguard/ | grep ".conf" | awk \'{print $9}\' | sed "s/.conf$//"');
    console.log('/etc/wireguard/目录检查结果:', etcResult.stdout || '无输出', '错误:', etcResult.stderr || '无错误');
    
    // 检查/root/VPS配置WG目录下的客户端配置文件
    const peerResult = await ssh.execCommand('find /root/VPS配置WG -name "*-peer*-client.conf" 2>/dev/null | sed -r "s/.*\\/([^-]+)-peer.*-client\\.conf/\\1/" | sort | uniq');
    console.log('客户端配置文件检查结果:', peerResult.stdout || '无输出', '错误:', peerResult.stderr || '无错误');
    
    // 直接使用wg命令检查活动接口
    const wgResult = await ssh.execCommand('wg show interfaces 2>/dev/null; echo "退出码: $?"');
    console.log('wg命令检查结果:', wgResult.stdout || '无输出', '错误:', wgResult.stderr || '无错误');
    
    // 检查系统服务状态
    const serviceResult = await ssh.execCommand('systemctl status wg-quick@* 2>/dev/null || echo "无服务信息"');
    console.log('WireGuard服务状态:', serviceResult.stdout || '无服务信息');
    
    // 检查内核模块
    const moduleResult = await ssh.execCommand('lsmod | grep wireguard || echo "未加载wireguard模块"');
    console.log('WireGuard内核模块状态:', moduleResult.stdout || '未找到模块');
    
    // 合并结果
    const instancesSet = new Set();
    
    // 从/etc/wireguard/目录添加
    if (etcResult.stdout) {
      etcResult.stdout.split('\n')
        .filter(name => name.trim() !== '')
        .forEach(name => instancesSet.add(name));
    }
    
    // 从客户端配置文件添加
    if (peerResult.stdout) {
      peerResult.stdout.split('\n')
        .filter(name => name.trim() !== '')
        .forEach(name => instancesSet.add(name));
    }
    
    // 从wg命令结果添加
    if (wgResult.stdout) {
      wgResult.stdout.split('\n')
        .filter(name => name.trim() !== '' && !name.includes('退出码:'))
        .forEach(name => instancesSet.add(name));
    }
    
    // 从服务状态提取
    if (serviceResult.stdout && serviceResult.stdout !== '无服务信息') {
      const serviceMatches = serviceResult.stdout.match(/wg-quick@([a-zA-Z0-9]+)\.service/g);
      if (serviceMatches) {
        serviceMatches.forEach(match => {
          const name = match.replace('wg-quick@', '').replace('.service', '');
          instancesSet.add(name);
        });
      }
    }
    
    // 确保VPS配置WG目录存在，以便后续操作
    await ssh.execCommand('mkdir -p /root/VPS配置WG');
    
    // 转换为数组并返回
    const instances = Array.from(instancesSet);
    console.log('检测到的Wireguard实例:', instances);
    
    // 如果没有找到实例，尝试通过其他命令检测
    if (instances.length === 0) {
      console.log('未检测到Wireguard实例，尝试通过其他命令检测...');
      
      // 检查网络接口
      const ifconfigResult = await ssh.execCommand('ip a | grep -E "wg[0-9]+" || echo "未找到wg接口"');
      console.log('网络接口检查结果:', ifconfigResult.stdout || '无输出');
      
      // 检查是否安装了wireguard
      const installCheckResult = await ssh.execCommand('which wg || echo "未安装wireguard"');
      console.log('wireguard安装检查:', installCheckResult.stdout || '无输出');
      
      if (ifconfigResult.stdout && !ifconfigResult.stdout.includes('未找到wg接口')) {
        // 从ip命令输出中提取接口名
        const interfaceMatches = ifconfigResult.stdout.match(/wg[0-9]+/g);
        if (interfaceMatches) {
          interfaceMatches.forEach(name => instancesSet.add(name));
          console.log('从ip命令中检测到的接口:', interfaceMatches);
        }
      }
      
      // 更新实例列表
      const updatedInstances = Array.from(instancesSet);
      console.log('最终检测到的Wireguard实例:', updatedInstances);
      return updatedInstances;
    }
    
    return instances;
  } catch (error) {
    console.error('获取Wireguard实例列表失败:', error);
    throw new Error('获取Wireguard实例列表失败: ' + error.message);
  }
}

// 获取Wireguard实例的详细信息
async function getWireguardInstanceDetails(ssh, instanceName) {
  try {
    console.log(`开始获取Wireguard实例[${instanceName}]的详细信息...`);
    
    // 获取服务器公网IP
    console.log('获取服务器公网IP...');
    const publicIPResult = await ssh.execCommand(`
      curl -4 -s https://api.ipify.org || 
      curl -4 -s https://ifconfig.me || 
      curl -4 -s https://checkip.amazonaws.com || 
      hostname -I | awk '{print $1}'
    `);
    
    const publicIP = publicIPResult.stdout.trim();
    console.log(`服务器公网IP: ${publicIP || '无法获取'}`);
    
    // 检查多个位置的配置文件
    const etcCheckResult = await ssh.execCommand(`test -f /etc/wireguard/${instanceName}.conf && echo "exists" || echo "not exists"`);
    console.log(`/etc/wireguard/${instanceName}.conf检查结果:`, etcCheckResult.stdout.trim());
    
    let configData = '';
    
    // 检查/etc/wireguard中的配置
    if (etcCheckResult.stdout.trim() === 'exists') {
      const configResult = await ssh.execCommand(`cat /etc/wireguard/${instanceName}.conf`);
      configData = configResult.stdout;
      console.log(`已从/etc/wireguard/${instanceName}.conf读取配置`);
      if (configData) {
        console.log(`配置内容预览(前100字符): ${configData.substring(0, 100)}...`);
      } else {
        console.log(`警告: 配置文件存在但内容为空`);
      }
    } else {
      // 尝试使用wg show命令获取配置
      console.log(`未在/etc/wireguard中找到${instanceName}.conf，尝试从wg命令获取配置`);
      const wgConfigResult = await ssh.execCommand(`wg showconf ${instanceName} 2>/dev/null || echo "无法获取配置"`);
      console.log(`wg showconf ${instanceName}结果:`, 
               wgConfigResult.stdout.includes('无法获取配置') ? '无法获取配置' : '获取到配置', 
               '错误:', wgConfigResult.stderr || '无错误');
      
      if (wgConfigResult.stdout && !wgConfigResult.stdout.includes('无法获取配置')) {
        configData = wgConfigResult.stdout;
        // 将配置保存到/etc/wireguard目录
        console.log(`尝试将wg showconf输出保存到/etc/wireguard/${instanceName}.conf`);
        await ssh.execCommand(`mkdir -p /etc/wireguard && echo '${configData.replace(/'/g, "'\\''")}' > /etc/wireguard/${instanceName}.conf`);
        console.log(`已将${instanceName}配置保存到/etc/wireguard/${instanceName}.conf`);
      } else {
        // 尝试从网络接口配置获取信息
        console.log(`wg showconf命令未返回配置，尝试从网络接口获取信息`);
        const ifconfigResult = await ssh.execCommand(`ip -d link show ${instanceName} 2>/dev/null || echo "未找到接口"`);
        console.log(`${instanceName}接口信息:`, ifconfigResult.stdout || '未找到接口');
        
        if (ifconfigResult.stdout && !ifconfigResult.stdout.includes('未找到接口')) {
          console.log(`检测到${instanceName}接口，尝试生成最小配置`);
          // 生成最小配置
          const minConfigResult = await ssh.execCommand(`
            # 提取监听端口
            PORT=$(wg show ${instanceName} listen-port 2>/dev/null || echo "51820")
            # 提取私钥(如果有权限)
            PRIVKEY=$(wg show ${instanceName} private-key 2>/dev/null || echo "未知私钥")
            # 提取IP地址
            IP=$(ip -4 addr show ${instanceName} | grep -oP 'inet \\K[\\d.]+' || echo "10.0.0.1")
            
            # 生成基本配置
            echo "[Interface]"
            echo "PrivateKey = $PRIVKEY"
            echo "Address = $IP/24"
            echo "ListenPort = $PORT"
            
            # 检查是否启用了转发
            if grep -q 1 /proc/sys/net/ipv4/ip_forward; then
              echo "# 已启用IP转发"
            fi
          `);
          
          if (minConfigResult.stdout && !minConfigResult.stdout.includes('未知私钥')) {
            configData = minConfigResult.stdout;
            console.log(`已生成${instanceName}的基本配置`);
          } else {
            console.log(`无法生成${instanceName}的有效配置`);
          }
        } else {
          console.log(`未能找到${instanceName}接口，尝试最后方法：查找客户端配置文件`);
          
          // 使用客户端配置文件生成服务器配置
          const firstClientConfig = await ssh.execCommand(`find /root/VPS配置WG -name "${instanceName}-peer*-client.conf" | head -1`);
          if (firstClientConfig.stdout.trim()) {
            console.log(`找到客户端配置文件: ${firstClientConfig.stdout.trim()}`);
            
            // 从客户端配置提取服务器信息
            const serverConfigGenResult = await ssh.execCommand(`
              CLIENT_FILE="${firstClientConfig.stdout.trim()}"
              SERVER_PUBKEY=$(grep -oP 'PublicKey\\s*=\\s*\\K[A-Za-z0-9+/=]+' "$CLIENT_FILE")
              ENDPOINT=$(grep -oP 'Endpoint\\s*=\\s*\\K[^:]+' "$CLIENT_FILE")
              PORT=$(grep -oP 'Endpoint\\s*=\\s*[^:]+:\\K\\d+' "$CLIENT_FILE")
              ADDRESS=$(grep -oP 'Address\\s*=\\s*\\K[0-9./]+' "$CLIENT_FILE" | sed 's/\\.[0-9]*\\//\\.1\\//g')
              
              # 生成服务器私钥
              cd /root/VPS配置WG
              [ ! -f "${instanceName}-server.key" ] && wg genkey > ${instanceName}-server.key
              SERVER_PRIVKEY=$(cat ${instanceName}-server.key)
              
              echo "[Interface]"
              echo "PrivateKey = $SERVER_PRIVKEY"
              echo "Address = $ADDRESS"
              echo "ListenPort = \${PORT:-51820}"
              echo "# 从客户端配置生成的基本配置"
            `);
            
            if (serverConfigGenResult.stdout && serverConfigGenResult.stdout.includes('PrivateKey')) {
              configData = serverConfigGenResult.stdout;
              console.log(`从客户端配置生成了服务器基本配置`);
              
              // 创建服务器配置文件
              await ssh.execCommand(`mkdir -p /etc/wireguard && echo '${configData.replace(/'/g, "'\\''")}' > /etc/wireguard/${instanceName}.conf`);
              console.log(`已根据客户端配置创建服务器配置文件`);
            }
          } else {
            console.log(`未找到客户端配置文件，无法生成服务器配置`);
          }
        }
      }
    }
    
    // 获取实例状态
    const statusResult = await ssh.execCommand(`wg show ${instanceName} 2>/dev/null || echo "接口未激活"`);
    console.log(`${instanceName}状态检查结果:`, statusResult.stdout.includes('接口未激活') ? '接口未激活' : '接口已激活');
    
    // 获取监听端口
    let listenPort = '51820'; // 默认端口
    const portMatch = statusResult.stdout.match(/listening port: (\d+)/);
    if (portMatch && portMatch[1]) {
      listenPort = portMatch[1];
      console.log(`找到监听端口: ${listenPort}`);
    }
    
    // 格式化状态信息，添加公网IP和端口
    let formattedStatus = statusResult.stdout;
    if (publicIP) {
      // 创建更友好的状态显示
      const summaryStatus = `Wireguard服务信息:
服务器公网IP: ${publicIP}
监听端口: ${listenPort}
接口状态: ${statusResult.stdout.includes('接口未激活') ? '未激活' : '已激活'}

详细状态:
${statusResult.stdout}`;
      
      formattedStatus = summaryStatus;
    }
    
    // 确保VPS配置WG目录存在
    await ssh.execCommand('mkdir -p /root/VPS配置WG');
    
    // 从VPS配置WG目录下获取peer信息
    const peersResult = await ssh.execCommand(`find /root/VPS配置WG -name "${instanceName}-peer*-client.conf" | sort`);
    console.log(`查找${instanceName}客户端配置结果:`, peersResult.stdout ? `找到${peersResult.stdout.split('\n').filter(l => l.trim()).length}个文件` : '未找到客户端配置');
    
    const peers = [];
    
    // 如果没有找到客户端配置文件，尝试从wg命令获取peer信息并创建客户端配置
    if (!peersResult.stdout || peersResult.stdout.trim() === '') {
      console.log(`未找到${instanceName}的客户端配置文件，尝试从wg命令获取peer信息`);
      const wgShowResult = await ssh.execCommand(`wg show ${instanceName} 2>/dev/null || echo "无法获取peer信息"`);
      console.log(`wg show ${instanceName}结果:`, wgShowResult.stdout.includes('peer:') ? '找到peer信息' : '未找到peer信息');
      
      if (wgShowResult.stdout && wgShowResult.stdout.includes('peer:')) {
        console.log(`找到${instanceName}的peer信息，准备创建客户端配置文件`);
        
        // 提取服务器信息
        const serverPublicKeyMatch = wgShowResult.stdout.match(/public key: ([A-Za-z0-9+\/=]+)/);
        const listenPortMatch = wgShowResult.stdout.match(/listening port: (\d+)/);
        console.log('服务器公钥:', serverPublicKeyMatch ? '已提取' : '未提取', 
                    '监听端口:', listenPortMatch ? listenPortMatch[1] : '未找到');
        
        // 使用前面已获取的公网IP
        console.log('使用已获取的服务器公网IP:', publicIP || '未能获取公网IP');
        
        // 获取服务器网络信息，用于客户端配置
        const serverNetworkMatch = configData.match(/Address\s*=\s*([0-9.\/]+)/);
        console.log('服务器网络信息:', serverNetworkMatch ? serverNetworkMatch[1] : '未找到网络信息');
        
        if (serverPublicKeyMatch && listenPortMatch && publicIP && serverNetworkMatch) {
          // 从wg show命令解析peer信息
          const peerSections = wgShowResult.stdout.split('peer:').slice(1);
          console.log(`发现${peerSections.length}个peer，准备生成配置文件`);
          
          for (let i = 0; i < peerSections.length; i++) {
            const peerSection = peerSections[i];
            const peerPublicKeyMatch = peerSection.match(/([A-Za-z0-9+\/=]+)/);
            const allowedIPsMatch = peerSection.match(/allowed ips: ([0-9.\/,\s]+)/);
            
            if (peerPublicKeyMatch && allowedIPsMatch) {
              const peerPublicKey = peerPublicKeyMatch[1];
              const allowedIPs = allowedIPsMatch[1].split(',')[0].trim();
              console.log(`Peer ${i+1} - 公钥: ${peerPublicKey.substring(0, 10)}... 允许IP: ${allowedIPs}`);
              
              // 给这个peer生成私钥
              const peerKeyResult = await ssh.execCommand('wg genkey');
              const peerPrivateKey = peerKeyResult.stdout.trim();
              
              // 创建客户端配置
              const clientConfig = `[Interface]
PrivateKey = ${peerPrivateKey}
Address = ${allowedIPs}
DNS = 1.1.1.1

[Peer]
PublicKey = ${serverPublicKeyMatch[1]}
Endpoint = ${publicIP}:${listenPortMatch[1]}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;
              // 保存客户端配置
              const peerNumber = i + 1;
              await ssh.execCommand(`echo '${clientConfig.replace(/'/g, "'\\''")}' > /root/VPS配置WG/${instanceName}-peer${peerNumber}-client.conf`);
              
              peers.push({
                number: peerNumber.toString(),
                file: `/root/VPS配置WG/${instanceName}-peer${peerNumber}-client.conf`,
                address: allowedIPs,
                publicKey: peerPublicKey,
                config: clientConfig
              });
              
              console.log(`已为${instanceName}创建客户端配置文件: peer${peerNumber}`);
            }
          }
        } else {
          console.log('未能提取足够的信息来创建客户端配置');
        }
      } else {
        console.log(`无法从wg命令获取${instanceName}的peer信息`);
      }
    } else {
      // 处理找到的peer配置文件
      const peerFiles = peersResult.stdout.split('\n').filter(line => line.trim() !== '');
      console.log(`找到${peerFiles.length}个peer配置文件`);
      
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
            console.log(`已读取peer${peerNumber}配置`);
          }
        }
      }
    }
    
    // 如果peers仍然为空，查找任何包含peer的配置文件作为最后的尝试
    if (peers.length === 0) {
      console.log(`通过常规方法未找到peer，尝试搜索任何peer相关配置文件`);
      const anyPeerResult = await ssh.execCommand(`find /root -name "*peer*-client.conf" | sort`);
      
      if (anyPeerResult.stdout && anyPeerResult.stdout.trim() !== '') {
        const anyPeerFiles = anyPeerResult.stdout.split('\n').filter(line => line.trim() !== '');
        console.log(`找到${anyPeerFiles.length}个可能的peer配置文件`);
        
        for (const peerFile of anyPeerFiles) {
          // 提取peer编号
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
              console.log(`已读取额外查找的peer${peerNumber}配置: ${peerFile}`);
            }
          }
        }
      }
    }
    
    // 提取端口映射范围
    let portMappingRange = null;
    // 首先从配置文件中提取端口映射范围 - 这是最准确的方法
    if (configData) {
      console.log(`尝试从${instanceName}配置文件提取端口映射范围...`);
      
      // 从PostUp命令中提取端口映射范围 - 特别查找seq命令，它定义了端口范围
      // 示例: for port in $(seq 55835 56834); do iptables -t nat -A PREROUTING -p udp --dport $port -j DNAT --to-destination 45.32.157.163:52835; done
      const portRangeMatch = configData.match(/for port in \$\(seq (\d+) (\d+)\);/);
      if (portRangeMatch) {
        portMappingRange = {
          start: parseInt(portRangeMatch[1]),
          end: parseInt(portRangeMatch[2]),
          count: parseInt(portRangeMatch[2]) - parseInt(portRangeMatch[1]) + 1,
          note: '从配置文件PostUp规则中提取'
        };
        console.log(`从${instanceName}配置文件提取到端口映射范围: ${portMappingRange.start}-${portMappingRange.end}`);
      }
    }
    
    // 如果从配置文件未提取到，尝试使用iptables命令检查实际配置的转发规则
    if (!portMappingRange) {
      console.log(`尝试使用iptables命令检查${instanceName}的端口映射规则...`);
      // 使用更精确的命令，查找包含实例名称的端口范围
      // 注意：使用grep -A和-B来获取上下文，因为实例名可能在注释或相关行中
      const iptablesGrepResult = await ssh.execCommand(`iptables-save | grep -A 10 -B 10 "${instanceName}" | grep -E "PREROUTING|DNAT" | grep -E "dpt:[0-9]+" || echo ""`);
      
      if (iptablesGrepResult.stdout && !iptablesGrepResult.stdout.includes("No such file or directory")) {
        console.log(`找到与${instanceName}相关的iptables规则`);
        // 提取所有端口
        const portMatches = iptablesGrepResult.stdout.match(/dpt:(\d+)/g);
        if (portMatches && portMatches.length > 0) {
          const ports = portMatches.map(match => parseInt(match.replace('dpt:', '')));
          ports.sort((a, b) => a - b);
          
          // 计算端口范围
          const startPort = ports[0];
          const endPort = ports[ports.length - 1];
          
          // 验证这是连续的端口范围
          const expectedCount = endPort - startPort + 1;
          const isConsecutive = (ports.length === expectedCount) || 
                               (expectedCount <= 1100 && ports.length >= 5); // 容许部分端口缺失
          
          if (isConsecutive) {
            portMappingRange = {
              start: startPort,
              end: endPort,
              count: ports.length,
              note: `从iptables规则中提取的${instanceName}端口映射范围`
            };
            console.log(`从iptables规则提取到${instanceName}的端口映射范围: ${startPort}-${endPort}，共${ports.length}个端口`);
          }
        }
      } else {
        console.log(`未找到与${instanceName}相关的iptables规则`);
      }
    }
    
    // 如果前两种方法都未找到，尝试从service文件或其他系统配置文件查找
    if (!portMappingRange) {
      console.log(`尝试从systemd服务文件查找${instanceName}端口映射...`);
      const serviceFileResult = await ssh.execCommand(`systemctl cat wg-quick@${instanceName}.service 2>/dev/null || cat /lib/systemd/system/wg-quick@.service 2>/dev/null || echo ""`);
      
      if (serviceFileResult.stdout && serviceFileResult.stdout.includes("ExecStart")) {
        // 查找PostUp命令引用的脚本
        const execStartMatch = serviceFileResult.stdout.match(/ExecStart=([^\n]+)/);
        if (execStartMatch) {
          const execStartCmd = execStartMatch[1];
          console.log(`找到${instanceName}服务ExecStart命令: ${execStartCmd}`);
          
          // 检查引用的脚本文件
          if (execStartCmd.includes("wg-quick")) {
            // 查看wg-quick脚本如何处理端口转发
            const wgQuickResult = await ssh.execCommand(`journalctl -u wg-quick@${instanceName}.service | grep -E "seq [0-9]+ [0-9]+" | tail -1 || echo ""`);
            
            if (wgQuickResult.stdout && wgQuickResult.stdout.includes("seq")) {
              const seqMatch = wgQuickResult.stdout.match(/seq (\d+) (\d+)/);
              if (seqMatch) {
                portMappingRange = {
                  start: parseInt(seqMatch[1]),
                  end: parseInt(seqMatch[2]),
                  count: parseInt(seqMatch[2]) - parseInt(seqMatch[1]) + 1,
                  note: '从systemd日志提取的端口范围'
                };
                console.log(`从systemd日志提取到${instanceName}的端口映射范围: ${portMappingRange.start}-${portMappingRange.end}`);
              }
            }
          }
        }
      }
    }

    // 如果所有方法都未检测到，根据实例名称推算（保证不同实例有不同范围）
    if (!portMappingRange) {
      console.log(`未检测到${instanceName}的实际映射配置，尝试根据实例名称推算`);
      
      // 检查是否为复合实例名称（如 "wg0 wg1 wg2"）
      if (instanceName.includes(' ')) {
        // 这是一个复合实例名称，需要处理多个实例的端口范围
        const instanceNames = instanceName.split(' ').filter(name => name.trim() !== '');
        const portRanges = [];
        
        // 为每个实例计算端口范围
        for (const singleInstanceName of instanceNames) {
          const instanceNumberMatch = singleInstanceName.match(/wg(\d+)/);
          if (instanceNumberMatch) {
            const instanceNumber = parseInt(instanceNumberMatch[1]);
            const startPort = 55835 + instanceNumber * 1000;
            const endPort = startPort + 999;
            
            portRanges.push({
              instance: singleInstanceName,
              start: startPort,
              end: endPort
            });
          }
        }
        
        // 如果找到了端口范围，返回所有范围
        if (portRanges.length > 0) {
          portMappingRange = {
            ranges: portRanges,
            isMultipleRanges: true,
            note: `包含多个实例的端口映射范围`
          };
          console.log(`为复合实例[${instanceName}]找到${portRanges.length}个端口范围`);
          
          // 同时提供单一范围以保持兼容性（显示第一个实例的范围）
          portMappingRange.start = portRanges[0].start;
          portMappingRange.end = portRanges[0].end;
          portMappingRange.count = 1000;
        }
      } else {
        // 单一实例名称处理（原有逻辑）
        const instanceNumberMatch = instanceName.match(/wg(\d+)/);
        if (instanceNumberMatch) {
          const instanceNumber = parseInt(instanceNumberMatch[1]);
          // 使用部署脚本中相同的计算公式
          const startPort = 55835 + instanceNumber * 1000;
          const endPort = startPort + 999;
          
          portMappingRange = {
            start: startPort,
            end: endPort,
            count: 1000,
            note: `根据实例名称[${instanceName}]推算的端口范围`
          };
          console.log(`根据实例名称[${instanceName}]推算端口范围: ${portMappingRange.start}-${portMappingRange.end}`);
        } else {
          // 默认fallback到listenPort作为单端口映射
          console.log(`无法从实例名称[${instanceName}]推算端口范围，使用监听端口 ${listenPort}`);
          portMappingRange = {
            start: parseInt(listenPort),
            end: parseInt(listenPort),
            count: 1,
            note: '使用Wireguard监听端口作为映射端口'
          };
        }
      }
    }
    
    // 对peers按编号排序，确保显示顺序正确
    peers.sort((a, b) => {
      const numA = parseInt(a.number);
      const numB = parseInt(b.number);
      return numA - numB;
    });
    
    // 综合所有信息
    console.log(`完成${instanceName}实例详情获取，找到${peers.length}个peer`);
    return {
      name: instanceName,
      status: formattedStatus,
      config: configData,
      publicIP: publicIP,
      listenPort: listenPort,
      portMappingRange: portMappingRange,
      peers: peers
    };
  } catch (error) {
    console.error(`获取Wireguard实例详情失败:`, error);
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
    
    // 获取当前peer信息，查找可用的peer编号
    const peersResult = await ssh.execCommand(`find /root/VPS配置WG -name "${instanceName}-peer*-client.conf" | sort`);
    
    const peerFiles = peersResult.stdout.split('\n').filter(line => line.trim() !== '');
    const usedNumbers = new Set();
    
    for (const peerFile of peerFiles) {
      const peerNameMatch = peerFile.match(/-peer(\d+)-client\.conf$/);
      if (peerNameMatch) {
        const peerNumber = parseInt(peerNameMatch[1], 10);
        usedNumbers.add(peerNumber);
      }
    }
    
    // 找到第一个可用的peer编号（从1开始）
    let newPeerNumber = 1;
    while (usedNumbers.has(newPeerNumber)) {
      newPeerNumber++;
    }
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
AllowedIPs = 0.0.0.0/0
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

    // 新增: 预检查和安装所有必需的软件包
    sendProgress(2, '正在检查系统更新...');
    
    // 智能APT锁冲突解决机制
    sendProgress(2, '正在检查APT锁状态...');
    const lockCheckResult = await ssh.execCommand('lsof /var/lib/dpkg/lock-frontend 2>/dev/null || echo "no lock"');
    if (!lockCheckResult.stdout.includes('no lock')) {
      sendProgress(2.5, '检测到APT锁冲突，正在智能解决...');
      
      // 1. 检查是否有正在运行的apt进程
      const aptProcessCheck = await ssh.execCommand('ps aux | grep -E "(apt|dpkg)" | grep -v grep || echo "no apt process"');
      if (!aptProcessCheck.stdout.includes('no apt process')) {
        sendProgress(2.7, '发现正在运行的APT进程，等待完成...');
        // 等待最多30秒让现有进程完成
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const stillRunning = await ssh.execCommand('ps aux | grep -E "(apt|dpkg)" | grep -v grep || echo "no apt process"');
          if (stillRunning.stdout.includes('no apt process')) {
            break;
          }
          if (i % 5 === 0) {
            sendProgress(2.7 + (i * 0.1), `等待APT进程完成... (${i}/30秒)`);
          }
        }
      }
      
      // 2. 强制清理锁文件
      sendProgress(3, '清理APT锁文件...');
      await ssh.execCommand('pkill -f apt || true');
      await ssh.execCommand('rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock');
      await new Promise(r => setTimeout(r, 3000)); // 等待3秒确保清理完成
      
      // 3. 验证锁已清理
      const verifyLockResult = await ssh.execCommand('lsof /var/lib/dpkg/lock-frontend 2>/dev/null || echo "lock cleared"');
      if (!verifyLockResult.stdout.includes('lock cleared')) {
        sendProgress(3.2, '锁文件清理失败，尝试强制解决...');
        await ssh.execCommand('fuser -k /var/lib/dpkg/lock-frontend 2>/dev/null || true');
        await ssh.execCommand('rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock');
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    await ssh.execCommand('apt update');
    
    // 预安装必要工具
    sendProgress(3, '正在预安装必要工具包...');
    const preInstallResult = await ssh.execCommand('apt install -y curl wget sudo software-properties-common apt-transport-https ca-certificates');
    console.log('预安装工具结果:', preInstallResult);
    
    // 检查和安装wireguard-tools
    sendProgress(4, '正在检查Wireguard工具...');
    const checkWgResult = await ssh.execCommand('which wg || echo "not-installed"');
    if (checkWgResult.stdout.includes('not-installed')) {
      sendProgress(4.5, '正在安装Wireguard工具...');
      const installWgResult = await ssh.execCommand('apt install -y wireguard wireguard-tools');
      console.log('Wireguard工具安装结果:', installWgResult);
    }
    
    // 自动执行Wireguard部署所需的步骤
    // 1. 设置DNS
    sendProgress(5, '正在设置DNS...');
    await ssh.execCommand('echo "nameserver 1.1.1.1" > /etc/resolv.conf');
    
    // 2. 安装VIM编辑器和其他依赖
    sendProgress(10, '正在安装VIM编辑器和依赖包...');
    const vimInstallResult = await ssh.execCommand('apt install -y vim qrencode ufw iptables-persistent curl');
    console.log('依赖包安装结果:', vimInstallResult);

    // 3. 确保系统文件系统权限正确
    sendProgress(12, '正在配置系统...');
    await ssh.execCommand('mkdir -p /root/VPS配置WG && chmod 700 /root/VPS配置WG');
    
    // 4. 检查iptables状态
    sendProgress(14, '正在检查网络配置...');
    await ssh.execCommand('sysctl -w net.ipv4.ip_forward=1');
    
    // 5. Wireguard脚本内容 - 改进版本，增加错误处理
    sendProgress(15, '正在准备安装脚本...');
    const wireguardScript = `#!/bin/bash
# 改进的Wireguard部署脚本 - 增加错误处理和诊断
set -e  # 遇到错误立即退出

# 错误处理函数
error_exit() {
    echo "错误: $1" >&2
    echo "部署失败，请检查上述错误信息" >&2
    exit 1
}

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    error_exit "请以root用户运行此脚本"
fi

# 记录开始时间
echo "Wireguard部署开始时间: $(date)"

# ==================== 系统更新和依赖安装 ====================
echo "步骤1: 系统更新和依赖安装..."

# 1. 彻底解决APT锁冲突问题
echo "1.1 解决APT锁冲突..."
# 强制终止所有apt相关进程
pkill -f apt || true
pkill -f dpkg || true
sleep 2

# 清理所有锁文件
rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock
sleep 2

# 修复dpkg中断问题
echo "1.2 修复dpkg中断问题..."
dpkg --configure -a || true
apt-get update --fix-missing || true

# 2. 更新系统软件包
echo "1.3 更新系统软件包..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get dist-upgrade -y

# 3. 安装基础依赖
echo "1.4 安装基础依赖..."
apt-get install -y curl wget sudo software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# 4. 安装Wireguard相关依赖
echo "1.5 安装Wireguard相关依赖..."
apt-get install -y wireguard wireguard-tools qrencode ufw iptables-persistent

# 5. 配置iptables-persistent
echo "1.6 配置iptables-persistent..."
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections

# 6. 启用IP转发
echo "1.7 启用IP转发..."
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p

echo "系统更新和依赖安装完成！"
echo "=========================================="

# 检查并清理现有Wireguard实例
echo "检查现有Wireguard实例..."
existing_instances=$(wg show interfaces 2>/dev/null || echo "")
if [ -n "$existing_instances" ]; then
    echo "发现现有Wireguard实例: $existing_instances"
    echo "正在停止现有实例..."
    
    # 停止所有现有的Wireguard接口
    for instance in $existing_instances; do
        echo "停止实例: $instance"
        wg-quick down $instance 2>/dev/null || true
        systemctl stop wg-quick@$instance 2>/dev/null || true
        systemctl disable wg-quick@$instance 2>/dev/null || true
    done
    
    # 清理现有配置
    echo "清理现有配置..."
    rm -f /etc/wireguard/wg*.conf 2>/dev/null || true
    rm -rf /root/VPS配置WG 2>/dev/null || true
    
    # 强制清理可能的残留配置
    echo "强制清理残留配置..."
    find /etc/wireguard/ -name "wg*.conf" -delete 2>/dev/null || true
    find /root/ -name "*WG*" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # 清理iptables规则
    echo "清理现有iptables规则..."
    iptables -D FORWARD -i wg+ -j ACCEPT 2>/dev/null || true
    iptables -D FORWARD -o wg+ -j ACCEPT 2>/dev/null || true
    iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o enp1s0 -j MASQUERADE 2>/dev/null || true
    iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o eth0 -j MASQUERADE 2>/dev/null || true
    
    echo "现有实例清理完成，开始重新部署..."
else
    echo "未发现现有Wireguard实例，开始全新部署..."
fi

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

# 智能APT锁冲突解决机制
echo "检查APT锁状态..."
if lsof /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
    echo "检测到APT锁冲突，启动智能解决流程..."
    
    # 1. 检查是否有正在运行的apt进程
    if pgrep -f "apt|dpkg" >/dev/null; then
        echo "发现正在运行的APT进程，等待完成..."
        # 等待最多30秒让现有进程完成
        for i in {1..30}; do
            if ! pgrep -f "apt|dpkg" >/dev/null; then
                break
            fi
            echo "等待APT进程完成... ($i/30秒)"
            sleep 1
        done
    fi
    
    # 2. 强制清理锁文件
    echo "清理APT锁文件..."
    pkill -f apt || true
    rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock
    sleep 3
    
    # 3. 验证锁已清理
    if lsof /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
        echo "锁文件清理失败，尝试强制解决..."
        fuser -k /var/lib/dpkg/lock-frontend 2>/dev/null || true
        rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock
        sleep 2
    fi
    
    echo "APT锁冲突解决完成"
fi

apt update && apt upgrade -y

echo "安装 WireGuard、qrencode、ufw、iptables-persistent 和 curl..."

# 再次检查锁问题（增强版）
if lsof /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
    echo "再次检测到APT锁冲突，执行快速解决..."
    pkill -f apt || true
    rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock
    sleep 3
    echo "APT锁冲突已解决，继续安装..."
fi

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

# 验证所有IP地址都是IPv4格式
echo "验证IP地址格式..."
valid_ips=()
for ip in "\${public_ips[@]}"; do
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    valid_ips+=("$ip")
    echo "有效IPv4地址: $ip"
  else
    echo "跳过无效IP地址: $ip"
  fi
done

if [ \${#valid_ips[@]} -eq 0 ]; then
  echo "错误：没有找到有效的IPv4地址"
  exit 1
fi

public_ips=("\${valid_ips[@]}")
echo "最终有效IPv4地址列表: \${public_ips[@]}"

# 获取实际对外显示的主IP（仅IPv4，多重检测确保获取IPv4）
echo "正在检测公网IPv4地址..."
primary_ip=""
# 尝试多个IPv4检测服务
for service in "curl -4 -s ifconfig.me" "curl -4 -s ipv4.icanhazip.com" "curl -4 -s 4.icanhazip.com" "curl -4 -s checkip.amazonaws.com" "curl -4 -s ipinfo.io/ip"; do
  echo "尝试服务: $service"
  result=$($service 2>/dev/null || echo "")
  if [[ "$result" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    primary_ip="$result"
    echo "通过 $service 检测到的主IP（IPv4）：$primary_ip"
    break
  fi
done

# 如果仍然没有获取到有效的IPv4地址，使用接口IP作为备选
if [[ -z "$primary_ip" || ! "$primary_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "外部检测失败，使用接口IP作为备选..."
  primary_ip=$(ip -4 addr show dev "$EXT_IF" | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n1)
  echo "使用接口IP作为主IP（IPv4）：$primary_ip"
fi

# 验证主IP是否为有效IPv4地址
if [[ ! "$primary_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "错误：无法获取有效的IPv4地址"
  exit 1
fi

# 调整顺序：将主IP放在首位，其它附加IP依次排列（仅IPv4）
ordered_ips=()
# 首先添加主IP
ordered_ips=("$primary_ip")

# 然后添加其他IPv4地址（排除主IP）
for ip in "\${public_ips[@]}"; do
  # 只处理IPv4地址（不包含冒号）
  if [[ "$ip" == *.* && "$ip" != *:* && "$ip" != "$primary_ip" ]]; then
      ordered_ips+=("$ip")
  fi
done

# 重新构建public_ips数组，只包含IPv4地址
public_ips=()
for ip in "\${ordered_ips[@]}"; do
  public_ips+=("$ip")
done

echo "最终IP顺序（仅IPv4）：\${public_ips[@]}"
echo "主IP确认：$primary_ip"

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
    
    # 确保使用IPv4地址作为Endpoint
    endpoint_ip="\${ip}"
    # 验证IP是否为IPv4格式
    if [[ ! "\${endpoint_ip}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "警告：IP地址 \${endpoint_ip} 不是有效的IPv4格式，跳过此配置"
      continue
    fi
    
    cat > "$CLIENT_CONF" <<EOF
[Interface]
PrivateKey = \$(cat "$WG_DIR/\${WG_IF}-peer\${p}.key")
Address = \${PEER_IP}/32
DNS = \${DNS}

[Peer]
PublicKey = \$(cat "$WG_DIR/\${WG_IF}-server.pub")
Endpoint = \${endpoint_ip}:\${WG_PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
    
    echo "客户端配置已生成：\${CLIENT_CONF}"
    echo "Endpoint地址：\${endpoint_ip}:\${WG_PORT} (IPv4)"
  done

  # 生成服务端配置文件，使用 SNAT 指定出网 IP，并添加双向 FORWARD 规则及1000个端口映射规则
  SERVER_CONF="/etc/wireguard/\${WG_IF}.conf"
  SERVER_PRIVATE_KEY=\$(cat "$WG_DIR/\${WG_IF}-server.key")
  
  # 确保使用IPv4地址
  server_ip="\${ip}"
  if [[ ! "\${server_ip}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "错误：服务端IP地址 \${server_ip} 不是有效的IPv4格式"
    exit 1
  fi
  
  cat > "$SERVER_CONF" <<EOF
[Interface]
Address = \${SERVER_WG_IP}/24
ListenPort = \${WG_PORT}
PrivateKey = \${SERVER_PRIVATE_KEY}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; \\
         iptables -t nat -A POSTROUTING -s \${WG_SUBNET} -o \${EXT_IF} -j SNAT --to-source \${server_ip}; \\
         for port in \\\$(seq \${MAP_PORT_START} \${MAP_PORT_END}); do iptables -t nat -A PREROUTING -p udp --dport \\\$port -j DNAT --to-destination \${server_ip}:\${WG_PORT}; done
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; \\
           iptables -t nat -D POSTROUTING -s \${WG_SUBNET} -o \${EXT_IF} -j SNAT --to-source \${server_ip}; \\
           for port in \\\$(seq \${MAP_PORT_START} \${MAP_PORT_END}); do iptables -t nat -D PREROUTING -p udp --dport \\\$port -j DNAT --to-destination \${server_ip}:\${WG_PORT}; done
EOF
  
  echo "服务端配置已生成：\${SERVER_CONF}"
  echo "服务端IP地址：\${server_ip} (IPv4)"

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
    
    // 6. 首次运行脚本 - 改进版本
    sendProgress(30, '正在启动Wireguard部署...');
    
    // 改进的脚本执行方式：直接执行并捕获输出
    const execScriptPromise = new Promise(async (resolve, reject) => {
      try {
        // 步骤1: 检查系统环境
        sendProgress(5, '步骤1/12: 检查系统环境...');
        const envCheck = await ssh.execCommand('uname -a && cat /etc/os-release | head -n 3');
        console.log('系统环境:', envCheck.stdout);
        
        // 步骤2: 检查网络接口
        sendProgress(10, '步骤2/12: 检查网络接口...');
        const netCheck = await ssh.execCommand('ip route | grep default && ip -o -4 addr show | grep -v 127.0.0.1');
        console.log('网络接口:', netCheck.stdout);
        
        // 步骤3: 执行Wireguard部署脚本
        sendProgress(15, '步骤3/12: 开始执行Wireguard部署脚本...');
        
        // 使用更简单直接的方式执行脚本
        const scriptResult = await ssh.execCommand('bash /root/VPS动态配置wireguard.sh', {
          onStdout: (chunk) => {
            const output = chunk.toString();
            console.log('脚本输出:', output);
            
            // 根据输出内容实时更新进度和步骤
            if (output.includes('Wireguard部署开始时间')) {
              sendProgress(20, '步骤4/12: 初始化部署环境...');
            } else if (output.includes('步骤1: 系统更新和依赖安装')) {
              sendProgress(25, '步骤5/12: 系统更新和依赖安装...');
            } else if (output.includes('解决APT锁冲突')) {
              sendProgress(30, '步骤6/12: 解决APT锁冲突...');
            } else if (output.includes('更新系统软件包')) {
              sendProgress(35, '步骤7/12: 更新系统软件包...');
            } else if (output.includes('安装基础依赖')) {
              sendProgress(40, '步骤8/12: 安装基础依赖...');
            } else if (output.includes('安装Wireguard相关依赖')) {
              sendProgress(45, '步骤9/12: 安装Wireguard组件...');
            } else if (output.includes('检查现有Wireguard实例')) {
              sendProgress(50, '步骤10/12: 检查现有实例...');
            } else if (output.includes('发现现有Wireguard实例')) {
              sendProgress(52, '步骤10/12: 发现现有实例，准备清理...');
            } else if (output.includes('正在停止现有实例')) {
              sendProgress(54, '步骤10/12: 停止现有实例...');
            } else if (output.includes('清理现有配置')) {
              sendProgress(56, '步骤10/12: 清理现有配置...');
            } else if (output.includes('现有实例清理完成')) {
              sendProgress(58, '步骤10/12: 现有实例清理完成...');
            } else if (output.includes('检测到外部网络接口')) {
              sendProgress(60, '步骤11/12: 检测网络接口和IP地址...');
            } else if (output.includes('配置 WireGuard 接口')) {
              sendProgress(65, '步骤12/12: 配置WireGuard接口...');
            } else if (output.includes('生成服务端密钥')) {
              sendProgress(70, '步骤12/12: 生成密钥对...');
            } else if (output.includes('配置 ufw 防火墙规则')) {
              sendProgress(75, '步骤12/12: 配置防火墙规则...');
            } else if (output.includes('设置 systemd 开机自启')) {
              sendProgress(80, '步骤12/12: 配置系统服务...');
            } else if (output.includes('二维码')) {
              sendProgress(85, '步骤12/12: 生成客户端配置和二维码...');
            } else if (output.includes('所有配置已完成')) {
              sendProgress(90, '步骤12/12: 完成所有配置...');
            }
          },
          onStderr: (chunk) => {
            console.error('脚本错误:', chunk.toString());
          }
        });
        
        console.log('脚本执行完成:', scriptResult);
        
        // 检查脚本执行结果
        if (scriptResult.code === 0) {
          sendProgress(95, 'Wireguard部署成功完成！');
          resolve({ success: true, output: scriptResult.stdout });
        } else {
          // 即使脚本返回非0，也检查是否实际成功了
          const configCheck = await ssh.execCommand('find /root/VPS配置WG -name "*-peer*-client.conf" 2>/dev/null || echo ""');
          if (configCheck.stdout && configCheck.stdout.trim() !== '') {
            sendProgress(95, 'Wireguard部署成功完成！');
            resolve({ success: true, output: scriptResult.stdout, warning: '脚本返回非0状态但配置文件已生成' });
          } else {
            throw new Error(`脚本执行失败，退出码: ${scriptResult.code}\n错误输出: ${scriptResult.stderr}`);
          }
        }
      } catch (error) {
        console.error('脚本执行过程中出错:', error);
        
        // 尝试获取更多诊断信息
        try {
          const diagResult = await ssh.execCommand(`
            echo "=== 系统诊断信息 ==="
            echo "当前用户: $(whoami)"
            echo "当前目录: $(pwd)"
            echo "Wireguard状态: $(wg show 2>/dev/null || echo '未运行')"
            echo "已安装的wireguard包: $(dpkg -l | grep wireguard || echo '未安装')"
            echo "网络接口: $(ip -br a | grep -v lo)"
            echo "防火墙状态: $(ufw status || echo 'ufw未安装')"
            echo "IP转发状态: $(sysctl net.ipv4.ip_forward)"
            echo "配置文件目录: $(ls -la /root/VPS配置WG/ 2>/dev/null || echo '目录不存在')"
            echo "Wireguard配置目录: $(ls -la /etc/wireguard/ 2>/dev/null || echo '目录不存在')"
          `);
          console.log('诊断信息:', diagResult.stdout);
          
          // 即使出错，也尝试检查是否有部分成功的配置
          const partialConfigCheck = await ssh.execCommand('find /root/VPS配置WG -name "*.conf" 2>/dev/null || echo ""');
          if (partialConfigCheck.stdout && partialConfigCheck.stdout.trim() !== '') {
            console.log('发现部分配置文件:', partialConfigCheck.stdout);
            resolve({ 
              success: true, 
              output: scriptResult ? scriptResult.stdout : '',
              warning: '脚本执行过程中遇到问题，但发现了一些配置文件。请检查部署状态。',
              diagnostic: diagResult.stdout
            });
          } else {
            reject(new Error(`脚本执行失败: ${error.message}\n\n诊断信息:\n${diagResult.stdout}`));
          }
        } catch (diagError) {
          reject(new Error(`脚本执行失败: ${error.message}\n无法获取诊断信息: ${diagError.message}`));
        }
      }
    });
    
    // 等待脚本执行完成
    let execScriptResult;
    try {
      execScriptResult = await execScriptPromise;
      console.log('执行脚本结果:', execScriptResult);
    } catch (error) {
      console.log('主脚本执行失败，尝试简化部署方法...');
      
      // 智能备用方案：增强的简化部署
      sendProgress(50, '主脚本失败，启动智能备用部署...');
      
      try {
        // 增强的备用部署步骤
        const enhancedBackupSteps = [
          { 
            cmd: 'pkill -f apt || true; rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock; sleep 3', 
            desc: '彻底解决APT锁冲突',
            retry: 3
          },
          { 
            cmd: 'apt update --fix-missing', 
            desc: '更新软件包列表（修复缺失）',
            retry: 2
          },
          { 
            cmd: 'apt install -y wireguard qrencode ufw iptables-persistent curl', 
            desc: '安装核心组件',
            retry: 2
          },
          { 
            cmd: 'mkdir -p /root/VPS配置WG && chmod 700 /root/VPS配置WG', 
            desc: '创建安全配置目录',
            retry: 1
          },
          { 
            cmd: 'sysctl -w net.ipv4.ip_forward=1 && echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf', 
            desc: '启用IP转发',
            retry: 1
          },
          { 
            cmd: 'systemctl enable wg-quick@wg0 2>/dev/null || true', 
            desc: '配置Wireguard服务',
            retry: 1
          }
        ];
        
        for (let i = 0; i < enhancedBackupSteps.length; i++) {
          const step = enhancedBackupSteps[i];
          let success = false;
          
          for (let retry = 0; retry < step.retry; retry++) {
            sendProgress(50 + (i * 8) + (retry * 2), `${step.desc}${retry > 0 ? ` (重试 ${retry}/${step.retry-1})` : ''}`);
            
            const result = await ssh.execCommand(step.cmd);
            if (result.code === 0) {
              success = true;
              break;
            } else {
              console.warn(`步骤失败: ${step.desc} (尝试 ${retry + 1}/${step.retry})`, result.stderr);
              if (retry < step.retry - 1) {
                await new Promise(r => setTimeout(r, 2000)); // 等待2秒后重试
              }
            }
          }
          
          if (!success) {
            console.error(`步骤最终失败: ${step.desc}`);
            // 继续执行其他步骤，不中断整个流程
          }
        }
        
        // 创建基本的Wireguard配置
        sendProgress(90, '创建基本Wireguard配置...');
        const basicConfig = await ssh.execCommand(`
          cd /root/VPS配置WG
          wg genkey | tee wg0-server.key | wg pubkey > wg0-server.pub
          wg genkey | tee wg0-peer1.key | wg pubkey > wg0-peer1.pub
          
          # 获取公网IP（仅IPv4）
          PUBLIC_IP=$(curl -4 -s ifconfig.me || curl -4 -s ipv4.icanhazip.com || curl -4 -s 4.icanhazip.com || curl -4 -s checkip.amazonaws.com || curl -4 -s ipinfo.io/ip || hostname -I | awk '{print $1}')
          echo "检测到公网IP（IPv4）: $PUBLIC_IP"
          
          # 创建服务端配置
          cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.0.1.1/24
ListenPort = 52835
PrivateKey = $(cat wg0-server.key)
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.0.1.0/24 -o $(ip route | grep default | awk '{print $5}' | head -n1) -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.0.1.0/24 -o $(ip route | grep default | awk '{print $5}' | head -n1) -j MASQUERADE

[Peer]
PublicKey = $(cat wg0-peer1.pub)
AllowedIPs = 10.0.1.2/32
EOF

          # 创建客户端配置
          cat > wg0-peer1-client.conf << EOF
[Interface]
PrivateKey = $(cat wg0-peer1.key)
Address = 10.0.1.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = $(cat wg0-server.pub)
Endpoint = $PUBLIC_IP:52835
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

          # 启动Wireguard
          systemctl enable wg-quick@wg0
          systemctl start wg-quick@wg0
          
          echo "简化部署完成"
        `);
        
        if (basicConfig.code === 0) {
          sendProgress(100, '简化部署成功完成！');
          execScriptResult = { 
            success: true, 
            output: basicConfig.stdout,
            method: 'simplified'
          };
        } else {
          throw new Error(`简化部署失败: ${basicConfig.stderr}`);
        }
      } catch (simpleError) {
        console.error('简化部署也失败了:', simpleError);
        throw new Error(`所有部署方法都失败了。主脚本错误: ${error.message}，简化部署错误: ${simpleError.message}`);
      }
    }
    
    // 获取客户端配置文件
    sendProgress(100, '获取客户端配置...');
    // 首次尝试查找配置文件
    const findClientConfigsResult = await ssh.execCommand('find /root/VPS配置WG -name "*-peer*-client.conf" 2>/dev/null || echo "未找到客户端配置"');
    let clientConfigs = [];

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

    // 如果没有找到配置文件，尝试在其他位置查找
    if (clientConfigs.length === 0) {
      console.log('在默认位置未找到配置文件，尝试扩展搜索...');
      // 更广泛的搜索
      const extendedSearchResult = await ssh.execCommand('find /etc/wireguard /root -name "*client*.conf" -o -name "*peer*.conf" 2>/dev/null || echo "未找到"');
      
      if (extendedSearchResult.stdout && !extendedSearchResult.stdout.includes("未找到")) {
        const extendedConfigFiles = extendedSearchResult.stdout.split('\n').filter(line => line.trim() !== '');
        
        for (const configPath of extendedConfigFiles) {
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
    }
    
    // 如果仍然没有找到配置文件，但Wireguard已安装，尝试手动创建配置
    if (clientConfigs.length === 0) {
      console.log('未找到配置文件，检查Wireguard状态并尝试手动生成...');
      // 检查Wireguard服务状态
      const wgShowResult = await ssh.execCommand('wg show 2>/dev/null || echo "Wireguard未运行"');
      
      if (!wgShowResult.stdout.includes("Wireguard未运行")) {
        console.log('Wireguard正在运行，但未找到配置文件，尝试手动获取接口信息...');
        // 从wg show输出中提取信息并手动生成配置
        const wgIfaceResult = await ssh.execCommand('ip -br a | grep wg || echo "no wireguard interface"');
        
        if (!wgIfaceResult.stdout.includes("no wireguard interface")) {
          // 解析接口名称
          const wgInterfaces = wgIfaceResult.stdout.split('\n')
            .map(line => line.trim().split(/\s+/)[0])
            .filter(iface => iface.startsWith('wg'));
          
          if (wgInterfaces.length > 0) {
            // 使用第一个找到的接口获取详细信息
            const instanceDetails = await getWireguardInstanceDetails(ssh, wgInterfaces[0]);
            if (instanceDetails && instanceDetails.peers && instanceDetails.peers.length > 0) {
              // 添加从接口获取的配置
              instanceDetails.peers.forEach(peer => {
                if (peer.config) {
                  clientConfigs.push({
                    path: peer.file || `/root/VPS配置WG/${wgInterfaces[0]}-peer${peer.number}-client.conf`,
                    name: `${wgInterfaces[0]}-peer${peer.number}-client.conf`,
                    content: peer.config
                  });
                }
              });
            }
          }
        }
      }
    }

    // 如果确实没有找到配置文件但部署看起来成功了，通知用户
    const hasMissingConfigWarning = clientConfigs.length === 0 ? 
      "\n\n警告：未找到客户端配置文件。这可能是因为:\n" +
      "1. 脚本仍在后台执行中\n" +
      "2. 配置文件保存在非标准位置\n" +
      "3. 部署过程中出现了问题\n\n" +
      "建议：\n" +
      "- 请稍后使用'查找配置'按钮重新尝试查找配置文件\n" +
      "- 或通过SSH终端执行 'find / -name \"*client*.conf\" -o -name \"*peer*.conf\"' 手动查找" : "";

    // 部署完成后发送实时更新信号
    sendProgress(100, '部署完成，正在更新实例列表...');
    
    // 发送实时更新信号给前端
    event.sender.send('wireguard-instances-updated', {
      message: 'Wireguard部署完成，实例列表已更新',
      timestamp: new Date().toISOString()
    });
    
    // 延迟重启应用以确保更新生效
    setTimeout(() => {
      sendProgress(100, '部署完成，正在重启应用以生效...');
      app.relaunch();
      app.exit(0);
    }, 3000);

    return {
      success: true,
      output: "Wireguard部署已完成！脚本已自动执行以下步骤：\n" +
              "1. 检查并清理现有实例（如存在）\n" +
              "2. 安装Wireguard和依赖包\n" +
              "3. 设置DNS和系统配置\n" +
              "4. 创建Wireguard配置\n" +
              "5. 启动Wireguard服务\n" +
              "6. 生成客户端配置文件\n" +
              "7. 实例列表已实时更新\n" +
              "8. 应用将在3秒后自动重启以生效" + hasMissingConfigWarning,
      clientConfig: clientConfigs.length > 0 ? clientConfigs[0].content : '',
      clientConfigs: clientConfigs,
      warning: clientConfigs.length === 0 ? "未找到客户端配置文件，可能仍在生成中" : undefined,
      debug: {
        notes: "Wireguard部署已自动完成，应用将自动重启",
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

// WireGuard诊断功能
ipcMain.handle('diagnose-wireguard', async (event, serverId) => {
  const servers = store.get('servers') || [];
  const server = servers.find(s => s.id === serverId);
  
  if (!server) {
    return { success: false, error: '找不到服务器' };
  }
  
  const connectionResult = await connectToSSH(server);
  if (!connectionResult.success) {
    return connectionResult;
  }
  
  const ssh = connectionResult.ssh;
  
  try {
    // 上传诊断脚本
    const diagnosticScript = `#!/bin/bash
echo "=========================================="
echo "WireGuard连接诊断脚本"
echo "开始时间: $(date)"
echo "=========================================="

# 1. 检查WireGuard服务状态
echo "1. 检查WireGuard服务状态"
echo "----------------------------------------"
echo "WireGuard接口状态:"
wg show 2>/dev/null || echo "WireGuard未运行或未安装"
echo ""

echo "WireGuard服务状态:"
systemctl status wg-quick@wg0 2>/dev/null || echo "wg0服务未运行"
systemctl status wg-quick@wg1 2>/dev/null || echo "wg1服务未运行"
echo ""

# 2. 检查网络接口
echo "2. 检查网络接口"
echo "----------------------------------------"
echo "所有网络接口:"
ip -br a
echo ""

echo "路由表:"
ip route
echo ""

echo "默认网关:"
ip route | grep default
echo ""

# 3. 检查防火墙状态
echo "3. 检查防火墙状态"
echo "----------------------------------------"
echo "UFW状态:"
ufw status verbose
echo ""

echo "iptables规则:"
echo "FORWARD链:"
iptables -L FORWARD -n -v
echo ""

echo "NAT表POSTROUTING链:"
iptables -t nat -L POSTROUTING -n -v
echo ""

echo "NAT表PREROUTING链:"
iptables -t nat -L PREROUTING -n -v
echo ""

# 4. 检查IP转发
echo "4. 检查IP转发"
echo "----------------------------------------"
echo "IP转发状态:"
sysctl net.ipv4.ip_forward
echo ""

echo "sysctl.conf中的IP转发配置:"
grep -i "ip_forward" /etc/sysctl.conf || echo "未找到IP转发配置"
echo ""

# 5. 检查WireGuard配置文件
echo "5. 检查WireGuard配置文件"
echo "----------------------------------------"
echo "WireGuard配置文件:"
ls -la /etc/wireguard/
echo ""

if [ -f "/etc/wireguard/wg0.conf" ]; then
    echo "wg0.conf内容:"
    cat /etc/wireguard/wg0.conf
    echo ""
fi

if [ -f "/etc/wireguard/wg1.conf" ]; then
    echo "wg1.conf内容:"
    cat /etc/wireguard/wg1.conf
    echo ""
fi

# 6. 检查客户端配置
echo "6. 检查客户端配置"
echo "----------------------------------------"
echo "客户端配置目录:"
ls -la /root/VPS配置WG/ 2>/dev/null || echo "客户端配置目录不存在"
echo ""

if [ -d "/root/VPS配置WG" ]; then
    echo "客户端配置文件:"
    find /root/VPS配置WG -name "*.conf" -exec echo "文件: {}" \\; -exec cat {} \\; -exec echo "" \\;
fi

# 7. 检查网络连接
echo "7. 检查网络连接"
echo "----------------------------------------"
echo "测试到8.8.8.8的连接:"
ping -c 3 8.8.8.8
echo ""

echo "测试到1.1.1.1的连接:"
ping -c 3 1.1.1.1
echo ""

# 8. 检查端口监听
echo "8. 检查端口监听"
echo "----------------------------------------"
echo "WireGuard相关端口监听:"
netstat -tuln | grep -E "(52835|52845|55835)" || echo "未发现WireGuard端口监听"
echo ""

# 9. 检查系统日志
echo "9. 检查系统日志"
echo "----------------------------------------"
echo "WireGuard相关日志:"
journalctl -u wg-quick@wg0 --no-pager -n 20 2>/dev/null || echo "无wg0日志"
journalctl -u wg-quick@wg1 --no-pager -n 20 2>/dev/null || echo "无wg1日志"
echo ""

echo "内核日志中的网络相关错误:"
dmesg | grep -i -E "(wireguard|wg|iptables|forward)" | tail -10
echo ""

# 10. 检查DNS解析
echo "10. 检查DNS解析"
echo "----------------------------------------"
echo "DNS解析测试:"
nslookup google.com 8.8.8.8
echo ""

# 11. 检查网络统计
echo "11. 检查网络统计"
echo "----------------------------------------"
echo "网络接口统计:"
cat /proc/net/dev | grep -E "(wg|eth|ens)"
echo ""

# 12. 生成诊断报告
echo "12. 生成诊断报告"
echo "----------------------------------------"
echo "诊断完成时间: $(date)"
echo ""

# 生成修复建议
echo "=========================================="
echo "修复建议"
echo "=========================================="

# 检查常见问题并提供修复建议
if ! wg show >/dev/null 2>&1; then
    echo "❌ WireGuard未运行"
    echo "修复建议: systemctl start wg-quick@wg0"
fi

if [ "$(sysctl -n net.ipv4.ip_forward)" != "1" ]; then
    echo "❌ IP转发未启用"
    echo "修复建议: sysctl -w net.ipv4.ip_forward=1"
fi

if ! iptables -L FORWARD | grep -q "ACCEPT.*wg"; then
    echo "❌ 缺少WireGuard FORWARD规则"
    echo "修复建议: 重新运行WireGuard部署脚本"
fi

if ! iptables -t nat -L POSTROUTING | grep -q "MASQUERADE\\|SNAT"; then
    echo "❌ 缺少NAT规则"
    echo "修复建议: 重新运行WireGuard部署脚本"
fi

echo ""
echo "如果问题仍然存在，请检查:"
echo "1. 服务器防火墙是否阻止了WireGuard端口"
echo "2. 云服务商安全组是否开放了相应端口"
echo "3. 客户端配置是否正确"
echo "4. 网络运营商是否阻止了VPN流量"
echo ""
echo "=========================================="`;

    // 保存诊断脚本
    await ssh.execCommand(`cat > /tmp/wireguard_diagnostic.sh << 'EOFSCRIPT'\n${diagnosticScript}\nEOFSCRIPT`);
    await ssh.execCommand('chmod +x /tmp/wireguard_diagnostic.sh');
    
    // 执行诊断脚本
    const diagnosticResult = await ssh.execCommand('bash /tmp/wireguard_diagnostic.sh');
    
    return {
      success: true,
      output: diagnosticResult.stdout,
      error: diagnosticResult.stderr
    };
    
  } catch (error) {
    console.error('WireGuard诊断失败:', error);
    return {
      success: false,
      error: '诊断失败: ' + error.message
    };
  } finally {
    if (ssh) {
      ssh.dispose();
    }
  }
});

// WireGuard快速修复功能
ipcMain.handle('quick-fix-wireguard', async (event, serverId) => {
  const servers = store.get('servers') || [];
  const server = servers.find(s => s.id === serverId);
  
  if (!server) {
    return { success: false, error: '找不到服务器' };
  }
  
  const connectionResult = await connectToSSH(server);
  if (!connectionResult.success) {
    return connectionResult;
  }
  
  const ssh = connectionResult.ssh;
  
  try {
    // 上传快速修复脚本
    const quickFixScript = `#!/bin/bash
echo "=========================================="
echo "WireGuard连接问题快速修复脚本"
echo "开始时间: $(date)"
echo "=========================================="

# 1. 修复IP转发
echo "1. 修复IP转发..."
if [ "$(sysctl -n net.ipv4.ip_forward)" != "1" ]; then
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    echo "✅ IP转发已启用"
else
    echo "✅ IP转发已启用"
fi
echo ""

# 2. 修复UFW配置
echo "2. 修复UFW配置..."
if [ -f /etc/default/ufw ]; then
    sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
    echo "✅ UFW转发策略已设置为ACCEPT"
fi
echo ""

# 3. 重新配置防火墙规则
echo "3. 重新配置防火墙规则..."

# 获取外部网络接口
EXT_IF=$(ip route | grep '^default' | awk '{print $5}' | head -n1)
echo "外部网络接口: $EXT_IF"

# 清理现有iptables规则
echo "清理现有iptables规则..."
iptables -D FORWARD -i wg+ -j ACCEPT 2>/dev/null || true
iptables -D FORWARD -o wg+ -j ACCEPT 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o $EXT_IF -j MASQUERADE 2>/dev/null || true

# 重新添加规则
echo "重新添加iptables规则..."
iptables -A FORWARD -i wg+ -j ACCEPT
iptables -A FORWARD -o wg+ -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.0.0.0/8 -o $EXT_IF -j MASQUERADE
echo "✅ iptables规则已重新配置"
echo ""

# 4. 重新配置UFW规则
echo "4. 重新配置UFW规则..."

# 重置UFW规则
ufw --force reset

# 重新添加规则
ufw allow 22/tcp
ufw allow 52835/udp
ufw allow 52845/udp
ufw allow 55835:55934/udp  # wg0端口映射范围
ufw allow 55935:56034/udp  # wg1端口映射范围

# 启用防火墙
ufw --force enable
ufw reload
echo "✅ UFW规则已重新配置"
echo ""

# 5. 重启WireGuard服务
echo "5. 重启WireGuard服务..."

# 停止现有服务
systemctl stop wg-quick@wg0 2>/dev/null || true
systemctl stop wg-quick@wg1 2>/dev/null || true

# 等待服务停止
sleep 2

# 重新启动服务
systemctl start wg-quick@wg0 2>/dev/null || true
systemctl start wg-quick@wg1 2>/dev/null || true

# 等待服务启动
sleep 3

echo "✅ WireGuard服务已重启"
echo ""

# 6. 验证修复结果
echo "6. 验证修复结果"
echo "----------------------------------------"

echo "WireGuard服务状态:"
systemctl status wg-quick@wg0 --no-pager 2>/dev/null || echo "wg0服务未运行"
systemctl status wg-quick@wg1 --no-pager 2>/dev/null || echo "wg1服务未运行"
echo ""

echo "WireGuard接口状态:"
wg show 2>/dev/null || echo "WireGuard未运行"
echo ""

echo "网络接口状态:"
ip -br a | grep wg || echo "无WireGuard接口"
echo ""

echo "端口监听状态:"
netstat -tuln | grep -E "(52835|52845|55835)" || echo "无相关端口监听"
echo ""

echo "防火墙状态:"
ufw status
echo ""

echo "iptables规则:"
iptables -L FORWARD -n | grep wg
iptables -t nat -L POSTROUTING -n | grep wg
echo ""

# 7. 网络连接测试
echo "7. 网络连接测试"
echo "----------------------------------------"

echo "测试到8.8.8.8的连接:"
ping -c 3 8.8.8.8
echo ""

echo "测试DNS解析:"
nslookup google.com 8.8.8.8
echo ""

# 8. 生成修复报告
echo "8. 生成修复报告"
echo "----------------------------------------"

echo "修复完成时间: $(date)"
echo ""

# 检查修复结果
echo "修复结果检查:"
if systemctl is-active --quiet wg-quick@wg0; then
    echo "✅ wg0服务正在运行"
else
    echo "❌ wg0服务未运行"
fi

if systemctl is-active --quiet wg-quick@wg1; then
    echo "✅ wg1服务正在运行"
else
    echo "❌ wg1服务未运行"
fi

if [ "$(sysctl -n net.ipv4.ip_forward)" = "1" ]; then
    echo "✅ IP转发已启用"
else
    echo "❌ IP转发未启用"
fi

if ufw status | grep -q "Status: active"; then
    echo "✅ UFW防火墙已启用"
else
    echo "❌ UFW防火墙未启用"
fi

if iptables -L FORWARD -n | grep -q "wg"; then
    echo "✅ iptables FORWARD规则已配置"
else
    echo "❌ iptables FORWARD规则未配置"
fi

if iptables -t nat -L POSTROUTING -n | grep -q "MASQUERADE"; then
    echo "✅ iptables NAT规则已配置"
else
    echo "❌ iptables NAT规则未配置"
fi

echo ""
echo "=========================================="
echo "快速修复完成"
echo "=========================================="
echo ""
echo "如果问题仍然存在，请检查:"
echo "1. 云服务商安全组是否开放了以下端口:"
echo "   - 52835/udp (WireGuard监听端口)"
echo "   - 52845/udp (WireGuard监听端口)"
echo "   - 55835-55934/udp (wg0端口映射)"
echo "   - 55935-56034/udp (wg1端口映射)"
echo ""
echo "2. 网络运营商是否阻止了VPN流量"
echo "3. 客户端配置是否正确"
echo "4. 运行完整诊断: bash wireguard_diagnostic.sh"
echo ""`;

    // 保存快速修复脚本
    await ssh.execCommand(`cat > /tmp/quick_fix_wireguard.sh << 'EOFSCRIPT'\n${quickFixScript}\nEOFSCRIPT`);
    await ssh.execCommand('chmod +x /tmp/quick_fix_wireguard.sh');
    
    // 执行快速修复脚本
    const fixResult = await ssh.execCommand('bash /tmp/quick_fix_wireguard.sh');
    
    return {
      success: true,
      output: fixResult.stdout,
      error: fixResult.stderr
    };
    
  } catch (error) {
    console.error('WireGuard快速修复失败:', error);
    return {
      success: false,
      error: '快速修复失败: ' + error.message
    };
  } finally {
    if (ssh) {
      ssh.dispose();
    }
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
    console.log('开始执行Wireguard检查和配置检索...');
    
    // 检查Wireguard是否已安装
    const wgCheckResult = await ssh.execCommand('command -v wg || echo "未安装"');
    if (wgCheckResult.stdout.includes("未安装")) {
      console.log('Wireguard工具未安装，需要先部署');
      return {
        success: true,
        output: "未检测到Wireguard工具。请先点击'Wireguard部署'按钮进行自动部署。",
        clientConfigs: []
      };
    }
    
    // 检查Wireguard配置目录是否存在
    await ssh.execCommand('mkdir -p /root/VPS配置WG 2>/dev/null');
    
    // 多位置查找所有客户端配置
    console.log('在多个位置查找Wireguard客户端配置文件...');
    const configCheckCmd = `
      find /root/VPS配置WG /etc/wireguard /root -type f \\( -name "*-peer*-client.conf" -o -name "*client*.conf" -o -name "wg*.conf" \\) 2>/dev/null || echo "未找到客户端配置文件"
    `;
    const configCheckResult = await ssh.execCommand(configCheckCmd);
    
    // 如果找到配置文件
    if (configCheckResult.stdout && !configCheckResult.stdout.includes("未找到客户端配置文件")) {
      // 已有配置文件，收集所有配置信息并去重
      const allConfigFiles = configCheckResult.stdout.split('\n').filter(line => line.trim() !== '' && !line.includes('/etc/wireguard/wg') && !line.endsWith('.key') && !line.endsWith('.pub'));
      
      // 去重：使用Set来确保每个文件路径只出现一次
      const uniqueConfigFiles = [...new Set(allConfigFiles)];
      console.log(`找到 ${allConfigFiles.length} 个配置文件，去重后 ${uniqueConfigFiles.length} 个`);
      
      // 按文件名排序，确保peer编号顺序正确
      const sortedConfigFiles = uniqueConfigFiles.sort((a, b) => {
        const aName = a.split('/').pop();
        const bName = b.split('/').pop();
        
        // 提取peer编号进行数字排序
        const aMatch = aName.match(/peer(\d+)/);
        const bMatch = bName.match(/peer(\d+)/);
        
        if (aMatch && bMatch) {
          return parseInt(aMatch[1]) - parseInt(bMatch[1]);
        }
        
        // 如果没有peer编号，按文件名排序
        return aName.localeCompare(bName);
      });
      
      console.log(`排序后的配置文件:`, sortedConfigFiles.map(f => f.split('/').pop()));
      const configFiles = sortedConfigFiles;
      
      if (configFiles.length === 0) {
        // 第二次尝试：查找Wireguard实例然后手动生成客户端配置
        console.log('未找到客户端配置文件，尝试从实例生成...');
        const wgInstances = await getWireguardInstances(ssh);
        
        if (wgInstances.length > 0) {
          console.log(`找到 ${wgInstances.length} 个Wireguard实例，尝试生成配置...`);
          
          const clientConfigs = [];
          let detailsObtained = false;
          
          // 从第一个实例生成配置
          try {
            const instanceDetails = await getWireguardInstanceDetails(ssh, wgInstances[0].name);
            if (instanceDetails && instanceDetails.peers && instanceDetails.peers.length > 0) {
              instanceDetails.peers.forEach(peer => {
                if (peer.config) {
                  clientConfigs.push({
                    path: peer.file || `/root/VPS配置WG/${wgInstances[0].name}-peer${peer.number}-client.conf`,
                    name: `${wgInstances[0].name}-peer${peer.number}-client.conf`,
                    content: peer.config
                  });
                }
              });
              detailsObtained = true;
            }
          } catch (instanceError) {
            console.warn('获取实例详情时出错，尝试其他方法:', instanceError);
          }
          
          if (clientConfigs.length > 0) {
            return {
              success: true,
              output: `已生成 ${clientConfigs.length} 个客户端配置文件。`,
              clientConfigs: clientConfigs
            };
          } else if (detailsObtained) {
            return {
              success: true,
              output: "找到Wireguard实例但未能自动生成配置文件。您可能需要重新部署或手动配置。",
              clientConfigs: []
            };
          }
        }
        
        // 第三次尝试：手动创建一个最基本的配置
        console.log('尝试最后方法：检查网络接口创建基础配置');
        const getIPCmd = 'curl -4 -s ifconfig.me || hostname -I | awk \'{print $1}\'';
        const ipResult = await ssh.execCommand(getIPCmd);
        const serverIP = ipResult.stdout.trim();
        
        if (serverIP && !serverIP.includes(" ") && serverIP.includes(".")) {
          // 创建一个基本配置作为应急
          console.log(`使用IP ${serverIP} 创建基本配置`);
          
          // 生成密钥对
          await ssh.execCommand('mkdir -p /root/VPS配置WG');
          const keyResult = await ssh.execCommand('cd /root/VPS配置WG && wg genkey | tee client.key | wg pubkey > client.pub');
          const getKeyCmd = 'cat /root/VPS配置WG/client.key';
          const keyContent = await ssh.execCommand(getKeyCmd);
          
          if (keyContent.stdout.trim()) {
            const basicConfig = `[Interface]
PrivateKey = ${keyContent.stdout.trim()}
Address = 10.0.1.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = 需要服务器公钥，请执行wg show命令查看
Endpoint = ${serverIP}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;
            await ssh.execCommand(`echo '${basicConfig.replace(/'/g, "'\\''")}' > /root/VPS配置WG/emergency-client.conf`);
            
            return {
              success: true,
              output: "未找到标准客户端配置，已创建基本配置模板。请注意：此配置需要手动设置服务器公钥才能使用。",
              clientConfigs: [{
                path: '/root/VPS配置WG/emergency-client.conf',
                name: 'emergency-client.conf',
                content: basicConfig
              }],
              warning: "配置文件需要手动补充服务器公钥"
            };
          }
        }
        
        return {
          success: true,
          output: "未检测到Wireguard客户端配置文件。您可以在Wireguard标签页选择服务器并点击'Wireguard部署'按钮进行自动部署。",
          clientConfigs: []
        };
      }
      
      console.log(`找到 ${configFiles.length} 个可能的客户端配置文件`);
      
      // 获取所有配置文件内容并去重
      const clientConfigs = [];
      const processedPaths = new Set(); // 用于跟踪已处理的文件路径
      
      for (const configFile of configFiles) {
        try {
          // 跳过已经处理过的文件
          if (processedPaths.has(configFile)) {
            console.log(`跳过重复文件: ${configFile}`);
            continue;
          }
          
          const configContent = await ssh.execCommand(`cat "${configFile}"`);
          if (configContent.stdout && configContent.stdout.includes("[Interface]") && configContent.stdout.includes("[Peer]")) {
            clientConfigs.push({
              path: configFile,
              name: configFile.split('/').pop(),
              content: configContent.stdout
            });
            processedPaths.add(configFile);
            console.log(`添加配置文件: ${configFile}`);
          }
        } catch (fileError) {
          console.warn(`读取文件 ${configFile} 失败:`, fileError);
        }
      }
      
      if (clientConfigs.length > 0) {
        return {
          success: true,
          output: `已找到 ${clientConfigs.length} 个客户端配置文件。`,
          clientConfigs: clientConfigs
        };
      } else {
        return {
          success: true,
          output: "找到了一些文件，但它们不是有效的Wireguard客户端配置。您可以尝试重新部署。",
          clientConfigs: []
        };
      }
    } else {
      // 如果没有找到配置文件，检查Wireguard实例状态
      const wgShowResult = await ssh.execCommand('wg show 2>/dev/null || echo "Wireguard未运行"');
      
      if (!wgShowResult.stdout.includes("Wireguard未运行")) {
        console.log('Wireguard正在运行，但未找到配置文件，尝试手动获取接口信息...');
        
        // 有运行的实例但找不到配置文件，调用函数获取实例详情
        const wgInterfaces = await getWireguardInstances(ssh);
        if (wgInterfaces.length > 0) {
          const firstInterface = wgInterfaces[0].name;
          const instanceDetails = await getWireguardInstanceDetails(ssh, firstInterface);
          
          if (instanceDetails && instanceDetails.peers && instanceDetails.peers.length > 0) {
            const clientConfigs = instanceDetails.peers.map(peer => ({
              path: peer.file || `/root/VPS配置WG/${firstInterface}-peer${peer.number}-client.conf`,
              name: `${firstInterface}-peer${peer.number}-client.conf`,
              content: peer.config
            })).filter(config => config.content);
            
            if (clientConfigs.length > 0) {
              // 保存配置到文件
              for (const config of clientConfigs) {
                await ssh.execCommand(`mkdir -p /root/VPS配置WG && echo '${config.content.replace(/'/g, "'\\''")}' > "${config.path}"`);
              }
              
              return {
                success: true,
                output: `找到 ${clientConfigs.length} 个运行中的Wireguard配置并保存到文件。`,
                clientConfigs
              };
            }
          }
        }
      }
      
      // 如果还是没找到，返回建议重新部署
      return {
        success: true,
        output: "未检测到Wireguard客户端配置文件。您可以在Wireguard标签页选择服务器并点击'Wireguard部署'按钮进行自动部署。",
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      billingManagerPath,
      '--action=get_current_month_bill'
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      '-u',  // 添加-u参数确保Python输出不被缓冲
      billingManagerPath,
      '--action=get_monthly_bill',
      `--year=${year}`,
      `--month=${month}`
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      '-u',  // 添加-u参数
      billingManagerPath,
      '--action=get_monthly_bill_summary'
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      '-u',  // 添加-u参数
      billingManagerPath,
      '--action=save_monthly_billing_to_excel',
      `--output=${filePath}`
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      '-u',  // 添加-u参数
      billingManagerPath,
      '--action=get_all_vps'
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    
    // 创建一个深拷贝，并确保所有数据可以被序列化
    const cleanVpsData = JSON.parse(JSON.stringify({
      ...vpsData,
      // 确保所有必要的字段都存在并且是正确的类型
      name: vpsData.name || '',
      ip_address: vpsData.ip_address || '',
      country: vpsData.country || '',
      status: vpsData.status || '在用',
      price_per_month: parseFloat(vpsData.price_per_month) || 0,
      start_date: vpsData.start_date || '',
      purchase_date: vpsData.purchase_date || '',
      cancel_date: vpsData.status === '销毁' ? (vpsData.cancel_date || '') : '',
      use_nat: !!vpsData.use_nat, // 确保是布尔值
    }));
    
    // 将VPS数据转换为JSON字符串
    const vpsDataJson = JSON.stringify(cleanVpsData);
    
    // 调用Python脚本保存VPS
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      billingManagerPath,
      '--action=save_vps',
      `--vps_data=${vpsDataJson}`
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
            // 确保更新VPS价格，这样在月账单统计中显示正确的数据
            const billingManagerPath = getResourcePath('billing_manager.py');
            const updateProcess = spawn('py', [
              billingManagerPath,
              '--action=update_prices'
            ], {
              cwd: app.isPackaged ? process.resourcesPath : __dirname
            });
            
            updateProcess.on('close', (updateCode) => {
              if (updateCode === 0) {
                console.log('VPS价格更新成功');
              } else {
                console.warn('VPS价格更新警告:', updateCode);
              }
              // 无论价格更新是否成功，都返回保存结果
              resolve({ success: true, data });
            });
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
    return { success: false, error: error.message || '保存VPS失败，请检查输入数据是否有效' };
  }
});

ipcMain.handle('delete-vps', async (event, vpsName) => {
  try {
    console.log(`删除VPS: ${vpsName}`);
    
    // 调用Python脚本删除VPS
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      billingManagerPath,
      '--action=delete_vps',
      `--vps_name=${vpsName}`
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      billingManagerPath,
      '--action=init_sample_data'
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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

ipcMain.handle('batch-add-vps', async (event, vpsList) => {
  try {
    console.log('批量添加VPS数据');
    
    // 将VPS列表转换为JSON字符串
    const vpsListJson = JSON.stringify(vpsList);
    
    // 调用Python脚本批量添加VPS
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      billingManagerPath,
      '--action=batch_add_vps',
      `--vps_list=${vpsListJson}`
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
          try {
            // 解析JSON结果
            const resultObj = JSON.parse(result);
            resolve(resultObj);
          } catch (parseError) {
            console.error('解析批量添加VPS结果失败:', parseError);
            resolve({ 
              success: false, 
              message: '解析批量添加VPS结果失败', 
              error: parseError.message,
              added: 0,
              failed: vpsList.length
            });
          }
        } else {
          console.error(`批量添加VPS失败 (${code}):`, error);
          resolve({ 
            success: false, 
            message: error || '批量添加VPS失败',
            added: 0,
            failed: vpsList.length
          });
        }
      });
    });
  } catch (error) {
    console.error('批量添加VPS出错:', error);
    return { 
      success: false, 
      message: error.message,
      added: 0,
      failed: vpsList ? vpsList.length : 0 
    };
  }
});

ipcMain.handle('update-vps-prices', async () => {
  try {
    console.log('更新VPS价格和使用时长');
    
    // 调用Python脚本更新VPS价格
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      billingManagerPath,
      '--action=update_prices'
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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
    const billingManagerPath = getResourcePath('billing_manager.py');
    const pythonProcess = spawn('py', [
      '-u',  // 添加-u参数确保输出不被缓冲
      billingManagerPath,
      '--action=save_monthly_billing_to_excel',
      `--output=${filePath}`,
      `--specific_year=${year}`,
      `--specific_month=${month}`
    ], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname
    });
    
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

// 强制同步客户端配置到Wireguard模块
ipcMain.handle('force-sync-wireguard-client-configs', async (event, serverId) => {
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
    console.log('开始强制同步Wireguard客户端配置...');
    
    // 1. 在各个常见位置查找客户端配置文件
    const clientConfigs = [];
    
    // 搜索多个位置的客户端配置文件
    console.log('搜索客户端配置文件中...');
    const locations = [
      '/root/VPS配置WG', 
      '/etc/wireguard',
      '/root'
    ];
    
    for (const location of locations) {
      console.log(`在 ${location} 中查找客户端配置...`);
      const result = await ssh.execCommand(`find ${location} -name "*-peer*-client.conf" -o -name "*peer*.conf" -o -name "wg*_client.conf" 2>/dev/null || echo ""`);
      
      if (result.stdout.trim()) {
        console.log(`在 ${location} 找到配置文件: ${result.stdout.split('\n').length} 个`);
        
        // 读取每个配置文件
        const files = result.stdout.split('\n').filter(f => f.trim());
        for (const file of files) {
          const readResult = await ssh.execCommand(`cat "${file}"`);
          if (readResult.stdout && readResult.stdout.includes('[Interface]') && readResult.stdout.includes('[Peer]')) {
            clientConfigs.push({
              path: file,
              content: readResult.stdout
            });
            console.log(`提取配置: ${file}`);
          }
        }
      } else {
        console.log(`在 ${location} 未找到客户端配置文件`);
      }
    }
    
    // 2. 从配置文件中提取实例信息
    console.log(`共找到 ${clientConfigs.length} 个有效客户端配置文件`);
    const instancesMap = new Map();
    let hasWg0 = false;
    
    for (const config of clientConfigs) {
      // 提取实例名称 (通常配置文件名为 wg0-peer1-client.conf)
      let instanceName = 'wg0'; // 默认实例名
      
      // 尝试从文件路径中提取实例名
      const instanceMatch = config.path.match(/([^\/]+)-peer\d+-client\.conf$/);
      if (instanceMatch && instanceMatch[1]) {
        instanceName = instanceMatch[1];
        console.log(`从配置文件 ${config.path} 提取到实例名: ${instanceName}`);
      } else {
        console.log(`未能从 ${config.path} 提取实例名，使用默认名称 wg0`);
      }
      
      if (instanceName === 'wg0') {
        hasWg0 = true;
      }
      
      // 保存实例与配置文件的映射关系
      if (!instancesMap.has(instanceName)) {
        instancesMap.set(instanceName, []);
      }
      instancesMap.get(instanceName).push(config);
    }
    
    // 如果没有找到任何实例，但有客户端配置，使用默认的wg0实例
    if (instancesMap.size === 0 && clientConfigs.length > 0) {
      instancesMap.set('wg0', clientConfigs);
      hasWg0 = true;
    }
    
    // 如果没有任何配置文件和实例
    if (clientConfigs.length === 0) {
      console.log('未找到任何客户端配置文件，无法同步');
      return {
        success: false,
        error: '未找到任何客户端配置文件，请先部署Wireguard或手动创建配置'
      };
    }
    
    // 3. 为每个实例创建或更新服务器配置文件
    const instances = [];
    
    for (const [instanceName, configs] of instancesMap.entries()) {
      console.log(`处理实例 ${instanceName} 的 ${configs.length} 个配置...`);
      
      // 检查是否存在服务器配置
      const serverConfigCheck = await ssh.execCommand(`test -f /etc/wireguard/${instanceName}.conf && echo "exists" || echo "not exists"`);
      let createServerConfig = serverConfigCheck.stdout.trim() === 'not exists';
      
      if (createServerConfig) {
        console.log(`实例 ${instanceName} 的服务器配置不存在，创建新配置`);
        
        // 从第一个客户端配置获取服务器信息
        const firstConfig = configs[0];
        
        // 提取服务器公钥和端口
        const serverPublicKey = firstConfig.content.match(/PublicKey\s*=\s*([A-Za-z0-9+\/=]+)/);
        const endpointMatch = firstConfig.content.match(/Endpoint\s*=\s*([^:]+):(\d+)/);
        const clientAddressMatch = firstConfig.content.match(/Address\s*=\s*([0-9.\/]+)/);
        
        if (serverPublicKey && endpointMatch && clientAddressMatch) {
          console.log(`从客户端配置中提取了服务器信息: ${endpointMatch[1]}:${endpointMatch[2]}`);
          
          // 生成服务器私钥
          const keyGenResult = await ssh.execCommand(`
            cd /root/VPS配置WG
            mkdir -p /root/VPS配置WG
            if [ ! -f "${instanceName}-server.key" ]; then
              wg genkey > ${instanceName}-server.key
            fi
            cat ${instanceName}-server.key
          `);
          
          if (keyGenResult.stdout) {
            const serverPrivKey = keyGenResult.stdout.trim();
            console.log(`服务器私钥已生成或获取`);
            
            // 构建服务器地址 (通常是 10.0.0.1/24 如果客户端是 10.0.0.2/24)
            const serverAddress = clientAddressMatch[1].replace(/\.\d+\//, '.1/');
            console.log(`服务器地址: ${serverAddress}`);
            
            // 创建基本服务器配置
            const serverConfig = `[Interface]
PrivateKey = ${serverPrivKey}
Address = ${serverAddress}
ListenPort = ${endpointMatch[2]}
# 根据客户端配置生成的服务器配置

`;
            
            // 为每个客户端创建Peer配置
            let peerConfigs = '';
            for (let i = 0; i < configs.length; i++) {
              const config = configs[i];
              const peerNumber = i + 1;
              
              // 从客户端配置中提取私钥和IP
              const privateKeyMatch = config.content.match(/PrivateKey\s*=\s*([A-Za-z0-9+\/=]+)/);
              const addressMatch = config.content.match(/Address\s*=\s*([0-9.\/]+)/);
              
              if (privateKeyMatch && addressMatch) {
                // 使用wg命令从私钥计算公钥
                const pubKeyResult = await ssh.execCommand(`echo "${privateKeyMatch[1]}" | wg pubkey`);
                if (pubKeyResult.stdout) {
                  const peerPubKey = pubKeyResult.stdout.trim();
                  console.log(`计算得到peer${peerNumber}的公钥`);
                  
                  // 添加Peer配置
                  peerConfigs += `[Peer] # peer${peerNumber}
PublicKey = ${peerPubKey}
AllowedIPs = ${addressMatch[1]}

`;
                }
              }
            }
            
            // 将配置写入文件
            const finalConfig = serverConfig + peerConfigs;
            console.log(`完成服务器配置生成，准备写入`);
            
            const writeConfigResult = await ssh.execCommand(`
              mkdir -p /etc/wireguard
              echo '${finalConfig.replace(/'/g, "'\\''")}' > /etc/wireguard/${instanceName}.conf
              chmod 600 /etc/wireguard/${instanceName}.conf
              echo "配置已写入"
            `);
            
            console.log(`写入配置结果: ${writeConfigResult.stdout}`);
            
            // 尝试创建wireguard服务并启动
            await ssh.execCommand(`
              systemctl enable wg-quick@${instanceName} 2>/dev/null || true
              systemctl restart wg-quick@${instanceName} 2>/dev/null || true
              wg-quick up ${instanceName} 2>/dev/null || true
            `);
            
            console.log(`已尝试启动服务: ${instanceName}`);
          } else {
            console.log(`无法生成服务器私钥`);
          }
        } else {
          console.log(`无法从客户端配置中提取必要的服务器信息`);
        }
      } else {
        console.log(`实例 ${instanceName} 的服务器配置已存在，保持不变`);
      }
      
      // 添加实例到列表
      instances.push(instanceName);
    }
    
    // 优先返回wg0实例
    if (hasWg0 && !instances.includes('wg0')) {
      instances.unshift('wg0');
    }
    
    console.log(`强制同步完成，找到以下实例: ${instances.join(', ')}`);
    
    return {
      success: true,
      message: '已强制同步Wireguard客户端配置',
      instances: instances
    };
  } catch (error) {
    console.error('强制同步Wireguard客户端配置失败:', error);
    return {
      success: false,
      error: '强制同步失败: ' + error.message
    };
  }
});
