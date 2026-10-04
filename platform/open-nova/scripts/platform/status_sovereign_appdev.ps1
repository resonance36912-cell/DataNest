$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Python = Join-Path $Root '.resonance-venv\Scripts\python.exe'

function Get-Status([string]$Uri) {
    $probe = 'import sys,urllib.request; print(urllib.request.urlopen(sys.argv[1],timeout=4).read().decode())'
    try {
        $response = & $Python -c $probe $Uri 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return (($response -join "`n") | ConvertFrom-Json)
    }
    catch { return $null }
}

$foundry = Get-Status 'http://127.0.0.1:8787/v1/apps'
$aurum = Get-Status 'http://127.0.0.1:4345/api/system/status'
$registry = Get-Status 'http://127.0.0.1:8787/v1/registry/verify'

[pscustomobject]@{
    foundry = if ($foundry) { 'healthy' } else { 'offline' }
    aurum = if ($aurum) { $aurum.health.status } else { 'offline' }
    aurum_sqlite_integrity = if ($aurum) { $aurum.integrity.ok } else { $false }
    registry_valid = if ($registry) { $registry.valid } else { $false }
    registry_events = if ($registry) { $registry.events } else { 0 }
    external_ai = $false
    production_cutover = $false
} | Format-List
