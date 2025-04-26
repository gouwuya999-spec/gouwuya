@echo off
echo Starting VPS Management System...
echo ==============================

:: 切换到脚本所在目录
cd /d "%~dp0"

:: 检查Node.js是否安装
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: Node.js not found.
  echo Please install Node.js from https://nodejs.org/
  pause
  exit /b 1
)

:: 检查npm是否可用
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: npm not found.
  echo Please install Node.js from https://nodejs.org/
  pause
  exit /b 1
)

echo Node.js is available, starting the application...

:: 确保依赖项已安装
if not exist "node_modules" (
  echo Installing dependencies...
  npm install
)

:: 启动应用
npm start

:: 如果应用启动失败
if %ERRORLEVEL% neq 0 (
  echo.
  echo Application failed to start. 
  echo Please check the error messages above.
  pause
  exit /b 1
) 