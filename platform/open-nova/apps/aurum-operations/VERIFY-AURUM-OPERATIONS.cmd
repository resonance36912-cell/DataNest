@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Verify Resonance Aurum Operations v0.2.2
set "APPDIR=%~dp0"
set "PYTHON="
if exist "%APPDIR%runtime-python.txt" set /p PYTHON=<"%APPDIR%runtime-python.txt"
if defined PYTHON if not exist "%PYTHON%" set "PYTHON="
if not defined PYTHON for /f "usebackq delims=" %%P in (`py -3 -c "import fastapi,uvicorn,pydantic,sys; print(sys.executable)" 2^>nul`) do set "PYTHON=%%P"
if not defined PYTHON for /f "usebackq delims=" %%P in (`python -c "import fastapi,uvicorn,pydantic,sys; print(sys.executable)" 2^>nul`) do set "PYTHON=%%P"
if not defined PYTHON (
  echo ERROR: No compatible Python runtime was found.
  pause
  exit /b 1
)
pushd "%APPDIR%"
"%PYTHON%" -m py_compile app.py
if errorlevel 1 goto :fail
"%PYTHON%" -c "import fastapi,uvicorn,pydantic,app; assert app.APP_VERSION == '0.2.2'"
if errorlevel 1 goto :fail
"%PYTHON%" -m unittest discover -s tests -v
if errorlevel 1 goto :fail
popd
echo Verification passed.
pause
exit /b 0
:fail
popd
echo Verification failed.
pause
exit /b 1
