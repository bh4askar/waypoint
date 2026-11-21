@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org first.
  pause
  exit /b 1
)
if not exist node_modules\sharp (
  call npm ci
  if errorlevel 1 exit /b 1
)
node scripts/launch.mjs
pause
