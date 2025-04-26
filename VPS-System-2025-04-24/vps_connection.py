#!/usr/bin/env python
# -*- coding: utf-8 -*-

import paramiko
import time
import logging
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm
import os
import re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("vps_manager.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class VPSConnection:
    def __init__(self, vps_info):
        """
        初始化VPS连接对象
        
        Args:
            vps_info (dict): VPS的连接和配置信息
        """
        self.name = vps_info.get('name')
        self.host = vps_info.get('host')
        self.port = vps_info.get('port', 22)
        self.username = vps_info.get('username')
        self.password = vps_info.get('password')
        self.status = vps_info.get('status')
        self.client = None
        self.connected = False
        
    def connect(self):
        """连接到VPS服务器"""
        if self.status != "在用":
            logger.warning(f"{self.name} 状态为 {self.status}，跳过连接")
            return False
            
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            self.client.connect(
                hostname=self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                timeout=10
            )
            self.connected = True
            logger.info(f"成功连接到 {self.name} ({self.host})")
            
            return True
        except Exception as e:
            logger.error(f"连接 {self.name} ({self.host}) 失败: {str(e)}")
            return False
    
    def disconnect(self):
        """断开VPS连接"""
        if self.client and self.connected:
            self.client.close()
            self.connected = False
            logger.info(f"已断开与 {self.name} ({self.host}) 的连接")
    
    def execute_command(self, command, timeout=30):
        """
        在VPS上执行命令
        
        Args:
            command (str): 要执行的命令
            timeout (int): 命令超时时间（秒）
            
        Returns:
            tuple: (stdout, stderr)
        """
        if not self.connected or not self.client:
            logger.error(f"{self.name} 未连接，无法执行命令")
            return "", "Not connected"
        
        try:
            logger.info(f"在 {self.name} 上执行命令: {command}")
            stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
            stdout_str = stdout.read().decode('utf-8')
            stderr_str = stderr.read().decode('utf-8')
            
            if stderr_str:
                logger.warning(f"{self.name} 命令执行警告: {stderr_str}")
            
            return stdout_str, stderr_str
        except Exception as e:
            logger.error(f"{self.name} 执行命令失败: {str(e)}")
            return "", str(e)
    
    def upload_file(self, local_path, remote_path):
        """
        上传文件到VPS
        
        Args:
            local_path (str): 本地文件路径
            remote_path (str): 远程文件路径
            
        Returns:
            bool: 是否成功
        """
        if not self.connected or not self.client:
            logger.error(f"{self.name} 未连接，无法上传文件")
            return False
        
        try:
            sftp = self.client.open_sftp()
            sftp.put(local_path, remote_path)
            sftp.close()
            logger.info(f"成功上传文件到 {self.name}: {local_path} -> {remote_path}")
            return True
        except Exception as e:
            logger.error(f"{self.name} 上传文件失败: {str(e)}")
            return False
    
    def download_file(self, remote_path, local_path):
        """
        从VPS下载文件
        
        Args:
            remote_path (str): 远程文件路径
            local_path (str): 本地文件路径
            
        Returns:
            bool: 是否成功
        """
        if not self.connected or not self.client:
            logger.error(f"{self.name} 未连接，无法下载文件")
            return False
        
        try:
            sftp = self.client.open_sftp()
            sftp.get(remote_path, local_path)
            sftp.close()
            logger.info(f"成功从 {self.name} 下载文件: {remote_path} -> {local_path}")
            return True
        except Exception as e:
            logger.error(f"{self.name} 下载文件失败: {str(e)}")
            return False

class VPSConnectionManager:
    def __init__(self):
        """初始化VPS连接管理器"""
        self.connections = {}
    
    def add_vps(self, vps_info):
        """
        添加VPS连接
        
        Args:
            vps_info (dict): VPS信息字典
        """
        name = vps_info.get('name')
        if name:
            self.connections[name] = VPSConnection(vps_info)
            logger.info(f"添加VPS连接: {name}")
        else:
            logger.error("VPS信息缺少名称")
    
    def sync_with_billing(self, billing_vps_list):
        """
        与账单管理器同步VPS信息
        
        Args:
            billing_vps_list (list): 来自账单管理器的VPS列表
            
        Returns:
            tuple: (添加的VPS数, 删除的VPS数)
        """
        current_vps_names = set(self.connections.keys())
        new_vps_names = set()
        
        # 添加/更新VPS
        added_count = 0
        for vps_info in billing_vps_list:
            name = vps_info.get('name')
            if not name:
                continue
                
            new_vps_names.add(name)
            
            if name not in self.connections:
                # 新增VPS
                self.add_vps(vps_info)
                added_count += 1
        
        # 删除不存在的VPS
        removed_count = 0
        for name in current_vps_names - new_vps_names:
            if name in self.connections:
                # 断开连接
                if self.connections[name].connected:
                    self.connections[name].disconnect()
                # 删除连接
                del self.connections[name]
                removed_count += 1
                logger.info(f"删除VPS连接: {name}")
        
        return added_count, removed_count
    
    def connect_all(self):
        """连接所有VPS"""
        logger.info("开始连接所有VPS...")
        
        results = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            # 提交所有连接任务
            future_to_vps = {
                executor.submit(connection.connect): name
                for name, connection in self.connections.items()
                if connection.status == "在用"
            }
            
            # 等待任务完成
            for future in future_to_vps:
                name = future_to_vps[future]
                try:
                    success = future.result()
                    results[name] = success
                except Exception as e:
                    logger.error(f"连接 {name} 时发生异常: {str(e)}")
                    results[name] = False
        
        logger.info(f"所有VPS连接完成，成功率: {sum(results.values())}/{len(results)}")
        return results
    
    def disconnect_all(self):
        """断开所有VPS连接"""
        logger.info("开始断开所有VPS连接...")
        
        count = 0
        for name, connection in self.connections.items():
            try:
                if connection.connected:
                    connection.disconnect()
                    count += 1
            except Exception as e:
                logger.error(f"断开 {name} 连接时发生异常: {str(e)}")
        
        logger.info(f"已断开 {count} 个VPS连接")
        return count
    
    def execute_on_all(self, command, timeout=30):
        """
        在所有已连接的VPS上执行命令
        
        Args:
            command (str): 要执行的命令
            timeout (int): 命令超时时间（秒）
            
        Returns:
            dict: {vps_name: (stdout, stderr)}
        """
        logger.info(f"在所有VPS上执行命令: {command}")
        
        results = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            # 提交所有执行任务
            future_to_vps = {
                executor.submit(connection.execute_command, command, timeout): name
                for name, connection in self.connections.items()
                if connection.connected
            }
            
            # 等待任务完成
            for future in future_to_vps:
                name = future_to_vps[future]
                try:
                    stdout, stderr = future.result()
                    results[name] = (stdout, stderr)
                except Exception as e:
                    logger.error(f"在 {name} 上执行命令时发生异常: {str(e)}")
                    results[name] = ("", str(e))
        
        return results
    
    def get_connection(self, vps_name):
        """
        获取指定VPS的连接对象
        
        Args:
            vps_name (str): VPS名称
            
        Returns:
            VPSConnection or None: VPS连接对象，如果不存在则返回None
        """
        return self.connections.get(vps_name) 