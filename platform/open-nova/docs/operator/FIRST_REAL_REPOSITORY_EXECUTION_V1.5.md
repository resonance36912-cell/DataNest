# First Real Repository Execution — Operator Guide

Start Open Nova locally:

```powershell
.\scripts\open-nova-workstation.ps1 -OpenBrowser
```

Assess the real repository without making changes:

```powershell
.\scripts\first-real-execution.ps1 -SourcePath "C:\path\to\real-repository" -AppId "reson8-life"
```

After reviewing the result, admit the copy-only snapshot:

```powershell
.\scripts\first-real-execution.ps1 -SourcePath "C:\path\to\real-repository" -AppId "reson8-life" -Admit
```

Prepare migration evidence (baseline plus rollback checkpoint):

```powershell
.\scripts\first-real-execution-prepare.ps1 -AppId "reson8-life" -Confirm
```

Execute only deterministic supported provider rewrites:

```powershell
.\scripts\first-real-execution-migrate.ps1 -AppId "reson8-life" -Confirm
```

Inspect readiness and evidence integrity:

```powershell
.\scripts\first-real-execution-status.ps1 -AppId "reson8-life"
.\scripts\first-real-execution-evidence.ps1 -AppId "reson8-life"
```

A blocked status is expected until the local container runner, backend services, isolated regression and loopback preview have been proven on the actual workstation. v1.5 does not alter production DNS, traffic or deployment targets.
