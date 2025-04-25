Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
Set objShell = CreateObject("Shell.Application")

' 获取桌面路径
strDesktop = WshShell.SpecialFolders("Desktop")
' PNG图标路径
pngPath = strDesktop & "\VPS.png"
' ICO图标路径
icoPath = strDesktop & "\VPS.ico"
' 快捷方式路径
lnkPath = strDesktop & "\VPS管理系统.lnk"
' 要启动的VBS文件路径
vbsFile = strDesktop & "\VPS管理系统\无窗口启动.vbs"

' 检查PNG文件是否存在
If FSO.FileExists(pngPath) Then
    ' 直接创建并设置快捷方式
    Set shortcut = WshShell.CreateShortcut(lnkPath)
    shortcut.TargetPath = vbsFile
    shortcut.WorkingDirectory = FSO.GetParentFolderName(vbsFile)
    shortcut.IconLocation = pngPath
    shortcut.Save
    
    WScript.Echo "快捷方式已创建，并尝试设置PNG图标。" & vbCrLf & _
                "注意：由于Windows限制，可能需要右键点击快捷方式→属性→更改图标，" & vbCrLf & _
                "手动选择VPS.png作为图标。"
Else
    WScript.Echo "找不到图标文件: " & pngPath
End If 