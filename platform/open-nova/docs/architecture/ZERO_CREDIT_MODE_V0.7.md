# Resonance Open Nova — Zero-Credit Mode v0.7

## Sovereign Service Fabric

v0.7 introduces the controller-owned local service layer used to detach managed applications from hosted backend assumptions while preserving reversible migration.

### Constitutional execution rule

A generated or migrated application may request a local capability, but it may not decide where secrets live, expose a service publicly, enable an external AI provider, or download a missing service image. Those decisions remain under the Resonance Governance controller.

### Service contracts

The default fabric declares replaceable local contracts for:

- `postgres` — relational persistence
- `auth` — local identity/session service
- `storage` — local object/file storage
- `gateway` — application routing boundary
- `ollama` — optional local AI provider
- `foundry-controller` — Open Nova control plane
- `secrets` — protected local secret-reference boundary

Applications bind to service IDs and endpoints rather than proprietary hosted-provider APIs. Implementations behind a service ID are replaceable.

### Migration mapping

Detected hosted dependencies are translated to local requirements without rewriting source automatically:

- Lovable → Foundry Controller
- hosted Supabase/Firebase → Postgres + Auth + Storage + Gateway
- Vercel/Netlify → Gateway/local container runtime
- OpenAI/Anthropic API → local Ollama adapter

The migration-plan endpoint is read-only. Writing bindings requires explicit confirmation.

### Network and supply-chain boundaries

- Host exposure defaults to `127.0.0.1` only.
- Generated compose networking is marked `internal: true`.
- Runtime images use explicit local Resonance aliases and `pull_policy: never`.
- Open Nova never auto-downloads a missing service image.
- Service health checks are limited to configured loopback endpoints.
- Public/production exposure remains a separate high-impact governance action.

### Secret boundary

Bindings contain only secret references such as `runtime/secrets/postgres-password`; the service-fabric API never reads or returns those values. `.env.sovereign.example` is safe configuration metadata and must never contain actual credentials.

### Endpoints

- `GET /v1/service-fabric`
- `GET /v1/service-fabric/health`
- `GET /v1/service-fabric/{app_id}/migration-plan`
- `POST /v1/service-fabric/{app_id}/bindings`
- `GET /v1/service-fabric/runtime/compose`
- `POST /v1/service-fabric/runtime/compose`

### Readiness semantics

A manifest being valid does not mean the local backend is running. Fabric health is `ready=true` only when every required TCP service is reachable and the local secret-reference contract is valid.

### Current boundary

v0.7 supplies governed contracts, binding generation, discovery, health checks, and offline runtime composition. It intentionally does not bundle third-party service binaries or images. Those must be provisioned locally and admitted through the sovereign supply-chain process before runtime startup.
