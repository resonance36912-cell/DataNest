# Real Execution Evidence Handoff — v1.5.2

## Purpose

This handoff bridges the final gap between a real local Resonance repository run and analysis in ChatGPT when direct repository access is unavailable.

The evidence package is **not a source-code export**. Its purpose is to show what Open Nova actually observed: repository admission state, migration blockers, provider findings, runtime readiness, supply-chain evidence and governance receipts.

## Preferred workflow

```powershell
.\scripts\run-and-package-first-real.ps1 `
  -RepositoryPath "C:\path\to\ResonanceAppDev" `
  -AppId "reson8-life" `
  -OpenBrowser
```

After completion, upload:

```text
exports\evidence-bundles\reson8-life-real-execution-evidence.zip
```

## Evidence-only collection

If the real execution was already performed:

```powershell
.\scripts\collect-first-real-evidence.ps1 -AppId "reson8-life"
```

The script creates the ZIP and immediately verifies its internal SHA-256 manifest.

## What is collected

Only JSON evidence from these controlled roots may be considered:

- `runtime/real-execution/`
- `runtime/source-ingestion/`
- `runtime/migration-execution/`
- `runtime/cutover/`
- `runtime/workstation/`
- `runtime/deployment/`
- `runtime/supply-chain/`
- `runtime/backend-runtime/`
- `exports/operator-reports/`

App-scoped runtime roots are filtered to the selected application ID.

## What is denied

The packager never traverses or bundles:

- `apps/`
- `imports/`
- `runtime/secrets/`
- `.git/`
- `node_modules/`
- dependency caches or artifact inboxes
- arbitrary logs or non-JSON files

## Redaction rules

Before writing evidence into the handoff bundle:

1. secret/password/token/API-key/private-key/credential fields are replaced with `[REDACTED]`;
2. absolute workstation paths are removed;
3. email addresses are replaced with `[redacted-email]`;
4. external HTTP(S) URLs are replaced with `[redacted-external-url]`;
5. loopback URLs are retained only without query/fragment data;
6. known token forms such as OpenAI/GitHub/AWS/JWT-like values are removed.

## Integrity

`MANIFEST.json` records the SHA-256 digest and byte size of each included file plus an aggregate digest. Verification fails if any included evidence is changed after packaging.

Manual verification:

```powershell
$python = ".\.resonance-venv\Scripts\python.exe"
& $python .\scripts\evidence-handoff.py `
  --verify .\exports\evidence-bundles\reson8-life-real-execution-evidence.zip
```

A valid result reports `"valid": true`.

## Governance boundary

Packaging evidence does not:

- modify the original repository;
- execute a provider migration;
- start production traffic;
- upload anything automatically;
- enable external AI;
- expose source code by default.

The operator explicitly uploads the final evidence ZIP to ChatGPT when ready.
