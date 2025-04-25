@echo off
chcp 65001 >nul
echo VPS Manager Git Helper
echo =====================================
echo.

if "%1"=="push" goto push
if "%1"=="pull" goto pull
if "%1"=="commit" goto commit
if "%1"=="status" goto status
if "%1"=="log" goto log

:menu
echo Choose operation:
echo 1. Check repository status
echo 2. Commit changes
echo 3. Push to GitHub
echo 4. Pull updates
echo 5. View commit history
echo 6. Exit
echo.

set /p choice=Enter option (1-6): 

if "%choice%"=="1" goto status
if "%choice%"=="2" goto commit
if "%choice%"=="3" goto push
if "%choice%"=="4" goto pull
if "%choice%"=="5" goto log
if "%choice%"=="6" goto end

echo Invalid choice, please try again
goto menu

:status
echo.
echo ===== Repository Status =====
call git status
goto end

:commit
echo.
echo ===== Commit Changes =====
echo Adding all changes...
call git add .
set /p message=Enter commit message: 
call git commit -m "%message%"
echo.
echo Push to GitHub now? (Y/N)
set /p push_now=
if /i "%push_now%"=="Y" goto push
goto end

:push
echo.
echo ===== Push to GitHub =====
call git push origin main
echo Successfully pushed to https://github.com/huaige888/automatic-potato.git
goto end

:pull
echo.
echo ===== Pull Updates =====
call git pull origin main
goto end

:log
echo.
echo ===== Commit History =====
call git log --oneline -n 10
goto end

:end
echo.
echo Operation completed!
echo. 