param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][string]$FolderName
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$source = (Resolve-Path $SourcePath).Path
$destinationRoot = Join-Path $root "imports/projects"
$destination = Join-Path $destinationRoot $FolderName
if (Test-Path $destination) { throw "Migration staging destination already exists: $destination" }
New-Item -ItemType Directory -Force -Path $destinationRoot | Out-Null
Copy-Item -Recurse -Path $source -Destination $destination
Write-Host "Staged a COPY at imports/projects/$FolderName. The original source was not modified."
Write-Host "Open http://127.0.0.1:8787/builder and run Assess migration before importing."
