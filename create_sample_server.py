#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
创建示例服务器连接数据
从VPS数据中提取服务器信息并创建服务器连接配置
"""

import json
import yaml
import os
from datetime import datetime

def create_sample_server():
    """创建示例服务器连接数据"""
    
    # 读取VPS数据
    try:
        with open('vps_data.yml', 'r', encoding='utf-8') as f:
            vps_data = yaml.safe_load(f)
    except Exception as e:
        print(f"读取VPS数据失败: {e}")
        return
    
    # 从VPS数据中提取一个在用的服务器
    vps_servers = vps_data.get('vps_servers', [])
    active_servers = [vps for vps in vps_servers if vps.get('status') == '在用']
    
    if not active_servers:
        print("没有找到在用的VPS服务器")
        return
    
    # 选择第一个在用的服务器
    selected_vps = active_servers[0]
    print(f"选择服务器: {selected_vps.get('name')} - {selected_vps.get('ip_address')}")
    
    # 创建服务器连接配置
    server_config = {
        "id": f"server_{int(datetime.now().timestamp())}",
        "name": selected_vps.get('name', 'VPS服务器'),
        "host": selected_vps.get('ip_address', '127.0.0.1'),
        "port": 22,
        "username": "root",
        "authType": "password",
        "password": "your_password_here",  # 用户需要修改为实际密码
        "privateKeyPath": "",
        "passphrase": "",
        "ipLocation": selected_vps.get('country', ''),
        "createdAt": datetime.now().isoformat()
    }
    
    # 保存到electron-store格式
    electron_store_data = {
        "servers": [server_config]
    }
    
    # 获取electron-store的存储路径
    import os
    user_home = os.path.expanduser("~")
    electron_store_path = os.path.join(user_home, "AppData", "Roaming", "vps-management-system", "config.json")
    
    # 确保目录存在
    os.makedirs(os.path.dirname(electron_store_path), exist_ok=True)
    
    # 写入配置文件
    try:
        with open(electron_store_path, 'w', encoding='utf-8') as f:
            json.dump(electron_store_data, f, ensure_ascii=False, indent=2)
        print(f"服务器配置已保存到: {electron_store_path}")
        print(f"服务器信息:")
        print(f"  名称: {server_config['name']}")
        print(f"  地址: {server_config['host']}")
        print(f"  端口: {server_config['port']}")
        print(f"  用户名: {server_config['username']}")
        print(f"  位置: {server_config['ipLocation']}")
        print(f"\n注意: 请修改密码为实际密码后重新启动应用")
        
    except Exception as e:
        print(f"保存服务器配置失败: {e}")

if __name__ == "__main__":
    create_sample_server()
