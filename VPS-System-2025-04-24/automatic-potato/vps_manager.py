#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import yaml
import logging
import argparse
import threading
import time
import datetime
from vps_connection import VPSConnectionManager
from billing_manager import BillingManager
import pandas as pd
from tabulate import tabulate

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("vps_manager.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class VPSManager:
    VERSION = "1.0.1"  # 版本号
    
    def __init__(self, config_file='vps_data.yml'):
        """
        初始化VPS管理器
        
        Args:
            config_file (str): 配置文件路径
        """
        self.config_file = config_file
        self.vps_connection_manager = VPSConnectionManager()
        self.billing_manager = BillingManager(config_file)
        self.load_config()
        logger.info(f"VPS管理器 v{self.VERSION} 已初始化")
        
    def load_config(self):
        """加载配置并初始化连接管理器"""
        try:
            # 从账单管理器获取VPS数据
            vps_data = self.billing_manager.get_all_vps()
            
            # 与连接管理器同步
            added, removed = self.vps_connection_manager.sync_with_billing(vps_data)
            
            # 记录同步结果
            if added > 0 or removed > 0:
                logger.info(f"与连接管理器同步: 添加了 {added} 台VPS，删除了 {removed} 台VPS")
                
            logger.info(f"已加载 {len(vps_data)} 台VPS配置")
        except Exception as e:
            logger.error(f"加载配置失败: {str(e)}")
    
    def connect_all_vps(self):
        """连接所有活跃的VPS"""
        self.vps_connection_manager.connect_all()
    
    def disconnect_all_vps(self):
        """断开所有VPS连接"""
        self.vps_connection_manager.disconnect_all()
    
    def execute_command_on_all(self, command):
        """
        在所有连接的VPS上执行命令
        
        Args:
            command (str): 要执行的命令
            
        Returns:
            dict: 执行结果
        """
        return self.vps_connection_manager.execute_on_all(command)
    
    def execute_command_on_vps(self, vps_name, command):
        """
        在指定VPS上执行命令
        
        Args:
            vps_name (str): VPS名称
            command (str): 要执行的命令
            
        Returns:
            tuple: (stdout, stderr)
        """
        vps_conn = self.vps_connection_manager.get_connection(vps_name)
        if vps_conn and vps_conn.connected:
            return vps_conn.execute_command(command)
        else:
            logger.error(f"VPS {vps_name} 未连接，无法执行命令")
            return "", "Not connected"
    
    def connect_vps(self, vps_name):
        """
        连接指定的VPS
        
        Args:
            vps_name (str): VPS名称
            
        Returns:
            bool: 是否连接成功
        """
        vps_conn = self.vps_connection_manager.get_connection(vps_name)
        if vps_conn:
            return vps_conn.connect()
        else:
            logger.error(f"找不到VPS: {vps_name}")
            return False
            
    def disconnect_vps(self, vps_name):
        """
        断开指定VPS的连接
        
        Args:
            vps_name (str): VPS名称
            
        Returns:
            bool: 是否成功断开连接
        """
        vps_conn = self.vps_connection_manager.get_connection(vps_name)
        if vps_conn and vps_conn.connected:
            vps_conn.disconnect()
            return True
        else:
            logger.warning(f"VPS {vps_name} 未连接或不存在")
            return False
    
    def display_vps_list(self):
        """显示VPS列表"""
        vps_data = self.billing_manager.get_all_vps()
        
        # 提取要显示的字段
        headers = ["名称", "IP地址", "是否使用NAT", "状态", "到期日期", "使用时长", "月单价", "总价"]
        data = []
        
        for vps in vps_data:
            row = [
                vps.get('name', ''),
                vps.get('host', ''),
                '是' if vps.get('use_nat', False) else '否',
                vps.get('status', ''),
                vps.get('expire_date', ''),
                vps.get('usage_period', ''),
                vps.get('price_per_month', 0),
                vps.get('total_price', 0)
            ]
            data.append(row)
        
        # 添加总计行
        total_price = sum(float(vps.get('total_price', 0)) for vps in vps_data)
        total_row = ['总计', '', '', '', '', '', '', f"{total_price:.2f}"]
        data.append(total_row)
        
        # 使用tabulate美化输出
        table = tabulate(data, headers=headers, tablefmt="grid")
        print(table)
    
    def generate_bill(self, format_type='excel', output_file=None):
        """
        生成账单
        
        Args:
            format_type (str): 账单格式，只支持'excel'
            output_file (str): 输出文件路径，默认为'vps_billing.xlsx'
            
        Returns:
            bool: 是否成功
        """
        if output_file is None:
            output_file = 'vps_billing.xlsx'
            
        if format_type.lower() != 'excel':
            logger.error(f"不支持的账单格式: {format_type}，仅支持Excel格式")
            return False
        
        # 更新价格
        self.billing_manager.update_prices()
        
        # 生成Excel账单
        return self.billing_manager.save_to_excel(output_file)
    
    def set_vps_status(self, vps_name, status):
        """
        设置VPS状态
        
        Args:
            vps_name (str): VPS名称
            status (str): 新状态，例如"在用"或"销毁"
            
        Returns:
            bool: 是否成功
        """
        # 使用账单管理器更新状态
        result = self.billing_manager.set_vps_status(vps_name, status)
        
        # 如果状态变为销毁，断开连接
        if result and status == "销毁":
            vps_conn = self.vps_connection_manager.get_connection(vps_name)
            if vps_conn and vps_conn.connected:
                vps_conn.disconnect()
                logger.info(f"VPS状态变为销毁，已断开连接: {vps_name}")
        
        return result
    
    def add_new_vps(self, vps_info):
        """
        添加新的VPS
        
        Args:
            vps_info (dict): VPS信息
            
        Returns:
            bool: 是否成功
        """
        # 添加到账单管理器
        result = self.billing_manager.add_vps(vps_info)
        
        # 如果成功，也添加到连接管理器
        if result:
            self.vps_connection_manager.add_vps(vps_info)
            
        return result
    
    def delete_vps(self, vps_name):
        """
        删除VPS
        
        Args:
            vps_name (str): VPS名称
            
        Returns:
            bool: 是否成功
        """
        # 先断开连接
        vps_conn = self.vps_connection_manager.get_connection(vps_name)
        if vps_conn and vps_conn.connected:
            vps_conn.disconnect()
            
        # 从连接管理器中删除
        if vps_name in self.vps_connection_manager.connections:
            del self.vps_connection_manager.connections[vps_name]
            logger.info(f"已从连接管理器中删除VPS: {vps_name}")
            
        # 从账单管理器中删除
        return self.billing_manager.delete_vps(vps_name)
    
    def update_vps_info(self, vps_name, **kwargs):
        """
        更新VPS信息
        
        Args:
            vps_name (str): VPS名称
            **kwargs: 要更新的字段和值
            
        Returns:
            bool: 是否成功
        """
        # 更新账单管理器中的信息
        result = self.billing_manager.update_vps(vps_name, **kwargs)
        
        # 如果更新失败，直接返回
        if not result:
            return False
            
        # 如果涉及到连接相关的更改或状态变更，需要更新连接管理器
        need_reload = any(k in kwargs for k in ['host', 'port', 'username', 'password', 'status', 'use_nat'])
        
        # 如果状态变为销毁，先断开连接
        if kwargs.get('status') == "销毁":
            vps_conn = self.vps_connection_manager.get_connection(vps_name)
            if vps_conn and vps_conn.connected:
                vps_conn.disconnect()
                logger.info(f"VPS状态变为销毁，已断开连接: {vps_name}")
                
        # 如果需要重新加载配置
        if need_reload:
            vps_conn = self.vps_connection_manager.get_connection(vps_name)
            if vps_conn and vps_conn.connected:
                vps_conn.disconnect()
                
            # 重新加载配置
            self.load_config()
            logger.info(f"VPS信息已更新，重新加载配置: {vps_name}")
            
        return result

def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description='VPS管理器 - 管理多台VPS服务器并处理账单')
    
    subparsers = parser.add_subparsers(dest='command', help='命令')
    
    # 显示版本命令
    version_parser = subparsers.add_parser('version', help='显示版本信息')
    
    # 连接命令
    connect_parser = subparsers.add_parser('connect', help='连接VPS')
    connect_parser.add_argument('--all', action='store_true', help='连接所有VPS')
    
    # 断开连接命令
    disconnect_parser = subparsers.add_parser('disconnect', help='断开VPS连接')
    disconnect_parser.add_argument('--all', action='store_true', help='断开所有VPS连接')
    
    # 列出VPS命令
    list_parser = subparsers.add_parser('list', help='列出VPS')
    
    # 执行命令
    exec_parser = subparsers.add_parser('exec', help='在VPS上执行命令')
    exec_parser.add_argument('--all', action='store_true', help='在所有VPS上执行')
    exec_parser.add_argument('--vps', help='要执行命令的VPS名称')
    exec_parser.add_argument('command', help='要执行的命令')
    
    # 生成账单命令
    bill_parser = subparsers.add_parser('bill', help='生成账单')
    bill_parser.add_argument('--format', choices=['excel', 'pdf'], default='excel', help='账单格式')
    bill_parser.add_argument('--output', help='输出文件路径')
    
    # 添加VPS命令
    add_parser = subparsers.add_parser('add', help='添加VPS')
    add_parser.add_argument('--name', required=True, help='VPS名称')
    add_parser.add_argument('--host', required=True, help='主机地址')
    add_parser.add_argument('--port', type=int, default=22, help='SSH端口')
    add_parser.add_argument('--username', required=True, help='用户名')
    add_parser.add_argument('--password', required=True, help='密码')
    add_parser.add_argument('--use-nat', action='store_true', help='是否使用NAT')
    add_parser.add_argument('--status', choices=['在用', '销毁'], default='在用', help='VPS状态')
    add_parser.add_argument('--expire-date', help='到期日期，格式如：2025/3/31')
    add_parser.add_argument('--usage-period', help='使用时长，例如：3个月+15')
    add_parser.add_argument('--price', type=float, required=True, help='月单价')
    
    # 更新VPS状态命令
    status_parser = subparsers.add_parser('status', help='更新VPS状态')
    status_parser.add_argument('--vps', required=True, help='VPS名称')
    status_parser.add_argument('--status', required=True, choices=['在用', '销毁'], help='新状态')
    
    # 删除VPS命令
    delete_parser = subparsers.add_parser('delete', help='删除VPS')
    delete_parser.add_argument('--vps', required=True, help='VPS名称')
    
    # 更新VPS信息命令
    update_parser = subparsers.add_parser('update', help='更新VPS信息')
    update_parser.add_argument('--vps', required=True, help='VPS名称')
    update_parser.add_argument('--host', help='主机地址')
    update_parser.add_argument('--port', type=int, help='SSH端口')
    update_parser.add_argument('--username', help='用户名')
    update_parser.add_argument('--password', help='密码')
    update_parser.add_argument('--use-nat', action='store_true', help='是否使用NAT')
    update_parser.add_argument('--expire-date', help='到期日期，格式如：2025/3/31')
    update_parser.add_argument('--usage-period', help='使用时长，例如：3个月+15')
    update_parser.add_argument('--price', type=float, help='月单价')
    
    return parser.parse_args()

def main():
    """主函数"""
    args = parse_args()
    
    # 初始化VPS管理器
    manager = VPSManager()
    
    if args.command == 'version':
        print(f"VPS管理器 v{manager.VERSION}")
        
    elif args.command == 'connect':
        if args.all:
            print("正在连接所有VPS...")
            manager.connect_all_vps()
            
    elif args.command == 'disconnect':
        if args.all:
            print("正在断开所有VPS连接...")
            manager.disconnect_all_vps()
            
    elif args.command == 'list':
        manager.display_vps_list()
        
    elif args.command == 'exec':
        if args.all:
            print(f"在所有VPS上执行命令: {args.command}")
            results = manager.execute_command_on_all(args.command)
            
            # 打印结果
            for vps_name, (stdout, stderr) in results.items():
                print(f"\n--- {vps_name} 执行结果 ---")
                if stdout:
                    print(f"标准输出:\n{stdout}")
                if stderr:
                    print(f"标准错误:\n{stderr}")
        elif args.vps:
            print(f"在 {args.vps} 上执行命令: {args.command}")
            stdout, stderr = manager.execute_command_on_vps(args.vps, args.command)
            
            if stdout:
                print(f"标准输出:\n{stdout}")
            if stderr:
                print(f"标准错误:\n{stderr}")
        else:
            print("请指定VPS或使用--all参数")
            
    elif args.command == 'bill':
        format_type = args.format
        output_file = args.output
        
        print(f"生成{format_type}格式的账单...")
        if manager.generate_bill(format_type, output_file):
            output_path = output_file if output_file else (
                'vps_billing.xlsx' if format_type == 'excel' else 'vps_billing.pdf'
            )
            print(f"账单已保存到: {output_path}")
        else:
            print("生成账单失败")
            
    elif args.command == 'add':
        # 创建VPS信息字典
        vps_info = {
            'name': args.name,
            'host': args.host,
            'port': args.port,
            'username': args.username,
            'password': args.password,
            'use_nat': args.use_nat,
            'status': args.status,
            'price_per_month': args.price
        }
        
        # 添加可选字段
        if args.expire_date:
            vps_info['expire_date'] = args.expire_date
        
        if args.usage_period:
            vps_info['usage_period'] = args.usage_period
            
        print(f"添加VPS: {args.name}")
        if manager.add_new_vps(vps_info):
            print(f"成功添加VPS: {args.name}")
        else:
            print(f"添加VPS失败")
            
    elif args.command == 'status':
        print(f"更新 {args.vps} 状态为: {args.status}")
        if manager.set_vps_status(args.vps, args.status):
            print(f"成功更新 {args.vps} 状态")
        else:
            print(f"更新状态失败")
            
    elif args.command == 'delete':
        print(f"删除VPS: {args.vps}")
        if manager.delete_vps(args.vps):
            print(f"成功删除VPS: {args.vps}")
        else:
            print(f"删除VPS失败")
            
    elif args.command == 'update':
        # 创建更新字段字典
        update_fields = {}
        
        if args.host:
            update_fields['host'] = args.host
        
        if args.port:
            update_fields['port'] = args.port
            
        if args.username:
            update_fields['username'] = args.username
            
        if args.password:
            update_fields['password'] = args.password
            
        if args.use_nat is not None:
            update_fields['use_nat'] = args.use_nat
            
        if args.expire_date:
            update_fields['expire_date'] = args.expire_date
            
        if args.usage_period:
            update_fields['usage_period'] = args.usage_period
            
        if args.price:
            update_fields['price_per_month'] = args.price
            
        if update_fields:
            print(f"更新VPS信息: {args.vps}")
            if manager.update_vps_info(args.vps, **update_fields):
                print(f"成功更新 {args.vps} 信息")
            else:
                print(f"更新VPS信息失败")
        else:
            print("没有指定要更新的字段")
    else:
        print("请指定命令。使用 --help 查看帮助。")

if __name__ == '__main__':
    main() 