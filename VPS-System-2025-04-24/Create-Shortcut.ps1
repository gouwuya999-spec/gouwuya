# 获取当前脚本路径
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition

# 创建WScript.Shell对象
$shell = New-Object -ComObject WScript.Shell

# 获取桌面路径
$desktop = $shell.SpecialFolders("Desktop")

# 输出路径信息
Write-Host "桌面路径: $desktop"
Write-Host "脚本路径: $scriptPath"

# 创建快捷方式
$shortcutPath = Join-Path $desktop "VPS管理系统.lnk"
$targetPath = Join-Path $scriptPath "无窗口启动.vbs"
$iconPath = Join-Path $scriptPath "icon.ico"

Write-Host "创建快捷方式..."
Write-Host "快捷方式位置: $shortcutPath"
Write-Host "目标文件: $targetPath"
Write-Host "图标文件: $iconPath"

# 创建快捷方式
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $scriptPath
$shortcut.IconLocation = $iconPath
$shortcut.Description = "VPS管理系统"
$shortcut.Save()

Write-Host "快捷方式创建成功！" -ForegroundColor Green
Write-Host "按任意键退出..." -ForegroundColor Yellow
$host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 