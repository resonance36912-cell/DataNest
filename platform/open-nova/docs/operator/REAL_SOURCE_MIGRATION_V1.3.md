# v1.3 Operator Runbook — First Real Resonance Application

The default first pilot is `reson8-life`. Replace the source path below with the actual exported/cloned source directory on the local machine.

## 1. Start Open Nova offline

```powershell
.\scripts\start-open-nova-offline.ps1 -OpenBrowser
```

## 2. Record local-machine readiness

```powershell
.\scripts\local-pc-preflight.ps1 -WriteEvidence
```

## 3. Stage the real source through the controller

```powershell
.\scripts\source-ingest-local.ps1 -SourcePath "C:\path\to\reson8-life" -AppId "reson8-life"
.\scripts\source-ingestion-status.ps1 -AppId "reson8-life"
```

Staging is copy-only. The source tree is rejected if secret-bearing files or symlink/reparse-point content is present. Existing staged/managed destinations are not overwritten.

## 4. Import a governed copy

```powershell
.\scripts\source-import-governed.ps1 -AppId "reson8-life"
```

This creates `apps/reson8-life`, writes migration metadata, and generates/validates supply-chain evidence. The original source remains untouched.

## 5. Prepare provider migration

```powershell
.\scripts\migration-execution-prepare.ps1 -AppId "reson8-life"
```

Preparation records a real-source baseline and verified rollback checkpoint before any provider-source rewrite.

## 6. Execute only supported deterministic rewrites

```powershell
.\scripts\migration-execution-run-supported.ps1 -AppId "reson8-life"
```

If ambiguous or unsupported provider behavior is detected, execution stops. Open Nova does not ask a model to guess semantic equivalence.

## 7. Verify migration state

```powershell
.\scripts\migration-execution-verify.ps1 -AppId "reson8-life"
```

Then continue through inherited v1.2 local cutover checks:

```powershell
.\scripts\cutover-regression.ps1 -AppId "reson8-life"
.\scripts\cutover-preview.ps1 -AppId "reson8-life" -Url "http://127.0.0.1:4310/"
.\scripts\cutover-plan.ps1 -AppId "reson8-life"
.\scripts\cutover-certify-local.ps1 -AppId "reson8-life"
```

## 8. Roll back a deterministic provider rewrite if required

Use the `migration_id` returned by the execution step:

```powershell
.\scripts\migration-execution-rollback.ps1 -AppId "reson8-life" -MigrationId "<migration-id>"
```

Rollback refuses to overwrite files changed after migration. Production cutover remains disabled.
