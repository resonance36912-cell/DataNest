param(
    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Root)
$rootPrefix = $resolvedRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$manifestPath = Join-Path $resolvedRoot 'BUILD_MANIFEST.json'

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
        $stream.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Release manifest is missing: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$failures = @()
foreach ($entry in $manifest.files) {
    $relative = [string]$entry.path
    $candidate = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $relative))
    if (-not $candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        $failures += "$relative escaped the release root"
        continue
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $failures += "$relative is missing"
        continue
    }
    $file = Get-Item -LiteralPath $candidate
    if ([int64]$file.Length -ne [int64]$entry.bytes -or (Get-Sha256Hex -Path $candidate) -ne ([string]$entry.sha256).ToLowerInvariant()) {
        $failures += "$relative did not match its release manifest entry"
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    throw 'Open Nova release verification failed.'
}

Write-Host "Open Nova release manifest verified: $($manifest.files.Count) files." -ForegroundColor Green
