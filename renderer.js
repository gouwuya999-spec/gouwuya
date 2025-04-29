const { createApp } = Vue;

// 生成随机ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

createApp({
  data() {
    return {
      servers: [],
      vpsDataList: [],
      connectingServer: null,
      newServer: {
        name: '',
        host: '',
        port: '22',
        username: 'root',
        password: '',
        privateKeyPath: '',
        passphrase: ''
      },
      editingServer: null,
      editingServerIndex: -1,
      showAddServerModal: false,
      showSSHTerminal: false,
      commandHistory: [],
      commandHistoryIndex: -1,
      terminalCommand: '',
      terminalOutput: '',
      currentServerId: null,
      currentServerName: '',
      activeConnection: null,
      appVersion: '',
      isSupportingPrivateKey: false,
      showQRCodeModal: false,
      currentQRCode: '',
      wireguardConfigTitle: '',
      configContent: '',
      configFile: '',
      showConfigModal: false,
      activeTab: 'servers',
      availableYears: [],
      currentYear: new Date().getFullYear(),
      monthlyBill: {},
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1, // 当前月份
      monthlyBillSummary: [],
      editingVps: {
        name: '',
        purchase_date: '',
        use_nat: false,
        status: '在用',
        cancel_date: '',
        price_per_month: 20
      },
      showAddVpsModal: false,
      editingVpsIndex: -1,
      useBatchMode: false,
      batchServers: [],
      isAddingBatchServers: false,
      wireguardInstances: [],
      selectedInstanceName: '',
      instanceDetails: null,
      batchVpsList: [],
      isDetectingIp: false,
      addNatStats: true, // 新增NAT统计表格选项，默认为true
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
    if (this.activeTab === 'monthly-billing') {
      this.loadMonthlyBillSummary();
    }
    
    // 加载VPS数据列表
    this.loadVpsDataList();
    
    // 设置接收Wireguard部署进度的事件处理
    if (window.electronAPI && window.electronAPI.onWireguardDeployProgress) {
      window.electronAPI.onWireguardDeployProgress((data) => {
        if (data.serverId === this.deployingServerId) {
          this.deployProgress = {
            percent: data.percent,
            message: data.message
          };
        }
      });
    }
  },
  
  methods: {
    // 格式化日期为显示格式 (YYYY/MM/DD)
    formatDateForDisplay(dateStr) {
      if (!dateStr) return '';
      // 同时支持横杠和斜杠格式的输入，输出统一为斜杠格式
      return dateStr.replace(/-/g, '/');
    },
    
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
    
    // 刷新系统数据
    async refreshData() {
      console.log('刷新系统数据');
      try {
        // 设置刷新状态为true，激活动画
        this.isRefreshing = true;
        
        // 显示加载中的提示
        this.showNotification('正在刷新数据...', 'info');
        
        // 根据当前活动的标签页刷新不同的数据
        if (this.activeTab === 'servers') {
          // 刷新服务器列表
          await this.loadServers();
        } else if (this.activeTab === 'wireguard') {
          // 刷新Wireguard实例
          await this.loadWireguardInstances();
          if (this.wireguardSelectedServer && this.wireguardSelectedInstance) {
            await this.loadInstanceDetails();
          }
        } else if (this.activeTab === 'monthly-billing') {
          // 刷新月账单数据
          await this.loadMonthlyBillSummary();
          await this.getCurrentMonthBill();
        }
        
        // 刷新VPS数据列表 (无论在哪个标签页都可能需要)
        await this.loadVpsDataList();
        
        // 显示刷新成功的提示
        this.showNotification('数据刷新成功！', 'success');
      } catch (error) {
        console.error('刷新数据失败:', error);
        this.showNotification('刷新数据失败: ' + (error.message || '未知错误'), 'error');
      } finally {
        // 无论成功或失败，最后都需要重置刷新状态
        setTimeout(() => {
          this.isRefreshing = false;
        }, 500); // 延迟500ms后停止动画，让用户看到完整的旋转
      }
    },
    
    // 显示通知消息
    showNotification(message, type = 'info') {
      this.notification = {
        message,
        type,
        show: true
      };
      
      // 3秒后自动关闭通知
      setTimeout(() => {
        this.notification.show = false;
      }, 3000);
    },
    
    // 加载已保存的服务器列表
    async loadServers() {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI未定义');
          return;
        }
        this.servers = await window.electronAPI.getServers();
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
          await window.electronAPI.deleteServer(id);
          this.servers = this.servers.filter(server => server.id !== id);
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
    
    // 连接服务器
    async connectServer(server) {
      try {
        this.showSSHTerminalModal = true;
        // 清空上一个连接的配置相关数据
        this.clientConfigs = [];
        this.foundConfigFiles = [];
        this.currentConfigIndex = -1;
        this.configContent = '';
        this.qrCodeImage = null;
        this.showConfigContent = false;
        this.wireguardResult = null;
        
        this.currentConnectedServer = server;
        this.sshOutput = `正在连接到 ${server.name} (${server.host})...\n`;
        
        const result = await window.electronAPI.openSSHTerminal(server.id);
        
        if (result.success) {
          this.sshOutput += `已连接到 ${server.host}\n`;
          
          // 自动检查Wireguard状态
          try {
            const wireguardResult = await window.electronAPI.executeWireguardScript(server.id);
            if (wireguardResult.success) {
              this.sshOutput += `\n> Wireguard状态检查:\n${wireguardResult.output}\n`;
              
              // 如果有发现客户端配置文件，显示它们
              if (wireguardResult.clientConfigs && wireguardResult.clientConfigs.length > 0) {
                this.clientConfigs = wireguardResult.clientConfigs;
                this.showConfigContent = true;
                
                // 为第一个配置生成二维码
                await this.generateQRCodeFromConfig(wireguardResult.clientConfigs[0].content);
                
                // 显示找到配置的提示
                this.sshOutput += `\n已找到 ${wireguardResult.clientConfigs.length} 个客户端配置文件。\n`;
                this.sshOutput += `您可以使用界面上的"查找配置"按钮查看所有配置文件并生成二维码。\n`;
              }
            }
          } catch (wireguardError) {
            console.error('Wireguard状态检查失败:', wireguardError);
            this.sshOutput += `\n> Wireguard状态检查失败: ${wireguardError.message || '未知错误'}\n`;
          }
        } else {
          this.sshOutput += `连接失败: ${result.error}\n`;
        }
      } catch (error) {
        console.error('连接服务器失败:', error);
        this.sshOutput += `连接失败: ${error.message || '未知错误'}\n`;
      }
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
      
      this.sshOutput += `> 正在执行Wireguard部署...\n`;
      
      try {
        const result = await window.electronAPI.executeWireguardScript(this.currentConnectedServer.id);
        
        if (result.success) {
          this.sshOutput += `Wireguard部署已准备就绪!\n\n`;
          
          if (result.output) {
            this.sshOutput += result.output + '\n';
          }
          
          this.sshOutput += `\nWireguard已经自动部署完成，配置文件保存在/root/VPS配置WG/目录下。\n`;
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
        this.isDeploying = true;
        this.wireguardResult = null;
        this.qrCodeImage = null;
        this.clientConfigs = [];
        
        // 保存当前部署的服务器ID，用于进度更新
        this.deployingServerId = server.id;
        
        // 重置进度
        this.deployProgress = {
          percent: 0,
          message: '准备部署...'
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
          
          alert('Wireguard已自动部署完成！');
        }
      } catch (error) {
        console.error('部署Wireguard失败:', error);
        this.wireguardResult = {
          success: false,
          error: error.message || '未知错误'
        };
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
    
    // 从终端输出中提取配置并生成二维码
    async generateQRFromTerminal() {
      try {
        // 尝试从终端输出中提取WireGuard配置
        const terminalOutput = this.sshOutput;
        
        // 使用正则表达式查找可能的WireGuard配置段落
        const configRegex = /\[Interface\][\s\S]*?PrivateKey[\s\S]*?Address[\s\S]*?\[Peer\][\s\S]*?PublicKey[\s\S]*?AllowedIPs[\s\S]*?(Endpoint|PersistentKeepalive)/;
        const match = terminalOutput.match(configRegex);
        
        if (match && match[0]) {
          const configData = match[0];
          console.log('从终端输出中提取到WireGuard配置');
          
          // 如果是新配置，将其添加到foundConfigFiles中
          this.configContent = configData;
          if (this.foundConfigFiles.length === 0) {
            this.foundConfigFiles = ['从终端提取的配置'];
            this.currentConfigIndex = 0;
          }
          
          // 显示配置区域
          this.showConfigContent = true;
          
          // 从提取到的配置生成二维码
          await this.generateQRCodeFromConfig(configData);
        } else {
          this.sshOutput += '\n未能从终端输出中提取WireGuard配置。请先查看配置文件，例如使用命令:\ncat /etc/wireguard/wg0_client.conf\n';
        }
      } catch (error) {
        console.error('从终端提取配置失败:', error);
        this.sshOutput += `\n生成二维码失败: ${error.message || '未知错误'}\n`;
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
        // 使用执行Wireguard脚本函数获取所有客户端配置
        const wireguardResult = await window.electronAPI.executeWireguardScript(this.currentConnectedServer.id);
        
        if (wireguardResult.success && wireguardResult.clientConfigs && wireguardResult.clientConfigs.length > 0) {
          this.sshOutput += `找到 ${wireguardResult.clientConfigs.length} 个客户端配置文件:\n`;
          
          // 保存所有配置文件
          this.clientConfigs = wireguardResult.clientConfigs;
          this.foundConfigFiles = wireguardResult.clientConfigs.map(config => config.path);
          
          // 显示第一个配置文件
          await this.showConfigFile(0);
          return;
        }
        
        // 如果上面的方法找不到配置，继续使用原来的方法查找
        // 首先尝试直接查找客户端配置文件（明确包含client关键字的）
        const clientSearchCommand = {
          serverId: this.currentConnectedServer.id,
          command: 'find /etc/wireguard -name "*client*.conf" -o -name "wg[0-9]*_client.conf" -o -name "peer*.conf" -o -name "wg[0-9]*-peer[0-9]*-client.conf" 2>/dev/null || echo "未找到客户端配置文件"'
        };
        
        const clientResult = await window.electronAPI.executeSSHCommand(clientSearchCommand);
        
        if (clientResult.success && clientResult.stdout && !clientResult.stdout.includes("未找到客户端配置文件")) {
          this.sshOutput += `找到以下客户端配置文件:\n${clientResult.stdout}\n`;
          
          // 获取找到的所有配置文件路径
          const configFiles = clientResult.stdout.split('\n').filter(line => line.trim() !== '');
          if (configFiles.length > 0) {
            // 存储找到的配置文件
            this.foundConfigFiles = configFiles;
            
            // 读取所有配置内容
            for (const configPath of configFiles) {
              const catCommand = {
                serverId: this.currentConnectedServer.id,
                command: `cat "${configPath}"`
              };
              
              const contentResult = await window.electronAPI.executeSSHCommand(catCommand);
              if (contentResult.success && contentResult.stdout) {
                this.clientConfigs.push({
                  path: configPath,
                  name: configPath.split('/').pop(),
                  content: contentResult.stdout
                });
              }
            }
            
            // 显示第一个配置文件
            await this.showConfigFile(0);
            return;
          }
        }
        
        // 以下是原来的代码，继续执行其他查找逻辑...
        
        // ... existing code ...
      } catch (error) {
        console.error('查找Wireguard配置失败:', error);
        this.sshOutput += `错误: ${error.message || '未知错误'}\n`;
      }
    },
    
    // 显示配置文件内容和二维码
    async showConfigFile(index) {
      if (index < 0 || index >= this.foundConfigFiles.length) return;
      
      this.currentConfigIndex = index;
      
      // 如果使用的是clientConfigs数组
      if (this.clientConfigs && this.clientConfigs.length > index) {
        const config = this.clientConfigs[index];
        this.configContent = config.content;
        this.sshOutput += `\n正在显示配置文件: ${config.name}\n`;
        
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
    
    // 设置当前活动标签页
    setActiveTab(tab) {
      this.activeTab = tab;
      
      // 切换到月账单标签页时初始化年份选项并加载账单汇总
      if (tab === 'monthly-billing') {
        this.initAvailableYears();
        this.loadMonthlyBillSummary();
        
        // 清空之前的月账单详情数据
        this.monthlyBill = {};
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
        const result = await window.electronAPI.saveMonthlyBillToExcel(year, month, this.addNatStats);
        
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
      // 创建一个简单的浅拷贝来避免可能的循环引用问题
      this.editingVps = Object.assign({}, vps);
      
      // 确保日期格式正确
      if (this.editingVps.purchase_date) {
        // 先确保日期格式标准化（添加前导零）
        const formattedDate = this.formatDateInput(this.editingVps.purchase_date);
        // 然后将YYYY/MM/DD格式转换为YYYY-MM-DD
        this.editingVps.purchase_date = formattedDate.replace(/\//g, '-');
      }
      
      if (this.editingVps.cancel_date) {
        // 先确保日期格式标准化
        const formattedDate = this.formatDateInput(this.editingVps.cancel_date);
        // 然后转换日期分隔符
        this.editingVps.cancel_date = formattedDate.replace(/\//g, '-');
      }
      
      // 查找当前编辑的VPS索引
      this.editingVpsIndex = this.vpsDataList.findIndex(item => item.name === vps.name);
      
      // 显示编辑弹窗
      this.showAddVpsModal = true;
    },
    
    // 添加新VPS
    addNewVps() {
      // 使用格式化的当前日期
      const currentDate = this.formatDate(new Date());
      
      // 重置编辑对象
      this.editingVps = {
        name: '',
        purchase_date: currentDate,
        use_nat: false,
        status: '在用',
        cancel_date: '',
        price_per_month: 20,
        start_date: currentDate,
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
          alert('请输入购买日期');
          return;
        }
        
        // 格式化日期输入
        if (this.editingVps.purchase_date) {
          this.editingVps.purchase_date = this.formatDateInput(this.editingVps.purchase_date);
        }
        
        if (this.editingVps.cancel_date) {
          this.editingVps.cancel_date = this.formatDateInput(this.editingVps.cancel_date);
        }
        
        // 验证购买日期格式
        const purchaseDateRegex = /^\d{4}[-\/](0[1-9]|1[0-2])[-\/](0[1-9]|[12][0-9]|3[01])$/;
        if (!purchaseDateRegex.test(this.editingVps.purchase_date)) {
          alert('购买日期格式不正确，请使用YYYY/MM/DD或YYYY-MM-DD格式');
          return;
        }
        
        if (this.editingVps.status === '销毁' && !this.editingVps.cancel_date) {
          alert('请输入销毁时间');
          return;
        }
        
        // 验证销毁日期格式
        if (this.editingVps.cancel_date) {
          if (!purchaseDateRegex.test(this.editingVps.cancel_date)) {
            alert('销毁时间格式不正确，请使用YYYY/MM/DD或YYYY-MM-DD格式');
            return;
          }
        }
        
        if (!this.editingVps.price_per_month || this.editingVps.price_per_month <= 0) {
          alert('请输入有效的单价');
          return;
        }
        
        // 确保start_date与purchase_date相同
        this.editingVps.start_date = this.editingVps.purchase_date;
        
        // 将日期格式转换为YYYY/MM/DD
        if (this.editingVps.purchase_date) {
          this.editingVps.purchase_date = this.editingVps.purchase_date.replace(/-/g, '/');
        }
        
        if (this.editingVps.cancel_date) {
          this.editingVps.cancel_date = this.editingVps.cancel_date.replace(/-/g, '/');
        }
        
        if (this.editingVps.start_date) {
          this.editingVps.start_date = this.editingVps.start_date.replace(/-/g, '/');
        }
        
        // 创建一个干净的对象进行保存，移除可能导致序列化问题的属性
        const vpsToSave = {
          name: this.editingVps.name,
          purchase_date: this.editingVps.purchase_date,
          start_date: this.editingVps.start_date,
          ip_address: this.editingVps.ip_address,
          country: this.editingVps.country,
          use_nat: this.editingVps.use_nat,
          status: this.editingVps.status,
          price_per_month: Number(this.editingVps.price_per_month)
        };
        
        // 如果是销毁状态，添加销毁日期
        if (this.editingVps.status === '销毁' && this.editingVps.cancel_date) {
          vpsToSave.cancel_date = this.editingVps.cancel_date;
        }
        
        // 保存VPS数据
        const result = await window.electronAPI.saveVps(vpsToSave);
        
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
          
          // 重新加载VPS数据列表，确保UI显示最新数据
          try {
            await this.loadVpsDataList();
          } catch (loadError) {
            console.error('重新加载VPS数据失败:', loadError);
            // 加载失败时不影响主流程，已有本地更新作为备份
          }
          
          // 重新生成当前月账单
          this.generateMonthlyBill();
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
            
            // 重新加载VPS数据列表，确保UI显示最新数据
            try {
              await this.loadVpsDataList();
            } catch (loadError) {
              console.error('重新加载VPS数据失败:', loadError);
              // 加载失败时不影响主流程，已有本地更新作为备份
            }
            
            // 重新生成当前月账单
            this.generateMonthlyBill();
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
    
    // 格式化日期为YYYY/MM/DD
    formatDate(date) {
      const d = new Date(date);
      let month = '' + (d.getMonth() + 1);
      let day = '' + d.getDate();
      const year = d.getFullYear();
      
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      
      return [year, month, day].join('/');
    },
    
    // 格式化用户输入的日期
    formatDateInput(dateStr) {
      if (!dateStr) return '';
      
      // 支持的日期格式: YYYY/M/D, YYYY-M-D
      const separator = dateStr.includes('/') ? '/' : '-';
      const parts = dateStr.split(separator);
      
      if (parts.length !== 3) return dateStr;
      
      const year = parts[0];
      let month = parts[1];
      let day = parts[2];
      
      // 为单数月份和日期添加前导零
      if (month.length === 1) month = '0' + month;
      if (day.length === 1) day = '0' + day;
      
      return [year, month, day].join(separator);
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
    
    // 批量添加VPS
    async batchAddVps() {
      try {
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
      // 确保使用正确的日期格式
      const currentDate = this.formatDate(new Date());
      
      return {
        name: '',
        purchase_date: currentDate,
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
    
    // 清空表格
    clearBatchServers() {
      if (confirm('确定要清空表格吗？')) {
        this.batchServers = [{
          name: '',
          host: '',
          port: 22,
          username: 'root',
          authType: 'password',
          password: '',
          privateKeyPath: ''
        }];
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
        
        // 验证日期格式的正则表达式
        const dateRegex = /^\d{4}[-\/](0[1-9]|1[0-2])[-\/](0[1-9]|[12][0-9]|3[01])$/;
        
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
          
          // 格式化日期输入
          if (item.purchase_date) {
            item.purchase_date = this.formatDateInput(item.purchase_date);
          }
          
          if (item.cancel_date) {
            item.cancel_date = this.formatDateInput(item.cancel_date);
          }
          
          // 验证购买日期格式
          if (!dateRegex.test(item.purchase_date)) {
            alert(`第 ${i+1} 行的购买日期格式不正确，请使用YYYY/MM/DD或YYYY-MM-DD格式`);
            hasErrors = true;
            break;
          }
          
          if (item.status === '销毁' && !item.cancel_date) {
            alert(`第 ${i+1} 行的状态为销毁，但未填写销毁时间`);
            hasErrors = true;
            break;
          }
          
          // 验证销毁日期格式
          if (item.status === '销毁' && item.cancel_date && !dateRegex.test(item.cancel_date)) {
            alert(`第 ${i+1} 行的销毁时间格式不正确，请使用YYYY/MM/DD或YYYY-MM-DD格式`);
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
            purchase_date: item.purchase_date.replace(/-/g, '/'),  // 转换日期格式为 YYYY/MM/DD
            start_date: item.purchase_date.replace(/-/g, '/'),     // 设置start_date与purchase_date相同
            use_nat: item.use_nat,
            status: item.status,
            price_per_month: parseFloat(item.price_per_month),
            ip_address: item.ip_address || '',
            country: item.country || ''
          };
          
          // 如果状态为销毁且有销毁时间，添加cancel_date
          if (item.status === '销毁' && item.cancel_date) {
            vpsItem.cancel_date = item.cancel_date.replace(/-/g, '/');  // 转换日期格式
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
            
            // 重新加载VPS数据列表，确保UI显示最新数据
            try {
              await this.loadVpsDataList();
            } catch (loadError) {
              console.error('重新加载VPS数据失败:', loadError);
              // 加载失败时不影响主流程
            }
            
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
        }
      } catch (error) {
        console.error('部署Wireguard失败:', error);
        this.wireguardResult = {
          success: false,
          error: error.message || '未知错误'
        };
      } finally {
        this.isDeploying = false;
      }
    },
    
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
    
    async loadInstanceDetails() {
      if (!this.wireguardSelectedServer || !this.wireguardSelectedInstance) return;
      
      try {
        this.wireguardLoading = true;
        this.wireguardInstanceDetails = null;
        // 清除所有相关状态，确保切换实例后不会显示前一个实例的配置
        this.viewingPeer = null;
        this.viewPeerQrCode = null;
        this.peerResult = null;
        
        const result = await window.electronAPI.getWireguardInstanceDetails(
          this.wireguardSelectedServer, 
          this.wireguardSelectedInstance
        );
        console.log('Wireguard实例详情:', result);
        
        if (result.success) {
          this.wireguardInstanceDetails = result.details;
        } else {
          console.error('获取Wireguard实例详情失败:', result.error);
          alert('获取Wireguard实例详情失败: ' + result.error);
        }
      } catch (error) {
        console.error('加载Wireguard实例详情失败:', error);
        alert('加载Wireguard实例详情失败: ' + (error.message || '未知错误'));
      } finally {
        this.wireguardLoading = false;
      }
    },
    
    async addPeer() {
      if (!this.wireguardSelectedServer || !this.wireguardSelectedInstance) return;
      
      try {
        this.addingPeer = true;
        this.peerResult = null;
        
        const result = await window.electronAPI.addWireguardPeer(
          this.wireguardSelectedServer,
          this.wireguardSelectedInstance
        );
        console.log('添加Peer结果:', result);
        
        this.peerResult = result;
        
        if (result.success) {
          // 刷新实例详情
          await this.loadInstanceDetails();
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
    
    async deletePeer(peerNumber) {
      if (!this.wireguardSelectedServer || !this.wireguardSelectedInstance) return;
      
      if (!confirm(`确定要删除Peer ${peerNumber}吗？此操作不可恢复！`)) {
        return;
      }
      
      try {
        this.addingPeer = true;
        this.peerResult = null;
        
        const result = await window.electronAPI.deleteWireguardPeer(
          this.wireguardSelectedServer,
          this.wireguardSelectedInstance,
          peerNumber
        );
        console.log('删除Peer结果:', result);
        
        this.peerResult = result;
        
        if (result.success) {
          // 刷新实例详情
          await this.loadInstanceDetails();
        }
      } catch (error) {
        console.error('删除Peer失败:', error);
        this.peerResult = {
          success: false,
          error: error.message || '未知错误'
        };
      } finally {
        this.addingPeer = false;
      }
    },
    
    async viewPeerConfig(peer) {
      this.viewingPeer = peer;
      this.viewPeerQrCode = null;
      
      try {
        // 生成二维码
        const result = await window.electronAPI.generateQRCode(peer.config);
        if (result.success) {
          this.viewPeerQrCode = result.qrCodeImage;
        }
      } catch (error) {
        console.error('生成二维码失败:', error);
      }
    },
    
    // 导出表格数据为JSON文件
    exportBatchTable() {
      try {
        if (this.batchVpsList.length === 0) {
          alert('表格为空，无法导出');
          return;
        }
        
        // 创建导出数据
        const exportData = JSON.stringify(this.batchVpsList, null, 2);
        
        // 创建下载链接
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // 创建下载链接并点击
        const a = document.createElement('a');
        a.href = url;
        a.download = `批量添加VPS_${this.formatDate(new Date())}.json`;
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
        
      } catch (error) {
        console.error('导出表格数据失败:', error);
        alert('导出表格数据失败: ' + (error.message || '未知错误'));
      }
    },
    
    // 导入表格
    importBatchTable() {
      // 触发文件选择
      this.$refs.fileInput.click();
    },
    
    // 文件选择处理
    onFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          
          // 验证数据是否为数组
          if (!Array.isArray(data)) {
            alert('导入的数据格式不正确，请确保是有效的JSON数组');
            return;
          }
          
          // 验证每个对象的格式
          let isValid = true;
          for (const item of data) {
            if (!item.name || !item.purchase_date || item.price_per_month === undefined) {
              isValid = false;
              break;
            }
          }
          
          if (!isValid) {
            alert('导入的数据格式不正确，请确保每条记录都包含必要的字段');
            return;
          }
          
          // 确认是否替换当前表格数据
          if (this.batchVpsList.length > 0 && !confirm('是否要替换当前表格数据？')) {
            return;
          }
          
          // 格式化日期，从YYYY/MM/DD转为YYYY-MM-DD (如果需要)
          const formattedData = data.map(item => ({
            ...item,
            purchase_date: item.purchase_date.replace(/\//g, '-'),
            cancel_date: item.cancel_date ? item.cancel_date.replace(/\//g, '-') : ''
          }));
          
          // 更新表格数据
          this.batchVpsList = formattedData;
          
          // 清空文件输入
          this.$refs.fileInput.value = '';
          
          alert(`已成功导入 ${formattedData.length} 条数据`);
        } catch (error) {
          console.error('解析导入文件失败:', error);
          alert('解析导入文件失败: ' + (error.message || '未知错误'));
        }
      };
      
      reader.onerror = () => {
        alert('读取文件失败');
      };
      
      reader.readAsText(file);
    },
    
    // 批量添加服务器相关方法
    addBatchServerRow() {
      this.batchServers.push({
        name: '',
        host: '',
        port: 22,
        username: 'root',
        authType: 'password',
        password: '',
        privateKeyPath: ''
      });
    },
    
    removeBatchServer(index) {
      if (this.batchServers.length > 1) {
        this.batchServers.splice(index, 1);
      } else {
        alert('至少保留一行数据');
      }
    },
    
    async saveBatchServers() {
      try {
        if (!window.electronAPI) {
          throw new Error('electronAPI未定义');
        }
        
        // 验证输入
        if (this.batchServers.length === 0) {
          alert('请至少添加一条服务器数据');
          return;
        }
        
        // 验证每一行数据
        const validatedList = [];
        let hasErrors = false;
        
        for (let i = 0; i < this.batchServers.length; i++) {
          const server = this.batchServers[i];
          
          // 检查必填字段
          if (!server.name) {
            alert(`第 ${i+1} 行的服务器名称不能为空`);
            hasErrors = true;
            break;
          }
          
          if (!server.host) {
            alert(`第 ${i+1} 行的主机地址不能为空`);
            hasErrors = true;
            break;
          }
          
          if (!server.username) {
            alert(`第 ${i+1} 行的用户名不能为空`);
            hasErrors = true;
            break;
          }
          
          if (server.authType === 'password' && !server.password) {
            alert(`第 ${i+1} 行选择了密码认证，但未填写密码`);
            hasErrors = true;
            break;
          }
          
          if (server.authType === 'privateKey' && !server.privateKeyPath) {
            alert(`第 ${i+1} 行选择了私钥认证，但未填写私钥路径`);
            hasErrors = true;
            break;
          }
          
          // 创建服务器对象
          const serverData = {
            id: generateId(),
            name: server.name,
            host: server.host,
            port: parseInt(server.port) || 22,
            username: server.username
          };
          
          if (server.authType === 'password') {
            serverData.password = server.password;
          } else {
            serverData.privateKeyPath = server.privateKeyPath;
          }
          
          validatedList.push(serverData);
        }
        
        if (hasErrors) {
          return;
        }
        
        // 保存所有服务器
        this.batchResults = [];
        
        for (const serverData of validatedList) {
          try {
            const result = await window.electronAPI.saveServer(serverData);
            
            if (result.success) {
              this.servers.push(serverData);
              this.batchResults.push({
                name: serverData.name,
                success: true,
                message: '添加成功'
              });
            } else {
              this.batchResults.push({
                name: serverData.name,
                success: false,
                message: `添加失败: ${result.error || '未知错误'}`
              });
            }
          } catch (error) {
            this.batchResults.push({
              name: serverData.name,
              success: false,
              message: `添加失败: ${error.message || '未知错误'}`
            });
          }
        }
        
        // 如果全部成功，清空表格
        const allSuccess = this.batchResults.every(result => result.success);
        if (allSuccess) {
          this.batchServers = [];
        }
      } catch (error) {
        console.error('批量保存服务器失败:', error);
        alert('批量保存服务器失败: ' + (error.message || '未知错误'));
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
    async detectIpLocation(ip) {
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
            const lastIndex = this.batchVpsList.length - 1;
            if (lastIndex >= 0) {
              this.batchVpsList[lastIndex].ip_address = ip;
              this.batchVpsList[lastIndex].country = locationInfo;
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
        alert('请输入IP地址');
        return;
      }
      
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        alert(`IP地理位置: ${locationInfo}`);
      }
    },
    
    // 在批量添加服务器中检测行IP
    async detectBatchServerIp(index) {
      if (!this.batchServers[index] || !this.batchServers[index].host) {
        alert('请输入IP地址');
        return;
      }
      
      const ip = this.batchServers[index].host;
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        alert(`IP地理位置: ${locationInfo}`);
      }
    },
    
    // 在添加VPS界面中检测IP
    async detectVpsIp() {
      const ip = this.editingVps.ip_address;
      if (!ip) {
        alert('请输入IP地址');
        return;
      }
      
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        this.editingVps.country = locationInfo;
      }
    },
    
    // 在批量添加VPS界面中检测IP
    async detectBatchVpsIp(index) {
      if (!this.batchVpsList[index] || !this.batchVpsList[index].ip_address) {
        alert('请输入IP地址');
        return;
      }
      
      const ip = this.batchVpsList[index].ip_address;
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        this.batchVpsList[index].country = locationInfo;
      }
    },
    
    // 检测已有服务器的IP地址
    async detectExistingServerIp(server) {
      if (!server || !server.host) {
        alert('服务器IP地址不存在');
        return;
      }
      
      const ip = server.host;
      const locationInfo = await this.detectIpLocation(ip);
      if (locationInfo) {
        // 直接将地理位置信息保存到服务器对象中，不弹窗
        server.ipLocation = locationInfo;
        
        // 确保Vue能够检测到这个变更
        this.servers = [...this.servers];
      }
    },
    
    // 处理表格粘贴
    async handleTablePaste(event) {
      try {
        let clipboardText = '';
        
        // 如果是粘贴事件
        if (event && event.clipboardData) {
          clipboardText = event.clipboardData.getData('text');
          // 阻止默认行为
          event.preventDefault();
        } 
        // 尝试使用现代剪贴板API直接读取
        else if (navigator.clipboard && navigator.clipboard.readText) {
          try {
            clipboardText = await navigator.clipboard.readText();
          } catch (clipError) {
            console.error('无法直接访问剪贴板:', clipError);
            // 如果直接访问失败，回退到提示输入
            clipboardText = prompt('请将从Excel、Google表格或其他电子表格中复制的数据粘贴到此处：');
          }
        } else {
          // 浏览器不支持Clipboard API，回退到提示输入
          clipboardText = prompt('请将从Excel、Google表格或其他电子表格中复制的数据粘贴到此处：');
        }
        
        if (!clipboardText) return;
        
        // 按换行符分割成行
        const rows = clipboardText.split('\n').filter(row => row.trim());
        
        if (rows.length === 0) {
          alert('未检测到有效数据');
          return;
        }
        
        // 清空当前表格，保留一行如果用户想要保留现有数据
        if (this.batchVpsList.length > 0 && confirm('是否清空当前表格数据？')) {
          this.batchVpsList = [];
        }
        
        // 处理每一行数据
        rows.forEach(row => {
          // 首先尝试按制表符分割（从Excel复制的标准格式）
          let columns = row.split('\t').map(col => col.trim());
          
          // 如果只有一列，尝试按逗号分割（CSV格式）
          if (columns.length <= 1) {
            columns = row.split(',').map(col => col.trim());
          }
          
          // 如果只有一列，尝试按空格分割（但要注意保留多个连续空格作为一个分隔符）
          if (columns.length <= 1) {
            columns = row.split(/\s{2,}/).map(col => col.trim()).filter(col => col);
          }
          
          if (columns.length >= 2) { // 至少需要名称和日期
            const vpsItem = this.createEmptyBatchRow();
            
            // 根据列的数量和位置填充数据
            if (columns.length >= 1) vpsItem.name = columns[0];
            if (columns.length >= 2) {
              // 处理日期格式
              const dateStr = columns[1];
              if (dateStr) {
                vpsItem.purchase_date = dateStr.replace(/[-\.]/g, '/');
              }
            }
            if (columns.length >= 3) vpsItem.ip_address = columns[2];
            if (columns.length >= 4) vpsItem.country = columns[3];
            if (columns.length >= 5) {
              const natValue = columns[4].toLowerCase();
              vpsItem.use_nat = natValue === '是' || natValue === 'true' || natValue === '1' || natValue === 'yes';
            }
            if (columns.length >= 6) {
              const statusValue = columns[5];
              vpsItem.status = statusValue === '销毁' ? '销毁' : '在用';
            }
            if (columns.length >= 7) {
              const cancelDate = columns[6];
              if (cancelDate && cancelDate !== '-') {
                vpsItem.cancel_date = cancelDate.replace(/[-\.]/g, '/');
              }
            }
            if (columns.length >= 8) {
              // 处理价格，去除任何非数字和小数点的字符（如$符号）
              const priceStr = columns[7].replace(/[^\d.]/g, '');
              const price = parseFloat(priceStr);
              if (!isNaN(price)) vpsItem.price_per_month = price;
            }
            
            this.batchVpsList.push(vpsItem);
          }
        });
        
        if (this.batchVpsList.length === 0) {
          this.batchVpsList = [this.createEmptyBatchRow()];
          alert('解析数据失败，请确保复制的数据格式正确。数据应包含至少VPS名称和购买日期两列。');
        } else {
          alert(`成功解析 ${this.batchVpsList.length} 行数据，请检查数据是否正确填充到表格中。`);
        }
      } catch (error) {
        console.error('处理粘贴数据失败:', error);
        alert('处理粘贴数据失败: ' + (error.message || '未知错误'));
        // 确保至少有一行空数据
        if (this.batchVpsList.length === 0) {
          this.batchVpsList = [this.createEmptyBatchRow()];
        }
      }
    },
  }
}).mount('#app');