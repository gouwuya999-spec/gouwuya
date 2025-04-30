# VPS管理系统启动脚本
Write-Host "正在启动VPS管理系统..." -ForegroundColor Green

# 切换到应用程序目录
Set-Location -Path "C:\Users\rensh\Desktop\VPS管理系统"

# 检查Node.js是否安装
try {
    $nodeVersion = node --version
    Write-Host "Node.js版本: $nodeVersion" -ForegroundColor Green
}
catch {
    Write-Host "错误: 未找到Node.js" -ForegroundColor Red
    Write-Host "请从 https://nodejs.org/ 安装Node.js" -ForegroundColor Yellow
    Read-Host "按Enter键退出"
    exit 1
}

# 检查依赖项
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安装依赖项..." -ForegroundColor Yellow
    npm install
}

# 启动应用
Write-Host "正在启动应用程序..." -ForegroundColor Green
npm start

# 如果应用启动失败
if ($LASTEXITCODE -ne 0) {
    Write-Host "应用程序启动失败，请检查上面的错误信息" -ForegroundColor Red
    Read-Host "按Enter键退出"
    exit 1
} 