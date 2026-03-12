@echo off
setlocal

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

REM Default commit message: allow override via first arg.
if "%~1"=="" (
  for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\" "') do set msg=chore: update %%i
) else (
  set msg=%~1
)

echo.
echo === Git status (before) ===
git status

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
  call pnpm run build
  if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    echo.
    popd
    pause
    exit /b 1
  )

  echo.
  echo === Security gates ===
  call pnpm run test:security
  if errorlevel 1 (
    echo.
    echo [ERROR] Security gates failed.
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
git status

REM Commit
for /f "delims=" %%i in ('git diff --cached --name-only') do set HAS_STAGED=1
if not defined HAS_STAGED (
  echo.
  echo [ERROR] Nothing staged. (No commit created.)
  echo.
  popd
  pause
  exit /b 1
)

git commit -m "%msg%"
if errorlevel 1 (
  echo.
  echo [ERROR] git commit failed. Fix the issue and re-run.
  echo.
  popd
  pause
  exit /b 1
)

REM Push
git push -u origin HEAD
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed. Fix the issue and re-run.
  echo.
  popd
  pause
  exit /b 1
)

popd
endlocal

echo.
echo Done. Press any key to close...
pause >nul
