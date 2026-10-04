@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\platform\status_sovereign_appdev.ps1"
pause
