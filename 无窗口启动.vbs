Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
strCmd = "cmd /c cd /d """ & strPath & """ && npm start"

' 创建快捷方式对象
Set oShortcut = WshShell.CreateShortcut(strPath & "\VPS管理系统.lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = """" & strPath & "\无窗口启动.vbs"""
oShortcut.WorkingDirectory = strPath
oShortcut.IconLocation = "%SystemRoot%\System32\SHELL32.dll,15"  ' 使用Windows自带图标，15是图标索引，可以根据需要修改
oShortcut.Save

WshShell.Run strCmd, 0, False 