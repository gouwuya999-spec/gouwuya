@echo off
chcp 65001 >nul
echo 测试VPS管理系统无窗口快捷方式...

echo.
echo 快捷方式信息:
echo 名称: VPS Management System (Silent).lnk
echo 位置: %USERPROFILE%\Desktop
echo 目标: F:\automatic-potato\launch_windowless.vbs
echo.

echo 检查快捷方式文件是否存在...
if exist "%USERPROFILE%\Desktop\VPS Management System (Silent).lnk" (
    echo ✓ 快捷方式文件存在
) else (
    echo ✗ 快捷方式文件不存在
    pause
    exit /b 1
)

echo.
echo 检查目标文件是否存在...
if exist "F:\automatic-potato\launch_windowless.vbs" (
    echo ✓ 目标VBS文件存在
) else (
    echo ✗ 目标VBS文件不存在
    pause
    exit /b 1
)

echo.
echo 检查Node.js环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo ✗ Node.js未安装或不在PATH中
    pause
    exit /b 1
) else (
    echo ✓ Node.js环境正常
)

echo.
echo 检查npm环境...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ✗ npm未安装或不在PATH中
    pause
    exit /b 1
) else (
    echo ✓ npm环境正常
)

echo.
echo 所有检查通过！快捷方式应该可以正常工作。
echo.
echo 使用方法:
echo 1. 双击桌面上的 "VPS Management System (Silent).lnk"
echo 2. 系统将无窗口启动VPS管理系统
echo 3. 可以通过任务管理器查看electron进程确认系统已启动
echo.
pause
