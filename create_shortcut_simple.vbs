Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
strPath = "F:\automatic-potato"

Set oShellLink = WshShell.CreateShortcut(strDesktop & "\VPS管理系统.lnk")
oShellLink.TargetPath = strPath & "\launch_windowless.vbs"
oShellLink.WorkingDirectory = strPath
oShellLink.Description = "VPS管理系统 - 无窗口启动"
oShellLink.IconLocation = strPath & "\icon.ico"
oShellLink.WindowStyle = 1
oShellLink.Save

Set oShellLink2 = WshShell.CreateShortcut(strDesktop & "\VPS管理系统(带窗口).lnk")
oShellLink2.TargetPath = strPath & "\launch_vps_optimized.vbs"
oShellLink2.WorkingDirectory = strPath
oShellLink2.Description = "VPS管理系统 - 带窗口启动"
oShellLink2.IconLocation = strPath & "\icon.ico"
oShellLink2.WindowStyle = 1
oShellLink2.Save

WScript.Echo "桌面快捷方式创建完成！"
