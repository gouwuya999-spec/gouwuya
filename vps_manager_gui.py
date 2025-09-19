#!/usr/bin/env python
# -*- coding: utf-8 -*-

import tkinter as tk
from tkinter import ttk, messagebox, filedialog, font
import os
import sys
import threading
import logging
import datetime
import yaml
import time
import qrcode
from PIL import Image, ImageTk
import pandas as pd
import ctypes

# 导入VPS管理器核心模块
from vps_connection import VPSConnectionManager
from billing_manager import BillingManager
from vps_manager import VPSManager

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("vps_manager_gui.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class VPSManagerGUI:
    def __init__(self, root):
        """初始化VPS管理器GUI"""
        try:
            self.root = root
            self.root.title("VPS管理器")
            self.root.geometry("1200x800")
            
            # 设置图标
            try:
                icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp', 'favicon.ico')
                if os.path.exists(icon_path):
                    self.root.iconbitmap(icon_path)
            except Exception as e:
                logger.error(f"设置图标时出错: {str(e)}")
            
            # 状态变量
            self.status_var = tk.StringVar()
            self.status_var.set("VPS管理器已启动")
            
            # NAT总费用文本变量
            self.nat_total_var = tk.StringVar(value="$0.00")
            self.nat_vps_count_var = tk.StringVar(value="使用NAT的VPS数量: 0   NAT计费单位: 0 (每10台一个单位)")
            
            # 账单费用文本变量
            self.nat_vps_fee_var = tk.StringVar(value="$0.00")
            self.non_nat_vps_fee_var = tk.StringVar(value="$0.00")
            self.summary_nat_fee_var = tk.StringVar(value="$0.00")
            self.summary_total_var = tk.StringVar(value="$0.00")
            
            # 总费用文本变量
            self.total_var = tk.StringVar(value="$0.00")
            
            # 初始化VPS管理器
            self.vps_manager = VPSManager()
            
            # 创建UI
            self.create_ui()
            self.create_menu()
            
            # 加载VPS数据
            self.load_vps_data()
            
            # 定时刷新使用时长
            self.refresh_timer = None
            self.usage_auto_refresh_started = False
            
            # 设置自动保存定时器
            self.auto_save_timer = None
            self.start_auto_save_timer()
            
            # 设置剪贴板支持
            self.setup_clipboard_support()
            
            # 创建VPS列表右键菜单
            self.create_vps_context_menu()
            
            # 绑定窗口关闭事件
            self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
            
            # 延迟启动自动刷新
            self.root.after(1000, self.delayed_start_auto_refresh)
            
            # 记录日志
            logger.info("VPS管理器GUI已初始化")
        except Exception as e:
            # 捕获所有初始化错误，防止闪退
            error_msg = f"初始化VPS管理器时出错: {str(e)}"
            logger.error(error_msg, exc_info=True)
            try:
                messagebox.showerror("初始化错误", error_msg)
            except:
                # 如果连messagebox都无法显示，尝试在控制台输出
                print(f"严重错误: {error_msg}")
                # 保持窗口开启，避免闪退
                self.root.after(5000, lambda: None)
                
    def create_vps_context_menu(self):
        """创建VPS列表的右键菜单"""
        # 创建VPS列表右键菜单
        self.vps_context_menu = tk.Menu(self.root, tearoff=0)
        self.vps_context_menu.add_command(label="复制选中", command=self.copy_selected)
        self.vps_context_menu.add_command(label="全选", command=self.select_all)
        self.vps_context_menu.add_separator()
        self.vps_context_menu.add_command(label="连接选中VPS", command=self.connect_selected_vps)
        self.vps_context_menu.add_command(label="断开选中VPS", command=self.disconnect_selected_vps)
        self.vps_context_menu.add_separator()
        self.vps_context_menu.add_command(label="编辑VPS", command=self.edit_selected_vps)
        self.vps_context_menu.add_command(label="删除VPS", command=self.delete_selected_vps)
    
    def delayed_start_auto_refresh(self):
        """延迟启动自动刷新功能"""
        try:
            # 启动自动刷新
            self.start_usage_auto_refresh()
            logger.info("自动刷新功能已启动")
        except Exception as e:
            error_msg = f"启动自动刷新功能失败: {str(e)}"
            logger.error(error_msg, exc_info=True)
            # 不显示错误对话框，只记录日志，避免影响用户体验
            self.status_var.set("启动自动刷新失败")

    def start_usage_auto_refresh(self):
        """启动自动刷新使用时长的计时器，每5分钟刷新一次"""
        try:
            # 取消已有的计时器
            if hasattr(self, 'usage_update_timer') and self.usage_update_timer:
                try:
                    self.root.after_cancel(self.usage_update_timer)
                except Exception as cancel_error:
                    logger.error(f"取消计时器时出错: {cancel_error}")
                
            # 更新VPS显示 - 不重新计算使用时长，只更新界面
            # 避免频繁计算导致性能问题
            try:
                self.status_var.set("正在更新显示...")
                self.update_vps_display_only()
                self.status_var.set(f"显示已更新 - {datetime.datetime.now().strftime('%H:%M:%S')}")
            except Exception as e:
                logger.error(f"自动刷新显示时出错: {str(e)}")
                self.status_var.set("更新显示失败")
            
            # 设置下一次刷新的计时器（5分钟），减少刷新频率
            self.usage_update_timer = self.root.after(300000, self.start_usage_auto_refresh)
            
            logger.debug("使用时长自动刷新已设置 - 下次刷新将在5分钟后")
        except Exception as e:
            logger.error(f"设置自动刷新时出错: {str(e)}")
            self.status_var.set("设置自动刷新失败")
            # 即使出错，也尝试设置下一次刷新，确保程序不会停止刷新
            try:
                self.usage_update_timer = self.root.after(300000, self.start_usage_auto_refresh)
            except:
                pass

    def start_auto_save_timer(self):
        """启动自动保存定时器，每5分钟自动保存一次VPS数据"""
        try:
            # 取消已有的计时器
            if self.auto_save_timer:
                self.root.after_cancel(self.auto_save_timer)
                
            # 执行自动保存
            self.auto_save_data()
            
            # 设置下一次自动保存的计时器（5分钟）
            self.auto_save_timer = self.root.after(300000, self.start_auto_save_timer)
            logger.info("自动保存定时器已设置 - 下次保存将在5分钟后")
        except Exception as e:
            logger.error(f"设置自动保存定时器时出错: {str(e)}")
            # 即使出错，也尝试设置下一次保存，确保程序不会停止自动保存
            try:
                self.auto_save_timer = self.root.after(300000, self.start_auto_save_timer)
            except:
                pass
                
    def auto_save_data(self):
        """自动保存所有VPS数据"""
        try:
            # 使用billing_manager保存数据
            self.vps_manager.billing_manager.save_data()
            logger.info("VPS数据已自动保存")
            # 更新状态栏信息，但只显示短暂时间
            original_status = self.status_var.get()
            self.status_var.set("VPS数据已自动保存")
            # 3秒后恢复原状态信息
            self.root.after(3000, lambda: self.status_var.set(original_status))
        except Exception as e:
            logger.error(f"自动保存VPS数据失败: {str(e)}")

    def on_closing(self):
        """窗口关闭时执行清理操作"""
        # 取消定时器
        if self.refresh_timer:
            self.root.after_cancel(self.refresh_timer)
            
        # 取消自动保存定时器
        if self.auto_save_timer:
            self.root.after_cancel(self.auto_save_timer)
        
        # 断开所有连接
        try:
            for name, conn in self.vps_manager.vps_connection_manager.connections.items():
                if conn.connected:
                    conn.disconnect()
                    logger.info(f"已断开VPS连接: {name}")
        except Exception as e:
            logger.error(f"关闭连接时出错: {str(e)}")
        
        # 保存VPS数据
        self.vps_manager.billing_manager.save_data()
        
        # 销毁窗口
        self.root.destroy()
        
    def setup_clipboard_support(self):
        """设置剪贴板支持，为组件添加复制粘贴功能"""
        # 为所有Treeview绑定复制功能
        self.root.bind_class("Treeview", "<Control-c>", self.copy_from_treeview)
        
        # 为文本框启用标准复制粘贴快捷键
        # 文本框默认已支持复制粘贴，仅需确保它们是可编辑的
        
        # 添加右键菜单绑定
        self.root.bind_class("Treeview", "<Button-3>", self.show_context_menu)
        self.root.bind_class("Text", "<Button-3>", self.show_text_context_menu)
        
        # 创建上下文菜单
        self.context_menu = tk.Menu(self.root, tearoff=0)
        self.context_menu.add_command(label="复制", command=self.copy_selected)
        self.context_menu.add_command(label="全选", command=self.select_all)
        
        # 文本框的上下文菜单
        self.text_context_menu = tk.Menu(self.root, tearoff=0)
        self.text_context_menu.add_command(label="复制", command=self.copy_text)
        self.text_context_menu.add_command(label="粘贴", command=self.paste_text)
        self.text_context_menu.add_command(label="全选", command=self.select_all_text)
    
    def show_context_menu(self, event):
        """显示Treeview上下文菜单"""
        try:
            widget = event.widget
            # 设置当前操作的组件
            self.current_widget = widget
            
            # 检查是否有选中的项目
            if not widget.selection():
                return
                
            # 根据不同的树形视图显示不同的上下文菜单
            if hasattr(self, 'vps_tree') and widget == self.vps_tree:
                # 在鼠标位置显示VPS列表专用菜单
                self.vps_context_menu.tk_popup(event.x_root, event.y_root)
            else:
                # 其他树形视图使用默认上下文菜单
                self.context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            # 确保菜单正确关闭
            if hasattr(self, 'vps_context_menu') and widget == self.vps_tree:
                self.vps_context_menu.grab_release()
            else:
                self.context_menu.grab_release()
    
    def show_text_context_menu(self, event):
        """显示文本框上下文菜单"""
        try:
            widget = event.widget
            # 设置当前操作的组件
            self.current_widget = widget
            # 在鼠标位置显示菜单
            self.text_context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            # 确保菜单正确关闭
            self.text_context_menu.grab_release()
    
    def copy_selected(self):
        """复制当前选中的内容"""
        if hasattr(self, 'current_widget') and self.current_widget:
            if isinstance(self.current_widget, ttk.Treeview):
                self.copy_from_treeview(None)
    
    def select_all(self):
        """选择Treeview中的所有项"""
        if hasattr(self, 'current_widget') and self.current_widget:
            if isinstance(self.current_widget, ttk.Treeview):
                for item in self.current_widget.get_children():
                    self.current_widget.selection_add(item)
    
    def copy_text(self):
        """复制文本框中选中的文本"""
        if hasattr(self, 'current_widget') and self.current_widget:
            if isinstance(self.current_widget, tk.Text):
                self.current_widget.event_generate("<<Copy>>")
    
    def paste_text(self):
        """粘贴文本到文本框"""
        if hasattr(self, 'current_widget') and self.current_widget:
            if isinstance(self.current_widget, tk.Text) and not self.current_widget.cget('state') == 'disabled':
                self.current_widget.event_generate("<<Paste>>")
    
    def select_all_text(self):
        """选择文本框中的所有文本"""
        if hasattr(self, 'current_widget') and self.current_widget:
            if isinstance(self.current_widget, tk.Text):
                self.current_widget.tag_add(tk.SEL, "1.0", tk.END)
                self.current_widget.mark_set(tk.INSERT, "1.0")
                self.current_widget.see(tk.INSERT)
    
    def copy_from_treeview(self, event):
        """从Treeview复制选中的内容到剪贴板"""
        treeview = self.current_widget if hasattr(self, 'current_widget') else (
            event.widget if event else None
        )
        
        if not treeview or not isinstance(treeview, ttk.Treeview):
            return
            
        selection = treeview.selection()
        if not selection:
            return
            
        # 获取列标题
        columns = treeview["columns"]
        headers = [treeview.heading(col)["text"] for col in columns]
        
        # 构建CSV格式的数据
        rows = ["\t".join(headers)]
        for item in selection:
            values = treeview.item(item, "values")
            if values:
                rows.append("\t".join(str(v) for v in values))
        
        # 将数据复制到剪贴板
        self.root.clipboard_clear()
        self.root.clipboard_append("\n".join(rows))
        self.status_var.set(f"已复制 {len(selection)} 行数据到剪贴板")
    
    def create_ui(self):
        """创建UI组件"""
        # 设置选项卡样式
        style = ttk.Style()
        # 设置Notebook.tab样式 - 标题栏背景为蓝色，字体为黑色
        style.configure("TNotebook.Tab", background="#0078d7", foreground="black", font=('Helvetica', 9, 'bold'))
        # 设置选中标签的样式
        style.map("TNotebook.Tab", 
                 background=[("selected", "#005a9e")],  # 选中时深蓝色
                 foreground=[("selected", "black")])    # 选中时字体仍保持黑色
        
        # 设置全局Treeview样式 - 所有表格标题栏统一使用蓝底黑字
        style.configure("Treeview.Heading", 
                      background="#0078d7",
                      foreground="black",
                      font=('Helvetica', 9, 'bold'))
        style.map('Treeview', 
                foreground=[('selected', 'white')],
                background=[('selected', '#005a9e')])
        
        # 创建选项卡控件
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # VPS列表选项卡
        self.tab_vps_list = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_vps_list, text="VPS列表")
        
        # VPS连接选项卡
        self.tab_connection = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_connection, text="连接管理")
        
        # 账单管理选项卡
        self.tab_billing = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_billing, text="账单管理")
        
        # 命令执行选项卡
        self.tab_command = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_command, text="命令执行")
        
        # 初始化各选项卡的UI
        self.init_vps_list_tab()
        self.init_connection_tab()
        self.init_billing_tab()
        self.init_command_tab()
        
        # 创建状态栏
        status_frame = ttk.Frame(self.root)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)
        
        # 左侧状态信息
        self.status_var = tk.StringVar()
        self.status_var.set("就绪")
        status_label = ttk.Label(status_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_label.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # 右侧显示版本号
        version_label = ttk.Label(status_frame, text=f"v{self.vps_manager.VERSION}", relief=tk.SUNKEN, anchor=tk.E)
        version_label.pack(side=tk.RIGHT, padx=5)
        
        # 添加选项卡切换事件
        self.notebook.bind("<<NotebookTabChanged>>", self.on_tab_changed)

    def init_connection_tab(self):
        """初始化连接管理选项卡"""
        # 创建顶部控制框架
        control_frame = ttk.Frame(self.tab_connection)
        control_frame.pack(fill=tk.X, padx=10, pady=10)
        
        # 添加按钮
        ttk.Button(control_frame, text="连接所有VPS", command=self.connect_all_vps).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="断开所有连接", command=self.disconnect_all_vps).pack(side=tk.LEFT, padx=5)
        self.connect_selected_button_conn = ttk.Button(control_frame, text="连接选中VPS", command=self.connect_selected_vps)
        self.connect_selected_button_conn.pack(side=tk.LEFT, padx=5)
        self.disconnect_selected_button_conn = ttk.Button(control_frame, text="断开选中VPS", command=self.disconnect_selected_vps)
        self.disconnect_selected_button_conn.pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="部署WireGuard", command=self.one_click_deploy_wireguard).pack(side=tk.LEFT, padx=5)
        # 添加复制按钮
        ttk.Button(control_frame, text="复制选中", command=self.copy_selected).pack(side=tk.LEFT, padx=5)
        
        # 创建连接状态列表框架
        list_frame = ttk.Frame(self.tab_connection)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        
        # 创建连接状态树形视图
        columns = ("VPS名称", "主机地址", "连接状态", "最后连接时间")
        self.connection_tree = ttk.Treeview(list_frame, columns=columns, show="headings", selectmode="extended")
        
        # 设置列宽和对齐方式
        for col in columns:
            self.connection_tree.heading(col, text=col)
            self.connection_tree.column(col, width=150, anchor=tk.CENTER)
        
        # 添加滚动条
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.connection_tree.yview)
        self.connection_tree.configure(yscrollcommand=scrollbar.set)
        
        # 放置组件
        self.connection_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 创建日志框架
        log_frame = ttk.LabelFrame(self.tab_connection, text="连接日志")
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        
        # 创建日志文本框
        self.connection_log = tk.Text(log_frame, wrap=tk.WORD, height=10)
        self.connection_log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # 添加滚动条
        log_scrollbar = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.connection_log.yview)
        self.connection_log.configure(yscrollcommand=log_scrollbar.set)
        log_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    
    def init_command_tab(self):
        """初始化命令执行选项卡"""
        # 创建顶部控制框架
        control_frame = ttk.Frame(self.tab_command)
        control_frame.pack(fill=tk.X, padx=10, pady=10)
        
        # 添加VPS选择下拉框
        ttk.Label(control_frame, text="选择VPS: ").pack(side=tk.LEFT, padx=5)
        
        self.vps_var = tk.StringVar()
        self.vps_combo = ttk.Combobox(control_frame, textvariable=self.vps_var)
        self.vps_combo.pack(side=tk.LEFT, padx=5)
        
        # 添加"所有VPS"复选框
        self.all_vps_var = tk.BooleanVar()
        ttk.Checkbutton(control_frame, text="所有VPS", variable=self.all_vps_var).pack(side=tk.LEFT, padx=5)
        
        # 添加部署WireGuard按钮
        ttk.Button(control_frame, text="部署WireGuard", command=self.one_click_deploy_wireguard).pack(side=tk.LEFT, padx=5)
        
        # 创建命令输入框架
        cmd_frame = ttk.LabelFrame(self.tab_command, text="命令输入")
        cmd_frame.pack(fill=tk.X, padx=10, pady=(0, 10))
        
        # 创建命令输入框
        self.cmd_var = tk.StringVar()
        cmd_entry = ttk.Entry(cmd_frame, textvariable=self.cmd_var, width=50)
        cmd_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5, pady=5)
        
        # 添加执行按钮
        ttk.Button(cmd_frame, text="执行", command=self.execute_command).pack(side=tk.LEFT, padx=5, pady=5)
        
        # 创建命令历史下拉框
        ttk.Label(cmd_frame, text="命令历史: ").pack(side=tk.LEFT, padx=5)
        
        self.history_var = tk.StringVar()
        history_combo = ttk.Combobox(cmd_frame, textvariable=self.history_var, width=30)
        history_combo.pack(side=tk.LEFT, padx=5, pady=5)
        history_combo.bind("<<ComboboxSelected>>", self.on_history_selected)
        
        # 创建结果显示框架
        result_frame = ttk.LabelFrame(self.tab_command, text="执行结果")
        result_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        
        # 创建结果文本框
        self.result_text = tk.Text(result_frame, wrap=tk.WORD)
        self.result_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # 添加滚动条
        result_scrollbar = ttk.Scrollbar(result_frame, orient=tk.VERTICAL, command=self.result_text.yview)
        self.result_text.configure(yscrollcommand=result_scrollbar.set)
        result_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    
    def init_vps_list_tab(self):
        """初始化VPS列表选项卡"""
        # 创建工具栏框架
        toolbar_frame = ttk.Frame(self.tab_vps_list)
        toolbar_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # 添加按钮
        ttk.Button(toolbar_frame, text="刷新列表", command=self.load_vps_data).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar_frame, text="添加VPS", command=self.show_add_vps_dialog).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar_frame, text="批量添加VPS", command=self.show_bulk_add_vps_dialog).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar_frame, text="编辑VPS", command=self.edit_selected_vps).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar_frame, text="删除VPS", command=self.delete_selected_vps).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar_frame, text="调试使用时长", command=self.debug_usage_period).pack(side=tk.LEFT, padx=5)
        # 添加连接和断开按钮
        self.connect_selected_button_list = ttk.Button(toolbar_frame, text="连接选中VPS", command=self.connect_selected_vps)
        self.connect_selected_button_list.pack(side=tk.LEFT, padx=5)
        self.disconnect_selected_button_list = ttk.Button(toolbar_frame, text="断开选中VPS", command=self.disconnect_selected_vps)
        self.disconnect_selected_button_list.pack(side=tk.LEFT, padx=5)
        # 添加一键部署WireGuard按钮
        ttk.Button(toolbar_frame, text="部署WireGuard", command=self.one_click_deploy_wireguard).pack(side=tk.LEFT, padx=5)
        # 添加设置NAT总金额按钮
        self.nat_fee_button = ttk.Button(toolbar_frame, text="设置NAT总金额", command=self.edit_nat_fee)
        self.nat_fee_button.pack(side=tk.LEFT, padx=5)
        # 添加复制选中和全选按钮
        ttk.Button(toolbar_frame, text="复制选中", command=self.copy_selected).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar_frame, text="全选", command=self.select_all).pack(side=tk.LEFT, padx=5)
        
        # 添加使用时长计算规则说明
        usage_info_frame = ttk.Frame(self.tab_vps_list)
        usage_info_frame.pack(fill=tk.X, padx=5, pady=(0, 5))
        usage_info_label = ttk.Label(
            usage_info_frame, 
            text="注意: 使用时长统计从每月1日00:00:00开始计算，精确到分钟，实时统计",
            font=("Helvetica", 9, "italic")
        )
        usage_info_label.pack(side=tk.LEFT)
        
        # 添加NAT信息显示框架
        self.nat_info_frame = ttk.LabelFrame(self.tab_vps_list, text="NAT费用信息")
        self.nat_info_frame.pack(fill=tk.X, padx=5, pady=(0, 5))
        
        # 添加NAT费用信息
        nat_inner_frame = ttk.Frame(self.nat_info_frame)
        nat_inner_frame.pack(fill=tk.X, expand=True, padx=5, pady=5)
        
        ttk.Label(nat_inner_frame, text="当前NAT总金额:", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
        self.vps_list_nat_total_var = tk.StringVar(value="$0.00")
        ttk.Label(nat_inner_frame, textvariable=self.vps_list_nat_total_var, font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
        
        # 添加NAT计数信息
        self.vps_list_nat_count_var = tk.StringVar(value="使用NAT的VPS数量: 0   NAT计费单位: 0 (每10台一个单位)")
        ttk.Label(nat_inner_frame, textvariable=self.vps_list_nat_count_var, font=("Helvetica", 9)).pack(side=tk.LEFT, padx=20)
        
        # 创建VPS列表树形视图样式
        style = ttk.Style()
        style.configure("VPSTree.Treeview", 
                        background="white",
                        fieldbackground="white")
        style.configure("VPSTree.Treeview.Heading", 
                       background="#0078d7",  # 使用与标签页相同的蓝色
                       foreground="black",
                       font=('Helvetica', 9, 'bold'))
        style.map('VPSTree.Treeview', 
                foreground=[('selected', 'purple')],
                background=[('selected', '#E8E8E8')])  # 选中项使用浅灰色背景，紫色字体
        
        # 创建VPS列表树形视图
        columns = ("名称", "IP地址", "国家地区", "是否使用NAT", "状态", "购买日期", "销毁时间", "使用时长", "月单价", "总金额")
        self.vps_tree = ttk.Treeview(self.tab_vps_list, columns=columns, show="headings", 
                                     style="VPSTree.Treeview", selectmode="extended")
        
        # 设置列宽和对齐方式
        for col in columns:
            self.vps_tree.heading(col, text=col)
            self.vps_tree.column(col, width=100, anchor=tk.CENTER)
        
        # 添加滚动条
        scrollbar = ttk.Scrollbar(self.tab_vps_list, orient=tk.VERTICAL, command=self.vps_tree.yview)
        self.vps_tree.configure(yscrollcommand=scrollbar.set)
        
        # 放置组件
        self.vps_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 绑定右键菜单和Ctrl+C快捷键
        self.vps_tree.bind("<Button-3>", self.show_context_menu)
        self.vps_tree.bind("<Control-c>", self.copy_from_treeview)
        
        # 绑定左键点击事件，更新当前活动控件
        self.vps_tree.bind("<Button-1>", lambda event: setattr(self, 'current_widget', event.widget))
    
    def update_nat_ui_visibility(self, has_nat_vps=False):
        """根据是否有使用NAT的VPS来更新界面元素显示状态"""
        if has_nat_vps:
            # 显示NAT相关UI组件
            self.nat_info_frame.pack(fill=tk.X, padx=5, pady=(0, 5))
            self.nat_fee_button.pack(side=tk.LEFT, padx=5)
        else:
            # 隐藏NAT相关UI组件
            self.nat_info_frame.pack_forget()
            self.nat_fee_button.pack_forget()
            
    def load_vps_data(self, refresh_billing=False):
        """加载VPS数据"""
        try:
            self.status_var.set("正在加载VPS数据...")
            self.vps_manager.billing_manager.load_data()
            
            # 检查是否有使用NAT的VPS
            nat_vps_count = sum(1 for vps in self.vps_manager.billing_manager.get_all_vps() if vps.get('use_nat', False))
            has_nat_vps = nat_vps_count > 0
            
            # 根据是否有NAT VPS更新UI可见性
            self.update_nat_ui_visibility(has_nat_vps)
            self.update_billing_nat_ui_visibility(has_nat_vps)
            
            # 仅刷新显示，不重新计算使用时长
            # 强制开启实时计算，确保价格更新
            self.update_vps_display_only(need_real_time_calculation=True)
            
            # 更新NAT总费用
            nat_fee = self.vps_manager.billing_manager.calculate_nat_fee()
            self.nat_total_var.set(f"${nat_fee:.2f}")
            
            # 更新NAT VPS使用信息
            nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
            nat_vps_count_info = f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)"
            self.nat_vps_count_var.set(nat_vps_count_info)
            
            if hasattr(self, 'vps_list_nat_count_var'):
                self.vps_list_nat_count_var.set(nat_vps_count_info)
            if hasattr(self, 'vps_list_nat_total_var'):
                self.vps_list_nat_total_var.set(f"${nat_fee:.2f}")
            
            # 如果需要刷新账单信息，则重新计算总账单
            if refresh_billing:
                total_bill = self.vps_manager.billing_manager.calculate_total_bill()
                self.total_var.set(f"${total_bill:.2f}")
            
            self.status_var.set("VPS数据加载完成")
            
            logger.info(f"已加载 {len(self.vps_manager.billing_manager.get_all_vps())} 台VPS数据")
            
        except Exception as e:
            logger.error(f"加载VPS数据失败: {str(e)}", exc_info=True)
            self.status_var.set("加载VPS数据失败")
            messagebox.showerror("错误", f"加载VPS数据失败: {str(e)}")
    
    def show_add_vps_dialog(self):
        """显示添加VPS对话框"""
        # 创建对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("添加VPS")
        dialog.geometry("500x650")  # 增加宽度和高度以完全显示所有内容
        dialog.resizable(True, True)  # 允许调整大小
        dialog.transient(self.root)
        dialog.grab_set()
        
        # 创建表单
        form_frame = ttk.Frame(dialog, padding=10)
        form_frame.pack(fill=tk.BOTH, expand=True)
        
        # 添加字段
        ttk.Label(form_frame, text="VPS名称:").grid(row=0, column=0, sticky=tk.W, pady=5)
        name_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=name_var, width=30).grid(row=0, column=1, pady=5)
        
        ttk.Label(form_frame, text="主机地址:").grid(row=1, column=0, sticky=tk.W, pady=5)
        host_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=host_var, width=30).grid(row=1, column=1, pady=5)
        
        ttk.Label(form_frame, text="SSH端口:").grid(row=2, column=0, sticky=tk.W, pady=5)
        port_var = tk.StringVar(value="22")
        ttk.Entry(form_frame, textvariable=port_var, width=30).grid(row=2, column=1, pady=5)
        
        ttk.Label(form_frame, text="用户名:").grid(row=3, column=0, sticky=tk.W, pady=5)
        username_var = tk.StringVar(value="root")
        ttk.Entry(form_frame, textvariable=username_var, width=30).grid(row=3, column=1, pady=5)
        
        ttk.Label(form_frame, text="密码:").grid(row=4, column=0, sticky=tk.W, pady=5)
        password_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=password_var, width=30, show="*").grid(row=4, column=1, pady=5)
        
        ttk.Label(form_frame, text="国家地区:").grid(row=5, column=0, sticky=tk.W, pady=5)
        country_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=country_var, width=30).grid(row=5, column=1, pady=5)
        
        ttk.Label(form_frame, text="是否使用NAT:").grid(row=6, column=0, sticky=tk.W, pady=5)
        use_nat_var = tk.BooleanVar(value=False)
        nat_checkbox = ttk.Checkbutton(form_frame, variable=use_nat_var)
        nat_checkbox.grid(row=6, column=1, sticky=tk.W, pady=5)
        
        # 获取所有VPS数据
        vps_data = self.vps_manager.billing_manager.get_all_vps()
        
        # 检查是否有使用NAT的VPS
        nat_vps_list = [vps for vps in vps_data if vps.get('use_nat', True)]
        has_nat_vps = len(nat_vps_list) > 0
        
        # 添加NAT计费说明
        nat_info_label = ttk.Label(
            form_frame, 
            text="注意: NAT计费方式为每10台VPS共享一个价格。当前NAT总费用: $" + 
                f"{self.vps_manager.billing_manager.calculate_nat_fee():.2f}" if has_nat_vps else 
                "注意: 当前无使用NAT的VPS，如果选择使用NAT，系统将自动启用NAT计费",
            font=("Helvetica", 9, "italic")
        )
        nat_info_label.grid(row=7, column=0, columnspan=3, sticky=tk.W, pady=2)
        
        ttk.Label(form_frame, text="VPS状态:").grid(row=8, column=0, sticky=tk.W, pady=5)
        status_var = tk.StringVar(value="在用")
        status_combo = ttk.Combobox(form_frame, textvariable=status_var, width=28, state="readonly")
        status_combo['values'] = ["在用", "销毁"]
        status_combo.current(0)  # 默认选择"在用"
        status_combo.grid(row=8, column=1, pady=5)
        
        # 添加购买日期字段
        ttk.Label(form_frame, text="购买日期:").grid(row=9, column=0, sticky=tk.W, pady=5)
        purchase_date_var = tk.StringVar(value=datetime.datetime.now().strftime("%Y/%m/%d"))
        ttk.Entry(form_frame, textvariable=purchase_date_var, width=30).grid(row=9, column=1, pady=5)
        ttk.Label(form_frame, text="格式: YYYY/MM/DD").grid(row=9, column=2, sticky=tk.W, pady=5)
        
        # 添加购买日期说明
        purchase_date_info = ttk.Label(
            form_frame,
            text="注意: 购买日期影响计费方式。当月购买日非1号按天计费，是1号则按月计费。\n第二个月起如满一个月按月计费，不满一个月按天计费。",
            font=("Helvetica", 9, "italic"), 
            wraplength=380
        )
        purchase_date_info.grid(row=10, column=0, columnspan=3, sticky=tk.W, pady=2)
        
        ttk.Label(form_frame, text="销毁时间:").grid(row=11, column=0, sticky=tk.W, pady=5)
        expire_date_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=expire_date_var, width=30).grid(row=11, column=1, pady=5)
        ttk.Label(form_frame, text="格式: YYYY/MM/DD").grid(row=11, column=2, sticky=tk.W, pady=5)
        
        ttk.Label(form_frame, text="使用时长:").grid(row=12, column=0, sticky=tk.W, pady=5)
        usage_period_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=usage_period_var, width=30).grid(row=12, column=1, pady=5)
        ttk.Label(form_frame, text="系统自动计算，可不填").grid(row=12, column=2, sticky=tk.W, pady=5)
        
        ttk.Label(form_frame, text="月单价:").grid(row=13, column=0, sticky=tk.W, pady=5)
        price_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=price_var, width=30).grid(row=13, column=1, pady=5)
        
        # 按钮框架
        button_frame = ttk.Frame(form_frame)
        button_frame.grid(row=14, column=0, columnspan=3, pady=10)
        
        # 添加按钮
        def on_add():
            try:
                # 获取输入值
                name = name_var.get().strip()
                host = host_var.get().strip()
                port = int(port_var.get().strip())
                username = username_var.get().strip()
                password = password_var.get().strip()
                country = country_var.get().strip()
                use_nat = use_nat_var.get()
                status = status_var.get()
                purchase_date = purchase_date_var.get().strip()
                expire_date = expire_date_var.get().strip()
                usage_period = usage_period_var.get().strip()
                price = price_var.get().strip()
                
                # 验证必填字段
                if not name or not host or not username or not password or not price:
                    messagebox.showerror("错误", "请填写所有必填字段")
                    return
                
                # 创建VPS信息字典
                vps_info = {
                    'name': name,
                    'host': host,
                    'port': port,
                    'username': username,
                    'password': password,
                    'country': country,
                    'use_nat': use_nat,
                    'status': status,
                    'purchase_date': purchase_date,
                    'price_per_month': float(price)
                }
                
                # 添加可选字段
                if expire_date:
                    vps_info['expire_date'] = expire_date
                
                if usage_period:
                    vps_info['usage_period'] = usage_period
                    
                # 添加VPS
                if self.vps_manager.add_new_vps(vps_info):
                    # 检查是否添加了使用NAT的VPS
                    if use_nat:
                        # 重新加载VPS数据以获取更新后的数据
                        all_vps_data = self.vps_manager.billing_manager.get_all_vps()
                        
                        # 检查是否有使用NAT的VPS
                        nat_vps_list = [vps for vps in all_vps_data if vps.get('use_nat', True)]
                        has_nat_vps = len(nat_vps_list) > 0
                        
                        # 重新计算NAT费用
                        nat_fee = self.vps_manager.billing_manager.calculate_nat_fee() if has_nat_vps else 0
                        
                        # 更新NAT使用情况信息
                        nat_vps_count = sum(1 for vps in all_vps_data if vps.get('use_nat', False))
                        nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
                        nat_count_info = f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)"
                        
                        # 更新VPS列表和账单列表中的NAT信息
                        self.nat_vps_count_var.set(nat_count_info)
                        self.vps_list_nat_count_var.set(nat_count_info)
                        
                        # 更新NAT总金额
                        self.nat_total_var.set(f"${nat_fee:.2f}")
                        self.vps_list_nat_total_var.set(f"${nat_fee:.2f}")
                        
                        # 更新总计金额
                        total = self.vps_manager.billing_manager.calculate_total_bill()
                        self.total_var.set(f"${total:.2f}")
                        
                        # 更新NAT相关UI组件的显示状态
                        self.update_nat_ui_visibility(has_nat_vps)
                        self.update_billing_nat_ui_visibility(has_nat_vps)
                    
                    messagebox.showinfo("成功", f"已成功添加VPS: {name}")
                    dialog.destroy()
                    
                    # 加载VPS数据
                    self.load_vps_data()
                else:
                    messagebox.showerror("错误", f"添加VPS失败: {name}")
                
            except ValueError as e:
                messagebox.showerror("错误", f"输入格式错误: {str(e)}")
            except Exception as e:
                logger.error(f"添加VPS时出错: {str(e)}")
                messagebox.showerror("错误", f"添加VPS时出错: {str(e)}")
        
        ttk.Button(button_frame, text="添加", command=on_add).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消", command=dialog.destroy).pack(side=tk.LEFT, padx=5)
        
        # 设置焦点到第一个字段
        dialog.focus_set()
        name_var.set('')  # 清空名称字段，以避免同名问题
    
    def edit_selected_vps(self):
        """编辑选中的VPS"""
        # 获取选中的项
        selected = self.vps_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请先选择要编辑的VPS")
            return
        
        # 获取VPS名称
        values = self.vps_tree.item(selected[0], 'values')
        tags = self.vps_tree.item(selected[0], 'tags')
        
        # 检查是否选中了特殊行（NAT费用行或总金额行）
        if not values or not values[0] or (tags and ('nat_fee' in tags or 'total' in tags)):
            messagebox.showinfo("提示", "请选择一个有效的VPS，而不是汇总行")
            return
            
        vps_name = values[0]
        
        # 获取VPS信息
        vps_info = self.vps_manager.billing_manager.get_vps_by_name(vps_name)
        if not vps_info:
            messagebox.showerror("错误", f"找不到VPS信息: {vps_name}")
            return
        
        # 创建编辑对话框
        dialog = tk.Toplevel(self.root)
        dialog.title(f"编辑VPS - {vps_name}")
        dialog.geometry("500x650")  # 增加宽度和高度以完全显示所有内容
        dialog.resizable(True, True)  # 允许调整大小
        dialog.transient(self.root)
        dialog.grab_set()
        
        # 创建表单
        form_frame = ttk.Frame(dialog, padding=10)
        form_frame.pack(fill=tk.BOTH, expand=True)
        
        # 添加字段
        ttk.Label(form_frame, text="VPS名称:").grid(row=0, column=0, sticky=tk.W, pady=5)
        name_var = tk.StringVar(value=vps_info.get('name', ''))
        ttk.Entry(form_frame, textvariable=name_var, width=30, state="disabled").grid(row=0, column=1, pady=5)
        
        ttk.Label(form_frame, text="主机地址:").grid(row=1, column=0, sticky=tk.W, pady=5)
        host_var = tk.StringVar(value=vps_info.get('host', ''))
        ttk.Entry(form_frame, textvariable=host_var, width=30).grid(row=1, column=1, pady=5)
        
        ttk.Label(form_frame, text="SSH端口:").grid(row=2, column=0, sticky=tk.W, pady=5)
        port_var = tk.StringVar(value=str(vps_info.get('port', 22)))
        ttk.Entry(form_frame, textvariable=port_var, width=30).grid(row=2, column=1, pady=5)
        
        ttk.Label(form_frame, text="用户名:").grid(row=3, column=0, sticky=tk.W, pady=5)
        username_var = tk.StringVar(value=vps_info.get('username', ''))
        ttk.Entry(form_frame, textvariable=username_var, width=30).grid(row=3, column=1, pady=5)
        
        ttk.Label(form_frame, text="密码:").grid(row=4, column=0, sticky=tk.W, pady=5)
        password_var = tk.StringVar(value=vps_info.get('password', ''))
        ttk.Entry(form_frame, textvariable=password_var, width=30, show="*").grid(row=4, column=1, pady=5)
        
        ttk.Label(form_frame, text="国家地区:").grid(row=5, column=0, sticky=tk.W, pady=5)
        country_var = tk.StringVar(value=vps_info.get('country', ''))
        ttk.Entry(form_frame, textvariable=country_var, width=30).grid(row=5, column=1, pady=5)
        
        ttk.Label(form_frame, text="是否使用NAT:").grid(row=6, column=0, sticky=tk.W, pady=5)
        use_nat_var = tk.BooleanVar(value=vps_info.get('use_nat', False))
        nat_checkbox = ttk.Checkbutton(form_frame, variable=use_nat_var)
        nat_checkbox.grid(row=6, column=1, sticky=tk.W, pady=5)
        
        # 获取所有VPS数据
        all_vps_data = self.vps_manager.billing_manager.get_all_vps()
        
        # 检查是否有使用NAT的VPS（除了当前编辑的VPS）
        nat_vps_list = [vps for vps in all_vps_data if vps.get('use_nat', True) and vps.get('name') != vps_name]
        has_nat_vps = len(nat_vps_list) > 0
        
        # 添加NAT计费说明
        nat_info_text = ""
        if vps_info.get('use_nat', False) or has_nat_vps:
            nat_info_text = f"注意: NAT计费方式为每10台VPS共享一个价格。当前NAT总费用: ${self.vps_manager.billing_manager.calculate_nat_fee():.2f}"
        else:
            nat_info_text = "注意: 当前无使用NAT的VPS，如果选择使用NAT，系统将自动启用NAT计费"
            
        nat_info_label = ttk.Label(
            form_frame, 
            text=nat_info_text,
            font=("Helvetica", 9, "italic")
        )
        nat_info_label.grid(row=7, column=0, columnspan=3, sticky=tk.W, pady=2)
        
        ttk.Label(form_frame, text="VPS状态:").grid(row=8, column=0, sticky=tk.W, pady=5)
        status_var = tk.StringVar(value=vps_info.get('status', '在用'))
        status_combo = ttk.Combobox(form_frame, textvariable=status_var, width=28, state="readonly")
        status_combo['values'] = ["在用", "销毁"]
        # 设置当前选择的状态
        if vps_info.get('status') == "销毁":
            status_combo.current(1)
        else:
            status_combo.current(0)
        status_combo.grid(row=8, column=1, pady=5)
        
        # 添加购买日期字段
        ttk.Label(form_frame, text="购买日期:").grid(row=9, column=0, sticky=tk.W, pady=5)
        purchase_date_var = tk.StringVar(value=vps_info.get('purchase_date', ''))
        ttk.Entry(form_frame, textvariable=purchase_date_var, width=30).grid(row=9, column=1, pady=5)
        ttk.Label(form_frame, text="格式: YYYY/MM/DD").grid(row=9, column=2, sticky=tk.W, pady=5)
        
        # 添加购买日期说明
        purchase_date_info = ttk.Label(
            form_frame,
            text="注意: 购买日期影响计费方式。当月购买日非1号按天计费，是1号则按月计费。\n第二个月起如满一个月按月计费，不满一个月按天计费。",
            font=("Helvetica", 9, "italic"), 
            wraplength=380
        )
        purchase_date_info.grid(row=10, column=0, columnspan=3, sticky=tk.W, pady=2)
        
        ttk.Label(form_frame, text="销毁时间:").grid(row=11, column=0, sticky=tk.W, pady=5)
        expire_date_var = tk.StringVar(value=vps_info.get('expire_date', ''))
        ttk.Entry(form_frame, textvariable=expire_date_var, width=30).grid(row=11, column=1, pady=5)
        ttk.Label(form_frame, text="格式: YYYY/MM/DD").grid(row=11, column=2, sticky=tk.W, pady=5)
        
        ttk.Label(form_frame, text="使用时长:").grid(row=12, column=0, sticky=tk.W, pady=5)
        usage_period_var = tk.StringVar(value=vps_info.get('usage_period', ''))
        ttk.Entry(form_frame, textvariable=usage_period_var, width=30).grid(row=12, column=1, pady=5)
        ttk.Label(form_frame, text="系统自动计算，可不填").grid(row=12, column=2, sticky=tk.W, pady=5)
        
        ttk.Label(form_frame, text="月单价:").grid(row=13, column=0, sticky=tk.W, pady=5)
        price_var = tk.StringVar(value=str(vps_info.get('price_per_month', '')))
        ttk.Entry(form_frame, textvariable=price_var, width=30).grid(row=13, column=1, pady=5)
        
        # 按钮框架
        button_frame = ttk.Frame(form_frame)
        button_frame.grid(row=14, column=0, columnspan=3, pady=10)
        
        # 添加按钮
        def on_save():
            try:
                # 验证必填字段
                host = host_var.get().strip()
                port = int(port_var.get().strip())
                username = username_var.get().strip()
                password = password_var.get().strip()
                country = country_var.get().strip()
                use_nat = use_nat_var.get()
                status = status_var.get()
                purchase_date = purchase_date_var.get().strip()
                expire_date = expire_date_var.get().strip()
                usage_period = usage_period_var.get().strip()
                price = float(price_var.get().strip())
                
                if not host or not username or not password:
                    messagebox.showerror("错误", "请填写所有必填字段")
                    return
                
                # 检查状态是否变更为销毁
                status_changed_to_inactive = (vps_info.get('status') != status and status == "销毁")
                
                # 检查NAT状态是否变更
                nat_status_changed = vps_info.get('use_nat', False) != use_nat
                
                # 创建VPS信息字典
                update_info = {
                    'host': host,
                    'port': port,
                    'username': username,
                    'password': password,
                    'country': country,
                    'use_nat': use_nat,
                    'status': status,
                    'purchase_date': purchase_date,
                    'expire_date': expire_date,
                    'usage_period': usage_period,
                    'price_per_month': price
                }
                
                # 更新VPS
                if self.vps_manager.update_vps_info(vps_name, **update_info):
                    # 如果NAT状态变更，重新计算NAT费用
                    if nat_status_changed:
                        # 重新加载VPS数据以获取更新后的数据
                        all_vps_data = self.vps_manager.billing_manager.get_all_vps()
                        
                        # 检查是否有使用NAT的VPS
                        nat_vps_list = [vps for vps in all_vps_data if vps.get('use_nat', True)]
                        has_nat_vps = len(nat_vps_list) > 0
                        
                        # 重新计算NAT费用
                        nat_fee = self.vps_manager.billing_manager.calculate_nat_fee() if has_nat_vps else 0
                        
                        # 更新NAT使用情况信息
                        nat_vps_count = sum(1 for vps in all_vps_data if vps.get('use_nat', False))
                        nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
                        nat_count_info = f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)"
                        
                        # 更新VPS列表和账单列表中的NAT信息
                        self.nat_vps_count_var.set(nat_count_info)
                        self.vps_list_nat_count_var.set(nat_count_info)
                        
                        # 更新NAT总金额
                        self.nat_total_var.set(f"${nat_fee:.2f}")
                        self.vps_list_nat_total_var.set(f"${nat_fee:.2f}")
                        
                        # 更新总计金额
                        total = self.vps_manager.billing_manager.calculate_total_bill()
                        self.total_var.set(f"${total:.2f}")
                        
                        # 更新NAT相关UI组件的显示状态
                        self.update_nat_ui_visibility(has_nat_vps)
                        self.update_billing_nat_ui_visibility(has_nat_vps)
                    
                    messagebox.showinfo("成功", f"已成功更新VPS: {vps_name}")
                    dialog.destroy()
                    
                    # 如果状态变为销毁，刷新连接状态
                    if status_changed_to_inactive:
                        self.status_var.set(f"VPS {vps_name} 状态变为销毁，已断开连接")
                    
                    # 加载VPS数据并刷新所有相关视图
                    self.load_vps_data()
                else:
                    messagebox.showerror("错误", f"更新VPS失败: {vps_name}")
                
            except ValueError as e:
                messagebox.showerror("错误", f"输入格式错误: {str(e)}")
            except Exception as e:
                messagebox.showerror("错误", f"更新VPS时出错: {str(e)}")
        
        ttk.Button(button_frame, text="保存", command=on_save).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消", command=dialog.destroy).pack(side=tk.LEFT, padx=5)
        
        # 设置焦点到第一个字段
        dialog.focus_set()
    
    def delete_selected_vps(self):
        """删除选中的VPS"""
        # 获取选中的项
        selected = self.vps_tree.selection()
        if not selected:
            messagebox.showinfo("提示", "请先选择要删除的VPS")
            return
        
        # 获取VPS名称
        values = self.vps_tree.item(selected[0], 'values')
        tags = self.vps_tree.item(selected[0], 'tags')
        
        # 检查是否选中了特殊行（NAT费用行或总金额行）
        if not values or not values[0] or (tags and ('nat_fee' in tags or 'total' in tags)):
            messagebox.showinfo("提示", "请选择一个有效的VPS，而不是汇总行")
            return
            
        vps_name = values[0]
        
        # 获取VPS信息以检查是否使用NAT
        vps_info = self.vps_manager.billing_manager.get_vps_by_name(vps_name)
        if not vps_info:
            messagebox.showerror("错误", f"找不到VPS信息: {vps_name}")
            return
            
        # 检查是否使用NAT
        uses_nat = vps_info.get('use_nat', False)
        
        # 确认删除
        if not messagebox.askyesno("确认", f"是否确认删除VPS: {vps_name}?"):
            return
        
        # 删除VPS
        if self.vps_manager.delete_vps(vps_name):
            # 如果删除的VPS使用了NAT，更新NAT相关信息
            if uses_nat:
                # 重新加载VPS数据以获取更新后的数据
                all_vps_data = self.vps_manager.billing_manager.get_all_vps()
                
                # 检查是否还有使用NAT的VPS
                nat_vps_list = [vps for vps in all_vps_data if vps.get('use_nat', True)]
                has_nat_vps = len(nat_vps_list) > 0
                
                # 重新计算NAT费用
                nat_fee = self.vps_manager.billing_manager.calculate_nat_fee() if has_nat_vps else 0
                
                # 更新NAT使用情况信息
                nat_vps_count = sum(1 for vps in all_vps_data if vps.get('use_nat', False))
                nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
                nat_count_info = f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)"
                
                # 更新VPS列表和账单列表中的NAT信息
                self.nat_vps_count_var.set(nat_count_info)
                self.vps_list_nat_count_var.set(nat_count_info)
                
                # 更新NAT总金额
                self.nat_total_var.set(f"${nat_fee:.2f}")
                self.vps_list_nat_total_var.set(f"${nat_fee:.2f}")
                
                # 更新总计金额
                total = self.vps_manager.billing_manager.calculate_total_bill()
                self.total_var.set(f"${total:.2f}")
                
                # 更新NAT相关UI组件的显示状态
                self.update_nat_ui_visibility(has_nat_vps)
                self.update_billing_nat_ui_visibility(has_nat_vps)
            
            messagebox.showinfo("成功", f"已成功删除VPS: {vps_name}")
            self.load_vps_data()
        else:
            messagebox.showerror("错误", f"删除VPS失败: {vps_name}")

    def execute_command(self):
        """执行命令"""
        try:
            # 获取命令
            command = self.cmd_var.get().strip()
            if not command:
                messagebox.showinfo("提示", "请输入要执行的命令")
                return
            
            # 检查是否执行在所有VPS上
            all_vps = self.all_vps_var.get()
            
            if all_vps:
                vps_targets = "所有已连接的VPS"
            else:
                vps_name = self.vps_var.get()
                if not vps_name:
                    messagebox.showinfo("提示", "请选择要执行命令的VPS")
                    return
                vps_targets = vps_name
            
            # 添加到命令历史
            if command not in self.command_history:
                self.command_history.append(command)
                # 更新命令历史下拉框
                self.update_command_history()
            
            self.status_var.set(f"正在{vps_targets}上执行命令: {command}...")
            
            # 清空结果文本框
            self.result_text.delete(1.0, tk.END)
            
            # 在单独的线程中执行命令
            def execute_thread():
                try:
                    if all_vps:
                        # 在所有VPS上执行
                        results = self.vps_manager.execute_command_on_all(command)
                        
                        # 显示结果
                        for vps_name, (stdout, stderr) in results.items():
                            self.append_result(f"\n--- {vps_name} 执行结果 ---\n")
                            
                            if stdout:
                                self.append_result(f"标准输出:\n{stdout}\n")
                            
                            if stderr:
                                self.append_result(f"标准错误:\n{stderr}\n")
                        
                        self.status_var.set("命令执行完成")
                    else:
                        # 在单个VPS上执行
                        vps_name_to_use = self.vps_var.get()  # 获取当前选中的VPS名称
                        stdout, stderr = self.vps_manager.execute_command_on_vps(vps_name_to_use, command)
                        
                        # 显示结果
                        if stdout:
                            self.append_result(f"标准输出:\n{stdout}\n")
                        
                        if stderr:
                            self.append_result(f"标准错误:\n{stderr}\n")
                        
                        self.status_var.set(f"在 {vps_name_to_use} 上命令执行完成")
                except Exception as e:
                    logger.error(f"执行命令时发生错误: {str(e)}")
                    self.append_result(f"错误: {str(e)}\n")
                    self.status_var.set("执行命令时发生错误")
            
            threading.Thread(target=execute_thread).start()
            
        except Exception as e:
            logger.error(f"执行命令时发生错误: {str(e)}")
            messagebox.showerror("错误", f"执行命令时发生错误: {str(e)}")
            self.status_var.set("执行命令时发生错误")
    
    def update_command_history(self):
        """更新命令历史下拉框"""
        # 更新命令历史
        values = list(self.command_history)
        # 查找命令历史下拉框
        for child in self.tab_command.winfo_children():
            if isinstance(child, ttk.LabelFrame) and child.cget("text") == "命令输入":
                for grandchild in child.winfo_children():
                    if isinstance(grandchild, ttk.Combobox):
                        grandchild['values'] = values
                        break
    
    def on_history_selected(self, event):
        """当选择命令历史时"""
        selected = self.history_var.get()
        if selected:
            self.cmd_var.set(selected)
    
    def append_result(self, text):
        """向结果文本框添加文本"""
        # 在UI线程中更新文本框
        def update_text():
            self.result_text.insert(tk.END, text)
            self.result_text.see(tk.END)
        
        self.root.after(0, update_text)

    def refresh_connection_status(self):
        """刷新连接状态"""
        try:
            # 清空现有数据
            for item in self.connection_tree.get_children():
                self.connection_tree.delete(item)
            
            # 获取所有VPS连接
            connections = self.vps_manager.vps_connection_manager.connections
            
            # 更新连接状态列表
            for name, conn in connections.items():
                status = "已连接" if conn.connected else "未连接"
                now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                values = [name, conn.host, status, now if conn.connected else ""]
                self.connection_tree.insert('', tk.END, text=name, values=values)
            
        except Exception as e:
            logger.error(f"刷新连接状态时发生错误: {str(e)}")
            self.status_var.set("刷新连接状态时发生错误")
    
    def log_connection(self, message):
        """添加连接日志"""
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{now}] {message}\n"
        
        # 在UI线程中更新文本框
        def update_log():
            self.connection_log.insert(tk.END, log_message)
            self.connection_log.see(tk.END)
        
        self.root.after(0, update_log)

    def connect_all_vps(self):
        """连接所有VPS"""
        self.status_var.set("正在连接所有VPS...")
        
        # 在新线程中执行连接操作
        thread = threading.Thread(target=self.connect_thread)
        thread.daemon = True
        thread.start()
        
    def connect_thread(self):
        """在后台线程中连接所有VPS"""
        try:
            self.log_connection("开始连接所有VPS...")
            
            # 获取所有VPS
            all_vps = []
            for item in self.vps_tree.get_children():
                vps_name = self.vps_tree.item(item, "values")[0]
                all_vps.append(vps_name)
            
            connected_count = 0
            for vps_name in all_vps:
                self.log_connection(f"正在连接 {vps_name}...")
                success = self.vps_manager.connect_vps(vps_name)
                if success:
                    self.log_connection(f"成功连接到 {vps_name}")
                    connected_count += 1
                else:
                    self.log_connection(f"连接 {vps_name} 失败")
                    
            self.log_connection(f"连接完成，成功连接 {connected_count}/{len(all_vps)} 台VPS")
            
            # 更新VPS状态显示
            self.root.after(0, lambda: self.load_vps_data(refresh_billing=True))
            
        except Exception as e:
            logger.error(f"连接VPS时发生错误: {str(e)}")
            self.log_connection(f"连接错误: {str(e)}")
    
    def disconnect_all_vps(self):
        """断开所有VPS连接"""
        self.status_var.set("正在断开所有VPS连接...")
        
        # 在单独的线程中执行断开连接操作
        def disconnect_thread():
            try:
                self.log_connection("开始断开所有VPS连接...")
                self.vps_manager.disconnect_all_vps()
                self.refresh_connection_status()
                self.status_var.set("已断开所有VPS连接")
                self.log_connection("所有VPS连接已断开")
            except Exception as e:
                logger.error(f"断开VPS连接时发生错误: {str(e)}")
                self.log_connection(f"错误: {str(e)}")
                self.status_var.set("断开VPS连接时发生错误")
        
        threading.Thread(target=disconnect_thread).start()
    
    def connect_selected_vps(self):
        """连接选中的VPS"""
        # 获取当前选项卡
        current_tab = self.notebook.index(self.notebook.select())
        
        # 根据当前选项卡选择不同的树形控件
        if current_tab == 0:  # VPS列表选项卡
            selected_items = self.vps_tree.selection()
        elif current_tab == 1:  # 连接管理选项卡
            selected_items = self.connection_tree.selection()
        else:
            # 在其他选项卡中点击了连接按钮，提示用户转到正确的选项卡
            messagebox.showinfo("提示", "请先切换到VPS列表或连接管理选项卡，然后选择要连接的VPS")
            return
            
        if not selected_items:
            messagebox.showinfo("提示", "请先选择要连接的VPS")
            return
            
        selected_vps = []
        for item in selected_items:
            if current_tab == 0:  # VPS列表选项卡
                values = self.vps_tree.item(item, "values")
                vps_name = values[0] if values else None  # 第一列是VPS名称
            else:  # 连接管理选项卡
                values = self.connection_tree.item(item, "values")
                vps_name = values[0] if values else None  # 第一列是VPS名称
                
            if vps_name:
                selected_vps.append(vps_name)
            
        if not selected_vps:
            messagebox.showinfo("提示", "未找到有效的VPS")
            return
            
        self.status_var.set(f"正在连接选中的VPS...")
        
        # 在新线程中执行连接操作
        thread = threading.Thread(target=lambda: self.connect_selected_thread(selected_vps))
        thread.daemon = True
        thread.start()
        
    def connect_selected_thread(self, selected_vps):
        """在后台线程中连接选中的VPS"""
        try:
            self.log_connection(f"开始连接 {len(selected_vps)} 台选中的VPS...")
            
            connected_count = 0
            for vps_name in selected_vps:
                self.log_connection(f"正在连接 {vps_name}...")
                success = self.vps_manager.connect_vps(vps_name)
                if success:
                    self.log_connection(f"成功连接到 {vps_name}")
                    connected_count += 1
                else:
                    self.log_connection(f"连接 {vps_name} 失败")
                    
            self.log_connection(f"连接完成，成功连接 {connected_count}/{len(selected_vps)} 台VPS")
            
            # 更新VPS状态显示
            self.root.after(0, lambda: self.load_vps_data(refresh_billing=True))
            
        except Exception as e:
            logger.error(f"连接选中的VPS时发生错误: {str(e)}")
            self.log_connection(f"连接错误: {str(e)}")
    
    def disconnect_selected_vps(self):
        """断开选中的VPS连接"""
        # 获取当前选项卡
        current_tab = self.notebook.index(self.notebook.select())
        
        # 根据当前选项卡选择不同的树形控件
        if current_tab == 0:  # VPS列表选项卡
            selected_items = self.vps_tree.selection()
        elif current_tab == 1:  # 连接管理选项卡
            selected_items = self.connection_tree.selection()
        else:
            # 在其他选项卡中点击了断开连接按钮，提示用户转到正确的选项卡
            messagebox.showinfo("提示", "请先切换到VPS列表或连接管理选项卡，然后选择要断开连接的VPS")
            return
        
        if not selected_items:
            messagebox.showinfo("提示", "请先选择要断开连接的VPS")
            return
            
        # 获取选中的VPS名称
        selected_vps = []
        for item in selected_items:
            if current_tab == 0:  # VPS列表选项卡
                values = self.vps_tree.item(item, "values")
                vps_name = values[0] if values else None  # 第一列是VPS名称
            else:  # 连接管理选项卡
                values = self.connection_tree.item(item, "values")
                vps_name = values[0] if values else None  # 第一列是VPS名称
                
            if vps_name:
                selected_vps.append(vps_name)
        
        if not selected_vps:
            messagebox.showinfo("提示", "未找到有效的VPS")
            return
            
        # 确认操作
        confirm_message = f"确定要断开以下 {len(selected_vps)} 台VPS的连接吗?\n\n"
        confirm_message += "\n".join(selected_vps)
        
        if not messagebox.askyesno("确认断开连接", confirm_message):
            return
            
        # 断开连接
        def disconnect_thread():
            for vps_name in selected_vps:
                try:
                    self.status_var.set(f"正在断开VPS连接: {vps_name}")
                    logger.info(f"正在断开VPS连接: {vps_name}")
                    
                    vps_conn = self.vps_manager.vps_connection_manager.get_connection(vps_name)
                    if vps_conn and vps_conn.connected:
                        vps_conn.disconnect()
                        self.log_connection(f"已断开VPS连接: {vps_name}")
                    else:
                        self.log_connection(f"VPS {vps_name} 未连接，无需断开")
                except Exception as e:
                    logger.error(f"断开VPS连接失败: {vps_name} - {str(e)}")
                    self.log_connection(f"断开VPS连接失败: {vps_name} - {str(e)}")
            
            # 刷新连接状态
            self.refresh_connection_status()
            self.status_var.set("已断开选中的VPS连接")
            
        # 启动线程
        threading.Thread(target=disconnect_thread).start()

    def update_prices(self):
        """更新所有VPS的价格和使用时长"""
        try:
            self.status_var.set("正在更新使用时长和价格...")
            
            if self.vps_manager.billing_manager.update_prices():
                # 初始化统计变量
                nat_vps_total_fee = 0.0
                non_nat_vps_total_fee = 0.0
                
                # 计算NAT和非NAT VPS的价格总额
                for vps in self.vps_manager.billing_manager.get_all_vps():
                    if vps.get('use_nat', False):
                        nat_vps_total_fee += float(vps.get('total_price', 0))
                    else:
                        non_nat_vps_total_fee += float(vps.get('total_price', 0))
                
                # 计算NAT费用信息
                nat_vps_count = sum(1 for vps in self.vps_manager.billing_manager.get_all_vps() if vps.get('use_nat', False))
                nat_fee = self.vps_manager.billing_manager.calculate_nat_fee()
                
                # 更新统计表格
                self.nat_vps_fee_var.set(f"${nat_vps_total_fee:.2f}")
                self.non_nat_vps_fee_var.set(f"${non_nat_vps_total_fee:.2f}")
                self.summary_nat_fee_var.set(f"${nat_fee:.2f}")
                
                # 计算总费用
                total_fee = nat_vps_total_fee + non_nat_vps_total_fee + nat_fee
                self.summary_total_var.set(f"${total_fee:.2f}")
                
                # 更新界面
                self.load_vps_data()
                
                # 显示成功信息，包含NAT总费用
                if nat_vps_count > 0:
                    messagebox.showinfo("成功", 
                                      f"已更新所有VPS的使用时长和价格\n\n"
                                      f"NAT信息：\n使用NAT的VPS数量: {nat_vps_count}\n"
                                      f"NAT总费用: ${nat_fee:.2f}\n\n"
                                      f"费用统计：\nNAT服务器费用: ${nat_vps_total_fee:.2f}\n"
                                      f"非NAT服务器费用: ${non_nat_vps_total_fee:.2f}\n"
                                      f"总费用: ${total_fee:.2f}")
                else:
                    messagebox.showinfo("成功", 
                                       f"已更新所有VPS的使用时长和价格\n\n"
                                       f"费用统计：\n非NAT服务器费用: ${non_nat_vps_total_fee:.2f}\n"
                                       f"总费用: ${total_fee:.2f}")
                
                self.status_var.set("已更新使用时长和价格")
            else:
                messagebox.showerror("错误", "更新使用时长和价格失败")
                self.status_var.set("更新使用时长和价格失败")
        except Exception as e:
            logger.error(f"更新使用时长和价格时发生错误: {str(e)}")
            messagebox.showerror("错误", f"更新使用时长和价格时发生错误: {str(e)}")
            self.status_var.set("更新使用时长和价格时发生错误")
    
    def generate_bill(self, format_type):
        """生成账单"""
        try:
            # 只支持Excel格式
            if format_type.lower() != 'excel':
                messagebox.showerror("错误", "目前只支持Excel格式导出")
                return
                
            # 获取当前设置的账单年月
            year, month = self.vps_manager.billing_manager.get_billing_period()
            
            # 选择保存位置
            month_names = {
                1: "一月", 2: "二月", 3: "三月", 4: "四月",
                5: "五月", 6: "六月", 7: "七月", 8: "八月",
                9: "九月", 10: "十月", 11: "十一月", 12: "十二月"
            }
            month_name = month_names.get(month, str(month) + "月")
            default_name = f"vps_billing_{year}_{month}.xlsx"
            file_types = [("Excel文件", "*.xlsx")]
            
            file_path = filedialog.asksaveasfilename(
                defaultextension=".xlsx",
                filetypes=file_types,
                initialfile=default_name
            )
            
            if not file_path:
                return
            
            self.status_var.set(f"正在生成{year}年{month_name}的Excel格式账单...")
            
            # 生成账单
            result = self.vps_manager.billing_manager.save_to_excel(file_path, year, month)
            
            # 检查文件是否实际生成
            file_exists = os.path.exists(file_path) and os.path.getsize(file_path) > 0
            
            if result or file_exists:
                # 即使函数返回False，只要文件存在且有内容，就认为是成功的
                if not result and file_exists:
                    logger.warning(f"generate_bill返回False，但文件已成功创建: {file_path}")
                
                messagebox.showinfo("成功", f"{year}年{month_name}账单已保存到: {file_path}")
                self.status_var.set("账单生成完成")
            else:
                messagebox.showerror("错误", "生成账单失败，请检查日志获取更多信息")
                self.status_var.set("生成账单失败")
        except Exception as e:
            logger.error(f"生成账单时发生错误: {str(e)}", exc_info=True)
            
            # 检查文件是否已经生成
            if 'file_path' in locals() and os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                messagebox.showinfo("部分成功", f"账单可能已部分保存到: {file_path}\n错误: {str(e)}")
                self.status_var.set("账单部分生成")
            else:
                messagebox.showerror("错误", f"生成账单时发生错误: {str(e)}")
                self.status_var.set("生成账单时发生错误")
    
    def show_about_dialog(self):
        """显示关于对话框"""
        try:
            about_message = "VPS管理器 v1.0\n\n"
            about_message += "一个简单的VPS管理和计费工具\n"
            about_message += "可以跟踪VPS的使用时间并计算费用"
            
            messagebox.showinfo("关于VPS管理器", about_message)
            logger.info("显示关于对话框")
        except Exception as e:
            logger.error(f"显示关于对话框时出错: {str(e)}")

    def schedule_usage_update(self):
        """定时更新使用时长（已废弃，由start_usage_auto_refresh替代）"""
        # 这个方法已被替换为更高效的start_usage_auto_refresh方法
        # 为兼容性保留，但不再调用
        logger.info("schedule_usage_update已被替换为start_usage_auto_refresh")
        pass

    def update_vps_display_only(self, need_real_time_calculation=False):
        """仅更新VPS显示，不重新计算使用时长"""
        try:
            # 获取VPS数据
            vps_data = self.vps_manager.billing_manager.get_all_vps()
            
            # 清空列表
            for item in self.vps_tree.get_children():
                self.vps_tree.delete(item)
                
            for item in self.bill_tree.get_children():
                self.bill_tree.delete(item)
            
            # 将使用NAT的VPS排在前面
            nat_vps_list = [vps for vps in vps_data if vps.get('use_nat', True)]
            non_nat_vps_list = [vps for vps in vps_data if not vps.get('use_nat', False)]
            
            # 检查是否有使用NAT的VPS
            has_nat_vps = len(nat_vps_list) > 0
            
            # 按10个一组分组NAT VPS
            nat_vps_groups = [nat_vps_list[i:i+10] for i in range(0, len(nat_vps_list), 10)]
            
            # 更新VPS列表 - 先添加NAT VPS
            group_index = 0
            
            # 初始化费用统计变量
            nat_vps_total_fee = 0.0
            non_nat_vps_total_fee = 0.0
            
            # 获取当前时间用于显示，但仅在必要时才计算使用时长
            now = datetime.datetime.now()
            now_str = now.strftime("%Y/%m/%d %H:%M:%S")
            
            # 获取当前设置的账单年月
            year, month = self.vps_manager.billing_manager.get_billing_period()
            
            # 更新VPS下拉菜单
            vps_names = []
            
            for group in nat_vps_groups:
                group_index += 1
                # 添加组内每个VPS
                for i, vps in enumerate(group):
                    vps_names.append(vps.get('name'))
                    # 获取使用时长（优先使用保存的值，除非需要实时计算）
                    if need_real_time_calculation:
                        try:
                            usage_result = self.vps_manager.billing_manager.calculate_usage_period(vps, year, month, now)
                            if isinstance(usage_result, tuple) and len(usage_result) == 4:
                                usage_string, days, hours, minutes = usage_result
                                vps['usage_period'] = usage_string
                                
                                # 计算价格
                                price_per_month = vps.get('price_per_month', 0)
                                if price_per_month:
                                    vps['total_price'] = self.vps_manager.billing_manager.calculate_price(
                                        price_per_month, days, hours, minutes)
                            else:
                                usage_string = usage_result
                                vps['usage_period'] = usage_string
                        except Exception as e:
                            usage_string = vps.get('usage_period', '计算错误')
                            logger.error(f"计算VPS {vps.get('name')} 使用时长时出错: {str(e)}")
                    else:
                        usage_string = vps.get('usage_period', '未知')
                    
                    values = [
                        vps.get('name', ''),
                        vps.get('host', ''),
                        vps.get('country', ''),
                        '是' if vps.get('use_nat', False) else '否',
                        vps.get('status', ''),
                        vps.get('purchase_date', ''),
                        vps.get('cancel_date', '') if vps.get('status') == "销毁" else '',
                        usage_string,
                        vps.get('price_per_month', 0),
                        vps.get('total_price', 0)
                    ]
                    
                    # 添加VPS到列表，并设置颜色标签
                    if vps.get('status') == "销毁":
                        tag = f'nat_group_{group_index}_destroyed'
                    else:
                        tag = f'nat_group_{group_index}'
                    vps_item = self.vps_tree.insert('', tk.END, text=vps.get('name'), values=values, tags=(tag,))
                    
                    # 设置颜色
                    self.vps_tree.tag_configure(f'nat_group_{group_index}_destroyed', foreground="red")
                    self.vps_tree.tag_configure(f'nat_group_{group_index}', foreground="purple")
                    
                    # 累加NAT VPS费用
                    nat_vps_total_fee += float(vps.get('total_price', 0))
                
            # 再添加非NAT的VPS
            for vps in non_nat_vps_list:
                vps_names.append(vps.get('name'))
                # 获取使用时长（优先使用保存的值，除非需要实时计算）
                if need_real_time_calculation:
                    try:
                        usage_result = self.vps_manager.billing_manager.calculate_usage_period(vps, year, month, now)
                        if isinstance(usage_result, tuple) and len(usage_result) == 4:
                            usage_string, days, hours, minutes = usage_result
                            vps['usage_period'] = usage_string
                            
                            # 计算价格
                            price_per_month = vps.get('price_per_month', 0)
                            if price_per_month:
                                vps['total_price'] = self.vps_manager.billing_manager.calculate_price(
                                    price_per_month, days, hours, minutes)
                        else:
                            usage_string = usage_result
                            vps['usage_period'] = usage_string
                    except Exception as e:
                        usage_string = vps.get('usage_period', '计算错误')
                        logger.error(f"计算VPS {vps.get('name')} 使用时长时出错: {str(e)}")
                else:
                    usage_string = vps.get('usage_period', '未知')
                
                values = [
                    vps.get('name', ''),
                    vps.get('host', ''),
                    vps.get('country', ''),
                    '是' if vps.get('use_nat', False) else '否',
                    vps.get('status', ''),
                    vps.get('purchase_date', ''),
                    vps.get('cancel_date', '') if vps.get('status') == "销毁" else '',
                    usage_string,
                    vps.get('price_per_month', 0),
                    vps.get('total_price', 0)
                ]
                
                # 设置标签以应用颜色
                status_tag = "destroyed" if vps.get('status') == "销毁" else "non_nat"
                self.vps_tree.insert('', tk.END, text=vps.get('name'), values=values, tags=(status_tag,))
                
                # 设置颜色
                self.vps_tree.tag_configure("destroyed", foreground="red")
                self.vps_tree.tag_configure("non_nat", foreground="blue")
                
                # 累加非NAT VPS费用
                non_nat_vps_total_fee += float(vps.get('total_price', 0))
            
            # 更新连接VPS下拉框
            self.vps_combo['values'] = vps_names
            if vps_names:
                self.vps_combo.current(0)
                
            # 获取当前设置的账单年月
            year, month = self.vps_manager.billing_manager.get_billing_period()
            
            # 更新账单树形视图，根据所选年月添加数据
            df = self.vps_manager.billing_manager.to_dataframe(year, month)
            
            # 账单费用统计变量重置
            bill_nat_vps_fee = 0.0
            bill_non_nat_vps_fee = 0.0
            
            for index, row in df.iterrows():
                # 排除总计行和NAT费用行
                if index < len(df) - 2 or (len(df) > 0 and "NAT总费用" not in str(row[-2]) and "总金额" not in str(row[-2])):
                    # 获取VPS对象以确定NAT状态和其他信息
                    vps_name = row[0]
                    vps_obj = next((v for v in vps_data if v.get('name') == vps_name), None)
                    
                    use_nat = False
                    status = ""
                    price_per_month = 0
                    if vps_obj:
                        use_nat = vps_obj.get('use_nat', False)
                        status = vps_obj.get('status', "")
                        price_per_month = vps_obj.get('price_per_month', 0)
                    
                    bill_values = list(row)
                    # 在国家地区后添加是否使用NAT列
                    bill_values.insert(2, '是' if use_nat else '否')
                    
                    # 确保单价与VPS对象中的单价一致
                    if len(bill_values) >= 9:  # 确保有足够的元素
                        bill_values[8] = price_per_month
                        
                    # 获取使用期限并按需要重新计算价格
                    if vps_obj and len(bill_values) >= 10:
                        # 如果可以获取用量和价格，确保总价正确
                        try:
                            total_price = vps_obj.get('total_price', 0)
                            bill_values[9] = total_price
                        except Exception as e:
                            logger.error(f"更新VPS {vps_name} 账单总价时出错: {str(e)}")
                    
                    # 累加费用统计
                    try:
                        # 使用重新计算后的价格进行统计
                        if vps_obj:
                            price = float(vps_obj.get('total_price', 0))
                        else:
                            price = float(row[-1])
                            
                        if use_nat:
                            bill_nat_vps_fee += price
                        else:
                            bill_non_nat_vps_fee += price
                    except (ValueError, TypeError):
                        pass
                    
                    # 设置颜色标签
                    if status == "销毁":
                        tag = "bill_destroyed"
                    elif use_nat:
                        tag = "bill_nat"
                    else:
                        tag = "bill_non_nat"
                    
                    self.bill_tree.insert('', tk.END, text=vps_name, values=bill_values, tags=(tag,))
            
            # 设置账单表格中的字体颜色
            self.bill_tree.tag_configure("bill_destroyed", foreground="red")
            self.bill_tree.tag_configure("bill_nat", foreground="purple")
            self.bill_tree.tag_configure("bill_non_nat", foreground="blue")
            
            # 计算NAT总费用 - 优先使用自定义值
            nat_fee = self.vps_manager.billing_manager.calculate_nat_fee()
            
            # 添加NAT总费用行（仅当有使用NAT的VPS时）
            if has_nat_vps and nat_fee > 0:
                nat_row = ['', '', '', '', '', '', '', 'NAT总费用', f"{nat_fee:.2f}"]
                self.bill_tree.insert('', tk.END, text="", values=nat_row, tags=('summary',))
            
            # 计算总金额
            total_bill = bill_nat_vps_fee + bill_non_nat_vps_fee
            if has_nat_vps:
                total_bill += nat_fee
            
            # 添加总金额行
            total_row = ['', '', '', '', '', '', '', '总金额', f"{total_bill:.2f}"]
            self.bill_tree.insert('', tk.END, text="", values=total_row, tags=('summary',))
            
            # 设置总计行字体
            self.bill_tree.tag_configure("summary", font=("Helvetica", 10, "bold"))
            
            # 更新UI中显示的费用
            self.nat_vps_fee_var.set(f"${bill_nat_vps_fee:.2f}")
            self.non_nat_vps_fee_var.set(f"${bill_non_nat_vps_fee:.2f}")
            self.summary_nat_fee_var.set(f"${nat_fee:.2f}" if has_nat_vps else "$0.00")
            self.summary_total_var.set(f"${total_bill:.2f}")
            
            # 更新NAT总费用显示
            self.nat_total_var.set(f"${nat_fee:.2f}")
            
            # 更新NAT VPS数量信息
            nat_vps_count = len(nat_vps_list)
            nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
            
            self.nat_vps_count_var.set(f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)")
            
            # 更新总费用显示
            self.total_var.set(f"${total_bill:.2f}")
            
            # 更新状态栏，显示最近更新时间
            self.status_var.set(f"数据已更新 - {now_str}")
            
            # 如果进行了实时计算，保存更新后的数据
            if need_real_time_calculation:
                self.vps_manager.billing_manager.save_data()
                logger.info("实时计算后的数据已保存")
            
        except Exception as e:
            logger.error(f"更新VPS显示时发生错误: {str(e)}", exc_info=True)

    def init_billing_tab(self):
        """初始化账单管理选项卡"""
        # 创建顶部工具栏框架
        toolbar_frame = ttk.Frame(self.tab_billing)
        toolbar_frame.pack(fill=tk.X, padx=10, pady=10)
        
        # 添加年月选择
        ttk.Label(toolbar_frame, text="年份:").pack(side=tk.LEFT, padx=(5, 0))
        
        # 年份下拉菜单
        self.year_var = tk.StringVar()
        now = datetime.datetime.now()
        year_options = [str(now.year - i) for i in range(-1, 5)]  # 从明年到前5年
        year_combo = ttk.Combobox(toolbar_frame, textvariable=self.year_var, values=year_options, width=6)
        year_combo.current(1)  # 默认选择当前年份
        year_combo.pack(side=tk.LEFT, padx=(0, 5))
        
        ttk.Label(toolbar_frame, text="月份:").pack(side=tk.LEFT, padx=(5, 0))
        
        # 月份下拉菜单
        self.month_var = tk.StringVar()
        month_options = [str(i) for i in range(1, 13)]
        month_combo = ttk.Combobox(toolbar_frame, textvariable=self.month_var, values=month_options, width=4)
        month_combo.current(now.month - 1)  # 默认选择当前月份
        month_combo.pack(side=tk.LEFT, padx=(0, 5))
        
        # 添加确认按钮
        ttk.Button(toolbar_frame, text="确认", command=self.set_billing_period).pack(side=tk.LEFT, padx=5)
        
        # 创建按钮框架
        buttons_frame = ttk.Frame(toolbar_frame)
        buttons_frame.pack(side=tk.RIGHT, padx=5)
        
        # 添加按钮
        ttk.Button(buttons_frame, text="刷新使用时长", command=self.refresh_usage).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="更新价格", command=self.update_prices).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="导出Excel账单", command=lambda: self.generate_bill('excel')).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="测试购买日期计费", command=self.test_purchase_date_billing).pack(side=tk.LEFT, padx=5)
        self.billing_nat_fee_button = ttk.Button(buttons_frame, text="编辑NAT费用", command=self.edit_nat_fee)
        self.billing_nat_fee_button.pack(side=tk.LEFT, padx=5)
        # 添加复制按钮
        ttk.Button(buttons_frame, text="复制选中", command=self.copy_selected).pack(side=tk.LEFT, padx=5)
        
        # 添加使用时长计算规则说明
        usage_info_frame = ttk.Frame(self.tab_billing)
        usage_info_frame.pack(fill=tk.X, padx=10, pady=(0, 5))
        usage_info_label = ttk.Label(
            usage_info_frame, 
            text="注意: 使用时长统计从每月1日00:00:00开始计算，精确到分钟，实时统计",
            font=("Helvetica", 9, "italic")
        )
        usage_info_label.pack(side=tk.LEFT)
        
        # 添加NAT计费规则说明
        self.billing_nat_info_frame = ttk.Frame(self.tab_billing)
        self.billing_nat_info_frame.pack(fill=tk.X, padx=10, pady=(0, 5))
        nat_info_label = ttk.Label(
            self.billing_nat_info_frame, 
            text="注意: NAT计费方式为每10台VPS共一个价格，系统会记录NAT总费用",
            font=("Helvetica", 9, "italic")
        )
        nat_info_label.pack(side=tk.LEFT)
        
        # 创建账单表格框架
        bill_frame = ttk.Frame(self.tab_billing)
        bill_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        
        # 创建账单树形视图
        columns = ("VPS名称", "国家地区", "是否使用NAT", "使用状态", "购买日期", "销毁时间", "统计截止时间", "使用时长", "月单价", "总金额")
        self.bill_tree = ttk.Treeview(bill_frame, columns=columns, show="headings", selectmode="extended")
        
        # 设置列宽和对齐方式
        for col in columns:
            self.bill_tree.heading(col, text=col)
            self.bill_tree.column(col, width=100, anchor=tk.CENTER)
        
        # 创建自定义样式 - 设置表格边框为深草绿色而不是背景
        style = ttk.Style()
        # 使用更深的草绿色 (#2E8B57 - 海洋绿)
        style.configure("BillTree.Treeview", 
                        background="white",  # 背景色改回白色
                        fieldbackground="white", 
                        bordercolor="#2E8B57",  # 深草绿色边框
                        borderwidth=2)
        style.configure("BillTree.Treeview.Heading", 
                        background="#3D9970",  # 标题背景使用深草绿色
                        foreground="white",
                        font=('Helvetica', 9, 'bold'),
                        bordercolor="#2E8B57",
                        borderwidth=2)
        
        # 配置表格网格线颜色
        style.map('BillTree.Treeview', 
                  foreground=[('selected', 'white')],
                  background=[('selected', '#2E8B57')])  # 选中项使用深草绿色
        
        # 应用样式
        self.bill_tree.configure(style="BillTree.Treeview")
        
        # 添加滚动条
        scrollbar = ttk.Scrollbar(bill_frame, orient=tk.VERTICAL, command=self.bill_tree.yview)
        self.bill_tree.configure(yscrollcommand=scrollbar.set)
        
        # 放置组件
        self.bill_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 创建费用统计表格框架
        summary_frame = ttk.LabelFrame(self.tab_billing, text="费用统计")
        summary_frame.pack(fill=tk.X, padx=10, pady=(0, 10))
        
        # 创建费用统计表格
        summary_frame_inner = ttk.Frame(summary_frame)
        summary_frame_inner.pack(fill=tk.X, padx=10, pady=10)
        
        # 创建表格标题
        ttk.Label(summary_frame_inner, text="类别", width=20, font=("Helvetica", 10, "bold")).grid(row=0, column=0, padx=5, pady=5)
        ttk.Label(summary_frame_inner, text="金额", width=15, font=("Helvetica", 10, "bold")).grid(row=0, column=1, padx=5, pady=5)
        
        # 创建NAT相关VPS费用行
        ttk.Label(summary_frame_inner, text="NAT服务器费用", width=20).grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
        self.nat_vps_fee_var = tk.StringVar()
        self.nat_vps_fee_var.set("$0.00")
        ttk.Label(summary_frame_inner, textvariable=self.nat_vps_fee_var, width=15).grid(row=1, column=1, padx=5, pady=5)
        
        # 创建非NAT服务器费用行
        ttk.Label(summary_frame_inner, text="非NAT服务器费用", width=20).grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
        self.non_nat_vps_fee_var = tk.StringVar()
        self.non_nat_vps_fee_var.set("$0.00")
        ttk.Label(summary_frame_inner, textvariable=self.non_nat_vps_fee_var, width=15).grid(row=2, column=1, padx=5, pady=5)
        
        # 创建NAT总费用行
        ttk.Label(summary_frame_inner, text="NAT管理费用", width=20).grid(row=3, column=0, padx=5, pady=5, sticky=tk.W)
        self.summary_nat_fee_var = tk.StringVar()
        self.summary_nat_fee_var.set("$0.00")
        ttk.Label(summary_frame_inner, textvariable=self.summary_nat_fee_var, width=15).grid(row=3, column=1, padx=5, pady=5)
        
        # 创建分隔线
        ttk.Separator(summary_frame_inner, orient=tk.HORIZONTAL).grid(row=4, column=0, columnspan=2, sticky=tk.EW, padx=5, pady=5)
        
        # 创建总计行
        ttk.Label(summary_frame_inner, text="总计金额", width=20, font=("Helvetica", 10, "bold")).grid(row=5, column=0, padx=5, pady=5, sticky=tk.W)
        self.summary_total_var = tk.StringVar()
        self.summary_total_var.set("$0.00")
        ttk.Label(summary_frame_inner, textvariable=self.summary_total_var, width=15, font=("Helvetica", 10, "bold")).grid(row=5, column=1, padx=5, pady=5)
        
        # 创建总计框架
        total_frame = ttk.Frame(self.tab_billing)
        total_frame.pack(fill=tk.X, padx=10, pady=(0, 10))
        
        # 创建NAT总费用标签和信息
        self.billing_nat_frame = ttk.LabelFrame(total_frame, text="NAT费用信息")
        self.billing_nat_frame.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # NAT信息第一行
        nat_info_frame1 = ttk.Frame(self.billing_nat_frame)
        nat_info_frame1.pack(fill=tk.X, pady=2)
        
        ttk.Label(nat_info_frame1, text="NAT总费用: ").pack(side=tk.LEFT)
        self.nat_total_var = tk.StringVar()
        self.nat_total_var.set("$0.00")
        ttk.Label(nat_info_frame1, textvariable=self.nat_total_var, font=("Helvetica", 12)).pack(side=tk.LEFT)
        
        # 添加设置按钮
        self.billing_nat_set_button = ttk.Button(nat_info_frame1, text="设置NAT总金额", command=self.edit_nat_fee)
        self.billing_nat_set_button.pack(side=tk.RIGHT, padx=5)
        
        # NAT使用VPS数量信息
        nat_info_frame2 = ttk.Frame(self.billing_nat_frame)
        nat_info_frame2.pack(fill=tk.X, pady=2)
        
        # 计算使用NAT的VPS数量
        nat_vps_count = sum(1 for vps in self.vps_manager.billing_manager.get_all_vps() if vps.get('use_nat', False))
        nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
        
        self.nat_vps_count_var = tk.StringVar()
        self.nat_vps_count_var.set(f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)")
        ttk.Label(nat_info_frame2, textvariable=self.nat_vps_count_var, font=("Helvetica", 9)).pack(side=tk.LEFT)
        
        # 创建总金额框架
        bill_frame = ttk.LabelFrame(total_frame, text="账单总额")
        bill_frame.pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=5)
        
        # 总计金额
        ttk.Label(bill_frame, text="总金额: ").pack(side=tk.LEFT, pady=5)
        self.total_var = tk.StringVar()
        self.total_var.set("$0.00")
        ttk.Label(bill_frame, textvariable=self.total_var, font=("Helvetica", 12, "bold")).pack(side=tk.LEFT, pady=5)

    def set_billing_period(self):
        """设置账单计算年月"""
        try:
            # 获取年月
            year = int(self.year_var.get())
            month = int(self.month_var.get())
            
            # 设置账单管理器的账单年月
            if self.vps_manager.billing_manager.set_billing_period(year, month):
                month_names = {
                    1: "一月", 2: "二月", 3: "三月", 4: "四月",
                    5: "五月", 6: "六月", 7: "七月", 8: "八月",
                    9: "九月", 10: "十月", 11: "十一月", 12: "十二月"
                }
                month_name = month_names.get(month, str(month) + "月")
                
                # 更新状态栏
                self.status_var.set(f"已设置账单计算年月为: {year}年{month_name}")
                
                # 刷新数据显示，重新加载VPS数据和账单
                self.load_vps_data(refresh_billing=True)
            else:
                messagebox.showerror("错误", f"设置账单年月失败: {year}/{month}")
        except ValueError:
            messagebox.showerror("错误", "请输入有效的年月")
        except Exception as e:
            messagebox.showerror("错误", f"设置账单年月时出错: {str(e)}")

    def test_purchase_date_billing(self):
        """测试购买日期计费方式"""
        try:
            # 获取选中的VPS
            selected_items = self.bill_tree.selection()
            if not selected_items:
                messagebox.showinfo("提示", "请先选择要测试的VPS")
                return
                
            # 获取VPS名称
            values = self.bill_tree.item(selected_items[0], 'values')
            tags = self.bill_tree.item(selected_items[0], 'tags')
            
            # 检查是否选中了特殊行（NAT费用行或总金额行）
            if not values or not values[0] or (tags and ('summary' in tags)):
                messagebox.showinfo("提示", "请选择一个有效的VPS，而不是汇总行")
                return
                
            vps_name = values[0]
            
            # 获取VPS信息
            vps_info = self.vps_manager.billing_manager.get_vps_by_name(vps_name)
            if not vps_info:
                messagebox.showerror("错误", f"找不到VPS信息: {vps_name}")
                return
                
            # 创建对话框
            dialog = tk.Toplevel(self.root)
            dialog.title("测试购买日期计费")
            dialog.geometry("450x700")
            dialog.resizable(False, False)
            dialog.transient(self.root)
            dialog.grab_set()
            
            # 创建表单
            form_frame = ttk.Frame(dialog, padding=10)
            form_frame.pack(fill=tk.BOTH, expand=True)
            
            # 显示VPS信息
            ttk.Label(form_frame, text="VPS名称:", font=("Helvetica", 10, "bold")).grid(row=0, column=0, sticky=tk.W, pady=5)
            ttk.Label(form_frame, text=vps_name).grid(row=0, column=1, sticky=tk.W, pady=5)
            
            ttk.Label(form_frame, text="主机地址:", font=("Helvetica", 10, "bold")).grid(row=1, column=0, sticky=tk.W, pady=5)
            ttk.Label(form_frame, text=vps_info.get('host', '')).grid(row=1, column=1, sticky=tk.W, pady=5)
            
            ttk.Label(form_frame, text="当前状态:", font=("Helvetica", 10, "bold")).grid(row=2, column=0, sticky=tk.W, pady=5)
            ttk.Label(form_frame, text=vps_info.get('status', '')).grid(row=2, column=1, sticky=tk.W, pady=5)
            
            ttk.Label(form_frame, text="月单价:", font=("Helvetica", 10, "bold")).grid(row=3, column=0, sticky=tk.W, pady=5)
            ttk.Label(form_frame, text=f"${vps_info.get('price_per_month', 0)}").grid(row=3, column=1, sticky=tk.W, pady=5)
            
            ttk.Label(form_frame, text="当前购买日期:", font=("Helvetica", 10, "bold")).grid(row=4, column=0, sticky=tk.W, pady=5)
            current_purchase_date = vps_info.get('purchase_date', '')
            ttk.Label(form_frame, text=current_purchase_date).grid(row=4, column=1, sticky=tk.W, pady=5)
            
            # 添加分隔线
            ttk.Separator(form_frame, orient=tk.HORIZONTAL).grid(row=5, column=0, columnspan=2, sticky=tk.EW, pady=10)
            
            # 添加测试表单
            ttk.Label(form_frame, text="测试购买日期:", font=("Helvetica", 10, "bold")).grid(row=6, column=0, sticky=tk.W, pady=5)
            test_purchase_date_var = tk.StringVar(value=current_purchase_date)
            ttk.Entry(form_frame, textvariable=test_purchase_date_var, width=20).grid(row=6, column=1, sticky=tk.W, pady=5)
            ttk.Label(form_frame, text="格式: YYYY/MM/DD").grid(row=6, column=2, sticky=tk.W, pady=5)
            
            # 添加测试月份信息
            ttk.Label(form_frame, text="测试年份:", font=("Helvetica", 10, "bold")).grid(row=7, column=0, sticky=tk.W, pady=5)
            year, month = self.vps_manager.billing_manager.get_billing_period()
            test_year_var = tk.StringVar(value=str(year))
            ttk.Entry(form_frame, textvariable=test_year_var, width=20).grid(row=7, column=1, sticky=tk.W, pady=5)
            
            ttk.Label(form_frame, text="测试月份:", font=("Helvetica", 10, "bold")).grid(row=8, column=0, sticky=tk.W, pady=5)
            test_month_var = tk.StringVar(value=str(month))
            ttk.Entry(form_frame, textvariable=test_month_var, width=20).grid(row=8, column=1, sticky=tk.W, pady=5)
            
            # 添加计算按钮
            ttk.Button(form_frame, text="计算", command=lambda: do_test_calculation()).grid(row=9, column=0, columnspan=2, pady=10)
            
            # 添加结果显示区域
            result_frame = ttk.LabelFrame(form_frame, text="计算结果")
            result_frame.grid(row=10, column=0, columnspan=3, sticky=tk.EW, pady=5)
            
            result_text = tk.Text(result_frame, wrap=tk.WORD, height=15, width=50)
            result_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
            
            scrollbar = ttk.Scrollbar(result_text, orient=tk.VERTICAL, command=result_text.yview)
            result_text.configure(yscrollcommand=scrollbar.set)
            scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
            
            # 关闭按钮
            ttk.Button(form_frame, text="关闭", command=dialog.destroy).grid(row=11, column=0, columnspan=2, pady=10)
            
            # 测试计算函数
            def do_test_calculation():
                try:
                    # 获取测试参数
                    test_purchase_date = test_purchase_date_var.get().strip()
                    test_year = int(test_year_var.get().strip())
                    test_month = int(test_month_var.get().strip())
                    
                    # 验证参数
                    if not test_purchase_date:
                        messagebox.showerror("错误", "请输入测试购买日期")
                        return
                        
                    if not (2000 <= test_year <= 2100 and 1 <= test_month <= 12):
                        messagebox.showerror("错误", f"无效的年月: {test_year}/{test_month}")
                        return
                    
                    # 解析购买日期
                    try:
                        purchase_date = datetime.datetime.strptime(test_purchase_date, "%Y/%m/%d")
                    except ValueError:
                        try:
                            purchase_date = datetime.datetime.strptime(test_purchase_date, "%Y-%m-%d")
                        except ValueError:
                            messagebox.showerror("错误", f"无法解析购买日期: {test_purchase_date}，请使用YYYY/MM/DD格式")
                            return
                    
                    # 清空结果显示
                    result_text.delete(1.0, tk.END)
                    
                    # 计算当前月的天数
                    if test_month == 12:
                        next_month_year = test_year + 1
                        next_month = 1
                    else:
                        next_month_year = test_year
                        next_month = test_month + 1
                        
                    last_day_of_month = (datetime.datetime(next_month_year, next_month, 1) - datetime.timedelta(days=1)).day
                    days_in_month = last_day_of_month
                    
                    # 显示基本信息
                    result_text.insert(tk.END, f"===== 测试参数 =====\n")
                    result_text.insert(tk.END, f"VPS: {vps_name}\n")
                    result_text.insert(tk.END, f"月单价: ${vps_info.get('price_per_month', 0)}\n")
                    result_text.insert(tk.END, f"购买日期: {test_purchase_date}\n")
                    result_text.insert(tk.END, f"购买日期的日: {purchase_date.day}\n")
                    result_text.insert(tk.END, f"计费月份: {test_year}年{test_month}月\n")
                    result_text.insert(tk.END, f"当月天数: {days_in_month}天\n\n")
                    
                    # 创建临时VPS对象用于测试
                    test_vps = vps_info.copy()
                    test_vps['purchase_date'] = test_purchase_date
                    
                    # 判断是否是第一个月
                    is_first_month = (test_year == purchase_date.year and test_month == purchase_date.month)
                    result_text.insert(tk.END, f"是否首月: {'是' if is_first_month else '否'}\n")
                    
                    if is_first_month:
                        result_text.insert(tk.END, f"购买日是否为1号: {'是' if purchase_date.day == 1 else '否'}\n\n")
                    
                    # 计算使用时长
                    usage_result = self.vps_manager.billing_manager.calculate_usage_period(test_vps, test_year, test_month)
                    
                    if isinstance(usage_result, tuple) and len(usage_result) == 4:
                        usage_string, days, hours, minutes = usage_result
                        result_text.insert(tk.END, f"===== 使用时长 =====\n")
                        result_text.insert(tk.END, f"使用时长: {usage_string}\n")
                        result_text.insert(tk.END, f"天数: {days}天\n")
                        result_text.insert(tk.END, f"小时: {hours}小时\n")
                        result_text.insert(tk.END, f"分钟: {minutes}分钟\n\n")
                        
                        # 计算价格
                        price = self.vps_manager.billing_manager.calculate_price_with_purchase_date(test_vps, test_year, test_month)
                        
                        result_text.insert(tk.END, f"===== 计费结果 =====\n")
                        result_text.insert(tk.END, f"计算价格: ${price:.2f}\n\n")
                        
                        # 计算计费规则
                        price_per_month = float(vps_info.get('price_per_month', 0))
                        daily_price = price_per_month / days_in_month
                        hourly_price = daily_price / 24
                        minutely_price = hourly_price / 60
                        
                        result_text.insert(tk.END, f"===== 计费明细 =====\n")
                        result_text.insert(tk.END, f"月价格: ${price_per_month:.2f}\n")
                        result_text.insert(tk.END, f"日价格: ${daily_price:.4f}\n")
                        result_text.insert(tk.END, f"时价格: ${hourly_price:.6f}\n")
                        result_text.insert(tk.END, f"分价格: ${minutely_price:.8f}\n\n")
                        
                        # 详细计算分析
                        result_text.insert(tk.END, f"===== 计费规则分析 =====\n")
                        
                        if is_first_month and purchase_date.day != 1:
                            result_text.insert(tk.END, "当月购买且不是1号，按天计费。\n")
                            result_text.insert(tk.END, f"计算公式: {days}天 * ${daily_price:.4f} + {hours}小时 * ${hourly_price:.6f} + {minutes}分钟 * ${minutely_price:.8f}\n")
                            day_fee = days * daily_price
                            hour_fee = hours * hourly_price
                            minute_fee = minutes * minutely_price
                            result_text.insert(tk.END, f"日费用: ${day_fee:.2f}\n")
                            result_text.insert(tk.END, f"时费用: ${hour_fee:.2f}\n")
                            result_text.insert(tk.END, f"分费用: ${minute_fee:.2f}\n")
                            result_text.insert(tk.END, f"总费用: ${(day_fee + hour_fee + minute_fee):.2f}\n")
                        elif is_first_month and purchase_date.day == 1:
                            result_text.insert(tk.END, "当月购买且是1号，按满月计费。\n")
                            result_text.insert(tk.END, f"计算公式: 按月费用 ${price_per_month:.2f}\n")
                        else:
                            # 非首月
                            if days >= days_in_month:
                                result_text.insert(tk.END, "非首月且使用满一个月，按月计费。\n")
                                result_text.insert(tk.END, f"计算公式: 按月费用 ${price_per_month:.2f}\n")
                            else:
                                result_text.insert(tk.END, "非首月但未使用满一个月，按天计费。\n")
                                result_text.insert(tk.END, f"计算公式: {days}天 * ${daily_price:.4f}\n")
                                result_text.insert(tk.END, f"总费用: ${days * daily_price:.2f}\n")
                    else:
                        result_text.insert(tk.END, f"计算使用时长失败: {usage_result}\n")
                        
                except ValueError as e:
                    messagebox.showerror("错误", f"输入格式错误: {str(e)}")
                except Exception as e:
                    logger.error(f"测试购买日期计费时出错: {str(e)}", exc_info=True)
                    messagebox.showerror("错误", f"测试时出错: {str(e)}")
                    
        except Exception as e:
            logger.error(f"测试购买日期计费时出错: {str(e)}", exc_info=True)
            messagebox.showerror("错误", f"测试购买日期计费时出错: {str(e)}")

    def show_bulk_add_vps_dialog(self):
        """显示批量添加VPS对话框（表格形式）"""
        # 创建对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("批量添加VPS")
        dialog.geometry("1200x600")  # 设置较大的初始大小
        dialog.resizable(True, True)  # 允许调整大小
        dialog.transient(self.root)
        dialog.grab_set()
        
        # 创建主框架
        main_frame = ttk.Frame(dialog, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 创建信息标签
        info_label = ttk.Label(
            main_frame, 
            text="使用表格批量添加VPS (最多50个)，必填字段: VPS名称、主机地址、用户名、密码、月单价",
            font=("Helvetica", 10, "bold")
        )
        info_label.pack(fill=tk.X, pady=(0, 10))
        
        # 创建NAT信息标签
        nat_info_label = ttk.Label(
            main_frame, 
            text="注意: NAT计费方式为每10台VPS共享一个价格。使用NAT的VPS会用紫色标记。",
            font=("Helvetica", 9, "italic")
        )
        nat_info_label.pack(fill=tk.X, pady=(0, 5))
        
        # 创建购买日期说明标签
        purchase_date_info = ttk.Label(
            main_frame,
            text="注意: 购买日期影响计费方式。当月购买日非1号按天计费，是1号则按月计费。第二个月起如满一个月按月计费，不满一个月按天计费。",
            font=("Helvetica", 9, "italic"), 
            wraplength=1100
        )
        purchase_date_info.pack(fill=tk.X, pady=(0, 10))
        
        # 创建表格框架和滚动条
        table_frame = ttk.Frame(main_frame)
        table_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        
        # 创建水平和垂直滚动条
        x_scrollbar = ttk.Scrollbar(table_frame, orient=tk.HORIZONTAL)
        x_scrollbar.pack(side=tk.BOTTOM, fill=tk.X)
        
        y_scrollbar = ttk.Scrollbar(table_frame)
        y_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 定义表格列
        columns = [
            "VPS名称", "主机地址", "SSH端口", "用户名", "密码", 
            "国家地区", "是否使用NAT", "VPS状态", "购买日期", 
            "销毁时间", "月单价"
        ]
        
        # 设置表格样式，添加草绿色边框
        style = ttk.Style()
        style.configure("GreenBorder.Treeview",
                      background="white",
                      fieldbackground="white",
                      borderwidth=2,
                      relief="solid")
        style.map("GreenBorder.Treeview",
                background=[('selected', '#e0f0e0')],
                foreground=[('selected', 'purple')])  # 选中项使用紫色字体
        # 设置表头样式
        style.configure("GreenBorder.Treeview.Heading",
                      background="#90ee90",  # 浅草绿色背景
                      foreground="black",
                      font=('Helvetica', 10, 'bold'),
                      relief="solid",
                      borderwidth=1)
        # 设置单元格表格线样式
        style.layout("GreenBorder.Treeview", [
            ('GreenBorder.Treeview.treearea', {'sticky': 'nswe', 'border': '1'})
        ])
        style.configure("GreenBorder.Treeview", bordercolor="#8fbc8f")  # 深草绿色边框
        
        # 创建表格视图，应用草绿色边框样式
        table = ttk.Treeview(
            table_frame, 
            columns=columns, 
            show="headings", 
            selectmode="browse",
            xscrollcommand=x_scrollbar.set,
            yscrollcommand=y_scrollbar.set,
            style="GreenBorder.Treeview"  # 应用自定义样式
        )
        
        # 配置滚动条
        x_scrollbar.config(command=table.xview)
        y_scrollbar.config(command=table.yview)
        
        # 设置列标题和宽度
        table.column("#0", width=0, stretch=tk.NO)
        column_widths = {
            "VPS名称": 100,
            "主机地址": 130,
            "SSH端口": 80,
            "用户名": 80,
            "密码": 100,
            "国家地区": 100,
            "是否使用NAT": 100,
            "VPS状态": 80,
            "购买日期": 100,
            "销毁时间": 100,
            "月单价": 80
        }
        
        for col in columns:
            table.heading(col, text=col)
            table.column(col, width=column_widths.get(col, 100), anchor=tk.CENTER)
        
        table.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # 创建编辑功能按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=10)
        
        # 添加行按钮
        def add_row():
            default_values = [
                "", "", "22", "root", "", 
                "", "否", "在用", datetime.datetime.now().strftime("%Y/%m/%d"),
                "", ""
            ]
            table.insert("", tk.END, values=default_values)
        
        # 删除行按钮
        def delete_row():
            selected_item = table.selection()
            if selected_item:
                table.delete(selected_item)
        
        # 清空表格按钮
        def clear_table():
            for item in table.get_children():
                table.delete(item)
        
        # 添加初始空行
        for _ in range(5):  # 默认显示5行
            add_row()
        
        # 创建单元格编辑功能
        def on_cell_click(event):
            # 获取点击的项目和列
            item = table.identify_row(event.y)
            column = table.identify_column(event.x)
            
            if not item or not column:
                return
                
            # 获取列索引
            column_index = int(column.replace('#', '')) - 1
            column_name = columns[column_index]
            
            # 如果是"是否使用NAT"或"VPS状态"列，显示下拉选择
            if column_name == "是否使用NAT":
                show_combobox_popup(item, column_index, ["是", "否"])
                return
            elif column_name == "VPS状态":
                show_combobox_popup(item, column_index, ["在用", "销毁"])
                return
            
            # 获取当前值
            current_value = table.item(item, "values")[column_index]
            
            # 获取单元格的坐标
            x, y, width, height = table.bbox(item, column)
            
            # 创建编辑框
            entry_edit = ttk.Entry(table)
            entry_edit.insert(0, current_value)
            
            # 放置编辑框
            entry_edit.place(x=x, y=y, width=width, height=height)
            entry_edit.focus_set()
            entry_edit.select_range(0, tk.END)  # 选中所有文本，方便编辑
            
            # 编辑完成函数
            def on_edit_finish(event=None):
                # 获取所有当前值
                current_values = list(table.item(item, "values"))
                # 更新编辑的值
                current_values[column_index] = entry_edit.get()
                # 设置新值
                table.item(item, values=current_values)
                # 销毁编辑框
                entry_edit.destroy()
                # 重新应用选中项样式
                table.selection_set(item)
            
            # 绑定回车键和失去焦点事件
            entry_edit.bind("<Return>", on_edit_finish)
            entry_edit.bind("<FocusOut>", on_edit_finish)
        
        # 用于下拉选择的函数
        def show_combobox_popup(item, column_index, values):
            # 销毁之前可能存在的任何combobox
            for widget in table.winfo_children():
                if isinstance(widget, ttk.Combobox):
                    widget.destroy()
                
            # 获取单元格的坐标
            x, y, width, height = table.bbox(item, column_index + 1)  # +1 因为treeview列索引从#1开始
            
            # 创建组合框
            combo = ttk.Combobox(table, values=values, state="readonly")
            current_value = table.item(item, "values")[column_index]
            if current_value in values:
                combo.set(current_value)
            else:
                combo.set(values[0])
            
            # 放置组合框
            combo.place(x=x, y=y, width=width, height=height)
            combo.focus_set()
            
            # 选择完成函数
            def on_combo_select(event=None):
                # 只处理下拉框选择事件，而不是失去焦点事件
                if event and event.type == "<<ComboboxSelected>>":
                    # 获取所有当前值
                    current_values = list(table.item(item, "values"))
                    # 更新编辑的值
                    current_values[column_index] = combo.get()
                    # 设置新值
                    table.item(item, values=current_values)
                    # 销毁组合框
                    combo.destroy()
                    # 重新应用选中项样式
                    table.selection_set(item)
            
            # 绑定选择事件
            combo.bind("<<ComboboxSelected>>", on_combo_select)
            # 移除失去焦点事件绑定，以防止在点击选项时提前关闭
            # combo.bind("<FocusOut>", on_combo_select)
        
        # 绑定单击事件
        table.bind("<ButtonRelease-1>", on_cell_click)
        
        # 添加编辑按钮
        ttk.Button(button_frame, text="添加行", command=add_row).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="删除选中行", command=delete_row).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="清空表格", command=clear_table).pack(side=tk.LEFT, padx=5)
        
        # 添加确认与取消按钮
        control_frame = ttk.Frame(main_frame)
        control_frame.pack(fill=tk.X, pady=10)
        
        def on_bulk_add():
            try:
                added_count = 0
                errors = []
                
                # 获取表格中的所有行
                all_rows = table.get_children()
                
                # 如果没有数据，显示提示
                if not all_rows:
                    messagebox.showinfo("提示", "表格中没有数据，请先添加VPS信息")
                    return
                
                # 遍历所有行，添加VPS
                for item in all_rows:
                    values = table.item(item, "values")
                    
                    # 如果行为空（所有字段都为空），则跳过
                    if not any(values):
                        continue
                    
                    # 获取各个字段的值
                    name = values[0].strip() if values[0] else ""
                    host = values[1].strip() if values[1] else ""
                    port = values[2].strip() if values[2] else "22"
                    username = values[3].strip() if values[3] else ""
                    password = values[4].strip() if values[4] else ""
                    country = values[5].strip() if values[5] else ""
                    use_nat = values[6] == "是"
                    status = values[7] if values[7] else "在用"
                    purchase_date = values[8].strip() if values[8] else datetime.datetime.now().strftime("%Y/%m/%d")
                    expire_date = values[9].strip() if values[9] else ""
                    price = values[10].strip() if values[10] else ""
                    
                    # 验证必填字段
                    if not name or not host or not username or not password or not price:
                        errors.append(f"行 {values}: 缺少必填字段")
                        continue
                    
                    try:
                        # 创建VPS信息字典
                        vps_info = {
                            'name': name,
                            'host': host,
                            'port': int(port),
                            'username': username,
                            'password': password,
                            'country': country,
                            'use_nat': use_nat,
                            'status': status,
                            'purchase_date': purchase_date,
                            'price_per_month': float(price)
                        }
                        
                        # 添加可选字段
                        if expire_date:
                            vps_info['expire_date'] = expire_date
                        
                        # 添加VPS
                        if self.vps_manager.add_new_vps(vps_info):
                            added_count += 1
                        else:
                            errors.append(f"添加VPS失败: {name}")
                            
                    except ValueError as e:
                        errors.append(f"VPS {name} 格式错误: {str(e)}")
                    except Exception as e:
                        errors.append(f"添加VPS {name} 时出错: {str(e)}")
                
                # 更新NAT相关信息（如果有VPS使用NAT）
                if added_count > 0:
                    # 重新加载VPS数据以获取更新后的数据
                    all_vps_data = self.vps_manager.billing_manager.get_all_vps()
                    
                    # 检查是否有使用NAT的VPS
                    nat_vps_list = [vps for vps in all_vps_data if vps.get('use_nat', True)]
                    has_nat_vps = len(nat_vps_list) > 0
                    
                    if has_nat_vps:
                        # 重新计算NAT费用
                        nat_fee = self.vps_manager.billing_manager.calculate_nat_fee()
                        
                        # 更新NAT使用情况信息
                        nat_vps_count = sum(1 for vps in all_vps_data if vps.get('use_nat', False))
                        nat_units = (nat_vps_count + 9) // 10  # 每10台VPS一个计费单位
                        nat_count_info = f"使用NAT的VPS数量: {nat_vps_count}   NAT计费单位: {nat_units} (每10台一个单位)"
                        
                        # 更新VPS列表和账单列表中的NAT信息
                        self.nat_vps_count_var.set(nat_count_info)
                        self.vps_list_nat_count_var.set(nat_count_info)
                        
                        # 更新NAT总金额
                        self.nat_total_var.set(f"${nat_fee:.2f}")
                        self.vps_list_nat_total_var.set(f"${nat_fee:.2f}")
                        
                        # 更新总计金额
                        total = self.vps_manager.billing_manager.calculate_total_bill()
                        self.total_var.set(f"${total:.2f}")
                        
                        # 更新NAT相关UI组件的显示状态
                        self.update_nat_ui_visibility(has_nat_vps)
                        self.update_billing_nat_ui_visibility(has_nat_vps)
                
                # 显示结果消息
                result_message = f"成功添加 {added_count} 个VPS"
                if errors:
                    result_message += f"\n\n发生以下错误:\n" + "\n".join(errors)
                
                if added_count > 0:
                    if errors:
                        messagebox.showwarning("部分成功", result_message)
                    else:
                        messagebox.showinfo("成功", result_message)
                    dialog.destroy()
                    
                    # 加载VPS数据
                    self.load_vps_data()
                else:
                    messagebox.showerror("失败", result_message)
                
            except Exception as e:
                logger.error(f"批量添加VPS时出错: {str(e)}")
                messagebox.showerror("错误", f"批量添加VPS时出错: {str(e)}")
        
        ttk.Button(control_frame, text="批量添加", command=on_bulk_add).pack(side=tk.RIGHT, padx=5)
        ttk.Button(control_frame, text="取消", command=dialog.destroy).pack(side=tk.RIGHT, padx=5)
        
        # 设置焦点
        dialog.focus_set()