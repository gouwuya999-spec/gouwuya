Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = oWS.SpecialFolders("Desktop")
sCurrentDir = oWS.CurrentDirectory

' Create shortcut
Set oShortcut = oWS.CreateShortcut(sDesktop & "\VPS System (Electron).lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = """" & sCurrentDir & "\electron-hidden.vbs"""
oShortcut.WorkingDirectory = sCurrentDir
oShortcut.IconLocation = sCurrentDir & "\icon.ico"
oShortcut.Description = "VPS Management System (Electron)"
oShortcut.Save

WScript.Echo "Desktop shortcut for Electron version created successfully (hidden mode)!" 