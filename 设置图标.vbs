Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' 获取桌面路径
strDesktop = WshShell.SpecialFolders("Desktop")
' PNG图标路径
pngPath = strDesktop & "\VPS.png"
' 快捷方式路径
lnkPath = strDesktop & "\VPS管理系统.lnk"
' 要启动的VBS文件路径
vbsFile = strDesktop & "\VPS管理系统\无窗口启动.vbs"

' 检查PNG文件是否存在
If FSO.FileExists(pngPath) Then
    ' 创建快捷方式并设置属性
    Set shortcut = WshShell.CreateShortcut(lnkPath)
    shortcut.TargetPath = vbsFile
    shortcut.WorkingDirectory = FSO.GetParentFolderName(vbsFile)
    shortcut.IconLocation = pngPath & ",0"
    shortcut.Save
    
    WScript.Echo "快捷方式已创建，并已设置PNG图标。" & vbCrLf & _
                "注意: Windows可能只支持ICO格式的图标，如果图标未正确显示，请将PNG转换为ICO格式。"
Else
    WScript.Echo "找不到图标文件: " & pngPath
End If 