# VPS管理系统 - 创建桌面快捷方式
# 创建时间: 2025-01

Write-Host "正在创建桌面快捷方式..." -ForegroundColor Green

# 获取当前脚本目录
$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 创建无窗口启动快捷方式
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\VPS管理系统.lnk")
$Shortcut.TargetPath = "$CurrentDir\launch_windowless.vbs"
$Shortcut.WorkingDirectory = $CurrentDir
$Shortcut.Description = "VPS管理系统 - 无窗口启动"
$Shortcut.IconLocation = "$CurrentDir\icon.ico"
$Shortcut.WindowStyle = 1
$Shortcut.Save()

# 创建带窗口启动快捷方式
$Shortcut2 = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\VPS管理系统(带窗口).lnk")
$Shortcut2.TargetPath = "$CurrentDir\launch_vps_optimized.vbs"
$Shortcut2.WorkingDirectory = $CurrentDir
$Shortcut2.Description = "VPS管理系统 - 带窗口启动"
$Shortcut2.IconLocation = "$CurrentDir\icon.ico"
$Shortcut2.WindowStyle = 1
$Shortcut2.Save()

Write-Host ""
Write-Host "桌面快捷方式创建完成！" -ForegroundColor Yellow
Write-Host ""
Write-Host "已创建以下快捷方式：" -ForegroundColor Cyan
Write-Host "• VPS管理系统.lnk (无窗口启动)" -ForegroundColor White
Write-Host "• VPS管理系统(带窗口).lnk (带窗口启动)" -ForegroundColor White
Write-Host ""
Write-Host "双击快捷方式即可启动VPS管理系统！" -ForegroundColor Green
Write-Host ""
Read-Host "按任意键继续..."
