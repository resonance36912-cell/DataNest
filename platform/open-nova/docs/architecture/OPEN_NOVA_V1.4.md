# Open Nova v1.4 Architecture — Sovereign Workstation & Repository Bridge

## Objective

v1.4 closes the gap between the Open Nova release package and a real source repository on the local Resonance machine. The bridge is intentionally independent of hosted repository connectors: if GitHub access is absent, a local Git working tree is sufficient.

## Trust boundary

The bridge does not clone, fetch or pull. It accepts only a user-approved local repository root and runs read-only Git inspection commands against it. The original repository remains unchanged.

The automatic path is:

1. Verify that Git is available.
2. Resolve the selected repository root.
3. Require a clean working tree.
4. Record the current commit SHA and branch.
5. Enumerate Git-tracked files.
6. Reject secret-bearing files, symlinks/reparse points, submodules and unresolved index stages.
7. Flag Git LFS for manual content verification.
8. Copy the admitted tracked-file snapshot into `imports/projects/<app_id>`.
9. Generate compatible source-ingestion evidence for the v1.3 import engine.
10. Generate controller-owned repository provenance evidence.
11. Verify the staged snapshot before import.

## Privacy

Open Nova records a SHA-256 digest of the repository path instead of the path itself. Remote names may be detected only as a boolean signal; remote URLs are not persisted.

## Why only a snapshot?

v1.4 deliberately does not import full Git history into the managed application. Full history can contain credentials or sensitive files that were deleted from the current tree. The existing local repository remains the historical source of truth while Open Nova admits only the governed current snapshot.

## Workstation state

`runtime/workstation/state.json` records only platform state required to prove initialization. It contains a hash of the workspace path, loopback builder URL, release identifier, network-provisioning state and external-AI policy. The directory is protected from coding-agent writes.

## Offline mode

Deterministic Zero-Credit mode requires no AI model. Ollama becomes a requested capability only when local-AI generation is explicitly selected. Package/model/image installation has no silent network fallback in strict offline operation.

## Certification boundary

Repository bridge verification means only that the staged source matches the admitted clean local Git snapshot. It does not imply that the app is operationally sovereign. That certification still requires provider migration, dependency integrity, local services, isolated regression, loopback preview and the existing Open Nova operational gates.
