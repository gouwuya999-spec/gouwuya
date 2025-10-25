Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
strPath = "F:\automatic-potato"

' 创建无窗口启动快捷方式，使用英文名称避免乱码
Set oShellLink = WshShell.CreateShortcut(strDesktop & "\VPS Management System.lnk")
oShellLink.TargetPath = strPath & "\launch_windowless.vbs"
oShellLink.WorkingDirectory = strPath
oShellLink.Description = "VPS Management System - Windowless Launch"
oShellLink.IconLocation = strPath & "\icon.ico"
oShellLink.WindowStyle = 1
oShellLink.Save

WScript.Echo "Desktop shortcut created successfully!"
