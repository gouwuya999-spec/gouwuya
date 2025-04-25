# 获取当前脚本所在目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# 创建Shell对象
$shell = New-Object -ComObject WScript.Shell

# 获取桌面路径
$desktop = $shell.SpecialFolders("Desktop")

# 设置文件路径
$targetPath = Join-Path $scriptDir "无窗口启动.vbs"
$iconPath = Join-Path $scriptDir "icon.ico"
$shortcutPath = Join-Path $desktop "VPS管理系统.lnk"

Write-Host "正在创建快捷方式..." -ForegroundColor Cyan
Write-Host "目标文件: $targetPath"
Write-Host "图标文件: $iconPath"
Write-Host "快捷方式将保存到: $shortcutPath"

# 创建快捷方式
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $scriptDir
$shortcut.IconLocation = $iconPath
$shortcut.Description = "VPS管理系统"
$shortcut.Save()

Write-Host "快捷方式创建成功!" -ForegroundColor Green

# 释放COM对象
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers() 