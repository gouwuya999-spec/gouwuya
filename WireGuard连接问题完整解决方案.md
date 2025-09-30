# WireGuard连接问题完整解决方案

## 🚨 问题描述
WireGuard重新部署成功，显示配置文件和二维码，可以扫码连接，但连接后数据不通。

## 🔍 问题分析结果

### ✅ 防火墙配置检查
经过详细分析，您的部署脚本中的防火墙配置是**正确的**：

**端口映射范围：**
- `wg0` 实例：55835-56834 (1000个端口)
- `wg1` 实例：56835-57834 (1000个端口)
- WireGuard监听端口：52835, 52845

**UFW防火墙规则：**
```bash
ufw allow 22/tcp                    # SSH端口
ufw allow ${WG_PORT}/udp            # WireGuard监听端口
ufw allow ${MAP_PORT_START}:${MAP_PORT_END}/udp  # 端口映射范围
```

**iptables DNAT规则：**
```bash
for port in $(seq ${MAP_PORT_START} ${MAP_PORT_END}); do 
    iptables -t nat -A PREROUTING -p udp --dport $port -j DNAT --to-destination ${ip}:${WG_PORT}
done
```

## 🛠️ 解决方案详细步骤

### 方案1: 云服务商安全组配置（最可能的原因）

#### 1.1 需要开放的端口范围
```
WireGuard监听端口：
- 52835/udp
- 52845/udp

端口映射范围：
- 55835-56834/udp (wg0实例)
- 56835-57834/udp (wg1实例)

SSH端口：
- 22/tcp
```

#### 1.2 各云服务商配置示例

**阿里云ECS安全组：**
```
入方向规则：
- 协议类型: UDP, 端口范围: 52835/52835, 授权对象: 0.0.0.0/0
- 协议类型: UDP, 端口范围: 52845/52845, 授权对象: 0.0.0.0/0
- 协议类型: UDP, 端口范围: 55835/56834, 授权对象: 0.0.0.0/0
- 协议类型: UDP, 端口范围: 56835/57834, 授权对象: 0.0.0.0/0
- 协议类型: TCP, 端口范围: 22/22, 授权对象: 0.0.0.0/0
```

**腾讯云CVM安全组：**
```
入站规则：
- 类型: 自定义, 协议端口: UDP:52835, 来源: 0.0.0.0/0, 策略: 允许
- 类型: 自定义, 协议端口: UDP:52845, 来源: 0.0.0.0/0, 策略: 允许
- 类型: 自定义, 协议端口: UDP:55835-56834, 来源: 0.0.0.0/0, 策略: 允许
- 类型: 自定义, 协议端口: UDP:56835-57834, 来源: 0.0.0.0/0, 策略: 允许
- 类型: 自定义, 协议端口: TCP:22, 来源: 0.0.0.0/0, 策略: 允许
```

### 方案2: 使用内置诊断工具

#### 2.1 在应用中运行诊断
1. 打开VPS管理器应用
2. 选择有问题的服务器
3. 在SSH页面点击"WireGuard诊断"按钮
4. 查看诊断报告，重点关注：
   - WireGuard服务状态
   - 端口监听状态
   - 防火墙规则
   - 网络连接测试

#### 2.2 运行快速修复
1. 在诊断后，点击"快速修复"按钮
2. 系统将自动：
   - 修复IP转发设置
   - 重新配置防火墙规则
   - 重启WireGuard服务
   - 验证修复结果

### 方案3: 使用简化版部署脚本

如果云服务商限制大范围端口开放，可以使用简化版脚本：

#### 3.1 简化版特点
- 每个实例只映射100个端口（而不是1000个）
- 端口范围：55835-55934, 55935-56034
- 减少云服务商安全组配置复杂度

#### 3.2 使用方法
```bash
# 在服务器上运行
bash wireguard_simplified_deploy.sh
```

### 方案4: 手动修复步骤

#### 4.1 检查服务状态
```bash
# 检查WireGuard服务
systemctl status wg-quick@wg0
systemctl status wg-quick@wg1

# 检查接口状态
wg show

# 检查端口监听
netstat -tuln | grep -E "(52835|55835)"
```

#### 4.2 修复IP转发
```bash
# 启用IP转发
sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
```

#### 4.3 重新配置防火墙
```bash
# 获取外部网络接口
EXT_IF=$(ip route | grep '^default' | awk '{print $5}' | head -n1)

# 清理现有规则
iptables -D FORWARD -i wg+ -j ACCEPT 2>/dev/null || true
iptables -D FORWARD -o wg+ -j ACCEPT 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o $EXT_IF -j MASQUERADE 2>/dev/null || true

# 重新添加规则
iptables -A FORWARD -i wg+ -j ACCEPT
iptables -A FORWARD -o wg+ -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.0.0.0/8 -o $EXT_IF -j MASQUERADE
```

#### 4.4 重新配置UFW
```bash
# 重置UFW规则
ufw --force reset

# 重新添加规则
ufw allow 22/tcp
ufw allow 52835/udp
ufw allow 52845/udp
ufw allow 55835:56834/udp
ufw allow 56835:57834/udp

# 启用防火墙
ufw --force enable
ufw reload
```

#### 4.5 重启WireGuard服务
```bash
# 停止服务
systemctl stop wg-quick@wg0 wg-quick@wg1

# 启动服务
systemctl start wg-quick@wg0 wg-quick@wg1

# 检查状态
systemctl status wg-quick@wg0 wg-quick@wg1
```

## 🔧 提供的工具和脚本

### 1. 诊断工具
- `wireguard_diagnostic.sh` - 完整诊断脚本
- 应用内置诊断功能 - 一键诊断

### 2. 修复工具
- `wireguard_fix.sh` - 完整修复脚本
- `quick_fix_wireguard.sh` - 快速修复脚本
- 应用内置快速修复功能 - 一键修复

### 3. 部署工具
- `wireguard_enhanced_deploy.sh` - 增强版部署脚本
- `wireguard_simplified_deploy.sh` - 简化版部署脚本

### 4. 配置检查工具
- `cloud_security_group_check.md` - 云服务商安全组配置指南

## 📋 问题排查检查清单

### 服务器端检查
- [ ] WireGuard服务正在运行 (`systemctl status wg-quick@wg0`)
- [ ] 网络接口已创建 (`ip -br a | grep wg`)
- [ ] 端口正在监听 (`netstat -tuln | grep 52835`)
- [ ] UFW防火墙规则已配置 (`ufw status`)
- [ ] iptables NAT规则已配置 (`iptables -t nat -L POSTROUTING`)
- [ ] IP转发已启用 (`sysctl net.ipv4.ip_forward`)
- [ ] 云服务商安全组已开放端口

### 客户端检查
- [ ] 客户端配置正确
- [ ] 可以连接到服务端 (`ping 10.0.1.1`)
- [ ] 可以访问互联网 (`ping 8.8.8.8`)
- [ ] DNS解析正常 (`nslookup google.com`)
- [ ] 网络运营商未阻止VPN

### 网络检查
- [ ] 服务器到互联网连接正常
- [ ] 客户端到服务器连接正常
- [ ] 端口映射规则生效
- [ ] NAT规则正确配置

## 🚀 推荐解决流程

### 第一步：使用应用内置工具
1. 打开VPS管理器应用
2. 选择有问题的服务器
3. 点击"WireGuard诊断"按钮
4. 查看诊断报告
5. 点击"快速修复"按钮
6. 验证修复结果

### 第二步：检查云服务商安全组
1. 登录云服务商控制台
2. 找到对应的安全组
3. 按照上述配置示例开放端口
4. 保存配置

### 第三步：如果问题仍然存在
1. 使用简化版部署脚本重新部署
2. 检查网络运营商是否阻止VPN流量
3. 联系技术支持并提供诊断信息

## 📞 技术支持信息

如果问题仍然存在，请提供以下信息：

1. **诊断报告** - 运行诊断工具的输出
2. **云服务商信息** - 使用的云服务商和实例类型
3. **网络环境** - 客户端网络环境（家庭/企业/移动网络）
4. **错误现象** - 具体的错误表现和日志

## 📊 性能优化建议

1. **减少端口映射范围** - 如果不需要1000个端口，可以减少到100个
2. **使用专用端口** - 避免使用常用端口范围
3. **启用压缩** - 在客户端配置中添加压缩选项
4. **优化MTU** - 根据网络环境调整MTU值

## 🎯 总结

WireGuard连接后数据不通的问题，**最可能的原因是云服务商安全组没有开放相应的端口范围**。您的部署脚本配置是正确的，只需要在云服务商控制台中正确配置安全组规则即可解决问题。

如果安全组配置正确后问题仍然存在，可以使用提供的诊断和修复工具进行进一步排查和修复。
