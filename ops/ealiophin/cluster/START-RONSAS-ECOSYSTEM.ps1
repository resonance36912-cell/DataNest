param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$MachineName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { [System.Net.Dns]::GetHostName() }

$Runtime = Join-Path $Root 'runtime'
$LogRoot = Join-Path $Runtime 'logs\rons-cluster'
$StatePath = Join-Path $Runtime 'rons-cluster-state.json'
$OwnershipPath = Join-Path $Runtime 'rons-cluster-owned.json'
$AppDev = Join-Path $Root 'ResonanceAppDev_ZeroCredit_v1.5.8'
$SecretRoot = Join-Path $Root 'runtime\secrets'
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$RegistryPath = Join-Path $PSScriptRoot 'RONSAS-MODULES.json'
if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) { throw "RONSAS module registry missing: $RegistryPath" }
$Registry = Get-Content -LiteralPath $RegistryPath -Raw | ConvertFrom-Json
if ([string]$Registry.schema -ne 'ronsas-module-registry/v1') { throw "Unsupported RONSAS module registry schema: $($Registry.schema)" }
$SttPython = Join-Path $Runtime 'python-envs\epublisher-stt\Scripts\python.exe'
$MediaPython = Join-Path $Runtime 'python-envs\musetalk-0a89dec45a01\Scripts\python.exe'
$SystemPython = (Get-Command python.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

# Win32_Process.CommandLine is blank when a non-elevated launcher inspects a
# RONS service started in an elevated session. In that case, retain the strict
# no-stop policy and use a loopback-only process + endpoint fingerprint.
$KnownEndpointIdentities = @{
    'hub' = @{ url='http://127.0.0.1:4173/'; process='node.exe'; marker='RONSAS'; contentType='text/html' }
    'epublisher' = @{ url='http://127.0.0.1:3101/'; process='node.exe'; marker='Resonance ePublisher'; contentType='text/html' }
    'creative-studio' = @{ url='http://127.0.0.1:3201/'; process='node.exe'; marker='Resonance Creative Studio'; contentType='text/html' }
    'sync-vision' = @{ url='http://127.0.0.1:3301/'; process='node.exe'; marker='Sync Vision'; contentType='text/html' }
    'musetalk-bridge' = @{ url='http://127.0.0.1:7863/health'; process='python.exe'; marker='resonance-musetalk-bridge'; contentType='application/json' }
    'launch-broker' = @{ url='http://127.0.0.1:4450/health'; process='python.exe'; marker='rons-launch-broker'; contentType='application/json' }
    'youtube-optimizer' = @{ url='http://127.0.0.1:3401/'; process='node.exe'; marker='youtube-optimizer'; contentType='text/html' }
    'local-stt' = @{ url='http://127.0.0.1:7864/health'; process='python.exe'; marker='epublisher-local-stt'; contentType='application/json' }
    'epublisher-stt' = @{ url='http://127.0.0.1:7869/health'; process='python.exe'; marker='127.0.0.1:7869'; contentType='application/json' }
    'local-image' = @{ url='http://127.0.0.1:7865/health'; process='python.exe'; marker='model_complete'; contentType='application/json' }
    'premium-image' = @{ url='http://127.0.0.1:7870/health'; process='python.exe'; marker='SDXL-Lightning'; contentType='application/json' }
    'local-llm' = @{ url='http://127.0.0.1:7866/health'; process='python.exe'; marker='model_ready'; contentType='application/json' }
    'creative-source' = @{ url='http://127.0.0.1:7867/health'; process='python.exe'; marker='rons-creative-source'; contentType='application/json' }
    'ai-broker' = @{ url='http://127.0.0.1:7868/health'; process='python.exe'; marker='rons-ai-broker'; contentType='application/json' }
    'ollama' = @{ url='http://127.0.0.1:11434/'; process='ollama.exe'; marker='Ollama is running'; contentType='text/plain' }
}

function Test-Http([string]$Url) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch { return $false }
}
function Test-BackendReady {
    try {
        $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/v1/backend/health' -TimeoutSec 5
        return [bool]$h.ready
    } catch { return $false }
}
function Get-ListenerPid([int]$Port) {
    $l = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($l) { return [int]$l.OwningProcess }
    return $null
}
function Get-CommandLine([int]$ProcessId) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if ($p) { return [string]$p.CommandLine }
    return ''
}
function Wait-Http([string]$Name, [string]$Url, [int]$Seconds = 30) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Http $Url) { return $true }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not become healthy at $Url"
}
function Assert-KnownPort([string]$Name, [int]$Port, [string]$Expected) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { return $null }
    $listenerPid = [int]$listener.OwningProcess
    $cmd = Get-CommandLine $listenerPid
    if ($cmd -like "*$Expected*") {
        return [pscustomobject]@{ pid=$listenerPid; owned=$false; command=$cmd; identity='command-line' }
    }
    if (-not [string]::IsNullOrWhiteSpace($cmd)) {
        throw "$Name port $Port is occupied by an unrecognized process PID $listenerPid. No process was stopped."
    }

    $identity = $KnownEndpointIdentities[$Name]
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
    $loopbackAddresses = @('127.0.0.1', '::1')
    if (-not $identity -or -not $process -or [string]$process.Name -ne [string]$identity.process -or
        $loopbackAddresses -notcontains [string]$listener.LocalAddress) {
        throw "$Name port $Port is occupied by an unrecognized process PID $listenerPid. No process was stopped."
    }

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ([string]$identity.url) -TimeoutSec 5
        $contentType = [string]$response.Headers['Content-Type']
        $contentMatches = [string]$response.Content -like ('*' + [string]$identity.marker + '*')
        if ($response.StatusCode -ne 200 -or $contentType -notlike ([string]$identity.contentType + '*') -or -not $contentMatches) {
            throw 'Endpoint fingerprint mismatch.'
        }
    } catch {
        throw "$Name port $Port is occupied by an unrecognized process PID $listenerPid. No process was stopped."
    }

    Write-Host "[SAFE REUSE] $Name PID $listenerPid verified by loopback endpoint fingerprint (command line unavailable)." -ForegroundColor Yellow
    return [pscustomobject]@{ pid=$listenerPid; owned=$false; command=''; identity='loopback-endpoint-fingerprint' }
}
function Start-ViteApp([string]$Name, [string]$Dir, [int]$Port, [string]$Mode, [string]$BindAddress) {
    $url = if ($BindAddress -eq '0.0.0.0') { "http://127.0.0.1:$Port/" } else { "http://$BindAddress`:$Port/" }
    $existing = Assert-KnownPort $Name $Port $Dir
    if ($existing) {
        if (-not (Test-Http $url)) { throw "$Name owns port $Port but is unhealthy." }
        return [pscustomobject]@{name=$Name;port=$Port;url=$url;pid=$existing.pid;owned=$false;root=$Dir}
    }
    $vite = Join-Path $Dir 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) { throw "$Name Vite runtime missing: $vite" }
    $args = @($vite, $Mode, '--host', $BindAddress, '--port', [string]$Port, '--strictPort')
    $outLog = Join-Path $LogRoot ($Name + '.out.log')
    $errLog = Join-Path $LogRoot ($Name + '.err.log')
    $proc = Start-Process -FilePath $Node -ArgumentList $args -WorkingDirectory $Dir `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    Wait-Http $Name $url 45 | Out-Null
    $listenerPid = Get-ListenerPid $Port
    if (-not $listenerPid) { throw "$Name became reachable but has no listener PID." }
    $cmd = Get-CommandLine $listenerPid
    if ($cmd -notlike "*$Dir*") { throw "$Name listener identity mismatch after startup." }
    return [pscustomobject]@{name=$Name;port=$Port;url=$url;pid=$listenerPid;owned=$true;root=$Dir;launcherPid=$proc.Id}
}
function Start-PythonService([string]$Name, [int]$Port, [string]$Url, [string]$Script, [string]$Python, [string]$Expected, [hashtable]$Environment = @{}) {
    $existing = Assert-KnownPort $Name $Port $Expected
    if ($existing) {
        if (-not (Test-Http $Url)) { throw "$Name owns port $Port but is unhealthy." }
        return [pscustomobject]@{name=$Name;port=$Port;url=$Url;pid=$existing.pid;owned=$false;root=(Split-Path $Script -Parent)}
    }
    if (-not (Test-Path -LiteralPath $Script -PathType Leaf)) { throw "$Name script missing: $Script" }
    if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) { throw "$Name Python runtime missing: $Python" }
    $outLog = Join-Path $LogRoot ($Name + '.out.log'); $errLog = Join-Path $LogRoot ($Name + '.err.log')
    $prior = @{}
    foreach ($key in $Environment.Keys) { $prior[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process') }
    try { $proc = Start-Process -FilePath $Python -ArgumentList @($Script) -WorkingDirectory (Split-Path $Script -Parent) -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru }
    finally { foreach ($key in $Environment.Keys) { [Environment]::SetEnvironmentVariable($key, $prior[$key], 'Process') } }
    Wait-Http $Name $Url 90 | Out-Null
    $listenerPid = Get-ListenerPid $Port; if (-not $listenerPid) { throw "$Name became reachable but has no listener PID." }
    $cmd = Get-CommandLine $listenerPid; if ($cmd -and $cmd -notlike "*$Expected*") { throw "$Name listener identity mismatch after startup." }
    return [pscustomobject]@{name=$Name;port=$Port;url=$Url;pid=$listenerPid;owned=$true;root=(Split-Path $Script -Parent);launcherPid=$proc.Id}
}

function Start-NodeService([string]$Name, [int]$Port, [string]$Url, [string]$Entry, [string]$WorkingDirectory, [string]$Expected, [hashtable]$Environment = @{}) {
    $existing = Assert-KnownPort $Name $Port $Expected
    if ($existing) { if (-not (Test-Http $Url)) { throw "$Name owns port $Port but is unhealthy." }; return [pscustomobject]@{name=$Name;port=$Port;url=$Url;pid=$existing.pid;owned=$false;root=$WorkingDirectory} }
    if (-not (Test-Path -LiteralPath $Entry -PathType Leaf)) { throw "$Name entry missing: $Entry" }
    $outLog = Join-Path $LogRoot ($Name + '.out.log'); $errLog = Join-Path $LogRoot ($Name + '.err.log'); $prior = @{}

    foreach ($key in $Environment.Keys) { $prior[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process') }
    try { $proc = Start-Process -FilePath $Node -ArgumentList @($Entry) -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru }
    finally { foreach ($key in $Environment.Keys) { [Environment]::SetEnvironmentVariable($key, $prior[$key], 'Process') } }
    Wait-Http $Name $Url 60 | Out-Null
    $listenerPid = Get-ListenerPid $Port; if (-not $listenerPid) { throw "$Name became reachable but has no listener PID." }
    $cmd = Get-CommandLine $listenerPid; if ($cmd -and $cmd -notlike "*$Expected*") { throw "$Name listener identity mismatch after startup." }
    return [pscustomobject]@{name=$Name;port=$Port;url=$Url;pid=$listenerPid;owned=$true;root=$WorkingDirectory;launcherPid=$proc.Id}
}

function Start-OllamaService {
    $name='ollama'; $port=11434; $url='http://127.0.0.1:11434/'
    $existing = Assert-KnownPort $name $port 'ollama'
    if ($existing) { if (-not (Test-Http $url)) { throw 'Ollama listener is unhealthy.' }; return [pscustomobject]@{name=$name;port=$port;url=$url;pid=$existing.pid;owned=$false;root='local-model-runtime'} }
    $ollama = Get-Command ollama.exe -ErrorAction Stop
    $outLog = Join-Path $LogRoot 'ollama.out.log'; $errLog = Join-Path $LogRoot 'ollama.err.log'
    $proc = Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    Wait-Http 'Ollama' $url 30 | Out-Null
    $listenerPid = Get-ListenerPid $port; if (-not $listenerPid) { throw 'Ollama became reachable but has no listener PID.' }
    return [pscustomobject]@{name=$name;port=$port;url=$url;pid=$listenerPid;owned=$true;root=(Split-Path $ollama.Source -Parent);launcherPid=$proc.Id}
}

function Start-LaunchBroker {
    $name = 'launch-broker'; $port = 4450; $url = 'http://127.0.0.1:4450/health'
    $script = Join-Path $Runtime 'rons-launch-broker.py'
    $existing = Assert-KnownPort $name $port 'rons-launch-broker.py'
    if ($existing) {
        if (-not (Test-Http $url)) { throw 'Launch broker owns port 4450 but is unhealthy.' }
        return [pscustomobject]@{name=$name;port=$port;url=$url;pid=$existing.pid;owned=$false;root=$Runtime}
    }
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "Launch broker missing: $script" }
    $python = (Get-Command python.exe -ErrorAction Stop).Source
    $outLog = Join-Path $LogRoot 'launch-broker.out.log'
    $errLog = Join-Path $LogRoot 'launch-broker.err.log'
    $priorGateway = $env:RESONANCE_SOVEREIGN_GATEWAY_URL
    $priorPort = $env:RONS_LAUNCH_BROKER_PORT
    $priorKey = $env:RONS_AUTH_EXCHANGE_KEY_FILE
    try {
        $env:RESONANCE_SOVEREIGN_GATEWAY_URL = 'http://127.0.0.1:58600'
        $env:RONS_LAUNCH_BROKER_PORT = '4450'
        $env:RONS_AUTH_EXCHANGE_KEY_FILE = Join-Path $SecretRoot 'auth-exchange-key'
        $proc = Start-Process -FilePath $python -ArgumentList @($script) -WorkingDirectory $Runtime `
            -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    } finally {
        $env:RESONANCE_SOVEREIGN_GATEWAY_URL = $priorGateway
        $env:RONS_LAUNCH_BROKER_PORT = $priorPort
        $env:RONS_AUTH_EXCHANGE_KEY_FILE = $priorKey
    }
    Wait-Http $name $url 20 | Out-Null
    $listenerPid = Get-ListenerPid $port
    if (-not $listenerPid -or (Get-CommandLine $listenerPid) -notlike '*rons-launch-broker.py*') {
        throw 'Launch broker listener identity mismatch after startup.'
    }
    return [pscustomobject]@{name=$name;port=$port;url=$url;pid=$listenerPid;owned=$true;root=$Runtime;launcherPid=$proc.Id}
}
$services = @()
$foundryUrl = 'http://127.0.0.1:8787/v1/apps'
if (-not (Test-Http $foundryUrl)) {
    $startFoundry = Join-Path $AppDev 'scripts\start-open-nova-offline.ps1'
    if (-not (Test-Path -LiteralPath $startFoundry -PathType Leaf)) { throw "Foundry offline launcher missing: $startFoundry" }
    $foundryOut = Join-Path $LogRoot 'foundry.out.log'
    $foundryErr = Join-Path $LogRoot 'foundry.err.log'
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$startFoundry) -WorkingDirectory $AppDev -RedirectStandardOutput $foundryOut -RedirectStandardError $foundryErr -WindowStyle Hidden | Out-Null
    Wait-Http 'Foundry' $foundryUrl 60 | Out-Null
}
$foundryPid = Get-ListenerPid 8787
$services += [pscustomobject]@{name='foundry';port=8787;url=$foundryUrl;pid=$foundryPid;owned=$false;root=$AppDev}
if (-not (Test-BackendReady)) {
    $podman = Get-Command podman.exe -ErrorAction SilentlyContinue
    if (-not $podman) { throw 'Sovereign backend is offline and Podman is not installed.' }
    $machinesRaw = & $podman.Source machine list --format json
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the Podman machine.' }
    # Windows PowerShell 5.1 can preserve a top-level JSON array as one nested
    # Object[] pipeline item. Flatten it so property checks operate on machines.
    $parsedMachines = $machinesRaw | ConvertFrom-Json
    $machines = @($parsedMachines | ForEach-Object { $_ })
    if (-not $machines.Count) { throw 'No Podman machine exists; refusing to create one automatically.' }
    $machine = @($machines | Where-Object { $_.PSObject.Properties['Default'] -and [bool]$_.Default })[0]
    if (-not $machine) { $machine = $machines[0] }
    if (-not [bool]$machine.Running) {
        & $podman.Source machine start ([string]$machine.Name) | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Existing Podman machine failed to start.' }
    }
    $preflight = Join-Path $AppDev 'scripts\service-fabric-preflight.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $preflight | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Sovereign backend image preflight failed. No network provisioning was attempted.' }
    $backendInit = Join-Path $AppDev 'scripts\backend-runtime-init.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backendInit -Start | Out-Host
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline -and -not (Test-BackendReady)) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-BackendReady)) { throw 'Sovereign backend did not become ready after local restore.' }
}
$backendUrl = 'http://127.0.0.1:8787/v1/backend/health'
$services += [pscustomobject]@{name='sovereign-backend';port=58600;url=$backendUrl;pid=(Get-ListenerPid 58600);owned=$false;root=$AppDev}
$opsRuntime = Join-Path (Split-Path $PSScriptRoot -Parent) 'runtime'
$sttSource = Join-Path $opsRuntime 'syncvision-local-stt.py'
if (-not (Test-Path -LiteralPath $sttSource -PathType Leaf)) { throw "STT runtime source missing: $sttSource" }
$sttTarget = Join-Path $Runtime 'syncvision-local-stt.py'
$sttSourceChanged = -not (Test-Path -LiteralPath $sttTarget -PathType Leaf)
if (-not $sttSourceChanged) {
    $sttSourceHash = (Get-FileHash -LiteralPath $sttSource -Algorithm SHA256).Hash
    $sttTargetHash = (Get-FileHash -LiteralPath $sttTarget -Algorithm SHA256).Hash
    $sttSourceChanged = ($sttSourceHash -ne $sttTargetHash)
}
if ($sttSourceChanged) {
    Copy-Item -LiteralPath $sttSource -Destination $sttTarget -Force

    $sttExisting = Assert-KnownPort 'local-stt' 7864 'syncvision-local-stt.py'
    if ($sttExisting) {
        Write-Host "[SOURCE REFRESH] restarting verified local-stt listener PID $($sttExisting.pid)." -ForegroundColor Yellow
        Stop-Process -Id ([int]$sttExisting.pid) -Force -ErrorAction Stop
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 500
            $remainingSttPid = Get-ListenerPid 7864
        } while ($remainingSttPid -and (Get-Date) -lt $deadline)
        if ($remainingSttPid) { throw "Verified local-stt listener did not release port 7864 after source refresh." }
    }

    $sttExisting = Assert-KnownPort 'epublisher-stt' 7869 'syncvision-local-stt.py'
    if ($sttExisting) {
        Write-Host "[SOURCE REFRESH] restarting verified epublisher-stt listener PID $($sttExisting.pid)." -ForegroundColor Yellow
        Stop-Process -Id ([int]$sttExisting.pid) -Force -ErrorAction Stop
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 500
            $remainingSttPid = Get-ListenerPid 7869
        } while ($remainingSttPid -and (Get-Date) -lt $deadline)
        if ($remainingSttPid) { throw "Verified epublisher-stt listener did not release port 7869 after source refresh." }
    }
}
$premiumImageTargetPath = Join-Path $Runtime 'epublisher-premium-image-service.py'
$premiumImageSourceChanged = $false
foreach ($runtimeName in @('rons-local-llm-service.py','epublisher-premium-image-service.py')) {
    $sourceRuntime = Join-Path $opsRuntime $runtimeName
    if (-not (Test-Path -LiteralPath $sourceRuntime -PathType Leaf)) { throw "Premium runtime source missing: $sourceRuntime" }
    $targetRuntime = Join-Path $Runtime $runtimeName
    if ($runtimeName -eq 'epublisher-premium-image-service.py') {
        if (-not (Test-Path -LiteralPath $targetRuntime -PathType Leaf)) {
            $premiumImageSourceChanged = $true
        } else {
            $sourceHash = (Get-FileHash -LiteralPath $sourceRuntime -Algorithm SHA256).Hash
            $targetHash = (Get-FileHash -LiteralPath $targetRuntime -Algorithm SHA256).Hash
            $premiumImageSourceChanged = ($sourceHash -ne $targetHash)
        }
        if ($premiumImageSourceChanged) {
            Copy-Item -LiteralPath $sourceRuntime -Destination $targetRuntime -Force
        }
    } else {
        Copy-Item -LiteralPath $sourceRuntime -Destination $targetRuntime -Force
    }
}

$premiumImageNeedsRestart = $premiumImageSourceChanged
$premiumListenerPid = Get-ListenerPid 7870
if (-not $premiumImageNeedsRestart -and $premiumListenerPid -and (Test-Path -LiteralPath $premiumImageTargetPath -PathType Leaf)) {
    try {
        $premiumProcess = Get-Process -Id ([int]$premiumListenerPid) -ErrorAction Stop
        $premiumRuntimeWrite = (Get-Item -LiteralPath $premiumImageTargetPath).LastWriteTimeUtc
        $premiumProcessStart = $premiumProcess.StartTime.ToUniversalTime()
        if ($premiumRuntimeWrite -gt $premiumProcessStart) {
            $premiumImageNeedsRestart = $true
            Write-Host "[SOURCE REFRESH] premium-image runtime file is newer than the live process; scheduling verified restart." -ForegroundColor Yellow
        }
    } catch {
        Write-Warning "Could not compare premium-image process start time to runtime source; preserving the healthy listener: $($_.Exception.Message)"
    }
}

if ($premiumImageNeedsRestart) {
    $premiumExisting = Assert-KnownPort 'premium-image' 7870 'epublisher-premium-image-service.py'
    if ($premiumExisting) {
        Write-Host "[SOURCE REFRESH] restarting verified premium-image listener PID $($premiumExisting.pid)." -ForegroundColor Yellow
        Stop-Process -Id ([int]$premiumExisting.pid) -Force -ErrorAction Stop
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 500
            $remainingPremiumPid = Get-ListenerPid 7870
        } while ($remainingPremiumPid -and (Get-Date) -lt $deadline)
        if ($remainingPremiumPid) { throw "Verified premium-image listener did not release port 7870 after source refresh." }
    }
}

$services += Start-LaunchBroker
$services += Start-OllamaService
$localLlmModel = 'qwen2.5:0.5b'
try {
    $ollamaText = (& (Get-Command ollama.exe -ErrorAction Stop).Source list | Out-String)
    if ($ollamaText -match 'qwen3:8b') { $localLlmModel = 'qwen3:8b' }
} catch { }
$brokerConfig = Join-Path $Runtime 'ai-broker\providers.json'
if (Test-Path -LiteralPath $brokerConfig -PathType Leaf) {
    try {
        $broker = Get-Content -LiteralPath $brokerConfig -Raw | ConvertFrom-Json
        $broker.providers.'rons-local'.model = $localLlmModel
        $broker.providers.'rons-local'.base_url = 'http://127.0.0.1:7866'
        # Windows PowerShell Set-Content UTF8 emits a BOM; the Python broker reads strict UTF-8 JSON.
        $brokerJson = $broker | ConvertTo-Json -Depth 20
        [IO.File]::WriteAllText($brokerConfig, $brokerJson, (New-Object Text.UTF8Encoding($false)))
    } catch { Write-Warning "Could not update local AI broker model label: $($_.Exception.Message)" }
}
$services += Start-PythonService 'local-llm' 7866 'http://127.0.0.1:7866/health' (Join-Path $Runtime 'rons-local-llm-service.py') $SystemPython 'rons-local-llm-service.py' @{ RONS_LLM_MODEL=$localLlmModel; RONS_LLM_NUM_CTX='16384'; RONS_LLM_NUM_PREDICT='4096' }
$services += Start-PythonService 'local-stt' 7864 'http://127.0.0.1:7864/health' (Join-Path $Runtime 'syncvision-local-stt.py') $SttPython 'syncvision-local-stt.py' @{ HF_HUB_DISABLE_XET='1'; RONS_STT_MODELS_ROOT=(Join-Path $Runtime 'models') }
$services += Start-PythonService 'epublisher-stt' 7869 'http://127.0.0.1:7869/health' (Join-Path $Runtime 'syncvision-local-stt.py') $SttPython 'syncvision-local-stt.py' @{ HF_HUB_DISABLE_XET='1'; RONS_STT_MODELS_ROOT=(Join-Path $Runtime 'models'); RONS_STT_PORT='7869' }
$services += Start-PythonService 'local-image' 7865 'http://127.0.0.1:7865/health' (Join-Path $Runtime 'epublisher-image-service.py') $MediaPython 'epublisher-image-service.py'
$services += Start-PythonService 'premium-image' 7870 'http://127.0.0.1:7870/health' (Join-Path $Runtime 'epublisher-premium-image-service.py') $MediaPython 'epublisher-premium-image-service.py' @{ RONS_EPUBLISHER_IMAGE_PORT='7870'; RONS_IMAGE_MAX_ACTIVE='1'; RONS_IMAGE_IDLE_UNLOAD_SECONDS='90'; RONS_EPUBLISHER_MODELS_ROOT=(Join-Path $Runtime 'models') }
$services += Start-PythonService 'creative-source' 7867 'http://127.0.0.1:7867/health' (Join-Path $Runtime 'creative-source-service.py') $MediaPython 'creative-source-service.py'
$services += Start-PythonService 'ai-broker' 7868 'http://127.0.0.1:7868/health' (Join-Path $Runtime 'ai-broker-service.py') $SystemPython 'ai-broker-service.py'

$hub = 'C:\Resonance\Sources\ronsas-hub-canonical'

$hubEntry = Join-Path $hub '.output-local\server\index.mjs'
$hubEnvFile = Join-Path $hub '.env.local'
if (-not (Test-Path -LiteralPath $hubEntry -PathType Leaf)) { throw "RONS Hub production build missing: $hubEntry" }
if (-not (Test-Path -LiteralPath $hubEnvFile -PathType Leaf)) { throw "RONS Hub runtime env missing: $hubEnvFile" }
$hubExisting = Assert-KnownPort 'hub' 4173 $hub
if ($hubExisting) {
    if (-not (Test-Http 'http://127.0.0.1:4173/')) { throw 'Hub owns port 4173 but is unhealthy.' }
    $services += [pscustomobject]@{name='hub';port=4173;url='http://127.0.0.1:4173/';pid=$hubExisting.pid;owned=$false;root=$hub}
} else {
    $outLog = Join-Path $LogRoot 'hub.out.log'
    $errLog = Join-Path $LogRoot 'hub.err.log'
    $priorHost = $env:HOST
    $priorPort = $env:PORT
    $priorBackendProvider = $env:RESONANCE_BACKEND_PROVIDER
    $priorGatewayUrl = $env:RESONANCE_SOVEREIGN_GATEWAY_URL
    $priorSovereignProxy = $env:RONS_SOVEREIGN_PROXY_ENABLED
    $priorEntitlementShadow = $env:RONS_ENTITLEMENT_SHADOW
    $priorIdentityShadow = $env:RONS_IDENTITY_SHADOW
    $priorRoleShadow = $env:RONS_ROLE_SHADOW
    $priorAuthExchangeKeyFile = $env:RONS_AUTH_EXCHANGE_KEY_FILE
    $priorGatewayProcedureKeyFile = $env:RONS_GATEWAY_PROCEDURE_KEY_FILE
    try {
        $env:HOST = '127.0.0.1'
        $env:PORT = '4173'
        $env:RESONANCE_BACKEND_PROVIDER = 'sovereign'
        $env:RESONANCE_SOVEREIGN_GATEWAY_URL = 'http://127.0.0.1:58600'
        $env:RONS_SOVEREIGN_PROXY_ENABLED = '1'
        $env:RONS_ENTITLEMENT_SHADOW = '1'
        $env:RONS_IDENTITY_SHADOW = '1'
        $env:RONS_ROLE_SHADOW = '1'
        $env:RONS_AUTH_EXCHANGE_KEY_FILE = Join-Path $SecretRoot 'auth-exchange-key'
        $env:RONS_GATEWAY_PROCEDURE_KEY_FILE = Join-Path $SecretRoot 'gateway-procedure-key'
        $hubProc = Start-Process -FilePath $Node -ArgumentList @(("--env-file=" + $hubEnvFile), $hubEntry) -WorkingDirectory $hub -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    } finally {
        $env:HOST = $priorHost
        $env:PORT = $priorPort
        $env:RESONANCE_BACKEND_PROVIDER = $priorBackendProvider
        $env:RESONANCE_SOVEREIGN_GATEWAY_URL = $priorGatewayUrl
        $env:RONS_SOVEREIGN_PROXY_ENABLED = $priorSovereignProxy
        $env:RONS_ENTITLEMENT_SHADOW = $priorEntitlementShadow
        $env:RONS_IDENTITY_SHADOW = $priorIdentityShadow
        $env:RONS_ROLE_SHADOW = $priorRoleShadow
        $env:RONS_AUTH_EXCHANGE_KEY_FILE = $priorAuthExchangeKeyFile
        $env:RONS_GATEWAY_PROCEDURE_KEY_FILE = $priorGatewayProcedureKeyFile
    }
    Wait-Http 'Hub' 'http://127.0.0.1:4173/' 45 | Out-Null
    $hubPid = Get-ListenerPid 4173
    if ((Get-CommandLine $hubPid) -notlike '*ronsas-hub-canonical*') { throw 'Hub listener identity mismatch after startup.' }
    $services += [pscustomobject]@{name='hub';port=4173;url='http://127.0.0.1:4173/';pid=$hubPid;owned=$true;root=$hub;launcherPid=$hubProc.Id}
}
$services += Start-ViteApp 'epublisher' (Join-Path $Root 'apps\epublisher-sovereign-local-v0.1') 3101 'preview' '127.0.0.1'
$services += Start-ViteApp 'creative-studio' (Join-Path $Root 'apps\creative-studio-sovereign-local-v0.1') 3201 'preview' '127.0.0.1'
$services += Start-ViteApp 'sync-vision' (Join-Path $Root 'apps\sync-vision-sovereign-local-v0.1') 3301 'preview' '127.0.0.1'
$youtubeDir = Join-Path $Runtime 'youtube-optimizer-stage'
$youtubeEntry = Join-Path $youtubeDir '.output\server\index.mjs'
$services += Start-NodeService 'youtube-optimizer' 3401 'http://127.0.0.1:3401/' $youtubeEntry $youtubeDir 'youtube-optimizer-stage' @{ PORT='3401'; HOST='127.0.0.1'; NODE_ENV='production'; RESONANCE_SOVEREIGN_GATEWAY_URL='http://127.0.0.1:58600' }
$museUrl = 'http://127.0.0.1:7863/health'

$museExisting = Assert-KnownPort 'musetalk-bridge' 7863 'musetalk_bridge.py'
if ($museExisting) {
    if (-not (Test-Http $museUrl)) { throw 'MuseTalk bridge owns port 7863 but is unhealthy.' }
    $services += [pscustomobject]@{name='musetalk-bridge';port=7863;url=$museUrl;pid=$museExisting.pid;owned=$false;root=(Join-Path $Root 'integrations\musetalk-syncvision-bridge')}
} else {
    $launcher = Join-Path $Root 'integrations\musetalk-syncvision-bridge\START-RONS-R5B-MUSETALK-BRIDGE.ps1'
    $outLog = Join-Path $LogRoot 'musetalk-launcher.out.log'
    $errLog = Join-Path $LogRoot 'musetalk-launcher.err.log'
    $launchProc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$launcher,'-Root',$Root) `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    Wait-Http 'MuseTalk bridge' $museUrl 60 | Out-Null
    $musePid = Get-ListenerPid 7863
    if ((Get-CommandLine $musePid) -notlike '*musetalk_bridge.py*') { throw 'MuseTalk listener identity mismatch after startup.' }
    $services += [pscustomobject]@{name='musetalk-bridge';port=7863;url=$museUrl;pid=$musePid;owned=$true;root=(Join-Path $Root 'integrations\musetalk-syncvision-bridge');launcherPid=$launchProc.Id}
}

$priorOwned = @()
if (Test-Path -LiteralPath $OwnershipPath) {
    try { $priorOwned = @((Get-Content -LiteralPath $OwnershipPath -Raw | ConvertFrom-Json).services) } catch { $priorOwned = @() }
}
foreach ($svc in $services) {
    if (-not $svc.owned -and $svc.pid) {
        $prior = @($priorOwned | Where-Object {$_.name -eq $svc.name -and [int]$_.pid -eq [int]$svc.pid}) | Select-Object -First 1
        if ($prior) { $svc.owned = $true }
    }
}
$ownedNow = @($services | Where-Object {$_.owned -and $_.pid} | ForEach-Object {[pscustomobject]@{name=$_.name;pid=[int]$_.pid}})
[pscustomobject]@{schema='rons-cluster-ownership-v1';updatedAt=(Get-Date).ToUniversalTime().ToString('o');services=$ownedNow} |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $OwnershipPath -Encoding UTF8
$state = [pscustomobject]@{
    schema='ronsas-cluster-state-v2'
    suite='RONSAS'
    hubPc=$MachineName
    registryPath=$RegistryPath
    registrySchema=[string]$Registry.schema
    startedAt=(Get-Date).ToUniversalTime().ToString('o')
    services=$services
}
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8
Write-Host ''
Write-Host 'RONSAS: READY' -ForegroundColor Green
$services | Select-Object name,port,url,pid,owned | Format-Table -AutoSize
Write-Host "State: $StatePath"
