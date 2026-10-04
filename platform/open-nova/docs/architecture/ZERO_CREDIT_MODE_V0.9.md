# Zero-Credit Mode v0.9 — Sovereign Backend Runtime

## Objective

Make the v0.8 provider-neutral application contracts executable on infrastructure controlled by Resonance, while preserving offline survival, explicit provisioning, reversible migration and health-gated cutover.

## Runtime path

`Migrated App → 127.0.0.1 Gateway → Postgres / Auth / Storage / Ollama`

No managed application receives database passwords or signing keys. Local secrets are stored under `runtime/secrets/` and referenced by file path. Controller responses return references only.

## Runtime services

| Service | Host endpoint | Responsibility |
|---|---|---|
| PostgreSQL | `127.0.0.1:55432` | relational application data |
| Auth | `127.0.0.1:58680` | local accounts and sessions |
| Storage | `127.0.0.1:59000` | local object/file persistence |
| Gateway | `127.0.0.1:58600` | provider-neutral API boundary |
| Ollama | local host | optional local model execution |

All container services share an internal container network and are exposed to the host only on loopback.

## Database migration rules

Schema files must be ordered as `001_name.sql`, `002_name.sql`, and so on. v0.9 refuses automatic execution when it detects destructive DDL or explicit transaction-control statements. Each accepted migration is executed by `psql` with `--single-transaction`, `ON_ERROR_STOP=1`, an argument array, and `shell=False`.

## Cutover certification

An application is backend-ready only when:

1. required local backend services are healthy;
2. service bindings exist;
3. sovereign compatibility adapters exist;
4. SQL migrations contain no unresolved governance blockers.

Certification is evidence, not a deployment action. It writes `.open-nova/backend-certification.json` and records the result in the append-only app registry.

## Offline boundary

Strict runtime operation performs no package or image downloads. Missing local wheels/base images are hard failures. Explicit one-time provisioning is separated into `scripts/provision-backend-cache.ps1 -AllowNetwork`.

## Security boundary

v0.9 is intended for local development and migration validation. It deliberately does not certify public production exposure. Production TLS, external ingress, HA, backups, key rotation, disaster recovery and hardened multi-user authorization remain later milestones.
