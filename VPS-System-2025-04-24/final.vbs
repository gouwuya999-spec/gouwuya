Set WS = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
CurrentFolder = FSO.GetParentFolderName(WScript.ScriptFullName)
desktop = WS.SpecialFolders("Desktop")

' Create the shortcut
Set link = WS.CreateShortcut(desktop & "\VPS System.lnk")
link.TargetPath = CurrentFolder & "\无窗口启动.vbs"
link.WorkingDirectory = CurrentFolder
link.IconLocation = CurrentFolder & "\icon.ico"
link.Description = "VPS Management System"
link.Save

WScript.Echo "Shortcut created successfully." 