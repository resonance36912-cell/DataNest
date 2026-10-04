# Zero-Credit Mode v0.4 — Sovereign App Factory

## Objective

Turn the governed ResonanceAppDev runtime into a local application factory that can create portable application source code without depending on third-party AI credits.

## Governed flow

`Prompt → App Spec → Deterministic or Local-AI Generation → Transactional Write → Dependency Gate → Security Gate → Static Validation → Preview Descriptor → Registry → Build/Test/Repair → Git Commit`

The local model has proposal authority only. The controller owns writes, validation, receipts, registry events, isolated execution and Git operations.

## New components

- `app_factory.py` — specifications, deterministic templates, local-model proposal parsing, transactional project writes, static validation and loopback preview descriptors.
- `registry.py` — append-only SHA-256 chained application lifecycle registry.
- `builder_ui.py` — first local Open Nova Sovereign App Factory interface at `/builder`.
- Factory endpoints for spec creation, deterministic generation, local-model generation, application listing, preview metadata and non-destructive archive/reactivation.

## Sovereignty boundaries

1. External AI remains disabled in Zero-Credit Mode.
2. Local-model output is data, not authority; it cannot directly write files or execute shell commands.
3. `APP_SPEC.json` is controller-authored even when a local model generates the rest of the project.
4. Generated file paths cannot escape their application project or create `.env` / `.git` control artifacts.
5. Multi-file project generation is transactional; partial writes are rolled back on failure.
6. Application registry and execution receipts are protected controller-owned paths.
7. Preview descriptors bind only to `127.0.0.1` and are not auto-started.
8. Archive/reactivate actions change lifecycle state only; they do not delete source code.
9. Full generated-code execution continues through the v0.3 isolated, network-denied runner.
10. Production deployment remains a high-impact human-approval action and is outside v0.4 automation.

## Templates

- `python-fastapi` — portable FastAPI baseline with exact dependency pins and a local test.
- `static-web` — dependency-free static web baseline.

Templates are intentionally simple. The local coding model can expand them, but governance validates the result before it is treated as preview-ready.

## Application registry states

Typical lifecycle:

`app_generated → preview_ready → build_passed/committed → archived → active`

The event log is hash-chained. `/v1/registry/verify` verifies integrity.

## Builder

Start the controller and open:

`http://127.0.0.1:8787/builder`

The deterministic generation path does not require Ollama. The local-AI path uses the configured local Ollama model and still uses no external AI credits.

## Remaining hardening

v0.5 should add a fully governed local package/cache mirror, SBOM generation, artifact signing, project import/migration, richer templates/components, and a safe local preview execution mechanism that preserves network isolation.
