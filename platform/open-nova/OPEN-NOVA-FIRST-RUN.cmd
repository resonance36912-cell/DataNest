@echo off
setlocal
cd /d "%~dp0"
title Resonance Open Nova v1.5.8 - First Run
echo Resonance Open Nova v1.5.8 - First Run
echo One-time network provisioning is limited to pinned Python wheels.
echo External AI is denied and production cutover is disabled.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\one-click-first-real.ps1" -AllowNetworkProvisioning -OpenBrowser
if errorlevel 1 (
  echo.
  echo Open Nova stopped safely. Read the error above.
  echo No production cutover was performed.
  pause
  exit /b 1
)
echo.
echo Open Nova completed and produced a governed evidence bundle.
pause
exit /b 0
