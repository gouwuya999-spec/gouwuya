@echo off
chcp 65001 >nul
echo 正在修复VPS管理系统的数据丢失和编码问题...

echo.
echo 步骤1: 设置环境变量
set LANG=zh_CN.UTF-8
set LC_ALL=zh_CN.UTF-8
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set NODE_ENV=production

echo.
echo 步骤2: 测试数据存储
node test_data_storage.js

echo.
echo 步骤3: 恢复数据（如果需要）
node restore_data.js

echo.
echo 步骤4: 启动应用程序
echo 环境变量已设置:
echo LANG=%LANG%
echo LC_ALL=%LC_ALL%
echo PYTHONIOENCODING=%PYTHONIOENCODING%
echo PYTHONUTF8=%PYTHONUTF8%

echo.
echo 正在启动VPS管理系统...
npm start

pause
