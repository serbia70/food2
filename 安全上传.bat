@echo off
setlocal

:: 检查是否在 git 仓库内
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 当前目录不在 git 仓库内
    pause
    exit /b 1
)

:: 显示当前分支
for /f "delims=" %%i in ('git branch --show-current') do set BRANCH=%%i
echo 当前分支: %BRANCH%

:: 显示当前状态
echo.
git status --short

:: 检查是否有改动
set HAS_CHANGES=0
for /f "delims=" %%i in ('git status --short') do set HAS_CHANGES=1
if not defined HAS_CHANGES (
    echo.
    echo [INFO] 没有需要提交的改动，退出
    exit /b 0
)

:: 提醒：只提交已跟踪文件的改动
echo.
echo [INFO] 此脚本只会通过 git add -u 暂存已跟踪文件的改动
echo        未跟踪文件不会自动加入，需要您手动 git add 后再运行
echo.

:: 读取 commit message
set /p MSG=Commit message:
if "%MSG%"=="" (
    echo.
    echo [INFO] 空的 commit message，退出
    exit /b 1
)

:: 二次确认
set /p CONFIRM=继续提交并推送吗? [y/N]:
if /I not "%CONFIRM%"=="y" (
    echo.
    echo 已取消
    exit /b 0
)

:: 执行 git add -u
echo.
echo 执行 git add -u...
git add -u
if errorlevel 1 (
    echo.
    echo [ERROR] git add -u 失败
    pause
    exit /b 1
)

:: 执行 git commit
echo 执行 git commit...
git commit -m "%MSG%"
if errorlevel 1 (
    echo.
    echo [ERROR] git commit 失败
    pause
    exit /b 1
)

:: 执行 git push
echo 执行 git push...
git push -u origin HEAD
if errorlevel 1 (
    echo.
    echo [ERROR] git push 失败
    pause
    exit /b 1
)

:: 完成
echo.
echo [SUCCESS] 提交并推送成功
endlocal
pause
