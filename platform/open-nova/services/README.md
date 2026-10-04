# Resonance Sovereign Backend Services v0.9

These services implement the first executable version of the provider-neutral API introduced in v0.8.

- **auth** — local identity, PBKDF2 password hashing, HMAC-signed session cookie, SQLite-backed identity store.
- **storage** — local object storage rooted in a dedicated volume with traversal protection.
- **gateway** — provider-neutral database/query gateway, auth/storage reverse proxy, and local Ollama AI proxy.
- **postgres** — pinned PostgreSQL container managed by the generated sovereign runtime.

The Python service images are built from a local wheelhouse only. Their Containerfiles use `pip --no-index`. The build script uses `--pull=false`. Runtime compose uses `pull_policy: never` and loopback host bindings.

`provision-backend-cache.ps1 -AllowNetwork` is an explicit provisioning action. It is intentionally separate from strict offline operation.

The v0.9 backend is a local development/migration runtime, not a claim of production hardening. Public internet exposure remains forbidden by governance.
