@echo off
setlocal
set "ROOT=%USERPROFILE%\Resonance\OpenNova"
echo [RONSAS] Legacy launcher alias - delegating to canonical RONSAS supervisor.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\integrations\rons-cluster\START-RONSAS-ECOSYSTEM.ps1"
exit /b %ERRORLEVEL%
