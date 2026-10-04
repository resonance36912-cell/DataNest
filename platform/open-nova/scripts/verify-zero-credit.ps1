$ErrorActionPreference = "Stop"
Write-Host "Resonance Sovereign Foundry - v0.9 verification"

$health = Invoke-RestMethod -Uri "http://localhost:8787/health" -Method Get
if ($health.external_ai_allowed -ne $false) { throw "FAIL: external AI is enabled" }
if ($health.coding_agent -ne "governed") { throw "FAIL: governed coding agent not active" }

$zero = Invoke-RestMethod -Uri "http://localhost:8787/v1/zero-credit-test" -Method Get
if ($zero.external_ai_denied -ne $true) { throw "FAIL: external AI governance denial is not active" }
if ($zero.passed -ne $true) { throw "FAIL: complete Zero-Credit Test requires local model + cached runner images + governance." }

$factoryBody = @{
  intent = "Create a sovereign verification application"
  app_name = "sovereign-factory-verification"
  template = "python-fastapi"
  strategy = "deterministic"
  overwrite = $true
  confirmed = $true
} | ConvertTo-Json
$factory = Invoke-RestMethod -Uri "http://localhost:8787/v1/factory/generate" -Method Post -ContentType "application/json" -Body $factoryBody
if ($factory.validated -ne $true) { throw "FAIL: Sovereign App Factory baseline did not validate" }
if ($factory.receipt.external_ai_used -ne $false) { throw "FAIL: factory verification used external AI" }
if ($factory.preview.host -ne "127.0.0.1") { throw "FAIL: preview is not loopback-only" }

$registry = Invoke-RestMethod -Uri "http://localhost:8787/v1/registry/verify" -Method Get
if ($registry.valid -ne $true) { throw "FAIL: sovereign app registry chain is invalid" }

$project = @{ project_dir = "apps/sovereign-factory-verification" } | ConvertTo-Json
$deps = Invoke-RestMethod -Uri "http://localhost:8787/v1/dependencies/check" -Method Post -ContentType "application/json" -Body $project
if ($deps.passed -ne $true) { throw "FAIL: dependency policy check failed" }
$security = Invoke-RestMethod -Uri "http://localhost:8787/v1/security/scan" -Method Post -ContentType "application/json" -Body $project
if ($security.passed -ne $true) { throw "FAIL: security scan failed" }

$supply = Invoke-RestMethod -Uri "http://localhost:8787/v1/supply-chain/generate" -Method Post -ContentType "application/json" -Body $project
if (-not $supply.evidence.tree_sha256) { throw "FAIL: supply-chain evidence was not generated" }
$integrity = Invoke-RestMethod -Uri "http://localhost:8787/v1/supply-chain/verify" -Method Post -ContentType "application/json" -Body $project
if ($integrity.valid -ne $true) { throw "FAIL: supply-chain integrity verification failed" }


$backend = Invoke-RestMethod -Uri "http://localhost:8787/v1/backend/validate" -Method Get
if ($backend.valid -ne $true) { throw "FAIL: sovereign backend runtime manifest is invalid" }
$backendHealth = Invoke-RestMethod -Uri "http://localhost:8787/v1/backend/health" -Method Get
if ($backendHealth.ready -eq $true) {
  Write-Host "PASS: sovereign backend services are reachable."
} else {
  Write-Warning "Sovereign backend services are not all running; backend certification remains blocked until local services start."
}

$runner = Invoke-RestMethod -Uri "http://localhost:8787/v1/runner/preflight" -Method Get
if ($runner.engine_found -eq $true) {
  $task = @{ project_dir = "apps/sovereign-factory-verification"; task = "python_compile" } | ConvertTo-Json
  $result = Invoke-RestMethod -Uri "http://localhost:8787/v1/runner/task" -Method Post -ContentType "application/json" -Body $task
  if ($result.returncode -ne 0) { throw "FAIL: isolated Python compile failed" }
  Write-Host "PASS: isolated runner executed with network denied."
} else {
  Write-Warning "Runner engine not found; factory/static governance passed but isolated execution was not tested."
}

Write-Host "PASS: Sovereign App Factory generated and validated a project."
Write-Host "PASS: external AI denied."
Write-Host "PASS: registry integrity verified."
Write-Host "PASS: dependency and security gates active."
Write-Host "PASS: SBOM and source-tree integrity evidence verified."
Write-Host "PASS: sovereign backend runtime policy validated."
Write-Host "Builder: http://127.0.0.1:8787/builder"
