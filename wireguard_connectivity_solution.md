# WireGuard连接问题完整解决方案

## 🚨 问题描述
WireGuard重新部署成功，显示配置文件和二维码，可以扫码连接，但连接后数据不通。

## 🔍 问题诊断步骤

### 步骤1: 基础连接检查
```bash
# 1.1 检查WireGuard服务状态
systemctl status wg-quick@wg0
wg show

# 1.2 检查网络接口
ip -br a | grep wg
ip route | grep wg

# 1.3 检查端口监听
netstat -tuln | grep -E "(52835|55835)"
```

### 步骤2: 防火墙检查
```bash
# 2.1 检查UFW状态
ufw status verbose

# 2.2 检查iptables规则
iptables -L FORWARD -n | grep wg
iptables -t nat -L POSTROUTING -n | grep wg
iptables -t nat -L PREROUTING -n | grep 55835

# 2.3 检查IP转发
sysctl net.ipv4.ip_forward
```

### 步骤3: 网络路由检查
```bash
# 3.1 检查默认路由
ip route | grep default

# 3.2 检查NAT规则
iptables -t nat -L -n -v

# 3.3 测试网络连接
ping -c 3 8.8.8.8
```

## 🛠️ 解决方案详细步骤

### 解决方案1: 云服务商安全组配置

#### 1.1 检查当前端口映射
```bash
# 查看当前端口映射范围
grep -r "MAP_PORT_START\|MAP_PORT_END" /etc/wireguard/
```

**端口范围：**
- wg0: 55835-56834 (1000个端口)
- wg1: 56835-57834 (1000个端口)
- WireGuard监听: 52835, 52845

#### 1.2 云服务商安全组配置

**阿里云ECS安全组规则：**
```
入方向规则：
- 协议类型: UDP
- 端口范围: 55835/56834
- 授权对象: 0.0.0.0/0
- 描述: WireGuard端口映射

- 协议类型: UDP
- 端口范围: 52835/52835
- 授权对象: 0.0.0.0/0
- 描述: WireGuard监听端口
```

**腾讯云CVM安全组规则：**
```
入站规则：
- 类型: 自定义
- 协议端口: UDP:55835-56834
- 来源: 0.0.0.0/0
- 策略: 允许

- 类型: 自定义
- 协议端口: UDP:52835
- 来源: 0.0.0.0/0
- 策略: 允许
```

### 解决方案2: 服务器端配置修复

#### 2.1 重新配置防火墙规则
```bash
# 清理现有规则
ufw --force reset

# 重新配置规则
ufw allow 22/tcp
ufw allow 52835/udp
ufw allow 52845/udp
ufw allow 55835:56834/udp
ufw allow 56835:57834/udp

# 启用防火墙
ufw --force enable
ufw reload
```

#### 2.2 修复iptables规则
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

#### 2.3 重新生成WireGuard配置
```bash
# 停止现有服务
systemctl stop wg-quick@wg0
systemctl stop wg-quick@wg1

# 重新生成配置（使用增强版脚本）
bash wireguard_enhanced_deploy.sh
```

### 解决方案3: 客户端配置优化

#### 3.1 优化客户端配置
```ini
[Interface]
PrivateKey = [客户端私钥]
Address = 10.0.1.2/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1420

[Peer]
PublicKey = [服务端公钥]
Endpoint = [服务器IP]:52835
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

#### 3.2 客户端连接测试
```bash
# 在客户端设备上测试
ping 10.0.1.1  # 测试到服务端的连接
ping 8.8.8.8   # 测试互联网连接
nslookup google.com  # 测试DNS解析
```

## 🔧 自动化修复脚本

### 快速诊断脚本
```bash
#!/bin/bash
echo "=== WireGuard连接诊断 ==="
echo "1. 服务状态:"
systemctl status wg-quick@wg0 --no-pager
echo ""
echo "2. 接口状态:"
wg show
echo ""
echo "3. 端口监听:"
netstat -tuln | grep -E "(52835|55835)"
echo ""
echo "4. 防火墙状态:"
ufw status
echo ""
echo "5. 路由表:"
ip route | grep wg
echo ""
echo "6. 网络测试:"
ping -c 3 8.8.8.8
```

### 一键修复脚本
```bash
#!/bin/bash
echo "=== WireGuard一键修复 ==="

# 1. 停止服务
systemctl stop wg-quick@wg0 wg-quick@wg1

# 2. 清理配置
rm -f /etc/wireguard/wg*.conf

# 3. 重新部署
bash wireguard_enhanced_deploy.sh

# 4. 验证修复
echo "验证修复结果..."
wg show
systemctl status wg-quick@wg0 --no-pager
```

## 📋 检查清单

### 服务器端检查
- [ ] WireGuard服务正在运行
- [ ] 网络接口已创建 (wg0, wg1)
- [ ] 端口正在监听 (52835, 52845)
- [ ] UFW防火墙规则已配置
- [ ] iptables NAT规则已配置
- [ ] IP转发已启用
- [ ] 云服务商安全组已开放端口

### 客户端检查
- [ ] 客户端配置正确
- [ ] 可以连接到服务端
- [ ] 可以访问互联网
- [ ] DNS解析正常
- [ ] 网络运营商未阻止VPN

### 网络检查
- [ ] 服务器到互联网连接正常
- [ ] 客户端到服务器连接正常
- [ ] 端口映射规则生效
- [ ] NAT规则正确配置

## 🚀 最终验证步骤

### 1. 服务器端验证
```bash
# 检查所有服务状态
systemctl status wg-quick@wg0 wg-quick@wg1

# 检查网络连接
ping -c 3 8.8.8.8

# 检查端口映射
iptables -t nat -L PREROUTING -n | grep 55835
```

### 2. 客户端验证
```bash
# 连接WireGuard
wg-quick up wg0

# 测试连接
ping 10.0.1.1
ping 8.8.8.8
curl ifconfig.me
```

### 3. 网络流量验证
```bash
# 在服务器上监控流量
wg show wg0 transfer
wg show wg0 latest-handshakes
```

## 📞 如果问题仍然存在

1. **检查云服务商限制**: 某些云服务商可能限制大范围端口开放
2. **检查网络运营商**: 部分运营商可能阻止VPN流量
3. **检查客户端设备**: 确保设备支持WireGuard
4. **联系技术支持**: 提供完整的诊断信息

## 📊 性能优化建议

1. **减少端口映射范围**: 如果不需要1000个端口，可以减少到100个
2. **使用专用端口**: 避免使用常用端口范围
3. **启用压缩**: 在客户端配置中添加压缩选项
4. **优化MTU**: 根据网络环境调整MTU值
