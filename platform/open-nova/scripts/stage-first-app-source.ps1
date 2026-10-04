param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [string]$Alias = "reson8-life"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$source = (Resolve-Path $SourcePath).Path
$destination = Join-Path $root ("imports/projects/" + $Alias)
if (Test-Path $destination) { throw "Staging destination already exists: $destination" }

$all = @(Get-Item -Force $source) + @(Get-ChildItem -LiteralPath $source -Recurse -Force -ErrorAction Stop)
$links = @($all | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
if ($links.Count -gt 0) { throw "Staging refused: symlink/reparse-point content was found. Resolve links before migration." }
$secretPatterns = @('.env','.env.*','*.pem','*.key','*.p12','*.pfx','id_rsa','id_ed25519')
foreach ($item in $all | Where-Object { -not $_.PSIsContainer }) {
  foreach ($pattern in $secretPatterns) {
    if ($item.Name -like $pattern) { throw "Staging refused: secret-bearing file detected: $($item.FullName)" }
  }
}

New-Item -ItemType Directory -Force (Split-Path -Parent $destination) | Out-Null
Copy-Item -Recurse -LiteralPath $source -Destination $destination
Write-Host "Copy-only staging complete: $destination"
Write-Host "No source mutation, symlink traversal, or secret-bearing file staging was permitted."
Write-Host "Next: .\scripts\first-app-migration-plan.ps1 -AppId $Alias -Write"
