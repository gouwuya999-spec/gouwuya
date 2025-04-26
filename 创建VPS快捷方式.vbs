Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = oWS.SpecialFolders("Desktop")
sCurrentDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 创建快捷方式
Set oShortcut = oWS.CreateShortcut(sDesktop & "\VPS管理系统.lnk")
oShortcut.TargetPath = sCurrentDir & "\无窗口启动.vbs"
oShortcut.WorkingDirectory = sCurrentDir
oShortcut.IconLocation = sCurrentDir & "\icon.ico"
oShortcut.Description = "VPS管理系统"
oShortcut.Save

WScript.Echo "桌面快捷方式创建成功！您可以双击桌面上的图标启动系统。"