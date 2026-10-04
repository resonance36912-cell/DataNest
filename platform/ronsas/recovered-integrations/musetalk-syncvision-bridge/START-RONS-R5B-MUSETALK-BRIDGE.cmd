@echo off
setlocal
title Resonance R5B MuseTalk Sync Vision Bridge - KEEP OPEN
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-RONS-R5B-MUSETALK-BRIDGE.ps1"
set "RC=%ERRORLEVEL%"
echo.
echo R5B MuseTalk bridge stopped.
pause
exit /b %RC%
