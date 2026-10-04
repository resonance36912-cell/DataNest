@echo off
setlocal
cd /d "%~dp0"
title Resonance Open Nova v1.5.8 - Repair Runtime
echo Resonance Open Nova v1.5.8 - Repair Python Runtime
echo Smart App Control remains enabled.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\provision-open-nova-once.ps1" -AllowNetworkProvisioning
if errorlevel 1 (
  echo.
  echo Repair stopped safely. Read the error above.
  echo Smart App Control was not disabled.
  pause
  exit /b 1
)
echo.
echo Runtime repair completed. Starting Open Nova first run...
call "%~dp0OPEN-NOVA-FIRST-RUN.cmd"
exit /b %errorlevel%
