param([switch]$Once)

$ErrorActionPreference = 'Continue'
Set-StrictMode -Version Latest

$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content -Raw -LiteralPath (Join-Path $Base 'rons-control.json') | ConvertFrom-Json

# The dedicated ePublisher STT listener is a governed required service. Older
# local control configs predate port 7869, so keep the supervisor fail-safe
# even before the persisted config is reconciled.
$epublisherStt = @($Config.services | Where-Object {
    ([string]$_.key -eq 'epublisher-stt') -or ([int]$_.port -eq 7869)
}) | Select-Object -First 1
if ($epublisherStt) {
    $epublisherStt.required = $true
} else {
    $Config.services += [pscustomobject]@{
        key='epublisher-stt'
        name='ePublisher Speech-to-Text'
        port=7869
        required=$true
    }
}
$LogDir = Join-Path $Base 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$SupervisorLog = Join-Path $LogDir ('supervisor-' + (Get-Date -Format 'yyyyMMdd') + '.log')
$CommanderOut = Join-Path $LogDir 'desktop-commander.out.log'
$CommanderErr = Join-Path $LogDir 'desktop-commander.err.log'
$DropboxOut = Join-Path $LogDir 'dropbox.out.log'
$DropboxErr = Join-Path $LogDir 'dropbox.err.log'

function Log([string]$Message) {
    $dailyLog = Join-Path $LogDir ('supervisor-' + (Get-Date -Format 'yyyyMMdd') + '.log')
    Add-Content -LiteralPath $dailyLog -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Message) -Encoding UTF8
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\RONS_Autonomous_Supervisor', [ref]$created)
if (-not $created) { Log 'A supervisor instance is already running.'; exit 0 }

$commanderFailures = 0
$nextCommanderAttempt = [datetime]::MinValue
$runnerFailures = 0
$nextRunnerAttempt = [datetime]::MinValue
$windowsRunnerFailures = 0
$nextWindowsRunnerAttempt = [datetime]::MinValue
$chromeEnrollmentWarned = $false
$DefaultGitHubRunnerStartup = Join-Path $env:USERPROFILE 'Documents\GitHub\rons-sovereign-codebase\ops\ealiophin\ci\START-RONSAS-ACTIONS-RUNNER.ps1'
$DefaultWindowsRunnerInstaller = Join-Path $env:USERPROFILE 'Documents\GitHub\rons-sovereign-codebase\ops\ealiophin\ci\INSTALL-RONSAS-WINDOWS-RUNNER.ps1'
$DefaultWindowsRunnerRoot = Join-Path $env:LOCALAPPDATA 'Resonance\RONS-GitHubRunner-Windows'
$DefaultWindowsRunnerTask = 'RONSAS GitHub Windows Runner'

function Get-DesktopCommanderProcess {
    $entry = [regex]::Escape([string]$Config.remote.desktopCommanderEntry)
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.CommandLine -match $entry -and [string]$_.CommandLine -match '(?i)\sremote(?:\s|$)' } |
        Select-Object -First 1
}

function Test-SovereignGateway {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:58600/v1/auth/session' -TimeoutSec 5
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Ensure-RonsSuite {
    if (-not [bool]$Config.autonomy.ensureSuite) { return }
    $requiredDown = @($Config.services | Where-Object { $_.required -and $_.key -ne 'backend' } | Where-Object { -not (Get-NetTCPConnection -State Listen -LocalPort ([int]$_.port) -ErrorAction SilentlyContinue) })
    $gatewayDown = -not (Test-SovereignGateway)
    if ($requiredDown.Count -eq 0 -and -not $gatewayDown) { return }
    $launcher = [string]$Config.launchSuite
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { Log 'Suite launcher missing.'; return }
    $existing = Get-Process | Where-Object { $_.Path -like '*cmd.exe' }
    $downNames = @($requiredDown | ForEach-Object { $_.name })
    if ($gatewayDown) { $downNames += 'Sovereign Gateway' }
    Log ('Required services missing: ' + ($downNames -join ', ') + '. Requesting governed restart.')
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','C:\\Users\\Ashley\\AppData\\Local\\Resonance\\RONS-ControlCenter\\RONS-Recover-Suite.ps1') -WindowStyle Hidden | Out-Null
}
function Ensure-GitHubRunner {
    if ((Get-Date) -lt $script:nextRunnerAttempt) { return }

    $configured = ($Config.autonomy.PSObject.Properties.Name -contains 'ensureGitHubRunner')
    if ($configured -and -not [bool]$Config.autonomy.ensureGitHubRunner) { return }

    $startup = $null
    if (($Config.PSObject.Properties.Name -contains 'githubRunner') -and $Config.githubRunner) {
        $startup = [string]$Config.githubRunner.startupScript
    }

    # Older RONS control configs predate the runner supervisor hook. Reuse the
    # same governed launcher provisioned for the non-parameterized TRIGGERcmd
    # recovery command, but only when the operator has not explicitly disabled
    # ensureGitHubRunner.
    if ([string]::IsNullOrWhiteSpace($startup)) {
        $startup = $DefaultGitHubRunnerStartup
    }

    if (-not (Test-Path -LiteralPath $startup -PathType Leaf)) {
        if ($configured -and [bool]$Config.autonomy.ensureGitHubRunner) {
            Log ('GitHub runner startup script is missing: ' + $startup)
        }
        return
    }

    try {
        $source = Get-Content -Raw -LiteralPath $startup -ErrorAction Stop
        $requiredMarkers = @(
            'Runner.Worker',
            'Get-ActiveRunnerAssignments',
            'for ($settleAttempt = 1; $settleAttempt -le 18; $settleAttempt++)',
            'ForceRecycle deferred because online runner registration deletion was not proven safe.'
        )
        foreach ($marker in $requiredMarkers) {
            if (-not $source.Contains($marker)) {
                $script:runnerFailures++
                $delay = [math]::Min(
                    [int]$Config.autonomy.maxRestartBackoffSeconds,
                    [int](60 * [math]::Pow(2, [math]::Min($script:runnerFailures - 1, 5)))
                )
                $script:nextRunnerAttempt = (Get-Date).AddSeconds($delay)
                Log ("GitHub runner recovery authority is stale; missing safeguard marker '$marker'. Retry in $delay seconds.")
                return
            }
        }

        $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startup 2>&1)
        $exitCode = [int]$LASTEXITCODE
        if ($exitCode -eq 0) {
            $script:runnerFailures = 0
            $script:nextRunnerAttempt = [datetime]::MinValue
            return
        }

        $script:runnerFailures++
        $delay = [math]::Min(
            [int]$Config.autonomy.maxRestartBackoffSeconds,
            [int](60 * [math]::Pow(2, [math]::Min($script:runnerFailures - 1, 5)))
        )
        $script:nextRunnerAttempt = (Get-Date).AddSeconds($delay)
        $tail = @($output | Select-Object -Last 5) -join ' | '
        Log ("GitHub runner recovery failed (exit=$exitCode); retry in $delay seconds: $tail")
    } catch {
        $script:runnerFailures++
        $delay = [math]::Min(
            [int]$Config.autonomy.maxRestartBackoffSeconds,
            [int](60 * [math]::Pow(2, [math]::Min($script:runnerFailures - 1, 5)))
        )
        $script:nextRunnerAttempt = (Get-Date).AddSeconds($delay)
        Log ('GitHub runner recovery failed: ' + $_.Exception.Message + "; retry in $delay seconds.")
    }
}

function Ensure-WindowsGitHubRunner {
    if ((Get-Date) -lt $script:nextWindowsRunnerAttempt) { return }

    $overallConfigured = ($Config.autonomy.PSObject.Properties.Name -contains 'ensureGitHubRunner')
    if ($overallConfigured -and -not [bool]$Config.autonomy.ensureGitHubRunner) { return }

    $windowsConfigured = ($Config.autonomy.PSObject.Properties.Name -contains 'ensureWindowsGitHubRunner')
    if ($windowsConfigured -and -not [bool]$Config.autonomy.ensureWindowsGitHubRunner) { return }

    # Do not introduce a Windows runner onto a host that never had one.
    $existingTask = Get-ScheduledTask -TaskName $DefaultWindowsRunnerTask -ErrorAction SilentlyContinue
    $existingRoot = Test-Path -LiteralPath $DefaultWindowsRunnerRoot -PathType Container
    if (-not $existingTask -and -not $existingRoot) { return }

    $installer = $DefaultWindowsRunnerInstaller
    if (($Config.PSObject.Properties.Name -contains 'githubWindowsRunner') -and $Config.githubWindowsRunner) {
        $configuredInstaller = [string]$Config.githubWindowsRunner.installerScript
        if (-not [string]::IsNullOrWhiteSpace($configuredInstaller)) {
            $installer = $configuredInstaller
        }
    }

    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        if ($windowsConfigured -and [bool]$Config.autonomy.ensureWindowsGitHubRunner) {
            Log ('Windows GitHub runner installer is missing: ' + $installer)
        }
        return
    }

    try {
        $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer 2>&1)
        $exitCode = [int]$LASTEXITCODE
        if ($exitCode -eq 0) {
            $script:windowsRunnerFailures = 0
            $script:nextWindowsRunnerAttempt = [datetime]::MinValue
            return
        }

        $script:windowsRunnerFailures++
        $delay = [math]::Min(
            [int]$Config.autonomy.maxRestartBackoffSeconds,
            [int](60 * [math]::Pow(2, [math]::Min($script:windowsRunnerFailures - 1, 5)))
        )
        $script:nextWindowsRunnerAttempt = (Get-Date).AddSeconds($delay)
        $tail = @($output | Select-Object -Last 5) -join ' | '
        Log ("Windows GitHub runner recovery failed (exit=$exitCode); retry in $delay seconds: $tail")
    } catch {
        $script:windowsRunnerFailures++
        $delay = [math]::Min(
            [int]$Config.autonomy.maxRestartBackoffSeconds,
            [int](60 * [math]::Pow(2, [math]::Min($script:windowsRunnerFailures - 1, 5)))
        )
        $script:nextWindowsRunnerAttempt = (Get-Date).AddSeconds($delay)
        Log ('Windows GitHub runner recovery failed: ' + $_.Exception.Message + "; retry in $delay seconds.")
    }
}

function Ensure-Dropbox {
    if (-not [bool]$Config.autonomy.ensureDropbox) { return }
    if (@(Get-Process -Name Dropbox -ErrorAction SilentlyContinue).Count) { return }
    if (Test-Path -LiteralPath $Config.dropboxExe -PathType Leaf) {
        Log 'Dropbox was not running; starting the installed client.'
        Start-Process -FilePath $Config.dropboxExe -WorkingDirectory (Split-Path -Parent ([string]$Config.dropboxExe)) -WindowStyle Hidden -RedirectStandardOutput $DropboxOut -RedirectStandardError $DropboxErr | Out-Null
    } else { Log 'Dropbox executable is missing.' }
}

function Ensure-ChromeRemoteDesktop {
    if (-not [bool]$Config.autonomy.ensureChromeRemoteDesktop) { return }
    $service = Get-Service -Name 'chromoting' -ErrorAction SilentlyContinue
    if (-not $service) { Log 'Chrome Remote Desktop host is not installed.'; return }
    $programData = if ($env:ProgramData) { $env:ProgramData } else { [Environment]::GetFolderPath('CommonApplicationData') }
    $hostConfig = Join-Path $programData 'Google\Chrome Remote Desktop\host.json'
    if (-not (Test-Path -LiteralPath $hostConfig -PathType Leaf)) {
        if (-not $script:chromeEnrollmentWarned) {
            Log 'Chrome Remote Desktop is installed but requires interactive enrollment; service was not forced on.'
            $script:chromeEnrollmentWarned = $true
        }
        return
    }
    $script:chromeEnrollmentWarned = $false
    if ($service.Status -ne 'Running') {
        try { Start-Service -Name 'chromoting' -ErrorAction Stop; Log 'Chrome Remote Desktop service started.' }
        catch { Log ('Chrome Remote Desktop could not start: ' + $_.Exception.Message) }
    }
}

function Ensure-DesktopCommander {
    if (-not [bool]$Config.autonomy.ensureDesktopCommander) { return }
    if (Get-DesktopCommanderProcess) { $script:commanderFailures = 0; return }
    if ((Get-Date) -lt $script:nextCommanderAttempt) { return }
    if (-not (Test-Path -LiteralPath $Config.remote.desktopCommanderEntry -PathType Leaf)) {
        Log 'Pinned Desktop Commander entry point is missing.'
        return
    }
    if (-not (Test-Path -LiteralPath $Config.remote.desktopCommanderDeviceConfig -PathType Leaf)) {
        Log 'Desktop Commander requires interactive device authorization; unattended start skipped.'
        return
    }
    try {
        Start-Process -FilePath 'node.exe' -ArgumentList @([string]$Config.remote.desktopCommanderEntry,'remote') -WorkingDirectory $Base -WindowStyle Hidden -RedirectStandardOutput $CommanderOut -RedirectStandardError $CommanderErr | Out-Null
        Start-Sleep -Seconds 6
        if (Get-DesktopCommanderProcess) {
            $script:commanderFailures = 0
            Log ('Desktop Commander remote started with pinned version ' + [string]$Config.remote.desktopCommanderVersion + '.')
        } else {
            $script:commanderFailures++
            $delay = [math]::Min([int]$Config.autonomy.maxRestartBackoffSeconds, [int](30 * [math]::Pow(2, [math]::Min($script:commanderFailures - 1, 5))))
            $script:nextCommanderAttempt = (Get-Date).AddSeconds($delay)
            Log "Desktop Commander exited; next retry in $delay seconds."
        }
    } catch {
        $script:commanderFailures++
        $delay = [math]::Min([int]$Config.autonomy.maxRestartBackoffSeconds, [int](30 * [math]::Pow(2, [math]::Min($script:commanderFailures - 1, 5))))
        $script:nextCommanderAttempt = (Get-Date).AddSeconds($delay)
        Log ('Desktop Commander launch failed: ' + $_.Exception.Message + "; retry in $delay seconds.")
    }
}

try {
    Log 'Supervisor started.'
    do {
        Ensure-GitHubRunner
        Ensure-WindowsGitHubRunner
        Ensure-Dropbox
        Ensure-ChromeRemoteDesktop
        Ensure-DesktopCommander
        Ensure-RonsSuite
        if ([bool]$Config.autonomy.ensurePublicEdge) { & (Join-Path $Base 'RONS-Ensure-Public-Edge.ps1') }
        if ($Once) { break }
        Start-Sleep -Seconds ([int]$Config.autonomy.pollSeconds)
    } while ($true)
} finally {
    Log 'Supervisor stopped.'
    if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() }
}
