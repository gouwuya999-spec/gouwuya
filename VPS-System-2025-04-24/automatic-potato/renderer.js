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
      newServer: {
        name: '',
        host: '',
        port: 22,
        username: '',
        password: '',
        privateKeyPath: '',
        passphrase: ''
      },
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
        usage_period: ''
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
      viewPeerQrCode: null
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
      if (!this.currentConnectedServer) {
        this.sshOutput = '未连接到任何服务器，请先连接服务器\n';
        return;
      }
      
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
        purchase_date: this.formatDate(new Date()),
        use_nat: false,
        status: '在用',
        cancel_date: '',
        price_per_month: 20,
        start_date: this.formatDate(new Date()),
        total_price: 0,
        usage_period: ''
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
        
        if (this.editingVps.status === '销毁' && !this.editingVps.cancel_date) {
          alert('请选择销毁时间');
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
          this.editingVps.purchase_date = this.editingVps.purchase_date.replace(/-/g, '/');
        }
        
        if (this.editingVps.cancel_date) {
          this.editingVps.cancel_date = this.editingVps.cancel_date.replace(/-/g, '/');
        }
        
        if (this.editingVps.start_date) {
          this.editingVps.start_date = this.editingVps.start_date.replace(/-/g, '/');
        }
        
        // 保存VPS数据
        const result = await window.electronAPI.saveVps(this.editingVps);
        
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
    }
  }
}).mount('#app');