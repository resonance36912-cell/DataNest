[CmdletBinding()]
param(
  [ValidateSet("assess","accounts")]
  [string]$Mode = "assess",
  [string]$StagingAuthUrl = "http://127.0.0.1:60680",
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $repoRoot ".ronsas\state\premium-credential-prereqs.json"
}

function Get-SecretPresence([string]$Name) {
  return -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))
}

function Get-HashPrefix([string]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [Security.Cryptography.SHA256]::HashData($bytes)
  return ([Convert]::ToHexString($hash)).Substring(0, 12).ToLowerInvariant()
}

$roles = @("EPUBLISHER","CREATIVE_STUDIO","SYNC_VISION","YOUTUBE_OPTIMIZER","BILLING")
$accountConfig = @()
foreach ($role in $roles) {
  $emailName = "RONSAS_TEST_" + $role + "_EMAIL"
  $passwordName = "RONSAS_TEST_" + $role + "_PASSWORD"
  $email = [Environment]::GetEnvironmentVariable($emailName)
  $password = [Environment]::GetEnvironmentVariable($passwordName)

  $accountConfig += [pscustomobject]@{
    role = $role.ToLowerInvariant().Replace("_","-")
    email_env = $emailName
    password_env = $passwordName
    configured = (-not [string]::IsNullOrWhiteSpace($email)) -and (-not [string]::IsNullOrWhiteSpace($password))
    identity_hash = if ($email) { Get-HashPrefix $email } else { $null }
    probe_ok = $null
  }
}

$payfastConfig = [ordered]@{
  merchant_id = Get-SecretPresence "RONSAS_PAYFAST_SANDBOX_MERCHANT_ID"
  merchant_key = Get-SecretPresence "RONSAS_PAYFAST_SANDBOX_MERCHANT_KEY"
  passphrase = Get-SecretPresence "RONSAS_PAYFAST_SANDBOX_PASSPHRASE"
}
$payfastConfigured = -not (@($payfastConfig.Keys | Where-Object { -not $payfastConfig[$_] }).Count)

$target = [Uri]$StagingAuthUrl
$allowedHosts = @("127.0.0.1","localhost","::1")
if ($target.Scheme -notin @("http","https") -or $target.Host.ToLowerInvariant() -notin $allowedHosts) {
  throw "Credential probes are restricted to loopback staging auth endpoints."
}

if ($Mode -eq "accounts") {
  $missing = @($accountConfig | Where-Object { -not $_.configured })
  if ($missing.Count -gt 0) {
    throw "Disposable-account credentials are incomplete. Supply the required RONSAS_TEST_<ROLE>_EMAIL/PASSWORD environment variables; secrets are never written to the report."
  }

  foreach ($account in $accountConfig) {
    $roleToken = $account.role.ToUpperInvariant().Replace("-","_")
    $email = [Environment]::GetEnvironmentVariable("RONSAS_TEST_" + $roleToken + "_EMAIL")
    $password = [Environment]::GetEnvironmentVariable("RONSAS_TEST_" + $roleToken + "_PASSWORD")
    $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress

    try {
      $response = Invoke-RestMethod -Method Post -Uri ($StagingAuthUrl.TrimEnd("/") + "/v1/auth/sign-in") -ContentType "application/json" -Body $body -TimeoutSec 8
      $account.probe_ok = [bool]$response.session
    } catch {
      $account.probe_ok = $false
    } finally {
      $body = $null
      $password = $null
      $email = $null
    }
  }
}

$accountsConfigured = -not (@($accountConfig | Where-Object { -not $_.configured }).Count)
$accountsProven = $Mode -eq "accounts" -and -not (@($accountConfig | Where-Object { $_.probe_ok -ne $true }).Count)

$report = [ordered]@{
  schema = "ronsas.premium-readiness.credential-prereqs.v1"
  captured_at_utc = (Get-Date).ToUniversalTime().ToString("o")
  mode = $Mode
  staging_auth = $StagingAuthUrl
  accounts = $accountConfig
  disposable_accounts_configured = $accountsConfigured
  disposable_accounts_proven = $accountsProven
  payfast_sandbox_fields = $payfastConfig
  payfast_sandbox_configured = $payfastConfigured
  payfast_sandbox_proven = $false
  note = "No passwords, keys, passphrases or session tokens are written to this report. PayFast remains unproven until an isolated end-to-end sandbox transaction is evidenced."
}

$reportDir = Split-Path $ReportPath -Parent
if ($reportDir) { New-Item -ItemType Directory -Force -Path $reportDir | Out-Null }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8

$accountConfig | Select-Object role,configured,identity_hash,probe_ok | Format-Table -AutoSize
Write-Output ""
Write-Output ("Disposable accounts configured: " + $accountsConfigured)
Write-Output ("Disposable accounts proven: " + $accountsProven)
Write-Output ("PayFast sandbox fields configured: " + $payfastConfigured)
Write-Output ("PayFast sandbox proven: False")
Write-Output ("Report: " + $ReportPath)

if ($Mode -eq "accounts" -and -not $accountsProven) { exit 1 }
exit 0
