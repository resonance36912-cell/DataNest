param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = (Join-Path $PSScriptRoot "bridge-agent.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RequiredEnv([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required environment variable: $Name"
  }
  return $value
}

$SupabaseUrl = (Get-RequiredEnv "SUPABASE_URL").TrimEnd("/")
$PublishableKey = Get-RequiredEnv "SUPABASE_PUBLISHABLE_KEY"
$AccessToken = Get-RequiredEnv "RONSAS_BRIDGE_ACCESS_TOKEN"
$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json -Depth 20
$deviceId = [string]$config.deviceId

if ($deviceId -notmatch '^[0-9a-fA-F-]{36}$') {
  throw "bridge-agent.json must contain a real paired deviceId"
}

$headers = @{
  "apikey" = $PublishableKey
  "Authorization" = "Bearer $AccessToken"
  "Content-Type" = "application/json"
}

function Invoke-BridgeRpc([string]$FunctionName, [hashtable]$Body) {
  $uri = "$SupabaseUrl/rest/v1/rpc/$FunctionName"
  $json = $Body | ConvertTo-Json -Depth 30 -Compress
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $json
}

function Get-Workspace([string]$WorkspaceId) {
  if ([string]::IsNullOrWhiteSpace($WorkspaceId)) {
    throw "workspace_required"
  }
  $property = $config.workspaces.PSObject.Properties[$WorkspaceId]
  if ($null -eq $property) {
    throw "workspace_not_allowed"
  }
  $workspace = $property.Value
  $root = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables([string]$workspace.path))
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    throw "workspace_missing"
  }
  return [PSCustomObject]@{ Id = $WorkspaceId; Root = $root; Config = $workspace }
}

function Assert-SafePatch([string]$Patch) {
  $denied = @(
    '(^|/|\\)\.env($|\.)',
    '(^|/|\\)secrets?(/|\\)',
    '(^|/|\\)\.git(/|\\)',
    '(^|/|\\)\.ssh(/|\\)',
    '(^|/|\\)\.cloudflared(/|\\)',
    '(^|/|\\)\.aws(/|\\)',
    '(^|/|\\)\.npmrc$'
  )
  foreach ($line in ($Patch -split "`n")) {
    if ($line -notmatch '^(---|\+\+\+)\s+[ab]/(.+)$') { continue }
    $relative = $Matches[2].Trim()
    if ($relative -match '(^|/|\\)\.\.(/|\\|$)') {
      throw "patch_path_traversal_denied"
    }
    foreach ($pattern in $denied) {
      if ($relative -match $pattern) {
        throw "patch_sensitive_path_denied:$relative"
      }
    }
  }
}

function Invoke-FixedCommand($Workspace, [string]$JobType) {
  $commands = $Workspace.Config.commands
  $property = $commands.PSObject.Properties[$JobType]
  if ($null -eq $property) {
    throw "job_type_not_configured:$JobType"
  }
  $parts = @($property.Value)
  if ($parts.Count -lt 1) { throw "empty_job_command" }
  $exe = [string]$parts[0]
  $args = @()
  if ($parts.Count -gt 1) { $args = @($parts[1..($parts.Count - 1)]) }
  Push-Location $Workspace.Root
  try {
    $output = & $exe @args 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
      throw "command_failed($LASTEXITCODE): $($output.Substring(0, [Math]::Min($output.Length, 6000)))"
    }
    return @{ output = $output.Substring(0, [Math]::Min($output.Length, 12000)); exitCode = 0 }
  } finally {
    Pop-Location
  }
}

function Invoke-WorkspaceInspect($Workspace, [string]$Request) {
  Push-Location $Workspace.Root
  try {
    $status = & git status --short --branch 2>&1 | Out-String
    $diff = & git diff --stat 2>&1 | Out-String
    $files = Get-ChildItem -LiteralPath $Workspace.Root -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object {
        $_.FullName -notmatch '\\(node_modules|dist|build|\.git|\.cache)\\'
      } |
      Select-Object -First 250 -ExpandProperty FullName |
      ForEach-Object { $_.Substring($Workspace.Root.Length).TrimStart("\\") }
    return @{
      request = $Request
      gitStatus = $status.Substring(0, [Math]::Min($status.Length, 6000))
      diffStat = $diff.Substring(0, [Math]::Min($diff.Length, 6000))
      files = @($files)
    }
  } finally {
    Pop-Location
  }
}

function Invoke-ApplyPatch($Workspace, [string]$Patch) {
  Assert-SafePatch $Patch
  $temp = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($temp, $Patch, [Text.UTF8Encoding]::new($false))
    Push-Location $Workspace.Root
    try {
      & git apply --check --whitespace=error-all -- $temp 2>&1 | Out-String | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "git_apply_check_failed" }
      & git apply --whitespace=error-all -- $temp 2>&1 | Out-String | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "git_apply_failed" }
      $status = & git status --short 2>&1 | Out-String
      $diff = & git diff --stat 2>&1 | Out-String
      return @{ gitStatus = $status; diffStat = $diff }
    } finally {
      Pop-Location
    }
  } finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  }
}

function Assert-BrowserUrl([string]$Url) {
  $uri = [Uri]$Url
  $host = $uri.Host.ToLowerInvariant()
  if ($uri.Scheme -notin @("http", "https")) { throw "browser_scheme_denied" }
  if ($host -ne "localhost" -and $host -ne "127.0.0.1" -and
      $host -ne "reson8.life" -and -not $host.EndsWith(".reson8.life")) {
    throw "browser_host_denied"
  }
  return $uri
}

function Invoke-BrowserTest($Workspace, [string]$Url, [string]$Scenario) {
  $uri = Assert-BrowserUrl $Url
  $edgeCandidates = @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  $edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $edge) { throw "edge_not_found" }
  $artifactDir = Join-Path $Workspace.Root ".ronsas\bridge-artifacts"
  New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
  $name = "browser-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ".png"
  $shot = Join-Path $artifactDir $name
  & $edge --headless --disable-gpu --hide-scrollbars "--screenshot=$shot" "--window-size=1440,1000" $uri.AbsoluteUri 2>&1 | Out-String | Out-Null
  if (-not (Test-Path -LiteralPath $shot)) { throw "browser_screenshot_failed" }
  return @{
    url = $uri.AbsoluteUri
    scenario = $Scenario
    screenshot = $shot
    note = "v1 browser_test captures the requested page; scripted scenario execution will be added behind the same allowlist."
  }
}

function Invoke-PreviewCreate($Workspace, [string]$Ref) {
  $preview = $Workspace.Config.preview
  if ($null -eq $preview) { throw "preview_not_configured" }
  $command = [string]$preview.command
  $args = @($preview.args)
  $process = Start-Process -FilePath $command -ArgumentList $args -WorkingDirectory $Workspace.Root -PassThru -WindowStyle Hidden
  return @{ processId = $process.Id; ref = $Ref; production = $false }
}

function Invoke-BridgeJob($Job) {
  $workspace = $null
  if ($null -ne $Job.workspace) { $workspace = Get-Workspace ([string]$Job.workspace) }

  switch ([string]$Job.tool_name) {
    "workspace_inspect" {
      return Invoke-WorkspaceInspect $workspace ([string]$Job.payload.request)
    }
    "workspace_apply_patch" {
      return Invoke-ApplyPatch $workspace ([string]$Job.payload.patch)
    }
    "job_start" {
      return Invoke-FixedCommand $workspace ([string]$Job.payload.job_type)
    }
    "browser_test" {
      return Invoke-BrowserTest $workspace ([string]$Job.payload.url) ([string]$Job.payload.scenario)
    }
    "preview_create" {
      return Invoke-PreviewCreate $workspace ([string]$Job.payload.ref)
    }
    default {
      throw "tool_not_supported_by_connector:$($Job.tool_name)"
    }
  }
}

Write-Host "RONSAS Bridge Agent starting for device $deviceId"
while ($true) {
  try {
    Invoke-BridgeRpc "bridge_connector_heartbeat" @{ _device_id = $deviceId } | Out-Null
    $job = Invoke-BridgeRpc "bridge_connector_claim_job" @{ _device_id = $deviceId }
    if ($null -eq $job) {
      Start-Sleep -Seconds ([int]$config.pollSeconds)
      continue
    }

    try {
      $result = Invoke-BridgeJob $job
      Invoke-BridgeRpc "bridge_connector_complete_job" @{
        _device_id = $deviceId
        _job_id = [string]$job.id
        _ok = $true
        _result = $result
        _error = $null
      } | Out-Null
    } catch {
      Invoke-BridgeRpc "bridge_connector_complete_job" @{
        _device_id = $deviceId
        _job_id = [string]$job.id
        _ok = $false
        _result = $null
        _error = $_.Exception.Message
      } | Out-Null
    }
  } catch {
    Write-Warning $_.Exception.Message
    Start-Sleep -Seconds ([Math]::Max(3, [int]$config.pollSeconds))
  }
}
