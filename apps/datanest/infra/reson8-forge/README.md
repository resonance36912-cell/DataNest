# DataNest Supository Forge

Reson8 Forge is the sovereign Git, registry and automation extension for the canonical **DataNest Supository**.

It exists to strengthen `DataNest-Supository/DataNest` and the Resonance AppDev portfolio. It is not a parallel source of truth and does not silently replace the current GitHub Pages production route.

## Canonical identity

- Current public DataNest: **https://datanest-supository.github.io/DataNest/**
- Current canonical repository: **DataNest-Supository/DataNest**
- Target sovereign forge namespace: **https://git.reson8.life/DataNest-Supository/DataNest**
- Reson8 ecosystem hub: **https://reson8.life**

Initial mode:

```text
DataNest-Supository/DataNest (GitHub authority)
              |
              | governed replication
              v
git.reson8.life/DataNest-Supository/DataNest
```

The public DataNest URL remains unchanged when the Forge is first deployed.

## Purpose

The Forge gives the DataNest Supository a sovereign environment for:

- Git repository replication and recovery;
- Resonance AppDev project/product/service namespaces;
- Forgejo package and container registries;
- isolated CI/CD runners;
- human and AI-agent identities with scoped permissions;
- auditable changes, releases and approvals;
- private development repositories cataloged by DataNest;
- provider-independent continuity.

See `docs/DATANEST_SUPOSITORY_ARCHITECTURE.md` and `config/supository.catalog.json`.

## Stack

- Forgejo 15 LTS
- PostgreSQL 16
- Caddy for HTTPS and reverse proxy
- Persistent Docker volumes
- Optional Dropbox off-site backup via rclone
- Forgejo Packages enabled
- Forgejo Actions enabled; runner provisioning is a separate hardening step

## Start on any Docker host

1. Point DNS for `git.reson8.life` to the host.
2. Copy `.env.example` to `.env`.
3. Replace `POSTGRES_PASSWORD` with a long random secret.
4. Start:

   ```sh
   docker compose up -d
   ```

5. Visit `https://git.reson8.life` and complete the first administrator setup.

Caddy obtains and renews TLS automatically when the hostname resolves publicly to the host and ports 80/443 are reachable.

## Initial replication

After the Forge is live, create the `DataNest-Supository` namespace and mirror the canonical repository:

```sh
git clone --mirror https://github.com/DataNest-Supository/DataNest.git
cd DataNest.git
git remote add forge https://git.reson8.life/DataNest-Supository/DataNest.git
git push --mirror forge
```

During the initial phase GitHub remains canonical. Mirror direction, release authority and production delivery must only change through an explicit governed migration.

## Registry

Forgejo's OCI/container registry can initially use the forge hostname:

```text
git.reson8.life/DataNest-Supository/<image>:<tag>
```

A dedicated `registry.reson8.life` gateway may be introduced later.

## Backups

Run:

```sh
./scripts/backup.sh
```

The script captures PostgreSQL plus the complete Forgejo `/data` tree. If `DROPBOX_REMOTE` is configured with rclone, it also copies each timestamped backup to Dropbox.

## Deployment status

The stack is provider-neutral. Railway provisioning is currently constrained by its resource limit, and DigitalOcean provisioning requires a funded account/payment method before resource creation.

No existing DataNest production service needs to be overwritten for the Forge deployment.

## Next infrastructure phase

1. Provision a dedicated Docker host.
2. Deploy Forgejo/PostgreSQL/Caddy.
3. Attach `git.reson8.life`.
4. Create the `DataNest-Supository` Forge namespace.
5. Mirror `DataNest-Supository/DataNest` without changing canonical authority.
6. Add a hardened Forgejo Actions runner.
7. Connect the Supository catalog to repository/project/service discovery.
8. Validate backup + restore.
9. Consider an authority cutover only as a separate governed migration.

## Phase A: read-only evidence ingestion

The Forge evidence adapter consumes only the versioned `release-evidence-envelope-v1` contract. It builds a local `forge-evidence-index-v1` projection for provenance correlation and recovery discovery.

This adapter is deliberately **read-only with respect to release authority**:

- it cannot set or elevate production authority;
- it preserves `productionAuthority` and `productionDeploymentAllowed` exactly as supplied;
- it does not deploy, merge, approve, certify or rewrite DataNest releases;
- identical repository/SHA/release evidence is deduplicated;
- DataNest remains the canonical authority during Phase A.

The intended next integration is a Forge-hosted ingestion job that calls the same adapter against signed/immutable envelopes after repository replication. That integration must remain observational until a separately governed authority migration is approved.


## Specialized tree alignment

Resonance Forge indexes DataNest specialized trees through `specialized-trees.json` and the read-only registry projection.

- **Knowledge** — repository-learning feed observation.
- **Boundaries** — acceptance/tolerance evidence observation.
- **BOTSQUAD** — scoped AI-agent identities mapped to `automation/botsquad/*`; agents have no production authority.
- **ENVIRONMENT** — compatibility and adaptation-feed observation.
- **ENFORCER** — defensive-evidence observation with complete approved Knowledge lineage and no production authority.
- **GUARDIAN** — health/drift/healing evidence observation.
- **CONDUCTOR** — orchestration timing and command-lineage observation.
- **SUGGESTER** — optimization-suggestion and bounded automation-queue observation.
- **CALMER** — minimum-friction governance and STONE/GOLD/DIAMOND tier-evidence observation.
- **REGULATOR** — transparent harmony requirements and BOTSQUAD regulation-evidence observation.
- **VISIBILITY-UTILITY** — SEO, market-presence and route-to-market projection evidence observation.
- **FREETREE** — no automatic Forge replication or synchronization.

Forge may preserve branch, evidence, identity, and compatibility lineage for these trees. It must not convert an AI recommendation, environment finding, or mirrored branch into production authorization.
