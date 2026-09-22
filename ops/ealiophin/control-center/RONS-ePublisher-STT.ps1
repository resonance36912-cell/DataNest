$ErrorActionPreference = 'Stop'

$Root = Join-Path $env:USERPROFILE 'Resonance\OpenNova'
$Runtime = Join-Path $Root 'runtime'
$Python = Join-Path $Runtime 'python-envs\epublisher-stt\Scripts\python.exe'
$Script = Join-Path $Runtime 'syncvision-local-stt.py'
$LogDir = Join-Path $Runtime 'logs\rons-cluster'
$Log = Join-Path $LogDir 'epublisher-stt-task.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) { throw "ePublisher STT Python missing: $Python" }
if (-not (Test-Path -LiteralPath $Script -PathType Leaf)) { throw "ePublisher STT runtime missing: $Script" }

$env:RONS_STT_PORT = '7869'
$env:RONS_STT_MODELS_ROOT = Join-Path $Runtime 'models'
$env:HF_HUB_DISABLE_XET = '1'

Set-Location -LiteralPath $Runtime

# Windows PowerShell 5.1 can promote native stderr into a terminating
# NativeCommandError when ErrorActionPreference is Stop. yt-dlp emits
# deprecation/advisory messages on stderr even when it is still usable.
# Keep those diagnostics in the service log without killing the long-lived
# Python listener, then enforce the real native exit code after it returns.
$priorErrorActionPreference = $ErrorActionPreference
$nativeExitCode = 0
try {
    $ErrorActionPreference = 'Continue'
    & $Python $Script *>> $Log
    $nativeExitCode = [int]$LASTEXITCODE
} finally {
    $ErrorActionPreference = $priorErrorActionPreference
}

if ($nativeExitCode -ne 0) {
    Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " ePublisher STT process exited with code $nativeExitCode")
    exit $nativeExitCode
}

exit 0
