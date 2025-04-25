Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = oWS.SpecialFolders("Desktop")
sCurrentDir = oWS.CurrentDirectory

' Create shortcut
Set oShortcut = oWS.CreateShortcut(sDesktop & "\VPS System.lnk")
oShortcut.TargetPath = sCurrentDir & "\start-vps.bat"
oShortcut.WorkingDirectory = sCurrentDir
oShortcut.IconLocation = sCurrentDir & "\icon.ico"
oShortcut.Description = "VPS Management System"
oShortcut.Save

WScript.Echo "Desktop shortcut created successfully! Please try to launch it." 