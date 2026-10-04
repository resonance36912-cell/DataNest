@echo off
setlocal
cd /d "%~dp0"
echo Resonance Open Nova v1.5.5 - First Run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\one-click-first-real.ps1" -AllowNetworkProvisioning -OpenBrowser
if errorlevel 1 (
  echo.
  echo Open Nova stopped safely. Read the error above; no production cutover was performed.
  pause
  exit /b 1
)
echo.
echo Open Nova completed and produced a governed evidence bundle.
pause
