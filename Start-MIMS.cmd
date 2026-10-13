@echo off
cd /d "%~dp0"
if not exist "node_modules\next\dist\bin\next" (
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)
call npm.cmd run dev:full
if errorlevel 1 (
  echo Startup failed. Review the error above. Install Node.js 22.13+ and start Docker Desktop, then retry.
  pause
  exit /b 1
)
