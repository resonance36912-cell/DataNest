@echo off
setlocal
set "ROOT=%USERPROFILE%\Resonance\OpenNova"
set "LOGDIR=%ROOT%\runtime\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
call :startvite 3101 "ePublisher" "%ROOT%\apps\epublisher-sovereign-local-v0.1"
call :startstt
call :startimage
call :startcreativesource
call :startmusetalkbridge
call :startollama
call :startllm
call :startaibroker
call :startvite 3201 "Creative Studio" "%ROOT%\apps\creative-studio-sovereign-local-v0.1"
call :startvite 3301 "Sync Vision" "%ROOT%\apps\sync-vision-sovereign-local-v0.1"
call :startoptimizer
call :starthub
call "%ROOT%\runtime\launchers\STATUS-RONS-SOVEREIGN-SUITE.cmd"
exit /b 0

:startvite
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] %~2 already listening on %~1& exit /b
start "%~2" /min cmd /c "cd /d %~3 && set VITE_OPEN_NOVA_LOCAL_ONLY=1&& npm run preview -- --host 127.0.0.1 --port %~1"
echo [START] %~2 on %~1
exit /b

:startoptimizer
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 3401 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] YouTube Optimizer already listening on 3401& exit /b
start "YouTube Optimizer" /min cmd /c "set PORT=3401&& set HOST=127.0.0.1&& set NODE_ENV=production&& set RESONANCE_SOVEREIGN_GATEWAY_URL=http://127.0.0.1:58600&& node %ROOT%\runtime\youtube-optimizer-stage\.output\server\index.mjs"
echo [START] YouTube Optimizer on 3401
exit /b

:starthub
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] RONS Hub already listening on 4173& exit /b
start "RONS Hub" /min cmd /c "cd /d %SystemDrive%\Resonance\Sources\ronsas-hub-canonical && set PORT=4173&& set HOST=127.0.0.1&& set RESONANCE_BACKEND_PROVIDER=sovereign&& set RESONANCE_SOVEREIGN_GATEWAY_URL=http://127.0.0.1:58600&& set RONS_SOVEREIGN_PROXY_ENABLED=1&& node --env-file=.env.local .output-local\server\index.mjs"
echo [START] RONS Hub on 4173 via direct local server
exit /b

:startstt
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 7864 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] Sync Vision Local STT already listening on 7864& exit /b
start "Sync Vision Local STT" /min cmd /c "set HF_HUB_DISABLE_XET=1&& set RONS_STT_MODELS_ROOT=%ROOT%\runtime\models&& %ROOT%\runtime\python-envs\epublisher-stt\Scripts\python.exe %ROOT%\runtime\syncvision-local-stt.py >> "%LOGDIR%\syncvision-stt-7864.log" 2>&1"
echo [START] Sync Vision Local STT on 7864
exit /b
:startimage
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 7865 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] ePublisher Local Image already listening on 7865& exit /b
start "ePublisher Local Image" /min cmd /c "%ROOT%\runtime\python-envs\musetalk-0a89dec45a01\Scripts\python.exe %ROOT%\runtime\epublisher-image-service.py >> "%LOGDIR%\epublisher-image-7865.log" 2>&1"
echo [START] ePublisher Local Image on 7865
exit /b


:startmusetalkbridge
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 7863 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] MuseTalk Local Bridge already listening on 7863& exit /b
start "MuseTalk Local Bridge" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\integrations\musetalk-syncvision-bridge\START-RONS-R5B-MUSETALK-BRIDGE.ps1"
echo [START] MuseTalk Local Bridge on 7863
exit /b

:startcreativesource
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 7867 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] Creative Studio Local Source already listening on 7867& exit /b
start "Creative Studio Local Source" /min cmd /c "%ROOT%\runtime\python-envs\musetalk-0a89dec45a01\Scripts\python.exe %ROOT%\runtime\creative-source-service.py >> "%LOGDIR%\creative-source-7867.log" 2>&1"
echo [START] Creative Studio Local Source on 7867
exit /b


:startollama
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] Ollama already listening on 11434& exit /b
start "Ollama" /min cmd /c "ollama serve >> "%LOGDIR%\ollama-11434.log" 2>&1"
echo [START] Ollama on 11434
exit /b

:startllm
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 7866 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] RONS Local LLM already listening on 7866& exit /b
start "RONS Local LLM" /min cmd /c "python %ROOT%\runtime\rons-local-llm-service.py >> "%LOGDIR%\rons-llm-7866.log" 2>&1"
echo [START] RONS Local LLM on 7866
exit /b

:startaibroker
powershell -NoProfile -Command "if(Get-NetTCPConnection -State Listen -LocalPort 7868 -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 echo [OK] RONS AI Broker already listening on 7868& exit /b
start "RONS AI Broker" /min cmd /c "python %ROOT%\runtime\ai-broker-service.py >> "%LOGDIR%\rons-ai-broker-7868.log" 2>&1"
echo [START] RONS AI Broker on 7868
exit /b
