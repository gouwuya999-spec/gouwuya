@echo off
REM VPS管理系统 - 创建桌面快捷方式
REM 创建时间: 2025-01

echo 正在创建桌面快捷方式...

REM 获取当前目录
set "CURRENT_DIR=%~dp0"

REM 创建无窗口启动快捷方式
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\VPS管理系统.lnk'); $Shortcut.TargetPath = '%CURRENT_DIR%launch_windowless.vbs'; $Shortcut.WorkingDirectory = '%CURRENT_DIR%'; $Shortcut.Description = 'VPS管理系统 - 无窗口启动'; $Shortcut.IconLocation = '%CURRENT_DIR%icon.ico'; $Shortcut.WindowStyle = 1; $Shortcut.Save()"

REM 创建带窗口启动快捷方式
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\VPS管理系统(带窗口).lnk'); $Shortcut.TargetPath = '%CURRENT_DIR%launch_vps_optimized.vbs'; $Shortcut.WorkingDirectory = '%CURRENT_DIR%'; $Shortcut.Description = 'VPS管理系统 - 带窗口启动'; $Shortcut.IconLocation = '%CURRENT_DIR%icon.ico'; $Shortcut.WindowStyle = 1; $Shortcut.Save()"

echo.
echo 桌面快捷方式创建完成！
echo.
echo 已创建以下快捷方式：
echo • VPS管理系统.lnk (无窗口启动)
echo • VPS管理系统(带窗口).lnk (带窗口启动)
echo.
echo 双击快捷方式即可启动VPS管理系统！
echo.
pause
