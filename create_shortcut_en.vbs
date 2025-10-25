Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
strPath = "F:\automatic-potato"

Set oShellLink = WshShell.CreateShortcut(strDesktop & "\VPS Management System.lnk")
oShellLink.TargetPath = strPath & "\launch_windowless.vbs"
oShellLink.WorkingDirectory = strPath
oShellLink.Description = "VPS Management System - Windowless Launch"
oShellLink.IconLocation = strPath & "\icon.ico"
oShellLink.WindowStyle = 1
oShellLink.Save

Set oShellLink2 = WshShell.CreateShortcut(strDesktop & "\VPS Management System (Windowed).lnk")
oShellLink2.TargetPath = strPath & "\launch_vps_optimized.vbs"
oShellLink2.WorkingDirectory = strPath
oShellLink2.Description = "VPS Management System - Windowed Launch"
oShellLink2.IconLocation = strPath & "\icon.ico"
oShellLink2.WindowStyle = 1
oShellLink2.Save

WScript.Echo "Desktop shortcuts created successfully!"
