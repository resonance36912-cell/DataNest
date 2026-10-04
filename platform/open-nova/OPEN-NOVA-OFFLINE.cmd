@echo off
setlocal
cd /d "%~dp0"
title Resonance Open Nova v1.5.8 - Offline Run
echo Resonance Open Nova v1.5.8 - Strict Offline Run
echo No dependency, model, or container download fallback is allowed.
echo External AI is denied and production cutover is disabled.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\one-click-first-real.ps1" -OpenBrowser
if errorlevel 1 (
  echo.
  echo Offline run stopped safely. Read the error above.
  echo No network fallback or production cutover was performed.
  pause
  exit /b 1
)
echo.
echo Open Nova offline run completed.
pause
exit /b 0
