' VPS管理系统 - 创建无窗口桌面快捷方式
' 创建时间: 2025-01
' 功能: 自动创建桌面快捷方式，支持无窗口启动

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 获取当前脚本目录
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 获取桌面路径
strDesktop = WshShell.SpecialFolders("Desktop")

' 创建快捷方式
Set oShellLink = WshShell.CreateShortcut(strDesktop & "\VPS管理系统.lnk")
oShellLink.TargetPath = strPath & "\launch_windowless.vbs"
oShellLink.WorkingDirectory = strPath
oShellLink.Description = "VPS管理系统 - 无窗口启动"
oShellLink.IconLocation = strPath & "\icon.ico"
oShellLink.WindowStyle = 1
oShellLink.Save

' 创建带窗口的快捷方式（备用）
Set oShellLink2 = WshShell.CreateShortcut(strDesktop & "\VPS管理系统(带窗口).lnk")
oShellLink2.TargetPath = strPath & "\launch_vps_optimized.vbs"
oShellLink2.WorkingDirectory = strPath
oShellLink2.Description = "VPS管理系统 - 带窗口启动"
oShellLink2.IconLocation = strPath & "\icon.ico"
oShellLink2.WindowStyle = 1
oShellLink2.Save

' 显示完成消息
WScript.Echo "桌面快捷方式创建完成！" & vbCrLf & vbCrLf & _
            "已创建以下快捷方式：" & vbCrLf & _
            "• VPS管理系统.lnk (无窗口启动)" & vbCrLf & _
            "• VPS管理系统(带窗口).lnk (带窗口启动)" & vbCrLf & vbCrLf & _
            "双击快捷方式即可启动VPS管理系统！"
