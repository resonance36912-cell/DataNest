@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\platform\stop_sovereign_appdev.ps1"
pause
