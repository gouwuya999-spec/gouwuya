Option Explicit

' Create objects
Dim WshShell, fso, desktopPath, currentPath
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get paths
currentPath = fso.GetParentFolderName(WScript.ScriptFullName)
desktopPath = WshShell.SpecialFolders("Desktop")

' Create desktop shortcut
Dim shortcut
Set shortcut = WshShell.CreateShortcut(desktopPath & "\VPS管理系统.lnk")
shortcut.TargetPath = currentPath & "\无窗口启动.vbs"
shortcut.WorkingDirectory = currentPath
shortcut.IconLocation = currentPath & "\icon.ico"
shortcut.Description = "VPS Management System"
shortcut.Save

' Notify user
WScript.Echo "Shortcut created successfully!"

' Cleanup
Set shortcut = Nothing
Set WshShell = Nothing
Set fso = Nothing 