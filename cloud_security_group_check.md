# 云服务商安全组检查指南

## 🔍 需要检查的端口范围

### WireGuard端口映射范围
- **wg0实例**: 55835-56834 (UDP)
- **wg1实例**: 56835-57834 (UDP)
- **WireGuard监听端口**: 52835, 52845 (UDP)
- **SSH端口**: 22 (TCP)

## ☁️ 各云服务商安全组配置

### 1. 阿里云ECS
```
安全组规则：
- 协议类型: UDP
- 端口范围: 55835/56834
- 授权对象: 0.0.0.0/0
- 描述: WireGuard端口映射

- 协议类型: UDP  
- 端口范围: 52835/52835
- 授权对象: 0.0.0.0/0
- 描述: WireGuard监听端口
```

### 2. 腾讯云CVM
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

### 3. AWS EC2
```
Security Group Rules:
- Type: Custom UDP
- Port Range: 55835-56834
- Source: 0.0.0.0/0
- Description: WireGuard port mapping

- Type: Custom UDP
- Port Range: 52835
- Source: 0.0.0.0/0
- Description: WireGuard listen port
```

### 4. 华为云ECS
```
安全组规则：
- 协议: UDP
- 端口: 55835-56834
- 源地址: 0.0.0.0/0
- 描述: WireGuard端口映射
```

## 🔧 快速检查命令

在服务器上运行以下命令检查端口是否被外部访问：

```bash
# 检查端口监听状态
netstat -tuln | grep -E "(52835|55835)"

# 检查防火墙状态
ufw status verbose

# 检查iptables规则
iptables -t nat -L PREROUTING -n | grep 55835
```

## ⚠️ 常见问题

1. **端口范围过大被阻止**: 某些云服务商可能限制大范围端口开放
2. **UDP协议限制**: 部分云服务商对UDP端口有特殊限制
3. **地域限制**: 某些地区可能对VPN端口有特殊限制
