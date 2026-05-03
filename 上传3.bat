@echo off
setlocal

echo Current changes:
git status --short
echo.

set HAS_CHANGES=
for /f "tokens=*" %%i in ('git status --porcelain') do set HAS_CHANGES=1
if "%HAS_CHANGES%"=="" (
    echo No changes detected.
    pause
    exit /b 0
)

set /p MSG=Commit message:
if "%MSG%"=="" (
    echo Error: commit message is required.
    pause
    exit /b 1
)

echo Staging files...
git add --all
if errorlevel 1 (
    echo.
    echo Error: git add --all failed.
    pause
    exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo Error: nothing staged for commit.
    pause
    exit /b 1
)

echo Committing...
git commit -m "%MSG%"
if errorlevel 1 (
    echo.
    echo Error: git commit failed. Check git output above.
    pause
    exit /b 1
)

echo Pushing...
git push -u origin HEAD
if errorlevel 1 (
    echo.
    echo Error: git push failed.
    pause
    exit /b 1
)

echo.
echo Done.
pause
