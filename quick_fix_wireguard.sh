#!/bin/bash

# WireGuard连接问题快速修复脚本
# 专门解决连接后数据不通的问题

echo "=========================================="
echo "WireGuard连接问题快速修复脚本"
echo "开始时间: $(date)"
echo "=========================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "错误: 请以root用户运行此脚本"
    exit 1
fi

# 1. 诊断当前状态
echo "1. 诊断当前状态"
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

echo "IP转发状态:"
sysctl net.ipv4.ip_forward
echo ""

# 2. 快速修复步骤
echo "2. 快速修复步骤"
echo "----------------------------------------"

# 2.1 修复IP转发
echo "2.1 修复IP转发..."
if [ "$(sysctl -n net.ipv4.ip_forward)" != "1" ]; then
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    echo "✅ IP转发已启用"
else
    echo "✅ IP转发已启用"
fi
echo ""

# 2.2 修复UFW配置
echo "2.2 修复UFW配置..."
if [ -f /etc/default/ufw ]; then
    sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
    echo "✅ UFW转发策略已设置为ACCEPT"
fi
echo ""

# 2.3 重新配置防火墙规则
echo "2.3 重新配置防火墙规则..."

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

# 2.4 重新配置UFW规则
echo "2.4 重新配置UFW规则..."

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

# 2.5 重启WireGuard服务
echo "2.5 重启WireGuard服务..."

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

# 3. 验证修复结果
echo "3. 验证修复结果"
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

# 4. 网络连接测试
echo "4. 网络连接测试"
echo "----------------------------------------"

echo "测试到8.8.8.8的连接:"
ping -c 3 8.8.8.8
echo ""

echo "测试DNS解析:"
nslookup google.com 8.8.8.8
echo ""

# 5. 生成修复报告
echo "5. 生成修复报告"
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
echo ""
