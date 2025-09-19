Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 检查是否已经运行
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'electron.exe'")
If colProcesses.Count > 0 Then
    ' 如果已经运行，直接退出
    WScript.Quit
End If

' 静默启动Electron
WshShell.Run "node_modules\.bin\electron.cmd . --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-extensions --disable-plugins --disable-web-security", 0, False
