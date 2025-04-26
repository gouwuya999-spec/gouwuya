@echo off
chcp 936
echo 正在运行PowerShell脚本以创建快捷方式...

powershell.exe -ExecutionPolicy Bypass -File "%~dp0Create-VPS-Shortcut.ps1"

pause 