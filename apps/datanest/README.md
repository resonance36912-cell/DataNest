# DataNest

**Resonance AppDev** is the master brand of **Resonance Sole Proprietorship**. **DataNest** is its canonical operating/control system: it governs product intent, AppDev execution, evidence, lifecycle, promotion and delivery while preserving separate source, backend and delivery authorities.

### Declaration of Intent

DataNest has published a proposed **Human + DataNest / Resonance Declaration of Intent v1.0**, explicitly subject to human approval and independent external AI assurance review.

- Proposed declaration: docs/DECLARATION_OF_INTENT.md
- External AI auditor call: Issue #388
- Adoption/review PR: PR #389

The declaration is a governance pledge, not a certification, statutory designation, production authorization or substitute for human accountability.



## Resonance AppDev Assurance Services

Resonance AppDev Assurance Services provide **regulatory/readiness support, technical assurance, evidence preparation, remediation support and authorized digital oversight** through DataNest, within the authority actually established for each engagement.

- Public service page: **https://datanest-supository.github.io/DataNest/assurance/**
- Commercial charter: [`docs/INDEPENDENT_REGULATORY_ASSURANCE_SERVICES.md`](docs/INDEPENDENT_REGULATORY_ASSURANCE_SERVICES.md)
- Trade & implementation intake: GitHub issue template `Trade & Implementation Interest`

This service does **not** claim statutory government-regulator status, IRBA audit-firm status, accredited ISO certification-body status, or authority to perform private-security surveillance without the registrations required for those reserved activities.

It combines two first-class tools:

- **UNIFI** — project orchestration, planning, Job Manifests, context, checkpoints, artifacts and audit.
- **TranScheduler** — capability-aware scheduling, dependencies, reservations, retry/backoff, execution history and human controls.

## Production-inclusive baseline

DataNest uses an **inclusive production contract**: every approved production-capable public surface, governed external production target, and production-support component is represented in its release contract. `/DataNest/` and `/Mirror-DataNest/` are peer production surfaces with separate release authority; staging backends, FREETREE, automation branches, and candidate branches remain non-production-authoritative unless explicitly assigned to one of those peer surfaces.

Contract: [`docs/PRODUCTION_INCLUSION_CONTRACT.md`](docs/PRODUCTION_INCLUSION_CONTRACT.md)

## Canonical public identity

DataNest uses its current GitHub Pages project-path deployment as the canonical public endpoint. There is no active DNS/custom-domain cutover or branded-host redirect. Reson8 remains an ecosystem Hub link rather than a routing target.

## Live web UI

Primary free public endpoint:

**https://datanest-supository.github.io/DataNest/**

Reson8 ecosystem integration links directly between the live DataNest GitHub Pages endpoint and the Reson8 Hub. No branded-host activation, DNS cutover, or Railway ingress is required.

Static health marker:

**https://datanest-supository.github.io/DataNest/health.json**

GitHub Pages is the **current public delivery target** for the DataNest-managed production path. Supabase supplies the governed auth, database, storage and backend-function services.

Standalone Node/Docker runtimes continue to expose the server health endpoint at `/api/health`, but local machines are development, controlled-test, and specialized execution surfaces only. They are not backup hosts or continuity authorities. Dropbox `/DataNest-AI-Backups` is the governed backup-artifact host.

## System and business scope

DataNest separates the operating system from the businesses and products it governs:

| Layer | Public name | Role |
| --- | --- | --- |
| Business | **Resonance Sole Proprietorship** | Legal/operating business identity |
| Master brand | **Resonance AppDev** | Public master brand |
| Operating system | **DataNest** | Governance, AppDev control, orchestration, evidence, security, continuity and delivery |
| Portfolio registry | **DataNest Portfolio Registry** | Canonical catalog of products, services, routes, components and authorities |
| Customer suite | **Resonance** | Career, Create and Grow customer applications |
| Professional line | **Sovereign Forge** | Professional/B2B engineering and sovereignty capability under Resonance AppDev |
| Service line | **Resonance AppDev Assurance Services** | Readiness, assurance, evidence and authorized professional services |
| Technical identifier | **RONSAS** | Stable identifier for the Resonance implementation estate |

Customer-facing pages should lead with the Resonance AppDev master brand and customer intent. Repository names, internal control-tree names, technical slugs and historical identifiers remain implementation details.

## Canonical stack

- DataNest: parent platform, governance and execution/promotion authority
- GitHub repository: `DataNest-Supository/DataNest`
- Branch: `main`
- GitHub: source control, history, CI and evidence authority
- Supabase: `sgqdmfgjbprsoqsmgigi`
- Supabase URL: `https://sgqdmfgjbprsoqsmgigi.supabase.co`
- Supabase: auth, database, storage and backend-function authority
- Current public delivery target: **GitHub Pages**
- Canonical production route: **DataNest-managed public delivery: GitHub Pages + Supabase**
- Railway dependency: **none**
- Hosting model: **replaceable delivery infrastructure**
- Backup-artifact host: **Dropbox · `/DataNest-AI-Backups`**
- Local PC backup hosting: **disabled**
- AI compute: **replaceable approved HTTPS inference endpoints; no workstation is required**
- AI architecture: [`docs/DATANEST_AI_ARCHITECTURE.md`](docs/DATANEST_AI_ARCHITECTURE.md)
- Vercel dependency: **none**

### Production contract

The machine-readable release authority is maintained in [\`config/production-contract.json\`](config/production-contract.json). CI and Pages release verification validate that contract and derive the expected Supabase production migration identity from it rather than maintaining a separate hard-coded database-release literal.


## Delivery-provider metadata

DataNest does not require Vercel. GitHub Pages is the active public delivery target; the retained `vercel.json` exists only to keep the still-linked Vercel Git integration deployment-disabled and is not a runtime dependency.

## Specialized control trees

- **Knowledge** — provenance-preserving repository learning from canonical DataNest and Mirror-DataNest, producing provisional categorized optimization feeds without self-promoting to Certified Memory or production authority.
- **Boundaries** — canonical tolerance and acceptance assessor mapping DataNest human-AI principles to machine-verifiable invariants and explicit human-review criteria across functional changes.
- **BOTSQUAD** — AI-only advisory specialist branches for optimization, product expansion, business growth, UX ease, UI evolution, function evolution, integrations, quality, and environment translation.
- **ENVIRONMENT** — shared compatibility assessor for runtimes, CI, delivery, backend, inference, Forge, recovery, dependencies, branch hygiene, and evidence; only generated non-authorizing adaptations are automatic.
- **ENFORCER** — continuous defensive enforcement and transparency tree that monitors security against Boundaries, consumes the complete approved Knowledge corpus without category/topic filtering, and publishes traceable learning/defence evidence without production authority.
- **GUARDIAN** — event-driven health monitor and safe healer that snapshots the operating blueprint, measures drift from optimal conditions, observes branch/source health, deletes only proven redundant branches, and routes behavioral streamlining through review.
- **CONDUCTOR** — timing and process-synchronization tree that coordinates dependency freshness plus pull/push and push/pull workflow dispatch across the specialized trees.
- **SUGGESTER** — continuous optimization tree that converts GUARDIAN, Knowledge, ENVIRONMENT, ENFORCER, BOTSQUAD, CONDUCTOR, CALMER and REGULATOR evidence into deduplicated suggestions and a bounded safe-automation queue.
- **CALMER** — continuous minimum-friction governance tree that pushes planning/evidence gates down to their safe pass floor and awards STONE, GOLD and DIAMOND packages to functions, processes and builds using accuracy, performance, security and contribution evidence.
- **REGULATOR** — transparency and harmony tree that converts system requirements into BOTSQUAD audit, stress-test, free/open acquisition-scout, supply-readiness and bounded action-planning work.
- **VISIBILITY-UTILITY** — continuous SEO, discoverability, brand/platform presence and market-intelligence tree that models evidence-labelled routes to market and projected relative outcomes without autonomous spend, pricing, sales or unverified-claim authority.
- **LIBERTY-IN-ALL** — continuous indexing and traceability assurance standard that hashes attributable records, preserves source lineage, exposes evidence gaps, and publishes sanitized on-demand metadata for the public, stakeholders, auditors and regulators without exposing restricted content or gaining production authority.
- **FREETREE** — isolated open-development clone target with no DataNest/Mirror synchronization, Knowledge exchange, Boundaries governance, BOTSQUAD feed authority, or canonical production authority.

Public system scope, mission, vision, governance, architecture, products/services, projections and standards alignment are documented in [`docs/DATANEST_SYSTEM_CHARTER.md`](docs/DATANEST_SYSTEM_CHARTER.md) and rendered publicly at **/DataNest/system-charter/**. The standards mapping is an alignment reference, not a claim of ISO certification.

Scheduled noise deletion and decluttering are defined in [`docs/MAINTENANCE_PROTOCOL.md`](docs/MAINTENANCE_PROTOCOL.md).


GitHub and Supabase remain the required source/CI and backend authorities. Dropbox is continuity storage for governed release and recovery artifacts; it is not the request-serving production web runtime. Hosting remains replaceable delivery infrastructure, not system authority.

## DataNest Portfolio Registry scope

`DataNest-Supository/DataNest` is the canonical DataNest **Portfolio Registry**: the governed parent index for products, services, application-development projects, components and delivery authorities. **Supository** remains a legacy technical term/path only.

The Portfolio Registry scope includes source/provenance, lifecycle state, delivery routes, release evidence, service relationships and future sovereign Git/registry replication. The current peer production authority model is GitHub + GitHub Pages + separate Supabase services: DataNest governs `/DataNest/`, while Mirror governs `/Mirror-DataNest/`. Deploying Reson8 Forge does not silently replace either surface.

- Architecture contract: [`docs/DATANEST_SUPOSITORY_ARCHITECTURE.md`](docs/DATANEST_SUPOSITORY_ARCHITECTURE.md)
- Machine-readable catalog: [`config/supository.catalog.json`](config/supository.catalog.json)
- Sovereign Forge bootstrap: [`infra/reson8-forge/`](infra/reson8-forge/)
- Ungated R&D mirror: `DataNest-Supository/Mirror-DataNest`
- Mirror promotion contract: [`docs/MIRROR_DATANEST_PROMOTION.md`](docs/MIRROR_DATANEST_PROMOTION.md)
- Target Forge namespace: `git.reson8.life/DataNest-Supository/DataNest`

New products, services and AppDev projects should be registered through the Portfolio Registry even when their source or runtime lives in a separate repository or provider, under the Resonance AppDev master-brand hierarchy.

## Target-state architecture concepts

The approved 27 Sep 2026 ecosystem design extends DataNest with target-state concepts that are intentionally separate from current production capability claims:

- **Cloud-Nest** — planned governed workspace abstraction for identity, projects, knowledge, permissions and resources.
- **Portfolio Registry** — governed catalog and provenance abstraction linking source, evidence, lineage, ownership and reuse policy; Supository is retained only as a legacy technical alias.
- **ILM (Inclusive Language Model)** — planned governed intelligence abstraction that begins as orchestration across approved models, tools, people and certified knowledge rather than a claim that Resonance has trained a proprietary foundation model.

These concepts require separate implementation and evidence before DataNest presents them as available product capabilities.


## Resonance technical integration (RONSAS)

DataNest integrates with **Resonance** as a governed customer suite through the authenticated Supabase Edge Function contract `ronsas-status@1`; **RONSAS** is the stable technical identifier.

- Resonance is governed through DataNest; it is not the parent platform or DataNest AI authority.
- No local workstation, loopback service, desktop launcher, or Ealiophin interaction is required by the DataNest web control plane.
- Ealiophin, Spider, Weed, and other local PCs are not backup hosts or continuity authorities.
- Dropbox `/DataNest-AI-Backups` is the governed backup-artifact host.
- The integration is cloud-only and rejects localhost, loopback, and `.local` origins.
- RONSAS health is non-blocking: DataNest remains usable when the public RONSAS Hub is unavailable.
- The Resonance implementation estate retains its stable technical source identifiers; those identifiers are not the public business name.
- The canonical public Hub probe is `https://reson8.life/`.

## Web UI

The UI includes authenticated access, an overview dashboard, UNIFI Job Manifest planning, TranScheduler queue controls, capability registry, run history, checkpoints, audit history, a Transparency audit library, scheduler settings, responsive navigation, deployment health checks and governed Products.

The sign-in screen intentionally does not create Supabase Auth users. Create authorized users through Supabase Auth administration, then use password or magic-link sign-in.

## External Audit & Optimizer production status

The **DataNest External Audit & Optimizer** is deployed through the canonical DataNest production path: GitHub Pages for the authenticated UI and Supabase project `sgqdmfgjbprsoqsmgigi` for governed database and Edge Function services.

- Production database release: `external-audit-production-v1`
- Supabase Edge Function: `external-audit@1`
- JWT verification: enabled
- Project-scoped RLS, reviewer gates, evidence traceability, Certified Memory usage receipts, and UNIFI/TranScheduler handoff remain enforced by backend controls.
- The tool produces assisted assessment evidence and optimization records; it does not claim ISO certification or accreditation.

## Runtime configuration

Runtime-resolved public configuration uses:

```env
SUPABASE_URL=https://sgqdmfgjbprsoqsmgigi.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The GitHub Pages workflow generates the public Supabase configuration into `runtime-config.js`. Local development and controlled-test Node/container runtimes consume the same public variables.

## Local development and controlled testing

Local development:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Legacy Windows/Node controlled-test launcher:

```powershell
$env:SUPABASE_PUBLISHABLE_KEY="<publishable key>"
.\scripts\start-production.ps1
```

Local Docker controlled test:

```bash
docker compose up --build -d
```

These paths do not replace the DataNest-managed production route and are not backup hosts.

## Backup and continuity artifacts

Dropbox `/DataNest-AI-Backups` is the governed backup-artifact host for DataNest and RONSAS continuity material. Existing governed ZIP, PGP, manifest, and GitHub Pages release artifacts are stored there. Dropbox is used for backup/recovery storage, not as the public web-serving origin; the operational web fallback remains the canonical GitHub Pages release.

See `docs/DEPLOYMENT.md` for the authority and delivery model.

## Validation

```bash
npm run check
npm run build
docker build -t resonance-datanest:ci .
```

Every GitHub Pages deployment also verifies the live homepage, static health marker, and published Supabase runtime configuration from a GitHub-hosted runner.

## Vercel status

Vercel is not required for DataNest operation. The active public delivery target is GitHub Pages, and retained Vercel integration metadata is deployment-disabled only.

## Scheduling safety

TranScheduler does not treat `UNKNOWN` capability state as permission to execute. Capability availability must be observed explicitly before routing work.

## Transparency

The **Transparency** workspace publishes audit methodology and accessible audit-source transcriptions separately from the operational Audit event log. The initial library contains the complete accessible transcription of the Resonance DataNest / RONSAS External Full-System Audit Brief v1.0 and explicitly marks external audit results as pending until a completed review is supplied.

### External audit return · 25 Sep 2026

The Transparency workspace now publishes the exact external audit return, structured `AUD-001`–`AUD-014` findings, and the reported remediation backlog. The audit is explicitly identified as a read-only public/source review, not a full production certification. DataNest validation/closure status remains separate and starts as pending for every reported finding.

## Resonance UI/UX alignment

This application follows the **Resonance Sovereign Spectrum 2026** portfolio design system: sovereign-dark operational surfaces, restrained translucent control layers, product-specific accents, explicit AI/governance state, accessible focus/motion behavior, and RONSAS-aligned product identity.

Canonical design authority: https://github.com/resonance36912-cell/RONSAS/blob/main/docs/design/RESONANCE_SOVEREIGN_SPECTRUM_2026.md
