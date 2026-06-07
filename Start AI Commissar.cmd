@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo AI Commissar requires Node.js 22 or newer.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Preparing AI Commissar for first use...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation failed.
    pause
    exit /b 1
  )
)

start "" /b "node_modules\electron\dist\electron.exe" .
exit /b 0
