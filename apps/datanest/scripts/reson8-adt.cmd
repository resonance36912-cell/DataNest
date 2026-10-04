@echo off
setlocal

if "%~1"=="" goto :usage

if /I "%~1"=="check" goto :check
if /I "%~1"=="test" goto :test
if /I "%~1"=="build" goto :build
if /I "%~1"=="dev" goto :dev
if /I "%~1"=="browser-test" goto :browser

echo Unknown command: %~1
goto :usage

:check
call npm run check
exit /b %ERRORLEVEL%

:test
call npm test
exit /b %ERRORLEVEL%

:build
call npm run build
exit /b %ERRORLEVEL%

:dev
call npm run dev
exit /b %ERRORLEVEL%

:browser
call npm run test:browser:datanest-ai
exit /b %ERRORLEVEL%

:usage
echo Reson8 ADT developer helper
echo.
echo Usage:
echo   scripts\reson8-adt.cmd check
echo   scripts\reson8-adt.cmd test
echo   scripts\reson8-adt.cmd build
echo   scripts\reson8-adt.cmd dev
echo   scripts\reson8-adt.cmd browser-test
echo.
echo This helper executes explicit local npm tasks only. It does not provide
echo autonomous remote desktop control or an unrestricted command shell.
exit /b 2
