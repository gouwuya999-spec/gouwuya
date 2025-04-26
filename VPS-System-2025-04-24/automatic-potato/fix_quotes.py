#!/usr/bin/env python
# -*- coding: utf-8 -*-

with open('vps_manager_gui.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 修复中文引号问题
content = content.replace('提示: 先在下方列表中选择要删除的节点，然后点击"删除选中对等节点"按钮', 
                         '提示: 先在下方列表中选择要删除的节点，然后点击删除按钮')

with open('vps_manager_gui.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("已修复引号问题") 