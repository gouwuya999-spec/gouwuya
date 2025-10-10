const { createApp } = Vue;

// 生成随机ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

createApp({
  data() {
    return {
      activeTab: 'servers',
      servers: [],
      showAddServerModal: false,
      showSSHTerminalModal: false,
      appVersion: '加载中...',
      // 添加连接状态管理
      connectedServers: new Set(), // 存储已连接服务器的ID
      connectionStatus: {}, // 存储每个服务器的连接状态
      newServer: {
        name: '',
        host: '',
        port: 22,
        username: '',
        password: '',
        privateKeyPath: '',
        passphrase: ''
      },
      // 批量添加服务器相关变量
      useBatchMode: false,
      batchServers: [],
      batchResults: [],
      selectedServer: null,
      isDeploying: false,
      isTestingConnection: false,
      isSupportingPrivateKey: true,
      wireguardResult: null,
      qrCodeImage: null,
      connectionTestResult: null,
      sshOutput: '',
      sshCommand: '',
      currentConnectedServer: null,
      showDebugInfo: false,
      // 存储找到的多个配置文件
      foundConfigFiles: [],
      // 当前选中的配置文件索引
      currentConfigIndex: -1,
      // 配置文件内容
      configContent: '',
      // 是否显示配置文件内容
      showConfigContent: true,
      // 添加进度显示相关变量
      deployProgress: {
        percent: 0,
        message: ''
      },
      // 添加客户端配置显示相关变量
      clientConfigs: [],
      // 状态栏信息
      cursorPosition: '',
      // 通知消息
      notification: null,
      // 月账单统计相关数据
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1,
      monthlyBill: {},
      monthlyBillSummary: [],
      // 可选年份列表
      availableYears: [],
      // VPS编辑相关数据
      vpsDataList: [],
      showAddVpsModal: false,
      editingVps: {
        name: '',
        purchase_date: '',
        use_nat: false,
        status: '在用',
        cancel_date: '',
        price_per_month: 20,
        start_date: '',
        total_price: 0,
        usage_period: '',
        ip_address: '',
        country: ''
      },
      editingVpsIndex: -1,
      // 修复未定义的属性
      showFileEditButton: false,
      currentEditingFile: '',
      deployingServerId: null,
      
      // Wireguard peer管理相关数据
      wireguardSelectedServer: '',
      wireguardSelectedInstance: '',
      wireguardInstances: [],
      wireguardInstanceDetails: null,
      wireguardLoading: false,
      addingPeer: false,
      peerResult: null,
      viewingPeer: null,
      viewPeerQrCode: null,
      // 批量添加VPS相关数据
      showBatchAddVpsModal: false,
      batchVpsData: '',
      batchVpsList: [],
      // IP地址检测相关变量
      isDetectingIp: false,
      isRefreshingWireguard: false,  // 标记是否正在刷新Wireguard
    };
  },
  
  mounted() {
    console.log('Vue应用已加载，electronAPI:', window.electronAPI);
    this.loadServers();
    
    // 获取应用版本号
    this.getAppVersion();
    
    // 初始化年份选项
    this.initAvailableYears();
    
    // 如果在月账单标签页，加载月账单汇总
    if (this.activeTab === 'monthly-bill') {
      this.loadMonthlyBillSummary();
      this.generateMonthlyBill();
    }
    
    // 加载VPS数据列表
    this.loadVpsDataList();
    
    // 设置接收Wireguard部署进度的事件处理
    if (window.electronAPI && window.electronAPI.onWireguardDeployProgress) {
      window.electronAPI.onWireguardDeployProgress((data) => {
        console.log('收到Wireguard部署进度:', data, '当前部署服务器ID:', this.deployingServerId);
        if (data.serverId === this.deployingServerId) {
          this.deployProgress = {
            percent: data.percent,
            message: data.message
          };
          console.log('更新部署进度:', this.deployProgress);
        } else {
          console.log('服务器ID不匹配，忽略进度更新');
        }
      });
    }
    
    // 设置接收Wireguard实例更新的事件处理
    if (window.electronAPI && window.electronAPI.onWireguardInstancesUpdated) {
      window.electronAPI.onWireguardInstancesUpdated((data) => {
        console.log('收到Wireguard实例更新通知:', data);
        // 自动刷新当前服务器的Wireguard实例列表
        if (this.selectedServer) {
          this.loadWireguardInstances();
        }
      });
    }
  },
  
  // 添加watch选项，监听实例选择变化
  watch: {
    // 当选择的实例改变时，立即加载实例详情
    wireguardSelectedInstance: {
      handler: function(newInstance, oldInstance) {
        if (newInstance && newInstance !== oldInstance) {
          console.log(`Wireguard实例已切换: ${oldInstance} -> ${newInstance}，重新加载详情`);
          this.loadInstanceDetails();
        }
      },
      immediate: false
    }
  },
  
  methods: {
    // 获取应用版本号
    async getAppVersion() {
      try {
        if (window.electronAPI) {
          this.appVersion = await window.electronAPI.getAppVersion();
          console.log('应用版本号:', this.appVersion);
        }
      } catch (error) {
        console.error('获取版本号失败:', error);
        this.appVersion = '未知';
      }
    },
    
    // 加载已保存的服务器列表
    async loadServers() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        this.servers = await window.electronAPI.getServers();
        
        // 初始化所有服务器的连接状态
        this.servers.forEach(server => {
          this.connectionStatus[server.id] = 'disconnected';
        });
        
        console.log('已加载服务器列表:', this.servers);
      } catch (error) {
        console.error('加载服务器列表失败:', error);
        alert('加载服务器列表失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 添加新服务器
    async addServer() {
      console.log('尝试添加服务器');
      try {
        if (!window.electronAPI) {
          throw new Error('electronAPI未定义');
        }
        
        if (!this.newServer.name || !this.newServer.host || !this.newServer.username || 
            (!this.newServer.password && !this.newServer.privateKeyPath)) {
          alert('请填写所有必填字段');
          return;
        }
        
        const serverData = {
          ...this.newServer,
          id: generateId()
        };
        
        console.log('保存服务器数据:', serverData);
        const result = await window.electronAPI.saveServer(serverData);
        console.log('保存结果:', result);
        
        if (result.success) {
          this.servers.push(serverData);
          
          // 初始化新服务器的连接状态
          this.connectionStatus[serverData.id] = 'disconnected';
          
          // 重置表单
          this.newServer = {
            name: '',
            host: '',
            port: 22,
            username: '',
            password: '',
            privateKeyPath: '',
            passphrase: ''
          };
          
          this.showAddServerModal = false;
          this.showNotification(`服务器 ${serverData.name} 已添加`, 'success');
        }
      } catch (error) {
        console.error('添加服务器失败:', error);
        alert('添加服务器失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 删除服务器
    async deleteServer(id) {
      try {
        if (confirm('确定要删除此服务器吗?')) {
          // 如果服务器已连接，先断开连接
          if (this.connectedServers.has(id)) {
            const server = this.servers.find(s => s.id === id);
            if (server) {
              await this.disconnectServer(server);
            }
          }
          
          // 删除服务器
          await window.electronAPI.deleteServer(id);
          this.servers = this.servers.filter(server => server.id !== id);
          
          // 清理连接状态
          this.connectedServers.delete(id);
          delete this.connectionStatus[id];
          
          this.showNotification('服务器已删除', 'info');
        }
      } catch (error) {
        console.error('删除服务器失败:', error);
        alert('删除服务器失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 测试服务器连接
    async testServerConnection(serverId) {
      try {
        this.isTestingConnection = true;
        this.connectionTestResult = null;
        
        const result = await window.electronAPI.testSSHConnection(serverId);
        this.connectionTestResult = result;
        
        console.log('连接测试结果:', result);
        
        if (result.success) {
          alert('连接成功！');
        } else {
          // 获取当前服务器信息以显示在错误信息中
          const server = this.servers.find(s => s.id === serverId);
          let errorDetails = '';
          
          if (server) {
            errorDetails = `\n\n服务器信息:\n主机: ${server.host}\n端口: ${server.port}\n用户名: ${server.username}\n认证方式: ${server.privateKeyPath ? '私钥' : '密码'}`;
          }
          
          // 添加详细的错误提示
          let fullErrorMessage = `连接失败: ${result.error}${errorDetails}\n\n`;
          fullErrorMessage += '请检查:\n1. 服务器地址和端口是否正确\n2. 用户名是否正确\n3. 密码或私钥是否有效\n4. 服务器SSH服务是否运行\n5. 防火墙是否允许SSH连接';
          
          alert(fullErrorMessage);
        }
      } catch (error) {
        console.error('测试连接失败:', error);
        alert('测试连接失败: ' + (error.message || '未知错误'));
      } finally {
        this.isTestingConnection = false;
      }
    },
    
    // 连接服务器 - 修改为直接连接并显示状态
    async connectServer(server) {
      try {
        // 如果已经连接，则断开连接
        if (this.connectedServers.has(server.id)) {
          await this.disconnectServer(server);
          return;
        }
        
        // 设置连接状态为连接中
        this.connectionStatus[server.id] = 'connecting';
        this.$forceUpdate(); // 强制更新UI
        
        console.log(`正在连接到 ${server.name} (${server.host})...`);
        
        // 建立SSH连接
        const result = await window.electronAPI.openSSHTerminal(server.id);
        
        if (result.success) {
          // 连接成功，更新状态
          this.connectedServers.add(server.id);
          this.connectionStatus[server.id] = 'connected';
          console.log(`已连接到 ${server.host}`);
          
          // 显示成功通知
          this.showNotification(`已连接到 ${server.name}`, 'success');
        } else {
          // 连接失败
          this.connectionStatus[server.id] = 'disconnected';
          console.error(`连接失败: ${result.error}`);
          this.showNotification(`连接失败: ${result.error}`, 'error');
        }
      } catch (error) {
        // 连接异常
        this.connectionStatus[server.id] = 'disconnected';
        console.error('连接服务器失败:', error);
        this.showNotification(`连接失败: ${error.message || '未知错误'}`, 'error');
      } finally {
        this.$forceUpdate(); // 强制更新UI
      }
    },
    
    // 断开服务器连接
    async disconnectServer(server) {
      try {
        console.log(`正在断开与 ${server.name} 的连接...`);
        
        // 关闭SSH连接
        await window.electronAPI.closeSSHConnection(server.id);
        
        // 更新状态
        this.connectedServers.delete(server.id);
        this.connectionStatus[server.id] = 'disconnected';
        
        console.log(`已断开与 ${server.name} 的连接`);
        this.showNotification(`已断开与 ${server.name} 的连接`, 'info');
      } catch (error) {
        console.error('断开连接失败:', error);
        this.showNotification(`断开连接失败: ${error.message || '未知错误'}`, 'error');
      } finally {
        this.$forceUpdate(); // 强制更新UI
      }
    },
    
    // 显示通知消息
    showNotification(message, type = 'info') {
      this.notification = {
        message: message,
        type: type,
        timestamp: Date.now()
      };
      
      // 3秒后自动清除通知
      setTimeout(() => {
        this.notification = null;
      }, 3000);
    },
    
    // 获取服务器连接状态
    getServerConnectionStatus(serverId) {
      return this.connectionStatus[serverId] || 'disconnected';
    },
    
    // 检查服务器是否已连接
    isServerConnected(serverId) {
      return this.connectedServers.has(serverId);
    },
    
    // 发送SSH命令
    async sendSSHCommand() {
      if (!this.sshCommand || !this.currentConnectedServer) return;
      
      const command = this.sshCommand.trim();
      this.sshOutput += `> ${command}\n`;
      
      try {
        const result = await window.electronAPI.executeSSHCommand({
          serverId: this.currentConnectedServer.id, 
          command: command
        });
        
        if (result.success) {
          if (result.stdout) {
            this.sshOutput += result.stdout + '\n';
            
            // 检查是否是cat配置文件的命令，如果是则自动生成二维码
            if (command.toLowerCase().includes('cat') && 
                command.toLowerCase().includes('/etc/wireguard') && 
                result.stdout.includes('[Interface]')) {
              // 找到了WireGuard配置，尝试生成二维码
              await this.generateQRCodeFromConfig(result.stdout);
            }
          }
          
          if (result.stderr) {
            this.sshOutput += result.stderr + '\n';
          }
        } else {
          // 检查是否为交互式命令
          if (result.isInteractive) {
            this.sshOutput += `${result.error}\n`;
            if (result.alternatives) {
              this.sshOutput += `提示: ${result.alternatives}\n`;
            }
          } else {
            this.sshOutput += `错误: ${result.error}\n`;
          }
        }
      } catch (error) {
        console.error('执行命令失败:', error);
        this.sshOutput += `错误: ${error.message || '未知错误'}\n`;
      }
      
      this.sshCommand = '';
      
      // 自动滚动到底部
      this.$nextTick(() => {
        const terminalOutput = document.querySelector('.terminal-output');
        if (terminalOutput) {
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
      });
    },
    
    // 从配置中生成二维码
    async generateQRCodeFromConfig(configData) {
      try {
        if (!configData || !configData.includes('[Interface]')) {
          console.log('无效的WireGuard配置数据');
          return;
        }
        
        console.log('尝试从配置生成二维码');
        this.sshOutput += '\n正在生成高质量二维码...\n';
        
        // 调用主进程生成二维码
        const result = await window.electronAPI.generateQRCode(configData);
        
        if (result.success) {
          this.qrCodeImage = result.qrCodeImage;
          this.sshOutput += '二维码生成成功，请查看下方图片。\n';
          this.showConfigContent = true; // 确保显示二维码区域
        } else {
          this.sshOutput += `生成二维码失败: ${result.error}\n`;
        }
      } catch (error) {
        console.error('生成二维码失败:', error);
        this.sshOutput += `生成二维码失败: ${error.message || '未知错误'}\n`;
      }
    },
    
    // 关闭SSH连接
    async closeSSHTerminal() {
      if (this.currentConnectedServer) {
        try {
          await window.electronAPI.closeSSHConnection(this.currentConnectedServer.id);
        } catch (error) {
          console.error('关闭SSH连接失败:', error);
        }
      }
      
      this.showSSHTerminalModal = false;
      this.currentConnectedServer = null;
      this.sshOutput = '';
      this.sshCommand = '';
      // 清空配置相关数据
      this.clientConfigs = [];
      this.foundConfigFiles = [];
      this.currentConfigIndex = -1;
      this.configContent = '';
      this.qrCodeImage = null;
      this.showConfigContent = false;
      this.wireguardResult = null;
    },
    
    // 一键执行Wireguard安装脚本
    async executeWireguardInTerminal() {
      if (!this.currentConnectedServer) return;
      
      // 添加重新部署确认对话框
      const confirmMessage = `确定要重新部署 ${this.currentConnectedServer.name} 的Wireguard吗？\n\n这将：\n• 停止现有的Wireguard实例\n• 清理旧的配置文件\n• 重新生成IPv4配置\n• 覆盖现有配置\n\n注意：此操作不可撤销！`;
      
      if (!confirm(confirmMessage)) {
        return;
      }
      
      this.sshOutput += `> 正在执行Wireguard重新部署...\n`;
      
      try {
        const result = await window.electronAPI.executeWireguardScript(this.currentConnectedServer.id);
        
        if (result.success) {
          this.sshOutput += `Wireguard重新部署已准备就绪!\n\n`;
          
          if (result.output) {
            this.sshOutput += result.output + '\n';
          }
          
          this.sshOutput += `\nWireguard已经自动重新部署完成，配置文件保存在/root/VPS配置WG/目录下。\n`;
          this.sshOutput += `您可以使用"查找配置"按钮自动查找配置文件并生成二维码。\n`;
          this.sshOutput += `或者使用以下命令查看客户端配置：\n`;
          this.sshOutput += `cat /root/VPS配置WG/wg0-peer1-client.conf\n`;
        } else {
          this.sshOutput += `操作失败: ${result.error || '未知错误'}\n`;
        }
      } catch (error) {
        console.error('执行Wireguard脚本失败:', error);
        this.sshOutput += `操作失败: ${error.message || '未知错误'}\n`;
      }
    },
    
    // 从服务器列表部署Wireguard
    async deployWireguardFromList(server) {
      try {
        // 添加重新部署确认对话框
        const confirmMessage = `确定要重新部署 ${server.name} 的Wireguard吗？\n\n这将：\n• 停止现有的Wireguard实例\n• 清理旧的配置文件\n• 重新生成IPv4配置\n• 覆盖现有配置\n\n注意：此操作不可撤销！`;
        
        if (!confirm(confirmMessage)) {
          return;
        }
        
        this.isDeploying = true;
        this.wireguardResult = null;
        this.qrCodeImage = null;
        this.clientConfigs = [];
        
        // 保存当前部署的服务器ID，用于进度更新
        this.deployingServerId = server.id;
        
        // 重置进度
        this.deployProgress = {
          percent: 0,
          message: '准备重新部署...'
        };
        
        // 先测试连接
        const testResult = await window.electronAPI.testSSHConnection(server.id);
        
        if (!testResult.success) {
          this.wireguardResult = {
            success: false,
            error: `连接失败: ${testResult.error}`
          };
          return;
        }
        
        // 部署Wireguard
        const result = await window.electronAPI.deployWireguard(server.id);
        this.wireguardResult = result;
        
        if (result.success) {
          // 如果有返回多个客户端配置，使用它们
          if (result.clientConfigs && result.clientConfigs.length > 0) {
            this.clientConfigs = result.clientConfigs;
            
            // 为第一个配置生成二维码
            await this.generateQRCodeFromConfig(result.clientConfigs[0].content);
          } 
          // 向后兼容：如果没有clientConfigs但有单一的clientConfig
          else if (result.clientConfig) {
            this.clientConfigs.push({
              name: 'wg0-peer1-client.conf',
              content: result.clientConfig
            });
            
            // 生成二维码
            await this.generateQRCodeFromConfig(result.clientConfig);
          }
          
          // 处理警告信息
          if (result.warning) {
            // 显示成功但有警告的消息
            alert(`Wireguard重新部署状态: ${result.warning}`);
          } else {
            alert('Wireguard已自动重新部署完成！\n\n✅ 已清理旧配置\n✅ 已重新生成IPv4配置\n✅ 已覆盖现有配置');
          }
        } else {
          // 显示错误信息
          alert(`Wireguard重新部署失败: ${result.error || '未知错误'}\n可能仍在后台部署中，请稍后通过SSH终端检查。`);
        }
      } catch (error) {
        console.error('部署Wireguard失败:', error);
        this.wireguardResult = {
          success: false,
          error: error.message || '未知错误'
        };
        alert(`部署过程中发生错误: ${error.message || '未知错误'}\n这可能是临时性问题，请稍后通过SSH终端检查部署状态。`);
      } finally {
        this.isDeploying = false;
      }
    },
    
    // 切换认证方式
    toggleAuthMethod() {
      this.isSupportingPrivateKey = !this.isSupportingPrivateKey;
      if (this.isSupportingPrivateKey) {
        this.newServer.password = '';
      } else {
        this.newServer.privateKeyPath = '';
        this.newServer.passphrase = '';
      }
    },
    
    
    // 自动查找Wireguard配置文件
    async findWireguardConfig() {
      if (!this.currentConnectedServer) return;
      
      this.sshOutput += `> 正在搜索Wireguard客户端配置文件...\n`;
      // 重置配置文件列表
      this.foundConfigFiles = [];
      this.currentConfigIndex = -1;
      this.qrCodeImage = null;
      this.configContent = '';
      this.showConfigContent = true;  // 确保找到配置文件后显示配置区域
      this.clientConfigs = [];  // 重置客户端配置列表
      
      try {
        // 检查是否已存在SSH连接
        const connectResult = await window.electronAPI.testSSHConnection(this.currentConnectedServer.id);
        if (!connectResult.success) {
          // 尝试连接服务器
          await window.electronAPI.openSSHTerminal(this.currentConnectedServer.id);
          this.sshOutput += `> 已连接到服务器: ${this.currentConnectedServer.name || this.currentConnectedServer.host}\n`;
        }
        
        // 使用增强版的执行Wireguard脚本函数获取所有客户端配置
        this.sshOutput += `> 正在全面搜索服务器上的Wireguard配置...\n`;
        const wireguardResult = await window.electronAPI.executeWireguardScript(this.currentConnectedServer.id);
        
        if (wireguardResult.success && wireguardResult.clientConfigs && wireguardResult.clientConfigs.length > 0) {
          this.sshOutput += `找到 ${wireguardResult.clientConfigs.length} 个客户端配置文件:\n`;
          
          // 打印配置文件路径
          for (const config of wireguardResult.clientConfigs) {
            this.sshOutput += `- ${config.path}\n`;
          }
          
          // 保存所有配置文件并按peer编号排序
          this.clientConfigs = wireguardResult.clientConfigs.sort((a, b) => {
            const aName = a.name || a.path.split('/').pop();
            const bName = b.name || b.path.split('/').pop();
            
            // 提取peer编号进行数字排序
            const aMatch = aName.match(/peer(\d+)/);
            const bMatch = bName.match(/peer(\d+)/);
            
            if (aMatch && bMatch) {
              return parseInt(aMatch[1]) - parseInt(bMatch[1]);
            }
            
            // 如果没有peer编号，按文件名排序
            return aName.localeCompare(bName);
          });
          
          this.foundConfigFiles = this.clientConfigs.map(config => config.path);
          console.log('设置foundConfigFiles:', this.foundConfigFiles);
          console.log('设置showConfigContent为true');
          this.showConfigContent = true;
          
          // 显示第一个配置文件
          await this.showConfigFile(0);
          return;
        } else if (wireguardResult.warning) {
          this.sshOutput += `警告: ${wireguardResult.warning}\n`;
        }
        
        // 如果上述方法没有找到配置，尝试更广泛的搜索
        this.sshOutput += `> 未找到标准配置，尝试全磁盘搜索...\n`;
        
        // 全磁盘搜索客户端配置文件（注意: 这可能会很慢，所以设置超时）
        const fullSearchCommand = {
          serverId: this.currentConnectedServer.id,
          command: 'timeout 30s find / -type f -name "*.conf" 2>/dev/null | grep -E "wg|wireguard|client|peer" || echo "搜索超时或未找到"'
        };
        
        const fullSearchResult = await window.electronAPI.executeSSHCommand(fullSearchCommand);
        
        if (fullSearchResult.success && fullSearchResult.stdout && !fullSearchResult.stdout.includes("搜索超时") && !fullSearchResult.stdout.includes("未找到")) {
          this.sshOutput += `全磁盘搜索找到以下可能的配置文件:\n${fullSearchResult.stdout}\n`;
          
          // 过滤掉系统配置文件，只保留可能的客户端配置
          const possibleConfigFiles = fullSearchResult.stdout.split('\n')
            .filter(line => line.trim() !== '' && 
                   (line.includes('/wg') || line.includes('client') || line.includes('peer')) &&
                   !line.includes('/etc/systemd/') && 
                   !line.includes('/var/lib/') &&
                   !line.includes('/usr/share/'));
          
          if (possibleConfigFiles.length > 0) {
            // 存储找到的配置文件
            this.foundConfigFiles = possibleConfigFiles;
            
            // 读取所有配置内容
            for (const configPath of possibleConfigFiles) {
              const catCommand = {
                serverId: this.currentConnectedServer.id,
                command: `cat "${configPath}" 2>/dev/null`
              };
              
              const contentResult = await window.electronAPI.executeSSHCommand(catCommand);
              if (contentResult.success && contentResult.stdout && 
                  contentResult.stdout.includes("[Interface]") && 
                  contentResult.stdout.includes("PrivateKey") &&
                  contentResult.stdout.includes("[Peer]")) {
                this.clientConfigs.push({
                  path: configPath,
                  name: configPath.split('/').pop(),
                  content: contentResult.stdout
                });
              }
            }
            
            if (this.clientConfigs.length > 0) {
              // 对找到的配置文件进行排序
              this.clientConfigs.sort((a, b) => {
                const aName = a.name || a.path.split('/').pop();
                const bName = b.name || b.path.split('/').pop();
                
                // 提取peer编号进行数字排序
                const aMatch = aName.match(/peer(\d+)/);
                const bMatch = bName.match(/peer(\d+)/);
                
                if (aMatch && bMatch) {
                  return parseInt(aMatch[1]) - parseInt(bMatch[1]);
                }
                
                // 如果没有peer编号，按文件名排序
                return aName.localeCompare(bName);
              });
              
              this.foundConfigFiles = this.clientConfigs.map(config => config.path);
              this.sshOutput += `找到 ${this.clientConfigs.length} 个有效的Wireguard客户端配置文件\n`;
              // 显示第一个配置文件
              await this.showConfigFile(0);
              return;
            }
          }
        }
        
        // 如果还是没有找到，尝试手动生成一个应急配置
        this.sshOutput += `> 未找到现有配置，检查Wireguard状态并尝试手动创建...\n`;
        
        // 检查Wireguard是否正在运行
        const wgShowCommand = {
          serverId: this.currentConnectedServer.id,
          command: 'wg show 2>/dev/null || echo "Wireguard未运行"'
        };
        
        const wgShowResult = await window.electronAPI.executeSSHCommand(wgShowCommand);
        
        if (wgShowResult.success && !wgShowResult.stdout.includes("Wireguard未运行")) {
          this.sshOutput += `检测到Wireguard正在运行，但未找到配置文件\n`;
          this.sshOutput += `请尝试重新部署Wireguard或手动查看服务器上的配置\n`;
        } else {
          this.sshOutput += `未检测到运行中的Wireguard服务\n`;
          this.sshOutput += `建议：点击"Wireguard部署"按钮进行自动部署\n`;
        }
        
        // 提示用户Wireguard运行状态
        this.sshOutput += `\n未找到有效的Wireguard客户端配置文件。\n`;
        this.sshOutput += `如果您确定配置文件存在，请执行以下操作：\n`;
        this.sshOutput += `1. 通过SSH终端手动查找 (find / -name "*client*.conf")\n`;
        this.sshOutput += `2. 检查Wireguard状态 (systemctl status wg-quick@wg0)\n`;
        this.sshOutput += `3. 重新部署Wireguard\n`;
      } catch (error) {
        console.error('查找Wireguard配置失败:', error);
        this.sshOutput += `错误: ${error.message || '未知错误'}\n`;
        this.sshOutput += `建议重新连接服务器并尝试部署Wireguard\n`;
      }
    },
    
    // 显示配置文件内容
    async showConfigFile(index) {
      console.log('showConfigFile被调用，index:', index, 'foundConfigFiles.length:', this.foundConfigFiles.length);
      if (index < 0 || index >= this.foundConfigFiles.length) {
        console.log('索引超出范围，返回');
        return;
      }
      
      this.currentConfigIndex = index;
      
      // 如果使用的是clientConfigs数组
      if (this.clientConfigs && this.clientConfigs.length > index) {
        const config = this.clientConfigs[index];
        this.configContent = config.content;
        this.sshOutput += `\n正在显示配置文件: ${config.name}\n`;
        console.log('显示配置文件:', config.name, '内容长度:', config.content.length);
        
        // 生成二维码
        await this.generateQRCodeFromConfig(config.content);
        return;
      }
      
      // 传统方式读取配置
      const configPath = this.foundConfigFiles[index];
      const catCommand = {
        serverId: this.currentConnectedServer.id,
        command: `cat "${configPath}"`
      };
      
      try {
        const result = await window.electronAPI.executeSSHCommand(catCommand);
        
        if (result.success && result.stdout) {
          this.configContent = result.stdout;
          this.sshOutput += `\n正在显示配置文件: ${configPath}\n`;
          
          // 生成二维码
          await this.generateQRCodeFromConfig(result.stdout);
        } else {
          this.sshOutput += `无法读取配置文件: ${configPath}\n`;
          if (result.stderr) {
            this.sshOutput += `错误: ${result.stderr}\n`;
          }
        }
      } catch (error) {
        console.error('读取配置文件失败:', error);
        this.sshOutput += `错误: ${error.message || '未知错误'}\n`;
      }
    },
    
    // 设置当前活动标签页 (热加载测试成功!)
    setActiveTab(tab) {
      this.activeTab = tab;
      
      // 根据切换的标签页执行相应的操作
      if (tab === 'monthly-bill') {
        // 月账单标签页
        this.loadMonthlyBillSummary();
        // 确保加载所有VPS数据
        this.loadVpsDataList();
        // 生成当前选择年月的账单
        this.generateMonthlyBill();
      } else if (tab === 'wireguard') {
        // 切换到Wireguard选项卡时，重置选中状态
        this.wireguardSelectedServer = '';
        this.wireguardSelectedInstance = '';
        this.wireguardInstances = [];
        this.wireguardInstanceDetails = null;
      }
    },
    
    // 初始化可选年份列表
    initAvailableYears() {
      const currentYear = new Date().getFullYear();
      this.availableYears = [];
      
      // 从2024年到当前年份
      for (let year = 2024; year <= currentYear; year++) {
        this.availableYears.push(year);
      }
    },
    
    // 获取当前月账单
    async getCurrentMonthBill() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        // 清空之前的月账单数据
        this.monthlyBill = {};
        
        const result = await window.electronAPI.getCurrentMonthBill();
        
        if (result.success) {
          this.monthlyBill = result.data;
          this.selectedYear = result.data.年份;
          this.selectedMonth = result.data.月份;
          console.log('已加载当前月账单:', this.monthlyBill);
        } else {
          console.error('获取当前月账单失败:', result.error);
        }
      } catch (error) {
        console.error('获取当前月账单失败:', error);
      }
    },
    
    // 生成指定年月的账单
    async generateMonthlyBill() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        // 确保年月参数是数字
        const year = parseInt(this.selectedYear);
        const month = parseInt(this.selectedMonth);
        
        console.log(`生成账单前的参数检查 - 年份: ${year}(${typeof year}), 月份: ${month}(${typeof month})`);
        
        if (isNaN(year) || isNaN(month)) {
          alert('无效的年份或月份参数');
          return;
        }
        
        // 生成账单前先清空之前的数据
        this.monthlyBill = {};
        
        console.log(`生成账单: ${year}年${month}月`);
        const result = await window.electronAPI.getMonthlyBill(year, month);
        
        console.log('月账单获取结果:', result);
        
        if (result.success) {
          // 更新月账单数据
          this.$nextTick(() => {
            this.monthlyBill = result.data;
            console.log('已生成月账单, VPS数量:', result.data['VPS数量'], 
                      '账单行数:', (result.data['账单行'] || []).length,
                      '总费用:', result.data['月总费用']);
                      
            // 再次确认账单年月与选择的年月一致
            if (result.data['年份'] !== year || result.data['月份'] !== month) {
              console.error('账单年月与选择不匹配', result.data, { year, month });
              alert(`警告: 获取的账单年月(${result.data['年份']}年${result.data['月份']}月)与选择的年月(${year}年${month}月)不匹配`);
            }
          });
        } else {
          console.error('生成月账单失败:', result.error);
          alert('生成月账单失败: ' + result.error);
        }
      } catch (error) {
        console.error('生成月账单失败:', error);
        alert('生成月账单失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 加载月账单汇总数据
    async loadMonthlyBillSummary() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        const result = await window.electronAPI.getMonthlyBillSummary();
        
        if (result.success) {
          this.monthlyBillSummary = result.data;
          console.log('已加载月账单汇总:', this.monthlyBillSummary);
        } else {
          console.error('加载月账单汇总失败:', result.error);
        }
      } catch (error) {
        console.error('加载月账单汇总失败:', error);
      }
    },
    
    // 查看指定年月的账单
    async viewMonthBill(year, month) {
      // 清空当前账单数据
      this.monthlyBill = {};
      
      // 设置选中的年月
      this.selectedYear = year;
      this.selectedMonth = month;
      
      // 生成所选年月的账单
      await this.generateMonthlyBill();
    },
    
    // 下载当前显示的月份账单
    async downloadCurrentMonthBill() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        if (!this.monthlyBill || !this.monthlyBill['年份'] || !this.monthlyBill['月份']) {
          alert('请先生成账单再下载');
          return;
        }
        
        const year = this.monthlyBill['年份'];
        const month = this.monthlyBill['月份'];
        
        console.log(`下载${year}年${month}月账单`);
        const result = await window.electronAPI.saveMonthlyBillToExcel(year, month);
        
        if (result.success) {
          alert(`账单已保存到: ${result.filePath}`);
        } else {
          alert('保存账单失败: ' + (result.error || '未知错误'));
        }
      } catch (error) {
        console.error('下载账单失败:', error);
        alert('下载账单失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 下载指定年月的账单
    async downloadMonthBill(year, month) {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        console.log(`下载${year}年${month}月账单`);
        const result = await window.electronAPI.saveMonthlyBillToExcel(year, month);
        
        if (result.success) {
          alert(`账单已保存到: ${result.filePath}`);
        } else {
          alert('保存账单失败: ' + (result.error || '未知错误'));
        }
      } catch (error) {
        console.error('下载账单失败:', error);
        alert('下载账单失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 下载所有历史账单（汇总）
    async downloadAllMonthlyBills() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        console.log('下载所有历史账单汇总');
        const result = await window.electronAPI.saveMonthlyBillingToExcel();
        
        if (result.success) {
          alert(`账单汇总已保存到: ${result.filePath}`);
        } else {
          alert('保存账单汇总失败: ' + (result.error || '未知错误'));
        }
      } catch (error) {
        console.error('下载账单汇总失败:', error);
        alert('下载账单汇总失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 导出Excel格式的月账单统计数据
    async saveMonthlyBillingToExcel() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        const result = await window.electronAPI.saveMonthlyBillingToExcel();
        
        if (result.success) {
          alert(`月账单统计已成功导出到: ${result.filePath}`);
        } else {
          console.error('导出月账单统计失败:', result.error);
          alert('导出月账单统计失败: ' + result.error);
        }
      } catch (error) {
        console.error('导出月账单统计失败:', error);
        alert('导出月账单统计失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 加载VPS数据列表
    async loadVpsDataList() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        const result = await window.electronAPI.getAllVps();
        
        if (result.success) {
          this.vpsDataList = result.data;
          // 更新价格和使用时长
          this.updateVpsPrices();
          console.log('已加载VPS数据列表:', this.vpsDataList);
          
          // 添加以下代码：在加载VPS数据后自动更新月账单统计
          if (this.activeTab === 'monthly-bill') {
            this.generateMonthlyBill();
          }
        } else {
          console.error('加载VPS数据列表失败:', result.error);
        }
      } catch (error) {
        console.error('加载VPS数据列表失败:', error);
      }
    },
    
    // 更新VPS价格和使用时长
    async updateVpsPrices() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        const result = await window.electronAPI.updateVpsPrices();
        
        if (result.success) {
          // 重新加载VPS数据列表
          const refreshResult = await window.electronAPI.getAllVps();
          if (refreshResult.success) {
            this.vpsDataList = refreshResult.data;
            console.log('已更新VPS价格和使用时长:', this.vpsDataList);
          }
        } else {
          console.error('更新VPS价格失败:', result.error);
          alert('更新VPS价格失败: ' + result.error);
        }
      } catch (error) {
        console.error('更新VPS价格失败:', error);
        alert('更新VPS价格失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 编辑VPS
    editVps(vps) {
      // 复制VPS数据到编辑对象，避免直接修改原对象
      this.editingVps = JSON.parse(JSON.stringify(vps));
      
      // 确保日期格式正确
      if (this.editingVps.purchase_date) {
        // 将YYYY/MM/DD格式转换为YYYY-MM-DD
        this.editingVps.purchase_date = this.editingVps.purchase_date.replace(/\//g, '-');
      }
      
      if (this.editingVps.cancel_date) {
        this.editingVps.cancel_date = this.editingVps.cancel_date.replace(/\//g, '-');
      }
      
      // 查找当前编辑的VPS索引
      this.editingVpsIndex = this.vpsDataList.findIndex(item => item.name === vps.name);
      
      // 显示编辑弹窗
      this.showAddVpsModal = true;
    },
    
    // 添加新VPS
    addNewVps() {
      // 重置编辑对象
      this.editingVps = {
        name: '',
        purchase_date: '',
        use_nat: false,
        status: '在用',
        cancel_date: '',
        price_per_month: 20,
        start_date: '',
        total_price: 0,
        usage_period: '',
        ip_address: '',
        country: ''
      };
      
      // 重置编辑索引为-1，表示添加新VPS
      this.editingVpsIndex = -1;
      
      // 显示添加弹窗
      this.showAddVpsModal = true;
    },
    
    // 保存VPS
    async saveVps() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        // 验证表单
        if (!this.editingVps.name) {
          alert('请输入VPS名称');
          return;
        }
        
        if (!this.editingVps.purchase_date) {
          alert('请选择购买日期');
          return;
        }
        
        // 验证购买日期格式
        if (this.editingVps.purchase_date && !this.isValidDateFormat(this.editingVps.purchase_date)) {
          alert('购买日期格式不正确，请使用YYYY-MM-DD或YYYY/MM/DD格式');
          return;
        }
        
        if (this.editingVps.status === '销毁' && !this.editingVps.cancel_date) {
          alert('请选择销毁时间');
          return;
        }
        
        // 验证销毁日期格式
        if (this.editingVps.cancel_date && !this.isValidDateFormat(this.editingVps.cancel_date)) {
          alert('销毁时间格式不正确，请使用YYYY-MM-DD或YYYY/MM/DD格式');
          return;
        }
        
        if (!this.editingVps.price_per_month || this.editingVps.price_per_month <= 0) {
          alert('请输入有效的单价');
          return;
        }
        
        // 确保start_date与purchase_date相同
        this.editingVps.start_date = this.editingVps.purchase_date;
        
        // 将日期格式转换为YYYY/MM/DD
        if (this.editingVps.purchase_date) {
          this.editingVps.purchase_date = this.formatDateToSystem(this.editingVps.purchase_date);
        }
        
        if (this.editingVps.cancel_date) {
          this.editingVps.cancel_date = this.formatDateToSystem(this.editingVps.cancel_date);
        }
        
        if (this.editingVps.start_date) {
          this.editingVps.start_date = this.formatDateToSystem(this.editingVps.start_date);
        }
        
        // 创建一个干净的数据对象，确保所有字段类型正确
        const cleanedVpsData = {
          name: String(this.editingVps.name),
          ip_address: String(this.editingVps.ip_address || ''),
          country: String(this.editingVps.country || ''),
          status: String(this.editingVps.status || '在用'),
          price_per_month: parseFloat(this.editingVps.price_per_month) || 0,
          purchase_date: String(this.editingVps.purchase_date || ''),
          start_date: String(this.editingVps.start_date || ''),
          use_nat: Boolean(this.editingVps.use_nat)
        };
        
        // 只在销毁状态时添加销毁时间
        if (cleanedVpsData.status === '销毁' && this.editingVps.cancel_date) {
          cleanedVpsData.cancel_date = String(this.editingVps.cancel_date);
        }
        
        // 保存VPS数据
        const result = await window.electronAPI.saveVps(cleanedVpsData);
        
        if (result.success) {
          console.log('保存VPS成功:', result.data);
          
          // 更新本地数据
          if (this.editingVpsIndex === -1) {
            // 添加新VPS
            this.vpsDataList.push(result.data);
          } else {
            // 更新现有VPS
            this.vpsDataList[this.editingVpsIndex] = result.data;
          }
          
          // 关闭弹窗
          this.showAddVpsModal = false;
          
          // 重新生成当前月账单
          this.generateMonthlyBill();
          
          // 如果当前在月账单统计页面，同时更新月账单汇总
          if (this.activeTab === 'monthly-bill') {
            this.loadMonthlyBillSummary();
          }
        } else {
          console.error('保存VPS失败:', result.error);
          alert('保存VPS失败: ' + result.error);
        }
      } catch (error) {
        console.error('保存VPS失败:', error);
        alert('保存VPS失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 删除VPS
    async deleteVps(vpsName) {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        if (confirm(`确定要删除VPS "${vpsName}" 吗？`)) {
          const result = await window.electronAPI.deleteVps(vpsName);
          
          if (result.success) {
            console.log('删除VPS成功:', vpsName);
            
            // 更新本地数据
            this.vpsDataList = this.vpsDataList.filter(vps => vps.name !== vpsName);
            
            // 重新生成当前月账单
            this.generateMonthlyBill();
            
            // 如果当前在月账单统计页面，同时更新月账单汇总
            if (this.activeTab === 'monthly-bill') {
              this.loadMonthlyBillSummary();
            }
          } else {
            console.error('删除VPS失败:', result.error);
            alert('删除VPS失败: ' + result.error);
          }
        }
      } catch (error) {
        console.error('删除VPS失败:', error);
        alert('删除VPS失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 关闭VPS编辑弹窗
    closeVpsModal() {
      this.showAddVpsModal = false;
      this.editingVpsIndex = -1;
    },
    
    // 计算VPS总价
    calculateVpsTotal() {
      const total = this.vpsDataList.reduce((sum, vps) => {
        return sum + (parseFloat(vps.total_price) || 0);
      }, 0);
      
      return total.toFixed(2);
    },
    
    // 格式化日期显示
    formatDateForDisplay(dateStr) {
      if (!dateStr) return '-';
      // 将YYYY/MM/DD转换为更友好的显示格式
      return dateStr.replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3');
    },
    
    // 计算VPS使用时长（如果服务器没有提供）
    calculateUsagePeriod(vps) {
      if (!vps || !vps.purchase_date) return '-';
      
      try {
        // 购买日期
        const purchaseDate = new Date(vps.purchase_date.replace(/\//g, '-'));
        
        // 结束日期（如果已销毁则使用销毁日期，否则使用当前日期）
        let endDate;
        if (vps.status === '销毁' && vps.cancel_date) {
          endDate = new Date(vps.cancel_date.replace(/\//g, '-'));
        } else {
          endDate = new Date();
        }
        
        // 计算时间差
        const diffTime = Math.abs(endDate - purchaseDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // 根据天数计算月和日
        const months = Math.floor(diffDays / 30);
        const days = diffDays % 30;
        
        // 格式化输出
        if (months > 0) {
          return `${months}个月${days}天`;
        } else {
          return `${days}天`;
        }
      } catch (error) {
        console.error('计算使用时长失败:', error);
        return '-';
      }
    },
    
    // 验证日期格式是否为YYYY-MM-DD或YYYY/MM/DD
    isValidDateFormat(dateStr) {
      // 支持YYYY-MM-DD和YYYY/MM/DD两种格式
      const regex = /^(\d{4})([-\/])(\d{1,2})\2(\d{1,2})$/;
      if (!regex.test(dateStr)) {
        return false;
      }
      
      // 验证日期有效性
      const parts = dateStr.split(/[-\/]/);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      
      // 检查月和日的有效范围
      if (month < 1 || month > 12) return false;
      
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day < 1 || day > daysInMonth) return false;
      
      return true;
    },
    
    // 将日期格式转换为系统使用的YYYY/MM/DD格式
    formatDateToSystem(dateStr) {
      if (!dateStr) return '';
      
      // 如果已经是YYYY/MM/DD格式，直接返回
      if (dateStr.includes('/')) {
        // 确保月和日是两位数
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const year = parts[0];
          let month = parts[1];
          let day = parts[2];
          
          if (month.length === 1) month = '0' + month;
          if (day.length === 1) day = '0' + day;
          
          return `${year}/${month}/${day}`;
        }
        return dateStr;
      }
      
      // 将YYYY-MM-DD转换为YYYY/MM/DD
      return dateStr.replace(/-/g, '/');
    },
    
    // 格式化日期为YYYY-MM-DD
    formatDate(date) {
      const d = new Date(date);
      let month = '' + (d.getMonth() + 1);
      let day = '' + d.getDate();
      const year = d.getFullYear();
      
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      
      return [year, month, day].join('-');
    },
    
    // 初始化示例数据
    async initSampleData() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        if (confirm('确定要初始化示例数据吗？这将清除现有的VPS数据。')) {
          const result = await window.electronAPI.initSampleVpsData();
          
          if (result.success) {
            console.log('初始化示例数据成功');
            
            // 重新加载VPS数据
            this.loadVpsDataList();
            
            // 重新生成当前月账单
            this.generateMonthlyBill();
          } else {
            console.error('初始化示例数据失败:', result.error);
            alert('初始化示例数据失败: ' + result.error);
          }
        }
      } catch (error) {
        console.error('初始化示例数据失败:', error);
        alert('初始化示例数据失败: ' + (error.message || '未知错误'));
      }
    },
    
    async testBatchConnections() {
      // 验证输入
      if (this.batchServers.length === 0) {
        alert('请至少添加一条服务器数据');
        return;
      }
      
      // 验证每一行数据
      for (let i = 0; i < this.batchServers.length; i++) {
        const server = this.batchServers[i];
        
        // 检查必填字段
        if (!server.name || !server.host || !server.username || 
            (server.authType === 'password' && !server.password) ||
            (server.authType === 'privateKey' && !server.privateKeyPath)) {
          alert(`第 ${i+1} 行数据不完整，请检查`);
          return;
        }
      }
      
      // 测试连接
      this.batchResults = [];
      
      for (const server of this.batchServers) {
        // 创建临时服务器对象
        const tempServer = {
          id: generateId(),
          name: server.name,
          host: server.host,
          port: parseInt(server.port) || 22,
          username: server.username
        };
        
        if (server.authType === 'password') {
          tempServer.password = server.password;
        } else {
          tempServer.privateKeyPath = server.privateKeyPath;
        }
        
        try {
          // 保存临时服务器
          const saveResult = await window.electronAPI.saveServer(tempServer);
          
          if (!saveResult.success) {
            this.batchResults.push({
              name: server.name,
              success: false,
              message: `保存服务器失败: ${saveResult.error || '未知错误'}`
            });
            continue;
          }
          
          // 测试连接
          const testResult = await window.electronAPI.testSSHConnection(tempServer.id);
          
          if (testResult.success) {
            this.batchResults.push({
              name: server.name,
              success: true,
              message: '连接成功'
            });
          } else {
            this.batchResults.push({
              name: server.name,
              success: false,
              message: `连接失败: ${testResult.error || '未知错误'}`
            });
          }
          
          // 删除临时服务器
          await window.electronAPI.deleteServer(tempServer.id);
        } catch (error) {
          this.batchResults.push({
            name: server.name,
            success: false,
            message: `测试失败: ${error.message || '未知错误'}`
          });
        }
      }
    },
    
    async batchDeploy() {
      try {
        if (!window.electronAPI) {
          throw new Error('electronAPI未定义');
        }
        
        // 验证输入
        if (this.batchServers.length === 0) {
          alert('请至少添加一条服务器数据');
          return;
        }
        
        if (!confirm(`确定要对 ${this.batchServers.length} 台服务器批量部署Wireguard吗？`)) {
          return;
        }
        
        // 验证每一行数据并部署
        this.batchResults = [];
        
        for (const server of this.batchServers) {
          // 检查必填字段
          if (!server.name || !server.host || !server.username || 
              (server.authType === 'password' && !server.password) ||
              (server.authType === 'privateKey' && !server.privateKeyPath)) {
            this.batchResults.push({
              name: server.name || '未命名服务器',
              success: false,
              message: '服务器数据不完整，请检查'
            });
            continue;
          }
          
          // 创建临时服务器对象
          const tempServer = {
            id: generateId(),
            name: server.name,
            host: server.host,
            port: parseInt(server.port) || 22,
            username: server.username
          };
          
          if (server.authType === 'password') {
            tempServer.password = server.password;
          } else {
            tempServer.privateKeyPath = server.privateKeyPath;
          }
          
          try {
            // 保存临时服务器
            const saveResult = await window.electronAPI.saveServer(tempServer);
            
            if (!saveResult.success) {
              this.batchResults.push({
                name: server.name,
                success: false,
                message: `保存服务器失败: ${saveResult.error || '未知错误'}`
              });
              continue;
            }
            
            // 部署Wireguard
            const deployResult = await window.electronAPI.deployWireguard(tempServer.id);
            
            if (deployResult.success) {
              this.batchResults.push({
                name: server.name,
                success: true,
                message: 'Wireguard部署成功'
              });
              
              // 添加服务器到列表（永久保存）
              this.servers.push(tempServer);
              
              // 初始化新服务器的连接状态
              this.connectionStatus[tempServer.id] = 'disconnected';
            } else {
              // 删除临时服务器
              await window.electronAPI.deleteServer(tempServer.id);
              
              this.batchResults.push({
                name: server.name,
                success: false,
                message: `Wireguard部署失败: ${deployResult.error || '未知错误'}`
              });
            }
          } catch (error) {
            this.batchResults.push({
              name: server.name,
              success: false,
              message: `操作失败: ${error.message || '未知错误'}`
            });
          }
        }
        
        // 如果全部成功，清空表格
        const allSuccess = this.batchResults.every(result => result.success);
        if (allSuccess) {
          this.batchServers = [];
        }
      } catch (error) {
        console.error('批量部署失败:', error);
        alert('批量部署失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 打开添加服务器对话框
    openAddServerModal() {
      // 重置表单
      this.newServer = {
        name: '',
        host: '',
        port: 22,
        username: 'root',
        password: '',
        privateKeyPath: '',
        passphrase: ''
      };
      
      // 重置批量添加相关数据
      this.useBatchMode = false;
      this.batchServers = [{
        name: '',
        host: '',
        port: 22,
        username: 'root',
        authType: 'password',
        password: '',
        privateKeyPath: ''
      }];
      this.batchResults = [];
      
      this.showAddServerModal = true;
    },
    
    // IP地址检测功能
    async detectIpLocation(ip, batchIndex) {
      if (!ip) {
        alert('请输入IP地址');
        return;
      }
      
      try {
        // 显示加载中
        this.isDetectingIp = true;
        
        // 使用ip-api.com API获取IP地理位置信息（支持中文输出）
        const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
        const data = await response.json();
        
        if (data.status === 'success') {
          // 根据当前的模式返回国家和城市信息
          let locationInfo = data.country;
          if (data.city) {
            locationInfo += ` ${data.city}`;
          }
          if (data.regionName && data.regionName !== data.city) {
            locationInfo += ` ${data.regionName}`;
          }
          
          // 根据当前模式设置不同的字段
          if (this.showAddServerModal) {
            // 当前在添加服务器界面
            this.newServer.host = ip;
            if (this.useBatchMode) {
              // 批量模式下最后一个输入的IP
              const lastIndex = this.batchServers.length - 1;
              if (lastIndex >= 0) {
                this.batchServers[lastIndex].host = ip;
              }
            }
          } else if (this.showAddVpsModal) {
            // 当前在添加VPS界面
            this.editingVps.ip_address = ip;
            this.editingVps.country = locationInfo;
          } else if (this.showBatchAddVpsModal) {
            // 当前在批量添加VPS界面
            if (batchIndex !== undefined) {
              // 使用传入的批量添加行索引
              if (batchIndex >= 0 && batchIndex < this.batchVpsList.length) {
                this.batchVpsList[batchIndex].ip_address = ip;
                this.batchVpsList[batchIndex].country = locationInfo;
              }
            } else {
              // 兼容旧逻辑，使用最后一行（不推荐）
              const lastIndex = this.batchVpsList.length - 1;
              if (lastIndex >= 0) {
                this.batchVpsList[lastIndex].ip_address = ip;
                this.batchVpsList[lastIndex].country = locationInfo;
              }
            }
          }
          
          return locationInfo;
        } else {
          throw new Error(data.message || '无法获取IP地址信息');
        }
      } catch (error) {
        console.error('IP检测失败:', error);
        alert('IP检测失败: ' + (error.message || '未知错误'));
        return null;
      } finally {
        this.isDetectingIp = false;
      }
    },
    
    // 在添加服务器模态框中检测IP
    async detectServerIp() {
      const ip = this.newServer.host;
      if (!ip) {
        this.showNotification('请输入IP地址', 'warning');
        return;
      }
      
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        this.showNotification(`IP地理位置: ${locationInfo}`, 'success');
        // 将地理位置信息保存到服务器对象中
        this.newServer.ipLocation = locationInfo;
      }
    },
    
    // 在批量添加服务器中检测行IP
    async detectBatchServerIp(index) {
      if (!this.batchServers[index] || !this.batchServers[index].host) {
        this.showNotification('请输入IP地址', 'warning');
        return;
      }
      
      const ip = this.batchServers[index].host;
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        this.showNotification(`IP地理位置: ${locationInfo}`, 'success');
        // 将地理位置信息保存到服务器对象中
        this.batchServers[index].ipLocation = locationInfo;
      }
    },
    
    // 在添加VPS界面中检测IP
    async detectVpsIp() {
      const ip = this.editingVps.ip_address;
      if (!ip) {
        this.showNotification('请输入IP地址', 'warning');
        return;
      }
      
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        this.editingVps.country = locationInfo;
        this.showNotification(`IP地理位置: ${locationInfo}`, 'success');
      }
    },
    
    // 在批量添加VPS界面中检测IP
    async detectBatchVpsIp(index) {
      if (!this.batchVpsList[index] || !this.batchVpsList[index].ip_address) {
        this.showNotification('请输入IP地址', 'warning');
        return;
      }
      
      const ip = this.batchVpsList[index].ip_address;
      const locationInfo = await this.detectIpLocation(ip, index);
      if (locationInfo) {
        this.batchVpsList[index].country = locationInfo;
        this.showNotification(`IP地理位置: ${locationInfo}`, 'success');
      }
    },
    
    // 检测已有服务器的IP地址
    async detectExistingServerIp(server) {
      if (!server || !server.host) {
        this.showNotification('服务器IP地址不存在', 'warning');
        return;
      }
      
      const ip = server.host;
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        // 直接将地理位置信息保存到服务器对象中，不弹窗
        server.ipLocation = locationInfo;
        
        // 确保Vue能够检测到这个变更
        this.servers = [...this.servers];
        
        this.showNotification(`IP地理位置: ${locationInfo}`, 'success');
      }
    },
    
    // 批量添加VPS
    async batchAddVps() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        
        // 初始化批量添加VPS列表
        this.batchVpsList = [this.createEmptyBatchRow()];
        
        // 显示批量添加VPS的模态框
        this.showBatchAddVpsModal = true;
      } catch (error) {
        console.error('打开批量添加VPS模态框失败:', error);
        alert('打开批量添加VPS模态框失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 创建一个空的批量添加行
    createEmptyBatchRow() {
      return {
        name: '',
        purchase_date: '',
        use_nat: false,
        status: '在用',
        cancel_date: '',
        price_per_month: 20,
        ip_address: '',
        country: ''
      };
    },
    
    // 添加新行
    addBatchRow() {
      this.batchVpsList.push(this.createEmptyBatchRow());
    },
    
    // 删除行
    removeBatchItem(index) {
      if (this.batchVpsList.length > 1) {
        this.batchVpsList.splice(index, 1);
      } else {
        alert('至少保留一行数据');
      }
    },
    
    // 处理表格形式批量添加VPS
    async processBatchTableVps() {
      try {
        // 验证输入
        if (this.batchVpsList.length === 0) {
          alert('请至少添加一条VPS数据');
          return;
        }
        
        // 验证每一行数据
        const validatedList = [];
        let hasErrors = false;
        
        for (let i = 0; i < this.batchVpsList.length; i++) {
          const item = this.batchVpsList[i];
          
          // 检查必填字段
          if (!item.name) {
            alert(`第 ${i+1} 行的VPS名称不能为空`);
            hasErrors = true;
            break;
          }
          
          if (!item.purchase_date) {
            alert(`第 ${i+1} 行的购买日期不能为空`);
            hasErrors = true;
            break;
          }
          
          // 验证购买日期格式
          if (item.purchase_date && !this.isValidDateFormat(item.purchase_date)) {
            alert(`第 ${i+1} 行的购买日期格式不正确，请使用YYYY-MM-DD或YYYY/MM/DD格式`);
            hasErrors = true;
            break;
          }
          
          if (item.status === '销毁' && !item.cancel_date) {
            alert(`第 ${i+1} 行的状态为销毁，但未填写销毁时间`);
            hasErrors = true;
            break;
          }
          
          // 验证销毁日期格式
          if (item.cancel_date && !this.isValidDateFormat(item.cancel_date)) {
            alert(`第 ${i+1} 行的销毁时间格式不正确，请使用YYYY-MM-DD或YYYY/MM/DD格式`);
            hasErrors = true;
            break;
          }
          
          if (!item.price_per_month || item.price_per_month <= 0) {
            alert(`第 ${i+1} 行的单价必须大于0`);
            hasErrors = true;
            break;
          }
          
          // 创建新的VPS对象
          const vpsItem = {
            name: item.name,
            purchase_date: this.formatDateToSystem(item.purchase_date),  // 转换日期格式为 YYYY/MM/DD
            start_date: this.formatDateToSystem(item.purchase_date),     // 设置start_date与purchase_date相同
            use_nat: item.use_nat,
            status: item.status,
            price_per_month: parseFloat(item.price_per_month),
            ip_address: item.ip_address || '',
            country: item.country || ''
          };
          
          // 如果状态为销毁且有销毁时间，添加cancel_date
          if (item.status === '销毁' && item.cancel_date) {
            vpsItem.cancel_date = this.formatDateToSystem(item.cancel_date);  // 转换日期格式
          }
          
          validatedList.push(vpsItem);
        }
        
        if (hasErrors) {
          return;
        }
        
        // 确认是否继续
        if (confirm(`确定要批量添加 ${validatedList.length} 台VPS吗？`)) {
          const result = await window.electronAPI.batchAddVps(validatedList);
          
          if (result && result.success) {
            console.log('批量添加VPS成功');
            alert(`批量添加VPS成功!\n已添加: ${result.added}台\n失败: ${result.failed}台\n${result.errors && result.errors.length > 0 ? '错误: ' + result.errors.join('\n') : ''}`);
            
            // 关闭模态框
            this.showBatchAddVpsModal = false;
            
            // 清空表格
            this.batchVpsList = [this.createEmptyBatchRow()];
            
            // 重新加载VPS数据
            this.loadVpsDataList();
            
            // 重新生成当前月账单
            this.generateMonthlyBill();
          } else {
            console.error('批量添加VPS失败:', result.message || result.error);
            alert('批量添加VPS失败: ' + (result.message || result.error || '未知错误'));
          }
        }
      } catch (error) {
        console.error('批量添加VPS失败:', error);
        alert('批量添加VPS失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 添加loadWireguardInstances方法如果不存在，并更新其实现
    async loadWireguardInstances() {
      if (!this.wireguardSelectedServer) return;
      
      try {
        this.wireguardLoading = true;
        this.wireguardInstances = [];
        this.wireguardInstanceDetails = null;
        this.wireguardSelectedInstance = '';
        // 清除所有相关状态，确保切换VPS后不会显示前一个VPS的配置
        this.viewingPeer = null;
        this.viewPeerQrCode = null;
        this.peerResult = null;
        
        const result = await window.electronAPI.getWireguardInstances(this.wireguardSelectedServer);
        console.log('Wireguard实例列表:', result);
        
        if (result.success) {
          this.wireguardInstances = result.instances || [];
          
          // 如果只有一个实例，自动选择它
          if (this.wireguardInstances.length === 1) {
            this.wireguardSelectedInstance = this.wireguardInstances[0];
            await this.loadInstanceDetails();
          }
        } else {
          console.error('获取Wireguard实例失败:', result.error);
          alert('获取Wireguard实例失败: ' + result.error);
        }
      } catch (error) {
        console.error('加载Wireguard实例列表失败:', error);
        alert('加载Wireguard实例列表失败: ' + (error.message || '未知错误'));
      } finally {
        this.wireguardLoading = false;
      }
    },
    
    // 添加强制同步Wireguard配置的方法
    async forceSyncWireguardConfig() {
      if (!this.wireguardSelectedServer) {
        alert('请先选择服务器');
        return;
      }
      
      try {
        this.isRefreshingWireguard = true;
        console.log('开始强制同步Wireguard配置...');
        
        // 调用主进程的强制同步方法
        const result = await window.electronAPI.forceSyncWireguardConfigs(this.wireguardSelectedServer);
        
        if (result.success) {
          console.log('强制同步成功:', result);
          this.wireguardInstances = result.instances || [];
          
          // 如果只有一个实例，自动选择它
          if (this.wireguardInstances.length === 1) {
            this.wireguardSelectedInstance = this.wireguardInstances[0];
            await this.loadInstanceDetails();
          }
          
          alert('已成功同步Wireguard配置');
        } else {
          console.error('强制同步失败:', result.error);
          alert('强制同步Wireguard配置失败: ' + result.error);
          
          // 强制同步失败后尝试普通刷新
          await this.loadWireguardInstances();
        }
      } catch (error) {
        console.error('强制同步Wireguard配置出错:', error);
        alert('强制同步Wireguard配置出错: ' + (error.message || '未知错误'));
      } finally {
        this.isRefreshingWireguard = false;
      }
    },
    
    // 添加loadInstanceDetails方法
    async loadInstanceDetails() {
      if (!this.wireguardSelectedServer || !this.wireguardSelectedInstance) {
        return;
      }
      
      try {
        this.wireguardLoading = true;
        this.wireguardInstanceDetails = null; // 清除之前的实例详情
        this.viewingPeer = null;
        this.viewPeerQrCode = null;
        this.peerResult = null;
        
        console.log(`加载Wireguard实例[${this.wireguardSelectedInstance}]详情...`);
        
        const result = await window.electronAPI.getWireguardInstanceDetails(
          this.wireguardSelectedServer,
          this.wireguardSelectedInstance
        );
        
        console.log('加载实例详情结果:', result);
        
        if (result.success) {
          // 完全替换详情对象，确保端口映射范围等数据被更新
          this.wireguardInstanceDetails = JSON.parse(JSON.stringify(result.details));
          console.log('实例详情加载成功:', JSON.stringify(this.wireguardInstanceDetails, null, 2));
          console.log('端口映射范围:', this.wireguardInstanceDetails.portMappingRange);
          
          // 检查是否有peer配置
          if (result.details.peers && result.details.peers.length > 0) {
            console.log(`成功加载${result.details.peers.length}个peer配置`);
          } else {
            console.log('没有找到peer配置，尝试强制同步配置');
            // 如果没有peer，可以自动尝试强制同步一次
            const syncResult = await window.electronAPI.forceSyncWireguardConfigs(this.wireguardSelectedServer);
            if (syncResult.success) {
              console.log('强制同步成功，重新加载实例详情');
              // 重新加载实例详情
              const refreshResult = await window.electronAPI.getWireguardInstanceDetails(
                this.wireguardSelectedServer,
                this.wireguardSelectedInstance
              );
              if (refreshResult.success) {
                this.wireguardInstanceDetails = JSON.parse(JSON.stringify(refreshResult.details));
                console.log('重新加载实例详情成功:', refreshResult.details);
                console.log('更新后的端口映射范围:', this.wireguardInstanceDetails.portMappingRange);
              }
            }
          }
        } else {
          console.error('加载实例详情失败:', result.error);
          alert('加载Wireguard实例详情失败: ' + result.error);
        }
      } catch (error) {
        console.error('加载实例详情异常:', error);
        alert('加载Wireguard实例详情失败: ' + (error.message || '未知错误'));
      } finally {
        this.wireguardLoading = false;
      }
    },
    
    // 查看Peer配置
    async viewPeerConfig(peer) {
      if (!peer) return;
      
      try {
        console.log(`查看Peer ${peer.number} 配置:`, peer);
        this.viewingPeer = peer;
        
        // 生成二维码
        if (peer.config) {
          const qrResult = await window.electronAPI.generateQRCode(peer.config);
          if (qrResult.success) {
            this.viewPeerQrCode = qrResult.qrCodeImage;
          } else {
            console.error('生成二维码失败:', qrResult.error);
          }
        } else {
          console.error('配置内容为空，无法生成二维码');
        }
      } catch (error) {
        console.error('查看Peer配置失败:', error);
        alert('查看Peer配置失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 导出Peer配置
    async exportPeerConfig(peer) {
      if (!peer) return;
      
      try {
        console.log(`导出Peer ${peer.number} 配置:`, peer);
        
        if (!peer.config) {
          alert('配置内容为空，无法导出');
          return;
        }
        
        // 调用主进程导出配置
        const result = await window.electronAPI.exportWireguardConfig(peer.config, `wg-peer${peer.number}.conf`);
        
        if (result.success) {
          this.showNotification(`Peer ${peer.number} 配置文件已导出到: ${result.filePath}`, 'success');
        } else {
          this.showNotification(`导出失败: ${result.error}`, 'error');
        }
      } catch (error) {
        console.error('导出Peer配置失败:', error);
        this.showNotification('导出Peer配置失败: ' + (error.message || '未知错误'), 'error');
      }
    },
    
    // 添加Peer节点
    async addPeer() {
      if (!this.wireguardSelectedServer || !this.wireguardSelectedInstance) {
        alert('请先选择服务器和Wireguard实例');
        return;
      }
      
      try {
        this.addingPeer = true;
        console.log(`为服务器[${this.wireguardSelectedServer}]的Wireguard实例[${this.wireguardSelectedInstance}]添加Peer`);
        
        const result = await window.electronAPI.addWireguardPeer(
          this.wireguardSelectedServer,
          this.wireguardSelectedInstance
        );
        
        console.log('添加Peer结果:', result);
        
        this.peerResult = result;
        
        if (result.success) {
          // 如果返回了配置但没有二维码，生成二维码
          if (result.peer && result.peer.config && !result.qrCode) {
            try {
              const qrResult = await window.electronAPI.generateQRCode(result.peer.config);
              if (qrResult.success) {
                this.peerResult.qrCode = qrResult.qrCodeImage;
              }
            } catch (qrError) {
              console.error('生成二维码失败:', qrError);
            }
          }
          
          // 重新加载实例详情
          this.loadInstanceDetails();
        }
      } catch (error) {
        console.error('添加Peer失败:', error);
        this.peerResult = {
          success: false,
          error: error.message || '未知错误'
        };
      } finally {
        this.addingPeer = false;
      }
    },
    
    // 删除Peer节点
    async deletePeer(peerNumber) {
      if (!this.wireguardSelectedServer || !this.wireguardSelectedInstance) {
        alert('请先选择服务器和Wireguard实例');
        return;
      }
      
      if (!confirm(`确定要删除Peer ${peerNumber} 吗？此操作不可撤销。`)) {
        return;
      }
      
      try {
        console.log(`删除服务器[${this.wireguardSelectedServer}]的Wireguard实例[${this.wireguardSelectedInstance}]的Peer ${peerNumber}`);
        
        const result = await window.electronAPI.deleteWireguardPeer(
          this.wireguardSelectedServer,
          this.wireguardSelectedInstance,
          peerNumber
        );
        
        console.log('删除Peer结果:', result);
        
        if (result.success) {
          alert(`成功删除Peer ${peerNumber}`);
          // 重新加载实例详情以更新Peer列表
          this.loadInstanceDetails();
        } else {
          alert(`删除Peer失败: ${result.error}`);
        }
      } catch (error) {
        console.error('删除Peer失败:', error);
        alert(`删除Peer失败: ${error.message || '未知错误'}`);
      }
    },
    
    // Wireguard peer管理相关方法
    async deployWireguard(serverId) {
      if (!serverId) return;
      
      try {
        this.isDeploying = true;
        this.deployingServerId = serverId;
        this.wireguardResult = null;
        this.deployProgress = { percent: 0, message: '准备部署Wireguard...' };
        
        const result = await window.electronAPI.deployWireguard(serverId);
        console.log('Wireguard部署结果:', result);
        
        this.wireguardResult = result;
        
        if (result.success && result.clientConfigs && result.clientConfigs.length > 0) {
          this.clientConfigs = result.clientConfigs;
          this.showConfigFile(0);
        }
        
        // 刷新实例列表
        if (result.success) {
          await this.loadWireguardInstances();
          
          // 处理警告信息
          if (result.warning) {
            // 显示成功但有警告的消息
            alert(`Wireguard重新部署状态: ${result.warning}`);
          } else {
            alert('Wireguard已自动重新部署完成！\n\n✅ 已清理旧配置\n✅ 已重新生成IPv4配置\n✅ 已覆盖现有配置');
          }
        } else {
          // 显示错误信息
          alert(`Wireguard重新部署失败: ${result.error || '未知错误'}\n可能仍在后台部署中，请稍后通过SSH终端检查。`);
        }
      } catch (error) {
        console.error('部署Wireguard失败:', error);
        this.wireguardResult = {
          success: false,
          error: error.message || '未知错误'
        };
        alert(`部署过程中发生错误: ${error.message || '未知错误'}\n这可能是临时性问题，请稍后通过SSH终端检查部署状态。`);
      } finally {
        this.isDeploying = false;
      }
    },
  }
}).mount('#app');