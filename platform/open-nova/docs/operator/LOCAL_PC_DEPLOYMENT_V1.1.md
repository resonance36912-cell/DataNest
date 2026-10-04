# Local PC Deployment — v1.1

## 1. Extract

Extract the v1.1 package into the intended sovereign workspace. Keep it on a local disk with sufficient free space for repositories, dependency artifacts, models and backend volumes.

## 2. Provision deliberately

Provision Python wheels, runner/base images and an optional Ollama model while network access is deliberately enabled. Once cached, strict offline operation must not pull them again.

## 3. Start Zero-Credit mode

```powershell
.\scripts\start-open-nova-offline.ps1 -OpenBrowser
```

Use `-RequireLocalAI` only when the local coding model is required. Deterministic application generation does not need Ollama.

## 4. Record machine evidence

```powershell
.\scripts\local-pc-preflight.ps1 -WriteEvidence
```

Resolve every blocker reported by the local machine itself. Do not manually change the evidence ledger.

## 5. Backend runtime

Use the existing backend scripts to initialize local secrets, build from already-cached artifacts, generate runtime configuration and start the local services. Re-run preflight and backend health after startup.

## 6. First app

Use `reson8-life` as the default pilot unless governance deliberately chooses a different declared suite app. Stage a copy of its source under `imports/projects/`, assess it, and follow the generated first-app plan.

## 7. Certification

Do not issue operational sovereignty certification until all critical gates are backed by real local evidence. Release Candidate integrity and operational sovereignty are separate certifications.
