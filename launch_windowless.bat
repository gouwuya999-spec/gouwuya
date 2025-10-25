@echo off
REM VPS管理系统 - 无窗口启动批处理文件
REM 创建时间: 2025-01

REM 设置环境变量
set ELECTRON_DISABLE_SECURITY_WARNINGS=1
set ELECTRON_ENABLE_LOGGING=0
set NODE_ENV=production

REM 切换到项目目录
cd /d "F:\automatic-potato"

REM 检查Node.js是否可用
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js not found
    pause
    exit /b 1
)

REM 启动应用（无窗口）
start /min "" npm start

REM 退出批处理
exit /b 0
