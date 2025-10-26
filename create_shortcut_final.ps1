# VPS Management System - Desktop Shortcut Creator
Write-Host "Creating VPS Management System desktop shortcut..."

$WshShell = New-Object -ComObject WScript.Shell
$Desktop = $WshShell.SpecialFolders("Desktop")

$Shortcut = $WshShell.CreateShortcut("$Desktop\VPS Management System (Silent).lnk")
$Shortcut.TargetPath = "F:\automatic-potato\launch_windowless.vbs"
$Shortcut.WorkingDirectory = "F:\automatic-potato"
$Shortcut.Description = "VPS Management System - Silent Launch"
$Shortcut.IconLocation = "F:\automatic-potato\icon.ico"
$Shortcut.WindowStyle = 1
$Shortcut.Save()

Write-Host "Shortcut created successfully!"
Write-Host "Shortcut name: VPS Management System (Silent).lnk"
Write-Host "Location: Desktop"
Write-Host "Function: Double-click to launch VPS Management System in silent mode"
