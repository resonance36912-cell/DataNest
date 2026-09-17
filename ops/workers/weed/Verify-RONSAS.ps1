$ErrorActionPreference = 'Stop'
$git = 'C:\Program Files\Git\cmd\git.exe'
$root = Join-Path $env:USERPROFILE 'Resonance\RONSAS'
$hub = Join-Path $root 'github\resonance-hub'
$ctl = Join-Path $root 'github\control-worker'
$audit = Join-Path $root 'audit'
$eal = Join-Path $root 'ealiophin-authority\latest-observed'
$expectedHub = 'ronsas/ealiophin-production'
$expectedCtl = 'main'
$report = [ordered]@{
  node = $env:COMPUTERNAME
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  hubBranch = (& $git -C $hub branch --show-current)
  hubHead = (& $git -C $hub rev-parse HEAD)
  hubDirty = @((& $git -C $hub status --porcelain)).Count
  controlBranch = (& $git -C $ctl branch --show-current)
  controlHead = (& $git -C $ctl rev-parse HEAD)
  controlDirty = @((& $git -C $ctl status --porcelain)).Count
  auditPresent = Test-Path $audit
  ealiophinSnapshotPresent = Test-Path $eal
}
$report['aligned'] = ($report.hubBranch -eq $expectedHub -and $report.controlBranch -eq $expectedCtl -and $report.hubDirty -eq 0 -and $report.controlDirty -eq 0 -and $report.auditPresent -and $report.ealiophinSnapshotPresent)
$report | ConvertTo-Json -Depth 3
if (-not $report.aligned) { exit 2 }
