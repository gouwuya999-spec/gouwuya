Option Explicit

' 获取当前脚本所在的目录
Dim fso, currentPath
Set fso = CreateObject("Scripting.FileSystemObject")
currentPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 设置要运行的Python脚本
Dim pythonScript
pythonScript = currentPath & "\vps_manager_gui.py"

' 创建Shell对象
Dim shell
Set shell = CreateObject("WScript.Shell")

' 使用pythonw.exe来隐藏控制台窗口
Dim pythonExe
pythonExe = "pythonw.exe"

' 构建命令行并执行
Dim command
command = """" & pythonExe & """ """ & pythonScript & """"
shell.Run command, 0, False

' 清理对象
Set shell = Nothing
Set fso = Nothing
