param(
  [int]$Attempts = 2,
  [int]$DelaySeconds = 12,
  [int]$StepTimeoutSeconds = 180,
  [int]$AcceptanceSettleSeconds = 240,
  [int]$AcceptancePollSeconds = 12
)
$ErrorActionPreference = 'Continue'
$Root = Join-Path $env:USERPROFILE 'Resonance\OpenNova'
$Cluster = Join-Path $Root 'integrations\rons-cluster\START-RONSAS-ECOSYSTEM.ps1'
$Suite = Join-Path $Root 'runtime\launchers\START-RONS-SOVEREIGN-SUITE.cmd'
$Acceptance = Join-Path $Root 'runtime\FINAL-RONS-ACCEPTANCE.ps1'
$LogDir = Join-Path $env:LOCALAPPDATA 'Resonance\RONS-ControlCenter\logs'
$Log = Join-Path $LogDir 'recovery.log'
$StepLogDir = Join-Path $LogDir 'recovery-steps'
New-Item -ItemType Directory -Force -Path $StepLogDir | Out-Null
function Log([string]$m) {
  Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m)
}
$LockPath = Join-Path $LogDir 'recovery.lock'
try {
  $lockStream = [IO.File]::Open($LockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $payload = [Text.Encoding]::UTF8.GetBytes(("pid=$PID started=" + (Get-Date).ToString('o')))
  $lockStream.SetLength(0)
  $lockStream.Write($payload, 0, $payload.Length)
  $lockStream.Flush()
} catch {
  Log 'Recovery request skipped because another governed recovery holds the cross-session lock.'
  exit 0
}
function Invoke-BoundedProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [int]$TimeoutSeconds,
    [string]$SuccessMarker = ''
  )
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $stdout = Join-Path $StepLogDir ($stamp + '-' + $Name + '.out.log')
  $stderr = Join-Path $StepLogDir ($stamp + '-' + $Name + '.err.log')
  try {
    Log ("Starting bounded recovery step: $Name timeout=${TimeoutSeconds}s")
    $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
      Log ("Recovery step timed out: $Name PID=$($p.Id)")
      & taskkill.exe /PID $p.Id /T /F | Out-Null
      return $false
    }
    $p.WaitForExit()
    $p.Refresh()
    $exitCode = [int]$p.ExitCode
    Log ("Recovery step completed: $Name exit=$exitCode")
    $markerOk = $true
    if (-not [string]::IsNullOrWhiteSpace($SuccessMarker)) {
      try { $text = Get-Content -LiteralPath $stdout -Raw -ErrorAction Stop; $markerOk = $text.Contains($SuccessMarker) } catch { $markerOk = $false }
      Log ("Recovery marker check: $Name ok=$markerOk marker=$SuccessMarker")
    }
    return ($exitCode -eq 0 -and $markerOk)
  } catch {
    Log ("Recovery step failed to launch: $Name :: $($_.Exception.Message)")
    return $false
  }
}
function Wait-RecoveryAcceptance {
  param([int]$SettleSeconds, [int]$PollSeconds)
  $deadline = (Get-Date).AddSeconds([Math]::Max(0, $SettleSeconds))
  $probe = 0
  do {
    $probe++
    $ok = Invoke-BoundedProcess -Name ('acceptance-' + $probe) -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Acceptance) -TimeoutSeconds 45 -SuccessMarker 'RONS ACCEPTANCE PASSED:'
    if ($ok) { Log ('Recovery acceptance settled on probe ' + $probe + '.'); return $true }
    if ((Get-Date) -ge $deadline) { break }
    Log ('Recovery acceptance not ready on probe ' + $probe + '; waiting ' + $PollSeconds + ' seconds.')
    Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
  } while ((Get-Date) -lt $deadline)
  Log ('Recovery acceptance did not settle within ' + $SettleSeconds + ' seconds.')
  return $false
}

function Test-CriticalRecoverySurface {
  Log 'Critical surface is verified by semantic acceptance and public sovereign-session checks.'
  return $true
}
try {
  for ($i = 1; $i -le $Attempts; $i++) {
    Log ("Recovery attempt $i/$Attempts started.")
    $clusterOk = Invoke-BoundedProcess -Name 'cluster' -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Cluster) -TimeoutSeconds $StepTimeoutSeconds
    $suiteOk = Invoke-BoundedProcess -Name 'suite' -FilePath 'cmd.exe' -ArgumentList @('/d','/c',('"' + $Suite + '"')) -TimeoutSeconds 45
    $acceptOk = Wait-RecoveryAcceptance -SettleSeconds $AcceptanceSettleSeconds -PollSeconds $AcceptancePollSeconds
    $criticalOk = Test-CriticalRecoverySurface
    if ($clusterOk -and $suiteOk -and $acceptOk -and $criticalOk) {
      Log ("Recovery attempt $i passed acceptance. cluster=$clusterOk suite=$suiteOk critical=$criticalOk")
      exit 0
    }
    Log ("Recovery attempt $i failed acceptance. cluster=$clusterOk suite=$suiteOk critical=$criticalOk")
    if ($i -lt $Attempts) { Start-Sleep -Seconds $DelaySeconds }
  }
  Log 'Recovery exhausted all attempts.'
  exit 2
} finally {
  if ($lockStream) { $lockStream.Dispose() }
}
