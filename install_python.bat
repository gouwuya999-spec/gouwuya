@echo off
echo 正在安装Python...
echo.

REM 检查是否已安装Python
py --version >nul 2>&1
if %errorlevel% == 0 (
    echo Python已安装，版本信息：
    py --version
    echo.
    echo 检查pip是否可用...
    py -m pip --version >nul 2>&1
    if %errorlevel% == 0 (
        echo pip已可用
        echo.
        echo 安装Python依赖包...
        py -m pip install -r requirements.txt
        echo.
        echo Python环境配置完成！
    ) else (
        echo pip不可用，尝试重新安装Python
        goto :install_python
    )
) else (
    echo Python未安装，开始安装...
    :install_python
    if exist "python-installer.exe" (
        echo 使用本地Python安装程序...
        python-installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
        echo.
        echo 等待安装完成...
        timeout /t 30 /nobreak >nul
        echo.
        echo 刷新环境变量...
        call refreshenv.cmd 2>nul || (
            echo 手动刷新环境变量...
            for /f "usebackq tokens=2*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH`) do set SYSTEM_PATH=%%B
            for /f "usebackq tokens=2*" %%A in (`reg query "HKCU\Environment" /v PATH`) do set USER_PATH=%%B
            set PATH=%SYSTEM_PATH%;%USER_PATH%
        )
        echo.
        echo 验证Python安装...
        py --version
        if %errorlevel% == 0 (
            echo Python安装成功！
            echo.
            echo 安装Python依赖包...
            py -m pip install -r requirements.txt
            echo.
            echo Python环境配置完成！
        ) else (
            echo Python安装失败，请手动安装Python
            echo 下载地址：https://www.python.org/downloads/
            pause
        )
    ) else (
        echo 未找到python-installer.exe文件
        echo 请从 https://www.python.org/downloads/ 下载Python安装程序
        pause
    )
)

echo.
echo 按任意键退出...
pause >nul
