@echo off
echo VPS管理器 Git助手
echo =====================================
echo.

if "%1"=="push" goto push
if "%1"=="pull" goto pull
if "%1"=="commit" goto commit
if "%1"=="status" goto status
if "%1"=="log" goto log

:menu
echo 请选择要执行的操作:
echo 1. 查看仓库状态
echo 2. 提交更改
echo 3. 推送到GitHub
echo 4. 拉取最新更新
echo 5. 查看提交历史
echo 6. 退出
echo.

set /p choice=请输入选项(1-6): 

if "%choice%"=="1" goto status
if "%choice%"=="2" goto commit
if "%choice%"=="3" goto push
if "%choice%"=="4" goto pull
if "%choice%"=="5" goto log
if "%choice%"=="6" goto end

echo 无效的选择，请重试
goto menu

:status
echo.
echo ===== 查看仓库状态 =====
git status
goto end

:commit
echo.
echo ===== 提交更改 =====
echo 添加所有更改...
git add .
set /p message=请输入提交信息: 
git commit -m "%message%"
echo.
echo 是否现在推送到GitHub? (Y/N)
set /p push_now=
if /i "%push_now%"=="Y" goto push
goto end

:push
echo.
echo ===== 推送到GitHub =====
git push origin main
echo 成功推送到 https://github.com/huaige888/automatic-potato.git
goto end

:pull
echo.
echo ===== 拉取最新更新 =====
git pull origin main
goto end

:log
echo.
echo ===== 查看提交历史 =====
git log --oneline -n 10
goto end

:end
echo.
echo 操作完成!
echo. 