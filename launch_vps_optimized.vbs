' VPS Management System Optimized Launch Script
' Created: 2025-01
' Function: Launch VPS Management System with maximum optimization

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get current script directory
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if necessary files exist
If Not fso.FileExists(strPath & "\package.json") Then
    WScript.Quit
End If

If Not fso.FileExists(strPath & "\main.js") Then
    WScript.Quit
End If

' Check if Node.js is installed
On Error Resume Next
WshShell.Run "node --version", 0, True
If Err.Number <> 0 Then
    WScript.Quit
End If
On Error GoTo 0

' Check if npm is available
On Error Resume Next
WshShell.Run "npm --version", 0, True
If Err.Number <> 0 Then
    WScript.Quit
End If
On Error GoTo 0

' Use optimized command to start the application
' Set environment variables to optimize startup
WshShell.Environment("Process")("ELECTRON_DISABLE_SECURITY_WARNINGS") = "1"
WshShell.Environment("Process")("ELECTRON_ENABLE_LOGGING") = "0"

' Create a completely invisible command to start the application
strCmd = "cmd /c cd /d """ & strPath & """ && npm start"

' Launch application with maximum optimization
WshShell.Run strCmd, 0, False
