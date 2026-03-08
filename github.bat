@echo off
setlocal
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\" "') do set msg=chore: update %%i
git status
git add -A
git commit -m "%msg%"
if errorlevel 1 (
  echo.
  echo [ERROR] git commit failed. Fix the issue and re-run.
  echo.
  pause
  exit /b 1
)
git push -f origin HEAD
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed. Fix the issue and re-run.
  echo.
  pause
  exit /b 1
)
endlocal
echo.
echo Done. Press any key to close...
pause >nul
