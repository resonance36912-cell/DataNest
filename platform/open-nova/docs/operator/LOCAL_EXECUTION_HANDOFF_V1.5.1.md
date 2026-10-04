# Local Execution Handoff — v1.5.1

This patch exists to execute the first real-repository workflow when the ChatGPT GitHub connector cannot see the repository.

## One-command path

From the extracted Open Nova folder:

```powershell
.\scripts\run-first-real-local.ps1 -OpenBrowser
```

The launcher attempts to find a unique local `ResonanceAppDev` / Resonance Git repository. If discovery is ambiguous, it stops instead of guessing. Supply the path explicitly:

```powershell
.\scripts\run-first-real-local.ps1 `
  -RepositoryPath "C:\path\to\ResonanceAppDev" `
  -OpenBrowser
```

By default the workflow:

1. starts the loopback-only Open Nova control plane if needed;
2. assesses the real repository;
3. admits a copy-only governed snapshot;
4. records source integrity/SBOM evidence;
5. creates the real-source baseline;
6. creates the verified rollback checkpoint;
7. writes a readiness report under `exports/operator-reports/`;
8. performs no production cutover and no provider rewrite.

Use `-AssessOnly` to make no admission copy. Provider rewriting remains a separate explicit action:

```powershell
.\scripts\run-first-real-local.ps1 `
  -RepositoryPath "C:\path\to\ResonanceAppDev" `
  -ExecuteSupportedMigration
```

Only deterministic supported migration is attempted. Unsupported/ambiguous provider semantics remain blockers.

## Privacy and sovereignty

The generated handoff report stores the repository **name** and Git commit SHA, not the absolute source path or Git remote URL. The original repository is never modified by the Open Nova admission workflow.
