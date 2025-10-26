' VPS Management System - Windowless Desktop Shortcut Creator
' Created: 2025-01-10
' Function: Create windowless desktop shortcuts for VPS Management System

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get desktop path
strDesktop = WshShell.SpecialFolders("Desktop")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if necessary files exist
If Not fso.FileExists(strPath & "\launch_windowless.vbs") Then
    WScript.Echo "Error: launch_windowless.vbs file not found"
    WScript.Quit
End If

If Not fso.FileExists(strPath & "\icon.ico") Then
    WScript.Echo "Warning: icon.ico file not found, using default icon"
    strIconPath = ""
Else
    strIconPath = strPath & "\icon.ico"
End If

' Create windowless shortcut (English name to avoid encoding issues)
Set oShellLink = WshShell.CreateShortcut(strDesktop & "\VPS Management System (Silent).lnk")
oShellLink.TargetPath = strPath & "\launch_windowless.vbs"
oShellLink.WorkingDirectory = strPath
oShellLink.Description = "VPS Management System - Silent Launch"
oShellLink.IconLocation = strIconPath
oShellLink.WindowStyle = 1
oShellLink.Save

' Create alternative shortcut with different name
Set oShellLink2 = WshShell.CreateShortcut(strDesktop & "\VPS Silent Mode.lnk")
oShellLink2.TargetPath = strPath & "\launch_windowless.vbs"
oShellLink2.WorkingDirectory = strPath
oShellLink2.Description = "VPS Management System - Windowless Mode"
oShellLink2.IconLocation = strIconPath
oShellLink2.WindowStyle = 1
oShellLink2.Save

WScript.Echo "Windowless desktop shortcuts created successfully!" & vbCrLf & _
             "Created shortcuts:" & vbCrLf & _
             "1. VPS Management System (Silent).lnk" & vbCrLf & _
             "2. VPS Silent Mode.lnk" & vbCrLf & _
             "Double-click any shortcut to launch VPS Management System in windowless mode"
