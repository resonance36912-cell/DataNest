# Resonance Open Nova - Zero-Credit Sovereign Development Platform v1.5.5

**Release:** `1.5.5-oneclick1`  
**Mode:** `zero-credit`  
**External AI default:** denied  
**Production cutover:** disabled

v1.5.5 removes the repeated extraction and folder-navigation failure from the Windows handoff. The new launcher can be double-clicked either in an extracted folder or directly from Windows Explorer's ZIP view.

## Start here on Windows

Download the ZIP, open it, and double-click:

```text
00-START-OPEN-NOVA.cmd
```

No manual **Extract All** step is required. When run from the ZIP view, the launcher locates the downloaded v1.5.5 archive, stages it in a temporary directory, verifies every packaged file against `BUILD_MANIFEST.json`, installs the verified copy under:

```text
%USERPROFILE%\Resonance\OpenNova\ResonanceAppDev_ZeroCredit_v1.5.5
```

It then starts `OPEN-NOVA-FIRST-RUN.cmd` from that verified local copy.

If the ZIP is not in Downloads, Desktop, or the corresponding OneDrive folders, a standard file picker opens so the operator can select it.

## First-run boundary

The first run may explicitly download only the pinned Python packages when the governed wheelhouse is empty. It does not:

- purchase or consume AI development credits;
- call external AI providers;
- download an AI model;
- modify the original Git repository;
- execute provider-source migration by default;
- enable production cutover.

After provisioning, normal strict-offline operation remains available through:

```text
OPEN-NOVA-OFFLINE.cmd
```

## Real repository workflow

The local workflow discovers or accepts the real Resonance Git repository, creates a governed copy, generates integrity and SBOM evidence, establishes a baseline and rollback checkpoint, and packages a source-free evidence bundle.

A successful run produces:

```text
exports\evidence-bundles\reson8-life-real-execution-evidence.zip
```

That evidence ZIP excludes application source, `.env` files, private keys, database contents, dependency caches, Git remotes, and absolute local PC paths.

## Governance guarantees

- External AI is denied by default.
- Production cutover remains disabled.
- The original repository is treated as read-only.
- Unsupported provider semantics stop for review rather than being guessed.
- Existing local v1.5.5 installations are preserved with timestamped `.previous-*` names before replacement.
- Package files are SHA-256 verified before the first-run launcher executes.
