[CmdletBinding()]
param(
    [switch]$Once,
    [int]$PollSeconds = 30,
    [int]$MaxBackoffSeconds = 300
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$RegistryPath = Join-Path $PSScriptRoot 'RONSAS-MODULES.json'
$StartScript = Join-Path $PSScriptRoot 'START-RONSAS-DATANEST.ps1'
$RuntimeRoot = if ($env:DATANEST_RONSAS_RUNTIME_ROOT) {
    [System.IO.Path]::GetFullPath($env:DATANEST_RONSAS_RUNTIME_ROOT)
} else {
    Join-Path $env:LOCALAPPDATA 'Resonance\DataNest-RONSAS'
}
$LogRoot = Join-Path $RuntimeRoot 'logs'
$LogPath = Join-Path $LogRoot 'supervisor.log'
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

function Write-SupervisorLog([string]$Message) {
    $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Host $line
}

function Test-Health([string]$Uri) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 4
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Get-RequiredFailures {
    $registry = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
    if ([string]$registry.repository -ne 'DataNest-Supository/DataNest') {
        throw 'RONSAS supervisor refuses non-DataNest source authority.'
    }

    $failures = @()
    foreach ($module in @($registry.modules | Where-Object { [bool]$_.required })) {
        $source = Join-Path $RepoRoot ([string]$module.source)
        $sourcePresent = Test-Path -LiteralPath $source
        $healthy = Test-Health ([string]$module.health)
        if (-not $sourcePresent -or -not $healthy) {
            $failures += [pscustomobject]@{
                id = [string]$module.id
                sourcePresent = [bool]$sourcePresent
                healthy = [bool]$healthy
                health = [string]$module.health
            }
        }
    }
    return @($failures)
}

if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) {
    throw "DataNest RONSAS module registry is missing: $RegistryPath"
}
if (-not (Test-Path -LiteralPath $StartScript -PathType Leaf)) {
    throw "DataNest RONSAS start script is missing: $StartScript"
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\DataNest_RONSAS_Supervisor', [ref]$created)
if (-not $created) {
    Write-SupervisorLog 'Another DataNest RONSAS supervisor is already running.'
    exit 0
}

$failureCount = 0
$nextRecovery = [datetime]::MinValue

try {
    Write-SupervisorLog "Supervisor started. repo=$RepoRoot"
    do {
        $failures = @(Get-RequiredFailures)
        if ($failures.Count -eq 0) {
            if ($failureCount -gt 0) {
                Write-SupervisorLog 'All required RONSAS modules are healthy again.'
            }
            $failureCount = 0
            $nextRecovery = [datetime]::MinValue
        } elseif ((Get-Date) -ge $nextRecovery) {
            $ids = ($failures | ForEach-Object { $_.id }) -join ', '
            Write-SupervisorLog "Required modules need recovery: $ids"
            try {
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript *>> $LogPath
                $exitCode = [int]$LASTEXITCODE
            } catch {
                $exitCode = 1
                Write-SupervisorLog ("Recovery launch failed: " + $_.Exception.Message)
            }

            $post = @(Get-RequiredFailures)
            if ($exitCode -eq 0 -and $post.Count -eq 0) {
                Write-SupervisorLog 'Governed DataNest RONSAS recovery succeeded.'
                $failureCount = 0
                $nextRecovery = [datetime]::MinValue
            } else {
                $failureCount++
                $delay = [math]::Min(
                    [math]::Max(30, $MaxBackoffSeconds),
                    [int](30 * [math]::Pow(2, [math]::Min($failureCount - 1, 4)))
                )
                $nextRecovery = (Get-Date).AddSeconds($delay)
                $remaining = ($post | ForEach-Object { $_.id }) -join ', '
                Write-SupervisorLog "Recovery incomplete (exit=$exitCode). Remaining=$remaining. Retry in $delay seconds."
            }
        }

        if ($Once) { break }
        Start-Sleep -Seconds ([math]::Max(10, $PollSeconds))
    } while ($true)
} finally {
    Write-SupervisorLog 'Supervisor stopped.'
    if ($mutex) {
        $mutex.ReleaseMutex()
        $mutex.Dispose()
    }
}
