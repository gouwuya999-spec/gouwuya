' VPS管理系统 - 完全无窗口启动脚本
' 创建时间: 2025-01
' 功能: 完全无窗口启动VPS管理系统

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 获取当前脚本目录
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 检查必要文件是否存在
If Not fso.FileExists(strPath & "\package.json") Then
    WScript.Quit
End If

If Not fso.FileExists(strPath & "\main.js") Then
    WScript.Quit
End If

' 检查Node.js是否安装
On Error Resume Next
WshShell.Run "node --version", 0, True
If Err.Number <> 0 Then
    WScript.Quit
End If
On Error GoTo 0

' 设置环境变量以优化启动
WshShell.Environment("Process")("ELECTRON_DISABLE_SECURITY_WARNINGS") = "1"
WshShell.Environment("Process")("ELECTRON_ENABLE_LOGGING") = "0"
WshShell.Environment("Process")("NODE_ENV") = "production"

' 创建完全无窗口的启动命令
strCmd = "cmd /c cd /d """ & strPath & """ && npm start"

' 使用Run方法启动，参数0表示完全隐藏窗口
WshShell.Run strCmd, 0, False
