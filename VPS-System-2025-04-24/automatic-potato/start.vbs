Set oShell = CreateObject("WScript.Shell")
Dim strArgs
strArgs = WScript.Arguments(0)
oShell.Run strArgs, 0, False
Set oShell = Nothing 