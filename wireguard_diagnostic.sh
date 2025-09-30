#!/bin/bash

# WireGuard连接诊断脚本
# 用于诊断WireGuard连接后数据不通的问题

echo "=========================================="
echo "WireGuard连接诊断脚本"
echo "开始时间: $(date)"
echo "=========================================="

# 1. 检查WireGuard服务状态
echo "1. 检查WireGuard服务状态"
echo "----------------------------------------"
echo "WireGuard接口状态:"
wg show 2>/dev/null || echo "WireGuard未运行或未安装"
echo ""

echo "WireGuard服务状态:"
systemctl status wg-quick@wg0 2>/dev/null || echo "wg0服务未运行"
systemctl status wg-quick@wg1 2>/dev/null || echo "wg1服务未运行"
echo ""

# 2. 检查网络接口
echo "2. 检查网络接口"
echo "----------------------------------------"
echo "所有网络接口:"
ip -br a
echo ""

echo "路由表:"
ip route
echo ""

echo "默认网关:"
ip route | grep default
echo ""

# 3. 检查防火墙状态
echo "3. 检查防火墙状态"
echo "----------------------------------------"
echo "UFW状态:"
ufw status verbose
echo ""

echo "iptables规则:"
echo "FORWARD链:"
iptables -L FORWARD -n -v
echo ""

echo "NAT表POSTROUTING链:"
iptables -t nat -L POSTROUTING -n -v
echo ""

echo "NAT表PREROUTING链:"
iptables -t nat -L PREROUTING -n -v
echo ""

# 4. 检查IP转发
echo "4. 检查IP转发"
echo "----------------------------------------"
echo "IP转发状态:"
sysctl net.ipv4.ip_forward
echo ""

echo "sysctl.conf中的IP转发配置:"
grep -i "ip_forward" /etc/sysctl.conf || echo "未找到IP转发配置"
echo ""

# 5. 检查WireGuard配置文件
echo "5. 检查WireGuard配置文件"
echo "----------------------------------------"
echo "WireGuard配置文件:"
ls -la /etc/wireguard/
echo ""

if [ -f "/etc/wireguard/wg0.conf" ]; then
    echo "wg0.conf内容:"
    cat /etc/wireguard/wg0.conf
    echo ""
fi

if [ -f "/etc/wireguard/wg1.conf" ]; then
    echo "wg1.conf内容:"
    cat /etc/wireguard/wg1.conf
    echo ""
fi

# 6. 检查客户端配置
echo "6. 检查客户端配置"
echo "----------------------------------------"
echo "客户端配置目录:"
ls -la /root/VPS配置WG/ 2>/dev/null || echo "客户端配置目录不存在"
echo ""

if [ -d "/root/VPS配置WG" ]; then
    echo "客户端配置文件:"
    find /root/VPS配置WG -name "*.conf" -exec echo "文件: {}" \; -exec cat {} \; -exec echo "" \;
fi

# 7. 检查网络连接
echo "7. 检查网络连接"
echo "----------------------------------------"
echo "测试到8.8.8.8的连接:"
ping -c 3 8.8.8.8
echo ""

echo "测试到1.1.1.1的连接:"
ping -c 3 1.1.1.1
echo ""

# 8. 检查端口监听
echo "8. 检查端口监听"
echo "----------------------------------------"
echo "WireGuard相关端口监听:"
netstat -tuln | grep -E "(52835|52845|55835)" || echo "未发现WireGuard端口监听"
echo ""

# 9. 检查系统日志
echo "9. 检查系统日志"
echo "----------------------------------------"
echo "WireGuard相关日志:"
journalctl -u wg-quick@wg0 --no-pager -n 20 2>/dev/null || echo "无wg0日志"
journalctl -u wg-quick@wg1 --no-pager -n 20 2>/dev/null || echo "无wg1日志"
echo ""

echo "内核日志中的网络相关错误:"
dmesg | grep -i -E "(wireguard|wg|iptables|forward)" | tail -10
echo ""

# 10. 检查DNS解析
echo "10. 检查DNS解析"
echo "----------------------------------------"
echo "DNS解析测试:"
nslookup google.com 8.8.8.8
echo ""

# 11. 检查网络统计
echo "11. 检查网络统计"
echo "----------------------------------------"
echo "网络接口统计:"
cat /proc/net/dev | grep -E "(wg|eth|ens)"
echo ""

# 12. 生成诊断报告
echo "12. 生成诊断报告"
echo "----------------------------------------"
echo "诊断完成时间: $(date)"
echo ""

# 生成修复建议
echo "=========================================="
echo "修复建议"
echo "=========================================="

# 检查常见问题并提供修复建议
if ! wg show >/dev/null 2>&1; then
    echo "❌ WireGuard未运行"
    echo "修复建议: systemctl start wg-quick@wg0"
fi

if [ "$(sysctl -n net.ipv4.ip_forward)" != "1" ]; then
    echo "❌ IP转发未启用"
    echo "修复建议: sysctl -w net.ipv4.ip_forward=1"
fi

if ! iptables -L FORWARD | grep -q "ACCEPT.*wg"; then
    echo "❌ 缺少WireGuard FORWARD规则"
    echo "修复建议: 重新运行WireGuard部署脚本"
fi

if ! iptables -t nat -L POSTROUTING | grep -q "MASQUERADE\|SNAT"; then
    echo "❌ 缺少NAT规则"
    echo "修复建议: 重新运行WireGuard部署脚本"
fi

echo ""
echo "如果问题仍然存在，请检查:"
echo "1. 服务器防火墙是否阻止了WireGuard端口"
echo "2. 云服务商安全组是否开放了相应端口"
echo "3. 客户端配置是否正确"
echo "4. 网络运营商是否阻止了VPN流量"
echo ""
echo "=========================================="
