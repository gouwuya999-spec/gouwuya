Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = oWS.SpecialFolders("Desktop")
sCurrentDir = oWS.CurrentDirectory

' Create shortcut
Set oShortcut = oWS.CreateShortcut(sDesktop & "\\VPS����ϵͳ.lnk")
oShortcut.TargetPath = sCurrentDir & "\\�޴�������.vbs"
oShortcut.WorkingDirectory = sCurrentDir
oShortcut.IconLocation = sCurrentDir & "\icon.ico"
oShortcut.Description = "VPS����ϵͳ"
oShortcut.Save

WScript.Echo "�����ݷ�ʽ�����ɹ�! Please try to launch it." 
