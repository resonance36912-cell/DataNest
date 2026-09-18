@echo off
setlocal
set "ROOT=%USERPROFILE%\Resonance\OpenNova"
echo [RONSAS] Legacy stop alias - delegating to canonical RONSAS stop control.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\integrations\rons-cluster\STOP-RONSAS-ECOSYSTEM.ps1"
exit /b %ERRORLEVEL%
