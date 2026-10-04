[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$Registry = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'RONSAS-MODULES.json') | ConvertFrom-Json

function Get-Health([string]$Uri) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 4
        return [pscustomobject]@{ healthy = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500); status = [int]$response.StatusCode }
    } catch {
        return [pscustomobject]@{ healthy = $false; status = $null }
    }
}

$rows = @()
foreach ($module in @($Registry.modules)) {
    $source = Join-Path $RepoRoot ([string]$module.source)
    $probe = Get-Health ([string]$module.health)
    $rows += [pscustomobject]@{
        id = [string]$module.id
        kind = [string]$module.kind
        required = [bool]$module.required
        sourcePresent = (Test-Path -LiteralPath $source)
        healthy = [bool]$probe.healthy
        httpStatus = $probe.status
        health = [string]$module.health
        source = [string]$module.source
    }
}

$result = [ordered]@{
    schema = 'datanest.ronsas.status.v1'
    repository = 'DataNest-Supository/DataNest'
    repoRoot = $RepoRoot
    checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    modules = $rows
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
} else {
    $rows | Format-Table id,kind,required,sourcePresent,healthy,httpStatus -AutoSize
}

$failed = @($rows | Where-Object { $_.required -and (-not $_.sourcePresent -or -not $_.healthy) })
if ($failed.Count -gt 0) {
    Write-Host ('[RONSAS] Required DataNest modules need attention: ' + (($failed | ForEach-Object id) -join ', ')) -ForegroundColor Red
    exit 1
}
Write-Host '[RONSAS] Required DataNest modules are healthy.' -ForegroundColor Green
