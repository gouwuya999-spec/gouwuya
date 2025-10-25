@echo off
chcp 65001 >nul
set LANG=zh_CN.UTF-8
set LC_ALL=zh_CN.UTF-8
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set NODE_ENV=production

echo 正在启动VPS管理系统...
echo 环境变量已设置:
echo LANG=%LANG%
echo LC_ALL=%LC_ALL%
echo PYTHONIOENCODING=%PYTHONIOENCODING%
echo PYTHONUTF8=%PYTHONUTF8%

echo.
echo 启动应用程序...
npm start
