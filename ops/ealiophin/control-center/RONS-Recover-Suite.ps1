param(
  [int]$Attempts = 2,
  [int]$DelaySeconds = 12,
  [int]$StepTimeoutSeconds = 75
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
    [int]$TimeoutSeconds
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
    return ($exitCode -eq 0)
  } catch {
    Log ("Recovery step failed to launch: $Name :: $($_.Exception.Message)")
    return $false
  }
}
try {
  for ($i = 1; $i -le $Attempts; $i++) {
    Log ("Recovery attempt $i/$Attempts started.")
    $clusterOk = Invoke-BoundedProcess -Name 'cluster' -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Cluster) -TimeoutSeconds $StepTimeoutSeconds
    $suiteOk = Invoke-BoundedProcess -Name 'suite' -FilePath 'cmd.exe' -ArgumentList @('/d','/c',('"' + $Suite + '"')) -TimeoutSeconds 45
    Start-Sleep -Seconds 6
    $acceptOk = Invoke-BoundedProcess -Name 'acceptance' -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Acceptance) -TimeoutSeconds 45
    if ($acceptOk) {
      Log ("Recovery attempt $i passed acceptance. cluster=$clusterOk suite=$suiteOk")
      exit 0
    }
    Log ("Recovery attempt $i failed acceptance. cluster=$clusterOk suite=$suiteOk")
    if ($i -lt $Attempts) { Start-Sleep -Seconds $DelaySeconds }
  }
  Log 'Recovery exhausted all attempts.'
  exit 2
} finally {
  if ($lockStream) { $lockStream.Dispose() }
}
