param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$StatePath = Join-Path $Root 'runtime\rons-cluster-state.json'
if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    Write-Host 'No RONSAS supervisor state exists; nothing was stopped.'
    exit 0
}
$state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
$expected = @{
    'hub'='ronsas-hub-canonical'
    'epublisher'='epublisher-sovereign-local-v0.1'
    'creative-studio'='creative-studio-sovereign-local-v0.1'
    'sync-vision'='sync-vision-sovereign-local-v0.1'
    'youtube-optimizer'='youtube-optimizer-stage'
    'musetalk-bridge'='musetalk_bridge.py'
    'launch-broker'='rons-launch-broker.py'
    'local-stt'='syncvision-local-stt.py'
    'epublisher-stt'='syncvision-local-stt.py'
    'local-image'='epublisher-image-service.py'
    'local-llm'='rons-local-llm-service.py'
    'creative-source'='creative-source-service.py'
    'ai-broker'='ai-broker-service.py'
    'ollama'='ollama'
}

$stopped = @()
$skipped = @()
foreach ($service in @($state.services)) {
    if (-not $service.owned) { continue }
    $name = [string]$service.name
    if (-not $expected.ContainsKey($name)) { continue }
    if (-not $service.pid) { $skipped += "${name}: no recorded PID"; continue }
    $processId = [int]$service.pid
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if (-not $proc) { $skipped += "${name}: PID $processId already exited"; continue }
    $cmd = [string]$proc.CommandLine
    $processName = [string]$proc.Name
    $identityOk = $false
    if ($cmd -and $cmd -like ('*' + $expected[$name] + '*')) { $identityOk = $true }
    elseif ($name -eq 'ollama' -and $processName -eq 'ollama.exe') { $identityOk = $true }
    if (-not $identityOk) {
        $skipped += "${name}: PID $processId identity unavailable/mismatch; not stopped"
        continue
    }
    Stop-Process -Id $processId -Force
    $stopped += "${name}: PID $processId"
    if ($service.PSObject.Properties.Name -contains 'launcherPid' -and $service.launcherPid) {
        $launcherPid = [int]$service.launcherPid
        if ($launcherPid -ne $processId) {
            Stop-Process -Id $launcherPid -Force -ErrorAction SilentlyContinue
        }
    }
}

$state | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ((Get-Date).ToUniversalTime().ToString('o')) -Force
$state | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $StatePath -Encoding UTF8
if ($stopped.Count) {
    Write-Host 'Stopped supervisor-owned RONSAS processes:' -ForegroundColor Green
    $stopped | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host 'No supervisor-owned RONSAS process required stopping.'
}
if ($skipped.Count) {
    Write-Host 'Safe skips:' -ForegroundColor Yellow
    $skipped | ForEach-Object { Write-Host "  $_" }
}
Write-Host 'Foundry/backend and reused pre-existing processes were left untouched.'
exit 0
