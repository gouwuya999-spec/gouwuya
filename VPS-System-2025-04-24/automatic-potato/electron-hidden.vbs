Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
strCmd = "cmd /c cd /d """ & strPath & """ && npm start"
WshShell.Run strCmd, 0, False 