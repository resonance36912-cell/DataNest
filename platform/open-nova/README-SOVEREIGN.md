# Resonance Open Nova v1.5.8

**Release:** `1.5.8`  
**Mode:** Zero-Credit  
**External AI default:** denied  
**Automatic production cutover:** disabled

v1.5.8 resumes the Windows setup automatically. It keeps the zero-extraction launcher and governed prebuilt-wheel-only runtime, detects the real CPython 3.13 executable directly, rejects the Microsoft WindowsApps alias, and can use Windows Package Manager during the explicit first run to install CPython 3.13 and Git when they are missing.

## Start on Windows

Open the downloaded ZIP and double-click:

```text
00-START-OPEN-NOVA.cmd
```

The launcher supports both Windows Explorer ZIP view and a normally extracted folder. When started from ZIP view it:

1. Locates the matching v1.5.8 ZIP in Downloads or Desktop, with a file-picker fallback.
2. Extracts to a temporary staging directory.
3. Checks the declared release version.
4. Verifies every build-manifest entry by size and SHA-256.
5. Preserves any previous v1.5.8 installation before replacement.
6. Installs the verified copy under the current Windows user profile.
7. Verifies the installed copy again.
8. Runs the governed first-run workflow and waits for its real exit result.
9. Writes a diagnostic transcript under the local Windows app-data folder.

The launcher never enables external AI, never performs automatic provider migration, and never enables production cutover.

## Runtime boundary

The pinned controller runtime uses CPython 3.13. Initial provisioning admits only prebuilt wheels and refuses source builds. The resolver checks standard per-user and system installation paths, the Python launcher, and named executables, while rejecting the Microsoft WindowsApps alias. During the explicit FIRST-RUN workflow, Windows Package Manager may install the official `Python.Python.3.13` package and `Git.Git` when needed. This does not require disabling Windows Smart App Control.

One-time provisioning may download the pinned Python wheels only when the first-run launcher explicitly passes `-AllowNetworkProvisioning`. It does not buy AI credits, call paid AI providers, or download an AI model.

After first-run provisioning, use:

```text
OPEN-NOVA-OFFLINE.cmd
```

Strict-offline operation refuses missing local dependencies instead of silently reaching the network.

## Real repository execution

The original local Git repository remains read-only to the handoff workflow. Open Nova creates a governed copy, integrity evidence, a baseline, and a rollback checkpoint before any supported migration. Provider rewriting remains off unless separately and explicitly confirmed.

A successful real run produces:

```text
exports\evidence-bundles\reson8-life-real-execution-evidence.zip
```

That evidence bundle excludes application source, `.env` files, private keys, database contents, dependency caches, Git remotes, and absolute local paths. Upload the evidence ZIP for provider and migration analysis.

## Honest certification boundary

The package test suite and manifest prove the release structure and deterministic governance behavior. They do not prove that Podman/Docker services are running on the target PC, that a real Resonance repository has been admitted, or that an application has achieved operational sovereignty. Those claims remain blocked until real local evidence exists.
