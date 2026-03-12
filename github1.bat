@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM If launched via cmd.exe /c (e.g. double-click), relaunch in a persistent window.
echo %CMDCMDLINE% | find /i " /c " >nul
if not errorlevel 1 (
  if /i not "%~1"=="--inner" (
    start "github" cmd /k ""%~f0" --inner %*"
    exit /b
  )
)

if /i "%~1"=="--inner" shift

REM Make sure we run from repo root.
for /f "delims=" %%i in ('git rev-parse --show-toplevel 2^>nul') do set ROOT=%%i
if "%ROOT%"=="" (
  echo.
  echo [ERROR] Not inside a git repository.
  echo.
  pause
  exit /b 1
)
pushd "%ROOT%"

set LOG=%ROOT%\github.log
(
  echo ===== %DATE% %TIME% =====
  echo ROOT=%ROOT%
  git --version
) > "%LOG%" 2>&1

echo.
echo Log: "%LOG%"

echo.
echo === Git status (before) ===
git status >> "%LOG%" 2>&1
git status

REM Default commit message: allow override via first arg.
if "%~1"=="" (
  for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\" "') do set msg=chore: update %%i
) else (
  set msg=%~1
)

REM Build + run security gates (fail fast).
if exist package.json (
  echo.
  echo === Build ===
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] pnpm not found in PATH.
    popd
    pause
    exit /b 1
  )
  call pnpm run build >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    echo See log: "%LOG%"
    echo.
    popd
    pause
    exit /b 1
  )

  echo.
  echo === Security gates ===
  call pnpm run test:security >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo.
    echo [ERROR] Security gates failed.
    echo See log: "%LOG%"
    echo.
    popd
    pause
    exit /b 1
  )
)

REM Stage only the intended files (avoid git add -A).
if exist src\components\UserCenterPageIsland.tsx git add -- src\components\UserCenterPageIsland.tsx
if exist package.json git add -- package.json
if exist github.bat git add -- github.bat

if exist scripts\check-no-unsafe-dom-apis-go-static.test.mjs git add -- scripts\check-no-unsafe-dom-apis-go-static.test.mjs
if exist scripts\check-no-unsafe-dom-apis-repo.test.mjs git add -- scripts\check-no-unsafe-dom-apis-repo.test.mjs
if exist scripts\scan-dist-no-unsafe-dom-sinks.test.mjs git add -- scripts\scan-dist-no-unsafe-dom-sinks.test.mjs
if exist scripts\user-center-no-login-flash.test.mjs git add -- scripts\user-center-no-login-flash.test.mjs

if exist docs\superpowers\plans\2026-03-12-security-unsafe-dom-gates.md git add -- docs\superpowers\plans\2026-03-12-security-unsafe-dom-gates.md

echo.
echo === Git status (staged) ===
git status >> "%LOG%" 2>&1
git status

REM Commit (if there is anything staged)
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo [INFO] Nothing new to commit (working tree clean or changes not in allowlist).
  echo.
  echo === Push (if needed) ===
  git push -u origin HEAD >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo.
    echo [ERROR] git push failed.
    echo See log: "%LOG%"
    echo.
    popd
    pause
    exit /b 1
  )
  for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
  for /f "delims=" %%s in ('git rev-parse --short HEAD') do set SHA=%%s
  popd
  endlocal
  echo.
  echo [OK] 已推送到 GitHub: origin/%BRANCH%  (%SHA%)
  echo Log: "%LOG%"
  echo 按任意键关闭...
  pause
  exit /b 0
)

git commit -m "%msg%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] git commit failed.
  echo See log: "%LOG%"
  echo.
  popd
  pause
  exit /b 1
)

REM Push
git push -u origin HEAD >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  echo See log: "%LOG%"
  echo.
  popd
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
for /f "delims=" %%s in ('git rev-parse --short HEAD') do set SHA=%%s
popd
endlocal

echo.
echo [OK] 已推送到 GitHub: origin/%BRANCH%  (%SHA%)
echo Log: "%LOG%"
echo 按任意键关闭...
pause
