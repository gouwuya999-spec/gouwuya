Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Get paths
CurrentPath = FSO.GetParentFolderName(WScript.ScriptFullName)
DesktopPath = WshShell.SpecialFolders("Desktop")

' Create desktop shortcut
Set Shortcut = WshShell.CreateShortcut(DesktopPath & "\VPS-System.lnk")
Shortcut.TargetPath = CurrentPath & "\无窗口启动.vbs"
Shortcut.WorkingDirectory = CurrentPath
Shortcut.IconLocation = CurrentPath & "\icon.ico"
Shortcut.Description = "VPS System"
Shortcut.Save

WScript.Echo "Shortcut created successfully!" 