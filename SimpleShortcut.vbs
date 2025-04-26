Option Explicit

' Create objects
Dim WshShell
Set WshShell = WScript.CreateObject("WScript.Shell")

' Get desktop path
Dim desktopPath
desktopPath = WshShell.SpecialFolders("Desktop")

' Get current directory - hardcode it to avoid path issues
Dim currentPath
currentPath = WScript.ScriptFullName
currentPath = Left(currentPath, InStrRev(currentPath, "\") - 1)

' Create desktop shortcut
Dim shortcut
Set shortcut = WshShell.CreateShortcut(desktopPath & "\VPS管理系统.lnk")
shortcut.TargetPath = currentPath & "\无窗口启动.vbs"
shortcut.WorkingDirectory = currentPath
shortcut.IconLocation = currentPath & "\icon.ico"
shortcut.Description = "VPS Management System"
shortcut.Save

' Notify user
WScript.Echo "Shortcut created successfully at: " & desktopPath & "\VPS管理系统.lnk"
WScript.Echo "Target path: " & shortcut.TargetPath

' Cleanup
Set shortcut = Nothing
Set WshShell = Nothing 