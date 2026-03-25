@echo off
setlocal

:: 1. 显示本次改动（关键：增加可观察性）
echo 当前检测到的改动如下：
git status --short
echo.

:: 2. 检查是否有改动（关键：防空提交）
for /f "tokens=*" %%i in ('git status --porcelain') do set HAS_CHANGES=1
if "%HAS_CHANGES%"=="" (
    echo 没有检测到修改。
    pause & exit /b
)

:: 3. 获取提交信息（关键：规范版本记录）
set /p MSG=请输入提交信息: 
if "%MSG%"=="" (
    echo 错误：提交信息不能为空。
    pause & exit /b
)

:: 4. 逐步执行并逐一检查错误（关键：精确报错）
echo 正在添加文件...
git add -u
if %errorlevel% neq 0 (
    echo.
    echo [错误] git add -u 执行失败。
    pause & exit /b
)

echo 正在提交...
git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo.
    echo [错误] git commit 失败，可能被 hook 拦截或发生其他错误。
    pause & exit /b
)

echo 正在推送...
git push -u origin HEAD
if %errorlevel% neq 0 (
    echo.
    echo [错误] git push 失败，请检查网络、权限或远程冲突。
    pause & exit /b
)

echo.
echo [成功] 上传完成！
pause