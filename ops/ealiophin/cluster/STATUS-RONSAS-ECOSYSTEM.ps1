param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RegistryPath = Join-Path $PSScriptRoot 'RONSAS-MODULES.json'
if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) {
    throw "RONSAS module registry missing: $RegistryPath"
}
$registry = Get-Content -LiteralPath $RegistryPath -Raw | ConvertFrom-Json
if ([string]$registry.schema -ne 'ronsas-module-registry/v1') {
    throw "Unsupported RONSAS module registry schema: $($registry.schema)"
}
$entries = @($registry.modules) + @($registry.services)
$ids = @($entries | ForEach-Object { [string]$_.id })
if (@($ids | Sort-Object -Unique).Count -ne $ids.Count) {
    throw 'RONSAS module registry contains duplicate ids.'
}

function Get-ListenerPid([int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { return [int]$listener.OwningProcess }
    return $null
}

function Test-RonsasEntry($Entry) {
    $http = 0; $semantic = $false; $errorText = ''; $detail = $null
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri ([string]$Entry.health) -TimeoutSec 6
        $http = [int]$r.StatusCode
        $semantic = ($http -ge 200 -and $http -lt 400)
        $contentType = [string]$r.Headers['Content-Type']
        if ($semantic -and $contentType -like 'application/json*') {
            try {
                $payload = $r.Content | ConvertFrom-Json
                if ($payload.PSObject.Properties['ok']) { $semantic = [bool]$payload.ok }
                elseif ($payload.PSObject.Properties['ready']) { $semantic = [bool]$payload.ready }
                elseif ($payload.PSObject.Properties['status']) {
                    $semantic = [string]$payload.status -in @('healthy','up','ready','ok')
                }
                if ([string]$Entry.id -in @('local-stt', 'epublisher-stt')) {
                    $detail = "model=$($payload.defaultResolvedModel); productionReady=$($payload.productionReady); cuda=$($payload.cudaRuntimeReady)"
                }
                elseif ([string]$Entry.id -eq 'local-image') {
                    $detail = "model=$($payload.model); complete=$($payload.model_complete); cuda=$($payload.cuda)"
                }
                elseif ([string]$Entry.id -eq 'local-llm') {
                    $detail = "model=$($payload.model); ready=$($payload.model_ready)"
                }
            } catch { $semantic = $false; $detail = 'invalid JSON health payload' }
        }
    } catch { $errorText = $_.Exception.Message }
    $listenPort = if ($Entry.PSObject.Properties['listenPort']) { [int]$Entry.listenPort } else { [int]$Entry.port }
    $listenerPid = Get-ListenerPid $listenPort
    $healthy = $semantic -and [bool]$listenerPid
    [pscustomobject]@{
        id=[string]$Entry.id
        kind=[string]$Entry.kind
        name=[string]$Entry.displayName
        required=[bool]$Entry.required
        port=[int]$Entry.port
        listenPort=$listenPort
        http=$http
        healthy=$healthy
        pid=$listenerPid
        health=[string]$Entry.health
        detail=$detail
        error=$errorText
    }
}

$rows = @($entries | ForEach-Object { Test-RonsasEntry $_ })
$requiredDown = @($rows | Where-Object { $_.required -and -not $_.healthy })
$summary = [pscustomobject]@{
    schema='ronsas-status/v2'
    suite='RONSAS'
    host=[System.Net.Dns]::GetHostName()
    checkedAt=(Get-Date).ToUniversalTime().ToString('o')
    registry=$RegistryPath
    moduleCount=@($registry.modules).Count
    serviceCount=@($registry.services).Count
    healthy=@($rows | Where-Object healthy).Count
    total=$rows.Count
    requiredDown=$requiredDown.Count
    status=$(if ($requiredDown.Count -eq 0) { 'ready' } else { 'attention' })
    entries=$rows
}

$summary | ConvertTo-Json -Depth 7
Write-Host ''
$rows | Select-Object id,kind,port,http,healthy,pid,detail | Format-Table -AutoSize
if ($requiredDown.Count -gt 0) {
    Write-Host ''
    Write-Host ('RONSAS ATTENTION: ' + (($requiredDown | ForEach-Object id) -join ', ')) -ForegroundColor Red
    exit 2
}
Write-Host ''
Write-Host "RONSAS READY: $($rows.Count)/$($rows.Count) governed entries healthy" -ForegroundColor Green
exit 0
