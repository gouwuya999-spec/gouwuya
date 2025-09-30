#!/bin/bash

# WireGuard连接修复脚本
# 用于修复WireGuard连接后数据不通的问题

echo "=========================================="
echo "WireGuard连接修复脚本"
echo "开始时间: $(date)"
echo "=========================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "错误: 请以root用户运行此脚本"
    exit 1
fi

# 1. 修复IP转发问题
echo "1. 修复IP转发问题"
echo "----------------------------------------"
echo "当前IP转发状态: $(sysctl -n net.ipv4.ip_forward)"

if [ "$(sysctl -n net.ipv4.ip_forward)" != "1" ]; then
    echo "启用IP转发..."
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    echo "✅ IP转发已启用"
else
    echo "✅ IP转发已启用"
fi
echo ""

# 2. 修复UFW防火墙配置
echo "2. 修复UFW防火墙配置"
echo "----------------------------------------"
echo "修改UFW默认转发策略..."
if [ -f /etc/default/ufw ]; then
    sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
    echo "✅ UFW转发策略已设置为ACCEPT"
else
    echo "⚠️ UFW配置文件不存在"
fi
echo ""

# 3. 重新配置WireGuard接口
echo "3. 重新配置WireGuard接口"
echo "----------------------------------------"

# 获取外部网络接口
EXT_IF=$(ip route | grep '^default' | awk '{print $5}' | head -n1)
echo "检测到外部网络接口: $EXT_IF"

# 获取公网IP
PUBLIC_IP=$(curl -4 -s ifconfig.me || curl -4 -s ipv4.icanhazip.com || curl -4 -s 4.icanhazip.com || curl -4 -s checkip.amazonaws.com || curl -4 -s ipinfo.io/ip)
echo "检测到公网IP: $PUBLIC_IP"

# 停止现有WireGuard接口
echo "停止现有WireGuard接口..."
wg-quick down wg0 2>/dev/null || true
wg-quick down wg1 2>/dev/null || true
systemctl stop wg-quick@wg0 2>/dev/null || true
systemctl stop wg-quick@wg1 2>/dev/null || true
echo "✅ 现有接口已停止"

# 4. 清理并重新创建iptables规则
echo "4. 清理并重新创建iptables规则"
echo "----------------------------------------"

# 清理现有规则
echo "清理现有iptables规则..."
iptables -D FORWARD -i wg+ -j ACCEPT 2>/dev/null || true
iptables -D FORWARD -o wg+ -j ACCEPT 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -o $EXT_IF -j MASQUERADE 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.1.0/24 -o $EXT_IF -j MASQUERADE 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 10.0.2.0/24 -o $EXT_IF -j MASQUERADE 2>/dev/null || true
echo "✅ 现有规则已清理"

# 5. 重新生成WireGuard配置
echo "5. 重新生成WireGuard配置"
echo "----------------------------------------"

# 创建配置目录
mkdir -p /root/VPS配置WG
cd /root/VPS配置WG

# 生成新的密钥对
echo "生成新的密钥对..."
wg genkey | tee wg0-server.key | wg pubkey > wg0-server.pub
wg genkey | tee wg0-peer1.key | wg pubkey > wg0-peer1.pub
chmod 600 wg0-server.key wg0-peer1.key
echo "✅ 新密钥对已生成"

# 6. 创建修复后的服务端配置
echo "6. 创建修复后的服务端配置"
echo "----------------------------------------"

cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.0.1.1/24
ListenPort = 52835
PrivateKey = $(cat wg0-server.key)
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.0.1.0/24 -o $EXT_IF -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.0.1.0/24 -o $EXT_IF -j MASQUERADE

[Peer]
PublicKey = $(cat wg0-peer1.pub)
AllowedIPs = 10.0.1.2/32
EOF

chmod 600 /etc/wireguard/wg0.conf
echo "✅ 服务端配置已创建"

# 7. 创建修复后的客户端配置
echo "7. 创建修复后的客户端配置"
echo "----------------------------------------"

cat > /root/VPS配置WG/wg0-peer1-client.conf << EOF
[Interface]
PrivateKey = $(cat wg0-peer1.key)
Address = 10.0.1.2/32
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = $(cat wg0-server.pub)
Endpoint = $PUBLIC_IP:52835
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

echo "✅ 客户端配置已创建"

# 8. 启动WireGuard服务
echo "8. 启动WireGuard服务"
echo "----------------------------------------"

# 启用并启动服务
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# 等待服务启动
sleep 3

# 检查服务状态
if systemctl is-active --quiet wg-quick@wg0; then
    echo "✅ WireGuard服务已启动"
else
    echo "❌ WireGuard服务启动失败"
    echo "错误信息:"
    systemctl status wg-quick@wg0 --no-pager
    exit 1
fi

# 9. 配置防火墙规则
echo "9. 配置防火墙规则"
echo "----------------------------------------"

# 配置UFW规则
ufw allow 22/tcp
ufw allow 52835/udp
ufw allow 52845/udp
ufw allow 55835:56834/udp
ufw --force enable
ufw reload
echo "✅ 防火墙规则已配置"

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

# 11. 生成二维码
echo "11. 生成二维码"
echo "----------------------------------------"
echo "客户端配置二维码:"
qrencode -t ansiutf8 < /root/VPS配置WG/wg0-peer1-client.conf
echo ""

# 12. 测试连接
echo "12. 测试连接"
echo "----------------------------------------"
echo "测试到8.8.8.8的连接:"
ping -c 3 8.8.8.8
echo ""

echo "测试DNS解析:"
nslookup google.com 8.8.8.8
echo ""

echo "=========================================="
echo "修复完成时间: $(date)"
echo "=========================================="
echo ""
echo "修复完成！请使用以下信息:"
echo "1. 客户端配置文件: /root/VPS配置WG/wg0-peer1-client.conf"
echo "2. 服务器公网IP: $PUBLIC_IP"
echo "3. WireGuard端口: 52835"
echo "4. 客户端IP: 10.0.1.2"
echo ""
echo "如果问题仍然存在，请检查:"
echo "1. 云服务商安全组是否开放了52835端口"
echo "2. 网络运营商是否阻止了VPN流量"
echo "3. 客户端设备是否支持WireGuard"
echo ""
