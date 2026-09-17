@echo off
setlocal
set "ROOT=%USERPROFILE%\Resonance\OpenNova"
echo [RONSAS] Legacy status alias - delegating to canonical RONSAS status.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\integrations\rons-cluster\STATUS-RONSAS-ECOSYSTEM.ps1"
exit /b %ERRORLEVEL%
