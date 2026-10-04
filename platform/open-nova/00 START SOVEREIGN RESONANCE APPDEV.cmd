@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\platform\start_or_repair_sovereign_appdev.ps1"
if errorlevel 1 pause
