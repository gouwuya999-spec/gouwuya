@echo off
chcp 936
echo Creating VPS Management System shortcut...

:: Create temp VBS file with ASCII characters only
(
echo Set WS = CreateObject^("WScript.Shell"^)
echo strDesktop = WS.SpecialFolders^("Desktop"^)
echo Set shortcut = WS.CreateShortcut^(strDesktop ^& "\VPS Management System.lnk"^)
echo shortcut.TargetPath = "%~dp0无窗口启动.vbs"
echo shortcut.WorkingDirectory = "%~dp0"
echo shortcut.IconLocation = "%~dp0icon.ico"
echo shortcut.Description = "VPS Management System"
echo shortcut.Save
) > "%TEMP%\createshortcut.vbs"

:: Run the VBS script
cscript //nologo "%TEMP%\createshortcut.vbs"
if errorlevel 1 (
  echo Error creating shortcut
) else (
  echo Shortcut created successfully
)

:: Delete the temporary VBS script
del "%TEMP%\createshortcut.vbs"

:: Rename the shortcut to Chinese name (use move command to rename)
ren "%USERPROFILE%\Desktop\VPS Management System.lnk" "VPS管理系统.lnk"

echo.
echo Completed. Press any key to exit...
pause 