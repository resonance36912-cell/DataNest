@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Resonance Aurum Operations v0.2.2
set "APPDIR=%~dp0"
set "PYTHON="

rem Prefer the exact Python runtime selected during governed installation.
if exist "%APPDIR%runtime-python.txt" (
  set /p PYTHON=<"%APPDIR%runtime-python.txt"
)
if defined PYTHON if not exist "%PYTHON%" set "PYTHON="
if defined PYTHON (
  "%PYTHON%" -c "import fastapi,uvicorn,pydantic" >nul 2>&1
  if errorlevel 1 set "PYTHON="
)

rem If needed, reuse the Python executable of the live Open Nova control plane.
if not defined PYTHON for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1; if($c){$p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess) -ErrorAction SilentlyContinue; if($p -and $p.ExecutablePath){$x=$p.ExecutablePath; ^& $x -c 'import fastapi,uvicorn,pydantic' 2^>$null; if($LASTEXITCODE -eq 0){Write-Output $x}}}"`) do set "PYTHON=%%P"

rem Fall back to registered Windows Python only if it has the required web stack.
if not defined PYTHON for /f "usebackq delims=" %%P in (`py -3 -c "import fastapi,uvicorn,pydantic,sys; print(sys.executable)" 2^>nul`) do set "PYTHON=%%P"
if not defined PYTHON for /f "usebackq delims=" %%P in (`python -c "import fastapi,uvicorn,pydantic,sys; print(sys.executable)" 2^>nul`) do set "PYTHON=%%P"

if not defined PYTHON (
  echo ERROR: No Python runtime with FastAPI, Uvicorn and Pydantic was found.
  echo Keep the Open Nova control-plane window running, then run this launcher again.
  pause
  exit /b 1
)

echo Aurum Python: %PYTHON%
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:4345/health' -TimeoutSec 2; if($r.status -eq 'healthy'){ Start-Process 'http://127.0.0.1:4345'; exit 0 } } catch {}; exit 1"
if not errorlevel 1 exit /b 0

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 4345 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){ Write-Host 'ERROR: Port 4345 is already occupied by another process.' -ForegroundColor Red; exit 9 }"
if errorlevel 9 (
  pause
  exit /b 9
)

set "AURUM_APPDIR=%APPDIR%"
set "AURUM_PYTHON=%PYTHON%"
start "Aurum Operations Server - Keep Open" powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath $env:AURUM_APPDIR; ^& $env:AURUM_PYTHON -m uvicorn app:app --host 127.0.0.1 --port 4345"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:4345/health'; for($i=0; $i -lt 60; $i++){ try { $r=Invoke-RestMethod -Uri $u -TimeoutSec 2; if($r.status -eq 'healthy'){ Start-Process 'http://127.0.0.1:4345'; exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo ERROR: Aurum Operations did not become healthy within 60 seconds.
  echo Keep the server window open and review its output.
  pause
  exit /b 1
)
exit /b 0
