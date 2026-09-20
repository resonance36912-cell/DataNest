[CmdletBinding()]
param(
    [string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'),
    [string]$HubSource = 'C:\Resonance\Sources\ronsas-hub-canonical',
    [string]$CandidateDirName = '.output-candidate-local',
    [string]$LiveDirName = '.output-local',
    [int]$CandidatePort = 4195,
    [int]$LivePort = 4174,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Candidate = Join-Path $HubSource $CandidateDirName
$Live = Join-Path $HubSource $LiveDirName
$EnvFile = Join-Path $HubSource '.env.local'
$CandidateEntry = Join-Path $Candidate 'server\index.mjs'
$LiveEntry = Join-Path $Live 'server\index.mjs'
$Runtime = Join-Path $Root 'runtime'
$SecretRoot = Join-Path $Runtime 'secrets'
$ReceiptRoot = Join-Path $Runtime 'release-receipts'
$LockRoot = Join-Path $env:LOCALAPPDATA 'Resonance\RONS-ControlCenter\locks'
$StatePath = Join-Path $Runtime 'rons-cluster-state.json'
$OwnershipPath = Join-Path $Runtime 'rons-cluster-owned.json'
$Node = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $ReceiptRoot,$LockRoot | Out-Null

if (-not $ValidateOnly -and ([IO.Path]::GetFullPath($Candidate) -eq [IO.Path]::GetFullPath($Live))) { throw 'Candidate and live build directories must differ for promotion.' }
if (-not (Test-Path -LiteralPath $CandidateEntry -PathType Leaf)) { throw "Candidate Hub build missing: $CandidateEntry" }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw "Hub runtime env missing: $EnvFile" }

$lockPath = Join-Path $LockRoot 'hub-promotion.lock'
$lock = $null
try {
    $lock = [IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
} catch {
    throw ('Unable to acquire governed Hub promotion lock: ' + $_.Exception.Message)
}
Write-Host '[RONSAS] Hub promotion lock acquired.'

function Test-Http([string]$Url,[string]$Marker='RONSAS') {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
        return ($r.StatusCode -eq 200 -and ([string]$r.Content -like ('*' + $Marker + '*')))
    } catch { return $false }
}

function Wait-Http([string]$Url,[int]$Seconds=45) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Http $Url) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Get-ListenerPid([int]$Port) {
    $l = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($l) { return [int]$l.OwningProcess }
    return $null
}

function Start-Hub([string]$Entry,[int]$Port,[switch]$DetachFromActionsCleanup) {
    $prior = @{}
    foreach ($key in @('HOST','PORT','NODE_ENV','RESONANCE_BACKEND_PROVIDER','RESONANCE_SOVEREIGN_GATEWAY_URL','RONS_SOVEREIGN_PROXY_ENABLED','RONS_ENTITLEMENT_SHADOW','RONS_IDENTITY_SHADOW','RONS_ROLE_SHADOW','RONS_AUTH_EXCHANGE_KEY_FILE','RONS_GATEWAY_PROCEDURE_KEY_FILE','RUNNER_TRACKING_ID')) {
        $prior[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
    }
    try {
        $env:HOST = '127.0.0.1'
        $env:PORT = [string]$Port
        $env:NODE_ENV = 'production'
        $env:RESONANCE_BACKEND_PROVIDER = 'sovereign'
        $env:RESONANCE_SOVEREIGN_GATEWAY_URL = 'http://127.0.0.1:58600'
        $env:RONS_SOVEREIGN_PROXY_ENABLED = '1'
        $env:RONS_ENTITLEMENT_SHADOW = '1'
        $env:RONS_IDENTITY_SHADOW = '1'
        $env:RONS_ROLE_SHADOW = '1'
        $env:RONS_AUTH_EXCHANGE_KEY_FILE = Join-Path $SecretRoot 'auth-exchange-key'
        $env:RONS_GATEWAY_PROCEDURE_KEY_FILE = Join-Path $SecretRoot 'gateway-procedure-key'
        if ($DetachFromActionsCleanup) {
            [Environment]::SetEnvironmentVariable('RUNNER_TRACKING_ID',$null,'Process')
            Write-Host '[RONSAS] Starting production Hub outside GitHub Actions orphan-process cleanup.'
        }
        $out = Join-Path $ReceiptRoot ("hub-$Port.out.log")
        $err = Join-Path $ReceiptRoot ("hub-$Port.err.log")
        return Start-Process -FilePath $Node -ArgumentList @(("--env-file=" + $EnvFile),$Entry) -WorkingDirectory $HubSource -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
    } finally {
        foreach ($key in $prior.Keys) { [Environment]::SetEnvironmentVariable($key,$prior[$key],'Process') }
    }
}

function Stop-VerifiedHub([int]$Port) {
    $listenerPid = Get-ListenerPid $Port
    if (-not $listenerPid) { return $null }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
    if (-not $proc -or [string]$proc.Name -ne 'node.exe') { throw "Port $Port is not owned by the expected Node Hub process." }
    if (-not (Test-Http ("http://127.0.0.1:$Port/") 'RONSAS')) { throw "Port $Port failed the Hub endpoint fingerprint; refusing to stop it." }
    Stop-Process -Id $listenerPid -Force -ErrorAction Stop
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline -and (Get-ListenerPid $Port)) { Start-Sleep -Milliseconds 250 }
    if (Get-ListenerPid $Port) { throw "Hub listener on port $Port did not stop cleanly." }
    return $listenerPid
}

function Clear-StaleCandidateListener([int]$Port,[string]$ExpectedEntry) {
    $listenerPid = Get-ListenerPid $Port
    if (-not $listenerPid) { return $null }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
    if (-not $proc -or [string]$proc.Name -ne 'node.exe') {
        throw "Candidate port $Port is occupied by an unrecognized process; refusing cleanup."
    }

    $expectedPath = [IO.Path]::GetFullPath($ExpectedEntry)
    $commandLine = [string]$proc.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine) -or
        $commandLine.IndexOf($expectedPath,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "Candidate port $Port is occupied by Node, but not by the expected RONSAS candidate entry; refusing cleanup."
    }

    if (-not (Test-Http ("http://127.0.0.1:$Port/") 'RONSAS')) {
        throw "Candidate port $Port matches the expected entry but failed the RONSAS endpoint fingerprint; refusing cleanup."
    }

    Write-Host "[RONSAS] Removing stale verified candidate listener on port $Port (PID $listenerPid)."
    return Stop-VerifiedHub $Port
}

function Update-State([int]$ProcessId) {
    if (Test-Path -LiteralPath $StatePath) {
        $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        $hub = @($state.services | Where-Object { $_.name -eq 'hub' }) | Select-Object -First 1
        if ($hub) {
            $hub.pid = $ProcessId; $hub.owned = $true; $hub.root = $HubSource; $hub.url = ("http://127.0.0.1:$LivePort/")
            $state | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $StatePath -Encoding UTF8
        }
    }
    $owned = if (Test-Path -LiteralPath $OwnershipPath) { Get-Content -LiteralPath $OwnershipPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{schema='rons-cluster-ownership-v1';services=@()} }
    $services = @($owned.services | Where-Object { $_.name -ne 'hub' })
    $services += [pscustomobject]@{name='hub';pid=$ProcessId}
    [pscustomobject]@{schema='rons-cluster-ownership-v1';updatedAt=(Get-Date).ToUniversalTime().ToString('o');services=$services} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OwnershipPath -Encoding UTF8
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $CandidateEntry).Hash.ToLowerInvariant()
$candidateProcess = $null
$rollback = $null
try {
    Clear-StaleCandidateListener -Port $CandidatePort -ExpectedEntry $CandidateEntry | Out-Null
    Write-Host ("[RONSAS] Validating Hub candidate on port $CandidatePort...")
    $candidateProcess = Start-Hub $CandidateEntry $CandidatePort
    if (-not (Wait-Http ("http://127.0.0.1:$CandidatePort/") 45)) { throw 'Candidate Hub failed isolated health validation.' }
    Stop-VerifiedHub $CandidatePort | Out-Null
    $candidateProcess = $null
    Write-Host '[RONSAS] Candidate health validation passed.'

    if ($ValidateOnly) {
        [pscustomobject]@{schema='ronsas-hub-promotion/v1';mode='validate-only';validatedAt=(Get-Date).ToUniversalTime().ToString('o');candidateSha256=$hash;candidate=$Candidate} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $ReceiptRoot ("hub-validation-$stamp.json")) -Encoding UTF8
        Write-Host 'RONSAS HUB CANDIDATE: VALID' -ForegroundColor Green
        exit 0
    }

    Stop-VerifiedHub $LivePort | Out-Null
    if (Test-Path -LiteralPath $Live) {
        $rollback = Join-Path $HubSource ('.output-rollback-' + $stamp)
        Move-Item -LiteralPath $Live -Destination $rollback
    }
    Move-Item -LiteralPath $Candidate -Destination $Live

    $newProcess = Start-Hub $LiveEntry $LivePort -DetachFromActionsCleanup
    if (-not (Wait-Http ("http://127.0.0.1:$LivePort/") 45)) { throw 'Promoted Hub failed production health validation.' }
    $newPid = Get-ListenerPid $LivePort
    if (-not $newPid) { throw 'Promoted Hub is reachable but listener PID was not found.' }
    Update-State $newPid

    $sourceHead = ''
    try { $sourceHead = ((& git -C $HubSource rev-parse HEAD) | Out-String).Trim() } catch {}
    [pscustomobject]@{schema='ronsas-hub-promotion/v1';mode='promote';promotedAt=(Get-Date).ToUniversalTime().ToString('o');candidateSha256=$hash;sourceHead=$sourceHead;pid=$newPid;rollback=$rollback} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $ReceiptRoot ("hub-promotion-$stamp.json")) -Encoding UTF8

    Get-ChildItem $HubSource -Directory -Filter '.output-rollback-*' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "RONSAS HUB PROMOTED: PID $newPid" -ForegroundColor Green
    exit 0
} catch {
    $failure = $_.Exception.Message
    if ($candidateProcess -and -not $candidateProcess.HasExited) { Stop-Process -Id $candidateProcess.Id -Force -ErrorAction SilentlyContinue }
    if (-not $ValidateOnly) {
        $failedPid = Get-ListenerPid $LivePort
        if ($failedPid -and (Test-Http ("http://127.0.0.1:$LivePort/") 'RONSAS')) { Stop-Process -Id $failedPid -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }
        if ($rollback -and (Test-Path -LiteralPath $rollback)) {
            if (Test-Path -LiteralPath $Live) { Move-Item -LiteralPath $Live -Destination (Join-Path $HubSource ('.output-failed-' + $stamp)) }
            Move-Item -LiteralPath $rollback -Destination $Live
            $restored = Start-Hub $LiveEntry $LivePort -DetachFromActionsCleanup
            if (Wait-Http ("http://127.0.0.1:$LivePort/") 45) {
                $restoredPid = Get-ListenerPid $LivePort
                if ($restoredPid) { Update-State $restoredPid }
            }
        }
    }
    [pscustomobject]@{schema='ronsas-hub-promotion/v1';mode='failure';failedAt=(Get-Date).ToUniversalTime().ToString('o');candidateSha256=$hash;error=$failure;rollback=$rollback} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $ReceiptRoot ("hub-promotion-failed-$stamp.json")) -Encoding UTF8
    throw
} finally {
    if ($lock) { $lock.Dispose() }
}


