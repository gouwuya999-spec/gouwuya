@echo off
echo 正在启动VPS管理器...
python vps_manager_gui.py
if errorlevel 1 (
  echo 启动失败，错误代码: %errorlevel%
  echo 请查看日志文件了解详情
  pause
) 