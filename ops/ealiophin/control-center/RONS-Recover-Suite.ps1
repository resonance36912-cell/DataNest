param([int]$Attempts=2,[int]$DelaySeconds=12)
$ErrorActionPreference='Continue'
$Root=Join-Path $env:USERPROFILE 'Resonance\OpenNova'
$Cluster=Join-Path $Root 'integrations\rons-cluster\START-RONSAS-ECOSYSTEM.ps1'
$Suite=Join-Path $Root 'runtime\launchers\START-RONS-SOVEREIGN-SUITE.cmd'
$Acceptance=Join-Path $Root 'runtime\FINAL-RONS-ACCEPTANCE.ps1'
$Log=Join-Path $env:LOCALAPPDATA 'Resonance\RONS-ControlCenter\logs\recovery.log'
function Log([string]$m){Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss')+' '+$m)}
for($i=1;$i -le $Attempts;$i++){
  Log "Recovery attempt $i/$Attempts started."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Cluster 2>&1 | Out-File -FilePath $Log -Append
  & cmd.exe /d /c ('"'+$Suite+'"') 2>&1 | Out-File -FilePath $Log -Append
  Start-Sleep -Seconds 6
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Acceptance 2>&1 | Tee-Object -FilePath $Log -Append | Out-Host
  if($LASTEXITCODE -eq 0){Log "Recovery attempt $i passed acceptance."; exit 0}
  Log "Recovery attempt $i failed acceptance."
  if($i -lt $Attempts){Start-Sleep -Seconds $DelaySeconds}
}
Log 'Recovery exhausted all attempts.'
exit 2
