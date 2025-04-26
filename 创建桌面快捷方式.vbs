Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = oWS.SpecialFolders("Desktop")
sCurrentDir = oWS.CurrentDirectory

' Create shortcut
Set oShortcut = oWS.CreateShortcut(sDesktop & "\\VPS管理系统.lnk")
oShortcut.TargetPath = sCurrentDir & "\\无窗口启动.vbs"
oShortcut.WorkingDirectory = sCurrentDir
oShortcut.IconLocation = sCurrentDir & "\icon.ico"
oShortcut.Description = "VPS管理系统"
oShortcut.Save

WScript.Echo "桌面快捷方式创建成功! Please try to launch it." 
