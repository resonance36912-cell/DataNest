[CmdletBinding()]
param(
    [string]$TopologyPath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $TopologyPath) {
    $repoLocal = Join-Path (Split-Path $PSScriptRoot -Parent) '.ronsas\topology.local.json'
    $besideScript = Join-Path $PSScriptRoot 'ronsas-topology.json'
    $repoExample = Join-Path (Split-Path $PSScriptRoot -Parent) '.ronsas\topology.example.json'

    if (Test-Path -LiteralPath $repoLocal) {
        $TopologyPath = $repoLocal
    }
    elseif (Test-Path -LiteralPath $besideScript) {
        $TopologyPath = $besideScript
    }
    else {
        $TopologyPath = $repoExample
    }
}

$TopologyPath = [Environment]::ExpandEnvironmentVariables($TopologyPath)
if (-not (Test-Path -LiteralPath $TopologyPath)) {
    throw "Topology manifest not found: $TopologyPath"
}

$topology = Get-Content -Raw -LiteralPath $TopologyPath | ConvertFrom-Json
$gitCommand = Get-Command git -ErrorAction SilentlyContinue

function Expand-RonsasPath {
    param([string]$Path)
    return [Environment]::ExpandEnvironmentVariables($Path)
}

function Invoke-GitText {
    param(
        [string]$Repository,
        [string[]]$Arguments
    )

    $text = & $gitCommand.Source -C $Repository @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return (($text | Out-String).Trim())
}

$pathChecks = foreach ($entry in $topology.paths) {
    $localPath = Expand-RonsasPath $entry.local_path
    [pscustomobject]@{
        id        = $entry.id
        role      = $entry.role
        path      = $localPath
        required  = [bool]$entry.required
        exists    = Test-Path -LiteralPath $localPath
        authority = $entry.authority
    }
}

$repositoryChecks = foreach ($entry in $topology.repositories) {
    $localPath = Expand-RonsasPath $entry.local_path
    $exists = Test-Path -LiteralPath $localPath
    $isRepository = $exists -and (Test-Path -LiteralPath (Join-Path $localPath '.git'))
    $branch = $null
    $head = $null
    $remote = $null
    $dirty = $null
    $ahead = $null
    $behind = $null

    if ($isRepository -and $gitCommand) {
        $branch = Invoke-GitText $localPath @('branch', '--show-current')
        $head = Invoke-GitText $localPath @('rev-parse', 'HEAD')
        $remoteNames = Invoke-GitText $localPath @('remote')
        if (@($remoteNames -split "`r?`n") -contains 'origin') {
            $remote = Invoke-GitText $localPath @('remote', 'get-url', 'origin')
        }
        $statusLines = & $gitCommand.Source -C $localPath status --porcelain 2>$null
        $dirty = @($statusLines).Count

        if ($branch -and $remote) {
            $remoteRef = "origin/$branch"
            $verifiedRemoteRef = Invoke-GitText $localPath @('rev-parse', '--verify', $remoteRef)
            if ($verifiedRemoteRef) {
                $counts = Invoke-GitText $localPath @('rev-list', '--left-right', '--count', "$remoteRef...HEAD")
                if ($counts -match '^(\d+)\s+(\d+)$') {
                    $behind = [int]$Matches[1]
                    $ahead = [int]$Matches[2]
                }
            }
        }
    }

    [pscustomobject]@{
        id            = $entry.id
        role          = $entry.role
        path          = $localPath
        required      = [bool]$entry.required
        exists        = $exists
        gitRepository = $isRepository
        branch        = $branch
        head          = $head
        remote        = $remote
        dirty         = $dirty
        ahead         = $ahead
        behind        = $behind
    }
}

$listenPorts = @{}
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $listenPorts[[int]$_.LocalPort] = $true
    }
}

$serviceChecks = foreach ($entry in $topology.services) {
    $listenPort = if ($entry.PSObject.Properties.Name -contains 'listen_port') {
        [int]$entry.listen_port
    }
    else {
        [int]$entry.port
    }

    [pscustomobject]@{
        id         = $entry.id
        name       = $entry.name
        port       = [int]$entry.port
        listenPort = $listenPort
        uri        = $entry.uri
        required   = [bool]$entry.required
        listening  = [bool]$listenPorts[$listenPort]
    }
}

$missingRequiredPaths = @($pathChecks | Where-Object { $_.required -and -not $_.exists })
$missingRequiredRepositories = @($repositoryChecks | Where-Object { $_.required -and -not $_.gitRepository })
$requiredServicesDown = @($serviceChecks | Where-Object { $_.required -and -not $_.listening })
$dirtyRepositories = @($repositoryChecks | Where-Object { $null -ne $_.dirty -and $_.dirty -gt 0 })

$summary = [pscustomobject]@{
    schema                      = 'ronsas-topology-status/v1'
    generatedAt                 = (Get-Date).ToString('o')
    host                        = $env:COMPUTERNAME
    topology                    = (Resolve-Path -LiteralPath $TopologyPath).Path
    status                      = if ($missingRequiredPaths.Count -or $missingRequiredRepositories.Count -or $requiredServicesDown.Count) { 'attention' } else { 'mapped' }
    missingRequiredPaths        = $missingRequiredPaths.Count
    missingRequiredRepositories = $missingRequiredRepositories.Count
    requiredServicesDown        = $requiredServicesDown.Count
    dirtyRepositories           = $dirtyRepositories.Count
    paths                       = @($pathChecks)
    repositories                = @($repositoryChecks)
    services                    = @($serviceChecks)
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    $summary | Select-Object generatedAt, host, status, missingRequiredPaths, missingRequiredRepositories, requiredServicesDown, dirtyRepositories | Format-List
    Write-Host 'Repositories'
    $repositoryChecks | Select-Object id, branch, dirty, ahead, behind, remote, path | Format-Table -AutoSize
    Write-Host 'Required paths'
    $pathChecks | Where-Object required | Select-Object id, exists, path | Format-Table -AutoSize
    Write-Host 'Services'
    $serviceChecks | Select-Object id, required, listening, listenPort, uri | Format-Table -AutoSize
}

if ($summary.status -ne 'mapped') {
    exit 2
}
