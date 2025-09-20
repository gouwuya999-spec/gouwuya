# Wireguard脚本功能流程详解

## 🔧 当前Wireguard脚本实现的自动化功能

### 1. ✅ 系统环境检查与准备

#### 1.1 用户权限检查
```bash
# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    error_exit "请以root用户运行此脚本"
fi
```

#### 1.2 智能APT锁冲突解决
```bash
# 智能APT锁冲突解决机制
if lsof /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
    # 1. 检查是否有正在运行的apt进程
    if pgrep -f "apt|dpkg" >/dev/null; then
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
    pkill -f apt || true
    rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock
    sleep 3
    
    # 3. 验证锁已清理
    if lsof /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
        fuser -k /var/lib/dpkg/lock-frontend 2>/dev/null || true
        rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock
        sleep 2
    fi
fi
```

#### 1.3 系统软件包更新与安装
```bash
# 更新系统软件包
apt update && apt upgrade -y

# 安装必要组件
apt install -y wireguard qrencode ufw iptables-persistent curl
```

### 2. ✅ 网络配置自动化

#### 2.1 IP转发配置
```bash
# 开启IP转发
sysctl -w net.ipv4.ip_forward=1 >/dev/null
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
```

#### 2.2 UFW防火墙配置
```bash
# 修改UFW默认转发策略为ACCEPT
if [ -f /etc/default/ufw ]; then
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
fi
```

### 3. ✅ 外部网络接口自动检测

#### 3.1 自动获取默认外部网络接口
```bash
# 自动获取默认外部网络接口
EXT_IF=$(ip route | grep '^default' | awk '{print $5}' | head -n1)
echo "检测到外部网络接口：$EXT_IF"
```

#### 3.2 获取所有公网IP地址
```bash
# 获取该接口上所有IPv4地址（按系统分配顺序）
public_ips=($(ip -o -4 addr show dev "$EXT_IF" | awk '{print $4}' | cut -d/ -f1))
if [ ${#public_ips[@]} -eq 0 ]; then
  echo "未检测到公共IP，退出！"
  exit 1
fi
```

#### 3.3 主IP检测与排序
```bash
# 获取实际对外显示的主IP
primary_ip=$(curl -s ifconfig.me)
echo "通过外部检测到的主IP：$primary_ip"

# 调整顺序：将主IP放在首位，其它附加IP依次排列
ordered_ips=()
for ip in "${public_ips[@]}"; do
  if [ "$ip" == "$primary_ip" ]; then
    ordered_ips=("$ip")
    break
  fi
done
for ip in "${public_ips[@]}"; do
  if [ "$ip" != "$primary_ip" ]; then
    ordered_ips+=("$ip")
  fi
done
public_ips=("${ordered_ips[@]}")
echo "最终IP顺序：${public_ips[@]}"
```

### 4. ✅ 多实例Wireguard自动配置

#### 4.1 实例配置参数自动计算
```bash
for ip in "${public_ips[@]}"; do
  WG_IF="wg${instance}"
  WG_PORT=$((52835 + instance * 10))
  # 修改端口映射范围：每个实例映射1000个端口，且不重叠
  MAP_PORT_START=$((55835 + instance * 1000))
  MAP_PORT_END=$((MAP_PORT_START + 999))
  # 每个实例使用不同子网：wg0 -> 10.0.1.0/24，wg1 -> 10.0.2.0/24，以此类推
  WG_SUBNET="10.0.$((instance+1)).0/24"
  SERVER_WG_IP="10.0.$((instance+1)).1"
```

#### 4.2 密钥对自动生成
```bash
# 生成服务端密钥对
echo "为 ${WG_IF} 生成服务端密钥..."
umask 077
wg genkey | tee "$WG_DIR/${WG_IF}-server.key" | wg pubkey > "$WG_DIR/${WG_IF}-server.pub"

# 为每个peer生成密钥对
for ((p=1; p<=peer_count; p++)); do
    echo "为 ${WG_IF} 的 peer $p 生成密钥..."
    wg genkey | tee "$WG_DIR/${WG_IF}-peer${p}.key" | wg pubkey > "$WG_DIR/${WG_IF}-peer${p}.pub"
```

### 5. ✅ 客户端配置自动生成

#### 5.1 IP地址自动分配
```bash
# 子网内IP分配，服务端占用.1，从.2开始分配给客户端
peer_ip_index=2  
for ((p=1; p<=peer_count; p++)); do
    # 分配peer IP
    PEER_IP="10.0.$((instance+1)).$peer_ip_index"
    peer_ip_index=$((peer_ip_index+1))
```

#### 5.2 客户端配置文件自动生成
```bash
# 生成客户端配置文件
CLIENT_CONF="$WG_DIR/${WG_IF}-peer${p}-client.conf"
cat > "$CLIENT_CONF" <<EOF
[Interface]
PrivateKey = $(cat "$WG_DIR/${WG_IF}-peer${p}.key")
Address = ${PEER_IP}/32
DNS = ${DNS}
[Peer]
PublicKey = $(cat "$WG_DIR/${WG_IF}-server.pub")
Endpoint = ${ip}:${WG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
```

### 6. ✅ 服务端配置自动生成

#### 6.1 服务端配置文件生成
```bash
# 生成服务端配置文件
SERVER_CONF="/etc/wireguard/${WG_IF}.conf"
SERVER_PRIVATE_KEY=$(cat "$WG_DIR/${WG_IF}-server.key")

cat > "$SERVER_CONF" <<EOF
[Interface]
Address = ${SERVER_WG_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE_KEY}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; \
         iptables -t nat -A POSTROUTING -s ${WG_SUBNET} -o ${EXT_IF} -j SNAT --to-source ${ip}; \
         for port in \$(seq ${MAP_PORT_START} ${MAP_PORT_END}); do iptables -t nat -A PREROUTING -p udp --dport \$port -j DNAT --to-destination ${ip}:${WG_PORT}; done
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; \
           iptables -t nat -D POSTROUTING -s ${WG_SUBNET} -o ${EXT_IF} -j SNAT --to-source ${ip}; \
           for port in \$(seq ${MAP_PORT_START} ${MAP_PORT_END}); do iptables -t nat -D PREROUTING -p udp --dport \$port -j DNAT --to-destination ${ip}:${WG_PORT}; done
EOF
```

### 7. ✅ 网络规则自动配置

#### 7.1 iptables规则自动配置
- **FORWARD规则**: 双向FORWARD规则自动添加
- **SNAT规则**: 自动配置出网IP的SNAT规则
- **DNAT规则**: 自动添加1000个端口映射规则

#### 7.2 UFW防火墙规则自动配置
```bash
# 配置ufw防火墙规则
echo "配置ufw防火墙规则..."
ufw allow 22/tcp
ufw allow ${WG_PORT}/udp
ufw allow ${MAP_PORT_START}:${MAP_PORT_END}/udp
```

### 8. ✅ 服务自动启动与配置

#### 8.1 systemd服务配置
```bash
# 设置systemd开机自启并启动WireGuard接口
systemctl enable wg-quick@${WG_IF}
systemctl restart wg-quick@${WG_IF}
```

#### 8.2 防火墙服务配置
```bash
ufw --force enable
ufw reload
```

### 9. ✅ 二维码自动生成

#### 9.1 客户端配置二维码生成
```bash
echo "二维码（使用qrencode显示）："
qrencode -t ansiutf8 < "$CLIENT_CONF"
```

### 10. ✅ DNS配置自动化

#### 10.1 DNS服务器配置
```bash
# 设置DNS（可根据需要修改）
DNS="1.1.1.1"
```

---

## 🚀 建议添加的功能

### 1. 🔄 网络连接状态监控
```bash
# 添加网络连接状态检查
check_network_connectivity() {
    echo "检查网络连接状态..."
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        echo "警告: 网络连接异常"
        return 1
    fi
    echo "网络连接正常"
    return 0
}
```

### 2. 🔄 端口冲突检测
```bash
# 添加端口冲突检测
check_port_conflict() {
    local port=$1
    if netstat -tuln | grep -q ":$port "; then
        echo "警告: 端口 $port 已被占用"
        return 1
    fi
    return 0
}
```

### 3. 🔄 配置文件备份与恢复
```bash
# 添加配置文件备份功能
backup_configs() {
    local backup_dir="/root/VPS配置WG/backup/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    cp -r /etc/wireguard/* "$backup_dir/"
    cp -r "$WG_DIR"/* "$backup_dir/"
    echo "配置文件已备份到: $backup_dir"
}
```

### 4. 🔄 日志记录与监控
```bash
# 添加详细日志记录
log_message() {
    local level=$1
    local message=$2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a /var/log/wireguard-deploy.log
}
```

### 5. 🔄 性能监控
```bash
# 添加性能监控
monitor_performance() {
    echo "WireGuard接口状态:"
    wg show
    echo "网络接口统计:"
    cat /proc/net/dev | grep -E "(wg|eth|ens)"
    echo "内存使用情况:"
    free -h
}
```

### 6. 🔄 自动故障恢复
```bash
# 添加自动故障恢复
auto_recovery() {
    echo "检查WireGuard服务状态..."
    for interface in $(wg show interfaces); do
        if ! systemctl is-active --quiet wg-quick@$interface; then
            echo "重启WireGuard接口: $interface"
            systemctl restart wg-quick@$interface
        fi
    done
}
```

### 7. 🔄 客户端连接状态监控
```bash
# 添加客户端连接状态监控
monitor_clients() {
    echo "客户端连接状态:"
    wg show | grep -A 10 "peer:"
}
```

### 8. 🔄 自动更新检查
```bash
# 添加自动更新检查
check_updates() {
    echo "检查WireGuard更新..."
    apt list --upgradable | grep wireguard
}
```

### 9. 🔄 配置文件验证
```bash
# 添加配置文件验证
validate_config() {
    local config_file=$1
    if wg-quick strip "$config_file" >/dev/null 2>&1; then
        echo "配置文件 $config_file 验证通过"
        return 0
    else
        echo "配置文件 $config_file 验证失败"
        return 1
    fi
}
```

### 10. 🔄 多DNS服务器支持
```bash
# 添加多DNS服务器支持
setup_multiple_dns() {
    local dns_servers="1.1.1.1,8.8.8.8,9.9.9.9"
    echo "配置多DNS服务器: $dns_servers"
    # 在客户端配置中使用多个DNS服务器
}
```

---

## 📊 功能完整性评估

### ✅ 已实现的核心功能
1. **系统环境检查** - 用户权限、APT锁冲突解决
2. **网络接口检测** - 自动检测外部网络接口和公网IP
3. **多实例支持** - 支持多个WireGuard实例
4. **密钥管理** - 自动生成服务端和客户端密钥
5. **配置文件生成** - 自动生成服务端和客户端配置
6. **网络规则配置** - 自动配置iptables和UFW规则
7. **服务管理** - 自动启动和配置systemd服务
8. **二维码生成** - 自动生成客户端配置二维码
9. **DNS配置** - 自动配置DNS服务器

### 🔄 建议添加的增强功能
1. **网络监控** - 连接状态监控和故障检测
2. **性能监控** - 系统资源使用监控
3. **日志管理** - 详细的操作日志记录
4. **备份恢复** - 配置文件备份和恢复
5. **自动更新** - 软件包更新检查
6. **故障恢复** - 自动故障检测和恢复
7. **配置验证** - 配置文件语法验证
8. **多DNS支持** - 多个DNS服务器配置

---

## 🎯 总结

当前的Wireguard脚本已经实现了非常完整的自动化功能，包括：
- ✅ 智能APT锁冲突解决
- ✅ 外部网络接口自动检测
- ✅ 多实例WireGuard自动配置
- ✅ 密钥对自动生成
- ✅ 配置文件自动生成
- ✅ 网络规则自动配置
- ✅ 服务自动启动
- ✅ 二维码自动生成
- ✅ DNS自动配置

建议添加的功能主要集中在监控、日志、备份和故障恢复方面，这些功能可以进一步提升系统的可靠性和可维护性。
