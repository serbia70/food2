@echo off
setlocal
echo 正在准备上传...

:: 1. 检查是否有修改
git status --porcelain
if "%errorlevel%" NEQ "0" (
    echo 没有检测到 Git 仓库，或者出现错误。
    pause & exit /b
)

:: 2. 添加并提交
git add .
git commit -m "Auto sync: %date% %time%"
if %errorlevel% NEQ 0 (
    echo 提交失败，可能没有文件需要提交。
    pause & exit /b
)

:: 3. 推送
git push
if %errorlevel% NEQ 0 (
    echo 推送失败！请检查网络或冲突。
    pause & exit /b
)

echo 上传完成！
pause