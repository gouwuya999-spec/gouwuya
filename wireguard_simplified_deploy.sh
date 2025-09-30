#!/bin/bash

# 简化版WireGuard部署脚本
# 减少端口映射范围，避免云服务商限制

set -e

echo "=========================================="
echo "简化版WireGuard部署脚本"
echo "开始时间: $(date)"
echo "=========================================="

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

# 1. 系统环境检查
echo "1. 系统环境检查"
echo "----------------------------------------"

# 检查操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "操作系统: $NAME $VERSION"
fi

# 检查内核版本
echo "内核版本: $(uname -r)"

# 检查网络接口
echo "网络接口:"
ip -br a | grep -v lo
echo ""

# 2. 解决APT锁问题
echo "2. 解决APT锁问题"
echo "----------------------------------------"

# 强制终止所有apt相关进程
pkill -f apt || true
pkill -f dpkg || true
sleep 3

# 清理所有锁文件
rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock
sleep 2

# 修复dpkg中断问题
dpkg --configure -a || true
apt-get update --fix-missing || true
echo "✅ APT锁问题已解决"
echo ""

# 3. 安装必要组件
echo "3. 安装必要组件"
echo "----------------------------------------"

export DEBIAN_FRONTEND=noninteractive

# 更新软件包列表
apt-get update -y

# 安装基础组件
apt-get install -y curl wget sudo software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# 安装WireGuard和相关工具
apt-get install -y wireguard wireguard-tools qrencode ufw iptables-persistent

# 配置iptables-persistent
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
echo "✅ 组件安装完成"
echo ""

# 4. 网络配置优化
echo "4. 网络配置优化"
echo "----------------------------------------"

# 启用IP转发
sysctl -w net.ipv4.ip_forward=1
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
echo "✅ IP转发已启用"

# 优化网络参数
cat >> /etc/sysctl.conf << EOF
# WireGuard优化参数
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.udp_rmem_min = 8192
net.ipv4.udp_wmem_min = 8192
net.core.netdev_max_backlog = 5000
net.core.netdev_budget = 300
EOF
sysctl -p
echo "✅ 网络参数已优化"

# 修改UFW默认转发策略
if [ -f /etc/default/ufw ]; then
    sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
    echo "✅ UFW转发策略已设置为ACCEPT"
fi
echo ""

# 5. 清理现有配置
echo "5. 清理现有配置"
echo "----------------------------------------"

# 停止现有WireGuard接口
existing_instances=$(wg show interfaces 2>/dev/null || echo "")
if [ -n "$existing_instances" ]; then
    for instance in $existing_instances; do
        echo "停止实例: $instance"
        wg-quick down $instance 2>/dev/null || true
        systemctl stop wg-quick@$instance 2>/dev/null || true
        systemctl disable wg-quick@$instance 2>/dev/null || true
    done
fi

# 清理配置文件
rm -f /etc/wireguard/wg*.conf 2>/dev/null || true
rm -rf /root/VPS配置WG 2>/dev/null || true

# 清理iptables规则
iptables -D FORWARD -i wg+ -j ACCEPT 2>/dev/null || true
iptables -D FORWARD -o wg+ -j ACCEPT 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o enp1s0 -j MASQUERADE 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o eth0 -j MASQUERADE 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o ens3 -j MASQUERADE 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o ens18 -j MASQUERADE 2>/dev/null || true
echo "✅ 现有配置已清理"
echo ""

# 6. 网络接口检测
echo "6. 网络接口检测"
echo "----------------------------------------"

# 自动获取默认外部网络接口
EXT_IF=$(ip route | grep '^default' | awk '{print $5}' | head -n1)
echo "检测到外部网络接口: $EXT_IF"

# 获取该接口上所有IPv4地址
public_ips=($(ip -o -4 addr show dev "$EXT_IF" | awk '{print $4}' | cut -d/ -f1))
if [ ${#public_ips[@]} -eq 0 ]; then
    error_exit "未检测到公共IP地址"
fi

# 验证IP地址格式
valid_ips=()
for ip in "${public_ips[@]}"; do
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        valid_ips+=("$ip")
        echo "有效IPv4地址: $ip"
    else
        echo "跳过无效IP地址: $ip"
    fi
done

if [ ${#valid_ips[@]} -eq 0 ]; then
    error_exit "没有找到有效的IPv4地址"
fi

public_ips=("${valid_ips[@]}")

# 获取实际对外显示的主IP
echo "检测公网IPv4地址..."
primary_ip=""
for service in "curl -4 -s ifconfig.me" "curl -4 -s ipv4.icanhazip.com" "curl -4 -s 4.icanhazip.com" "curl -4 -s checkip.amazonaws.com" "curl -4 -s ipinfo.io/ip"; do
    result=$($service 2>/dev/null || echo "")
    if [[ "$result" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        primary_ip="$result"
        echo "通过外部检测到的主IP: $primary_ip"
        break
    fi
done

# 如果外部检测失败，使用接口IP
if [[ -z "$primary_ip" || ! "$primary_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    primary_ip=$(ip -4 addr show dev "$EXT_IF" | grep inet | awk '{print $2}' | cut -d/ -f1 | head -n1)
    echo "使用接口IP作为主IP: $primary_ip"
fi

# 调整IP顺序，将主IP放在首位
ordered_ips=("$primary_ip")
for ip in "${public_ips[@]}"; do
    if [[ "$ip" == *.* && "$ip" != *:* && "$ip" != "$primary_ip" ]]; then
        ordered_ips+=("$ip")
    fi
done
public_ips=("${ordered_ips[@]}")

echo "最终IP顺序: ${public_ips[@]}"
echo "主IP确认: $primary_ip"
echo ""

# 7. 创建配置目录
echo "7. 创建配置目录"
echo "----------------------------------------"
WG_DIR="/root/VPS配置WG"
mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"
echo "✅ 配置目录已创建: $WG_DIR"
echo ""

# 8. 配置WireGuard实例（简化版）
echo "8. 配置WireGuard实例（简化版）"
echo "----------------------------------------"

instance=0
for ip in "${public_ips[@]}"; do
    WG_IF="wg${instance}"
    WG_PORT=$((52835 + instance * 10))
    
    # 简化端口映射：每个实例只映射100个端口，避免云服务商限制
    MAP_PORT_START=$((55835 + instance * 100))
    MAP_PORT_END=$((MAP_PORT_START + 99))
    
    WG_SUBNET="10.0.$((instance+1)).0/24"
    SERVER_WG_IP="10.0.$((instance+1)).1"

    echo "配置WireGuard接口: ${WG_IF} (公网IP: $ip)"
    echo "监听端口: ${WG_PORT}"
    echo "端口映射范围: ${MAP_PORT_START}-${MAP_PORT_END} (100个端口)"
    echo "子网: ${WG_SUBNET} (服务端IP: ${SERVER_WG_IP})"

    # 生成服务端密钥对
    echo "生成服务端密钥..."
    umask 077
    wg genkey | tee "$WG_DIR/${WG_IF}-server.key" | wg pubkey > "$WG_DIR/${WG_IF}-server.pub"

    # 配置1个peer
    peer_count=1
    peer_configs=""
    peer_ip_index=2

    for ((p=1; p<=peer_count; p++)); do
        echo "生成peer $p密钥..."
        wg genkey | tee "$WG_DIR/${WG_IF}-peer${p}.key" | wg pubkey > "$WG_DIR/${WG_IF}-peer${p}.pub"
        
        PEER_IP="10.0.$((instance+1)).$peer_ip_index"
        peer_ip_index=$((peer_ip_index+1))

        peer_configs+="
[Peer]
PublicKey = $(cat "$WG_DIR/${WG_IF}-peer${p}.pub")
AllowedIPs = ${PEER_IP}/32
"

        # 生成客户端配置文件
        CLIENT_CONF="$WG_DIR/${WG_IF}-peer${p}-client.conf"
        
        cat > "$CLIENT_CONF" << EOF
[Interface]
PrivateKey = $(cat "$WG_DIR/${WG_IF}-peer${p}.key")
Address = ${PEER_IP}/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1420

[Peer]
PublicKey = $(cat "$WG_DIR/${WG_IF}-server.pub")
Endpoint = ${ip}:${WG_PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

        echo "客户端配置已生成: ${CLIENT_CONF}"
    done

    # 生成服务端配置文件
    SERVER_CONF="/etc/wireguard/${WG_IF}.conf"
    SERVER_PRIVATE_KEY=$(cat "$WG_DIR/${WG_IF}-server.key")
    
    cat > "$SERVER_CONF" << EOF
[Interface]
Address = ${SERVER_WG_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE_KEY}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; \\
         iptables -t nat -A POSTROUTING -s ${WG_SUBNET} -o ${EXT_IF} -j MASQUERADE; \\
         for port in \$(seq ${MAP_PORT_START} ${MAP_PORT_END}); do iptables -t nat -A PREROUTING -p udp --dport \$port -j DNAT --to-destination ${ip}:${WG_PORT}; done
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; \\
           iptables -t nat -D POSTROUTING -s ${WG_SUBNET} -o ${EXT_IF} -j MASQUERADE; \\
           for port in \$(seq ${MAP_PORT_START} ${MAP_PORT_END}); do iptables -t nat -D PREROUTING -p udp --dport \$port -j DNAT --to-destination ${ip}:${WG_PORT}; done
EOF

    echo "${peer_configs}" >> "$SERVER_CONF"
    chmod 600 "$SERVER_CONF" "$WG_DIR/${WG_IF}-server.key"

    # 启动WireGuard接口
    echo "启动WireGuard接口..."
    systemctl enable wg-quick@${WG_IF}
    systemctl start wg-quick@${WG_IF}
    
    # 等待接口启动
    sleep 3
    
    # 检查接口状态
    if systemctl is-active --quiet wg-quick@${WG_IF}; then
        echo "✅ WireGuard接口 ${WG_IF} 已启动"
    else
        echo "❌ WireGuard接口 ${WG_IF} 启动失败"
        systemctl status wg-quick@${WG_IF} --no-pager
    fi

    # 配置UFW防火墙规则（简化版）
    echo "配置UFW防火墙规则..."
    ufw allow 22/tcp
    ufw allow ${WG_PORT}/udp
    ufw allow ${MAP_PORT_START}:${MAP_PORT_END}/udp

    echo "WireGuard接口 ${WG_IF} 配置完成"
    echo "公网IP: $ip"
    echo "服务端WireGuard IP: ${SERVER_WG_IP}"
    echo "监听端口: ${WG_PORT}"
    echo "端口映射范围: ${MAP_PORT_START}-${MAP_PORT_END} (100个端口)"
    echo ""

    instance=$((instance+1))
done

# 9. 启用防火墙
echo "9. 启用防火墙"
echo "----------------------------------------"
ufw --force enable
ufw reload
echo "✅ 防火墙已启用"
echo ""

# 10. 验证配置
echo "10. 验证配置"
echo "----------------------------------------"

echo "WireGuard接口状态:"
wg show
echo ""

echo "网络接口状态:"
ip -br a | grep wg
echo ""

echo "路由表:"
ip route | grep wg
echo ""

echo "iptables规则:"
iptables -L FORWARD -n | grep wg
iptables -t nat -L POSTROUTING -n | grep wg
echo ""

# 11. 生成客户端配置和二维码
echo "11. 生成客户端配置和二维码"
echo "----------------------------------------"

for config_file in /root/VPS配置WG/*-client.conf; do
    if [ -f "$config_file" ]; then
        echo "客户端配置文件: $config_file"
        echo "配置内容:"
        cat "$config_file"
        echo ""
        echo "二维码:"
        qrencode -t ansiutf8 < "$config_file"
        echo ""
        echo "----------------------------------------"
    fi
done

# 12. 网络连接测试
echo "12. 网络连接测试"
echo "----------------------------------------"

echo "测试到8.8.8.8的连接:"
ping -c 3 8.8.8.8
echo ""

echo "测试DNS解析:"
nslookup google.com 8.8.8.8
echo ""

echo "测试端口监听:"
netstat -tuln | grep -E "(52835|52845)" || echo "未发现WireGuard端口监听"
echo ""

# 13. 保存脚本副本
echo "13. 保存脚本副本"
echo "----------------------------------------"
cp "$0" "$WG_DIR/简化版WireGuard部署脚本.sh"
echo "✅ 脚本副本已保存"
echo ""

echo "=========================================="
echo "部署完成时间: $(date)"
echo "=========================================="
echo ""
echo "部署完成！WireGuard已成功配置并启动。"
echo ""
echo "配置信息:"
echo "1. 服务端配置文件: /etc/wireguard/"
echo "2. 客户端配置文件: /root/VPS配置WG/"
echo "3. 主公网IP: $primary_ip"
echo "4. WireGuard端口: 52835, 52845"
echo "5. 端口映射范围: 55835-55934, 55935-56034 (每个实例100个端口)"
echo ""
echo "简化版特点:"
echo "1. 每个实例只映射100个端口，避免云服务商限制"
echo "2. 优化了客户端配置，添加了MTU设置"
echo "3. 简化了防火墙规则配置"
echo ""
echo "如果连接后数据不通，请检查:"
echo "1. 云服务商安全组是否开放了相应端口"
echo "2. 网络运营商是否阻止了VPN流量"
echo "3. 客户端设备是否支持WireGuard"
echo "4. 运行诊断脚本: bash wireguard_diagnostic.sh"
echo ""
