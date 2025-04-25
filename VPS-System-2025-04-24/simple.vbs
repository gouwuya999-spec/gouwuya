Set WS = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
CurrentFolder = FSO.GetParentFolderName(WScript.ScriptFullName)
desktop = WS.SpecialFolders("Desktop")

' Create the shortcut
Set link = WS.CreateShortcut(desktop & "\VPS管理系统.lnk")
link.TargetPath = CurrentFolder & "\无窗口启动.vbs"
link.WorkingDirectory = CurrentFolder
link.IconLocation = CurrentFolder & "\icon.ico"
link.Description = "VPS管理系统"
link.Save

WScript.Echo "桌面快捷方式创建成功！" 