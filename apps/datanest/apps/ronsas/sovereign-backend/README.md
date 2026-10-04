# RONSAS Sovereign Backend

Private source authority for the local RONSAS backend services used by Ealiophin.

## Components

- `services/auth` — local identity/session service
- `services/storage` — local object-storage service
- `services/gateway` — loopback API gateway, protected procedures, database access, AI proxy
- `apps/rons-hub-backend` — ordered Hub/backend PostgreSQL schema migrations and provider-neutral compatibility adapter
- `governance/provider-neutral-api.yaml` — allowlisted provider-neutral backend contract
- `deploy/compose.backend.yml` — canonical production-style local Compose definition
- `tests` — direct service/billing regression tests

The initial baseline was extracted from `ResonanceAppDev_ZeroCredit_v1.5.8` on 19 September 2026. It intentionally excludes the wider OpenNova package, compiled caches, mutable runtime state, and all secrets.

## Authority

This repository owns backend **source history**. RONSAS remains the control/meta-repository. Runtime containers, databases, authentication state, storage objects, and keys remain machine-local.

## Development

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q
```

All changes use a review branch and CI before promotion. Build new container images with versioned tags; never overwrite a proven image tag in place.
