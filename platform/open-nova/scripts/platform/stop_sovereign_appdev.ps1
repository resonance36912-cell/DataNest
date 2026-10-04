$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Python = Join-Path $Root '.resonance-venv\Scripts\python.exe'
$owned = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='python3.13.exe'" | Where-Object {
    $command = [string]$_.CommandLine
    $command -match [regex]::Escape($Python) -and (
        $command -match 'foundry_controller\.app\.main:app' -or
        ($command -match 'uvicorn\s+app:app' -and $command -match '--port\s+4345')
    )
}

if (-not $owned) {
    Write-Host 'No owned Sovereign AppDev process is running.'
    exit 0
}

$owned | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "Stopped $(@($owned).Count) owned Sovereign AppDev process(es)." -ForegroundColor Green
