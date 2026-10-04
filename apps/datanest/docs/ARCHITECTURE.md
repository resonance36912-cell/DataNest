# Resonance DataNest Architecture

## Platform authority

**Resonance DataNest** is the parent platform and web control plane. **Resonance** is the governed customer application suite under DataNest; **RONSAS** remains the stable technical identifier for that implementation estate and is not DataNest's parent or DataNest AI authority.

The current target-state architecture authority is `docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md`. Design approval does not itself prove implementation status.

### Target-state concepts

- **Cloud-Nest** — governed workspace abstraction planned for a later implementation phase.
- **Supository** — governed knowledge and provenance abstraction planned for a later implementation phase.
- **ILM (Inclusive Language Model)** — governed intelligence abstraction planned first as orchestration rather than a proprietary foundation-model claim.

These concepts require separately implemented controls and evidence before they are treated as available product capabilities.


## Portfolio Registry authority

The Phase B source implementation introduces a project-scoped **Portfolio Registry** alongside the existing governed Product Registry.

- `products` remains the canonical identity authority for governed products.
- Portfolio Registry records applications, modules, capabilities, external capabilities and Product Candidates without turning them into products automatically.
- Architectural classification, relationship and lifecycle changes are governed, attributable records. Historical RONSAS application placement is provenance only and does not establish current ownership.
- Product Lab remains versioned build/test evidence. A `production` Product Lab surface does not promote an item into a governed product.
- Product Candidate promotion is an owner/admin governed database operation and preserves `billing_enabled=false` with the existing free-promotion commercial policy.
- Deprecation and retirement preserve history; retirement is blocked by active critical dependants and active linked production surfaces.
- Cloud-Nest, Supository, ILM and later Resource Fabric work remain target-state concepts outside this Phase B implementation.

This section records source architecture on the Phase B branch. Production availability or certification requires separate release/promotion evidence.


## Trust and Data Policy authority

The Phase C source implementation adds a project-scoped **Trust & Data Policy** layer without replacing existing authorization.

- Visibility / processing classification and reuse / learning state are separate governed dimensions.
- RLS, RBAC, project membership, Job collaboration, and explicit Job-file authorization remain prior authority gates. A favorable trust-policy decision cannot manufacture access.
- **Provider Trust Profiles** constrain external provider processing by approved visibility class, declared purpose, evidence state, and review status. They contain policy/evidence metadata only; provider credentials remain in the existing server-side provider connection boundary.
- **Trust Manifests** are versioned summaries of implemented controls and known limitations. They are not access grants, and planned/unknown controls are not represented as verified guarantees.
- Retention is policy-driven. Phase C v1 can define policy, place holds, record lineage, and review future disposition, but it does not delete, purge, anonymize, or otherwise destructively mutate existing content.
- Existing DataNest AI certified memory remains the reusable project-memory authority. Project-learning eligibility is not certification, and project certification does not automatically create platform learning authority.
- Legal Eagle and any other authoritative `learning_eligible=false` mode remain hard learning exclusions even when a broader project default exists.
- Cloud-Nest, Supository, ILM, Resource Fabric, Authority Envelopes, Capability Leases, Outcome Ledger and later architecture-programme concepts remain target-state work outside Phase C.

This section records source architecture only. Production availability, provider-policy rollout, retention enforcement, or public trust claims require their own verified promotion evidence.


## Authority and Execution Controls

The Phase D source implementation adds bounded **execution authority** above existing project membership, Job controls, Phase C trust policy, provider authorization and scheduler capacity. The approved model is additive over the earlier V1 Phase D baseline: legacy envelopes, leases and decisions remain historical/compatibility records, but they are not automatically promoted into canonical active authority.

- An **Authority Envelope** is attributable to an accountable human sponsor and may be project- or Job-scoped. It records purpose, requested/granted autonomy, explicitly allowed consequence classes, operation/capability/target scope, expiry, reversibility, evidence references and bounded non-monetary limits. It is not credential storage.
- Autonomy and consequence are independent. **A0 Observe**, **A1 Advise**, **A2 Prepare**, **A3 Execute**, and **A4 High-impact** establish autonomy ceilings; an operation is authorized only when its canonical consequence class is also explicitly allowed.
- A4 remains human-gated. High-impact execution requires an unexpired **exact-action approval** bound to the operation, target and exact evidence identity. Phase D does not add a generic destructive, legal, financial, ownership or constitutional executor.
- A **Capability Lease** is short-lived execution permission. Existing TranScheduler `reservations` remain resource-capacity reservations. A reservation is not a lease, and an available capability is not execution authorization.
- Canonical circuit breakers are `autonomous_writes`, `external_communications`, `deployments` and `resource_execution`, with `enabled|paused|blocked` states. Safety automation may tighten a breaker but cannot silently restore `enabled`.
- Route rollout is project-scoped. `external_ai_provider` and `job_start` default to **report-only** until an owner/admin explicitly moves the selected route to `enforced`.
- `service_evaluate_execution_authority_v1(...)` is the service-only canonical evaluator. It resolves active envelope scope, consequence/autonomy, exact approval, Capability Leases, breaker state, capability health, optional capacity reservation, Phase C decision, limits and idempotent lease consumption.
- External AI routing remains **Phase C trust/data policy → Phase D execution authority → existing provider/budget authorization → provider call**. A denial at an earlier gate cannot be widened downstream.
- Only the existing `RESERVED -> RUNNING` Job boundary uses the canonical `job_start` route adapter. Other human Pause/Resume/Cancel and existing Job transitions remain governed human controls and are not silently reclassified as autonomous execution.
- The Governance workspace exposes **Sovereign Governance**, **Trust & Data Policy**, and **Authority & Execution**. TranScheduler retains an operational Authority & Execution view plus read-only Job readiness; `Authorized` is shown only from a matching enforced allow decision.
- Phase D does not invent a currency/pricing unit. Legacy `max_cost_minor` history is preserved but is not canonical Phase D authority or a billing control.
- RLS/RBAC, Job collaboration, Job/file authorization, Phase C provider/data policy, provider budgets, certification and promotion remain independent prerequisites.
- Phase E Resource Fabric and Phase F Intelligence Fabric / ILM-1 are later governed layers and remain independent of Phase D authority. Cloud-Nest, Supository, Outcome Ledger and later architecture-programme concepts remain **target-state / not yet live**.

This section records source architecture only. It does not claim production route enforcement, autonomous A4 execution, destructive/legal/financial authority, billing changes, or deployment promotion. Production availability still requires exact-head verification and a separate promotion decision.

## Resource and Capability Fabric

The Phase E source implementation adds a governed **Resource Fabric** behind the existing scheduler-facing capability inventory.

- `resource_registry` represents supply-side Resources such as local nodes, cloud workers, accelerator runtimes, browser runtimes, model/storage/API endpoints, external services, agent runtimes, product capabilities and optional human specialist capability.
- `resource_project_bindings` is the explicit allowed-project boundary. A Resource is not usable by a project merely because it exists.
- Existing `capabilities` remain the TranScheduler execution unit and retain their IDs. Phase E adds a compatibility `resource_id` link; existing Job manifests, reservations, Phase D Capability Leases and execution history are not replaced.
- `resource_health_observations` is append-only health evidence. Browser clients cannot mark Resources healthy; trusted service ingestion may update current Resource/capability summaries while preserving observation history.
- `sovereign_node_policies` version local-node participation policy for capabilities, ceilings, schedules, data visibility, data scope, prohibited operations and network metadata. Phase E v1 fixes interactive remote control off.
- Resource matching is fail-closed on active project binding, Resource enablement/health, Phase C visibility suitability, capability availability and concurrency, plus sovereign-node policy where applicable.
- A Resource candidate match is **not** a capacity reservation and is **not** Phase D execution authorization. TranScheduler reservations and Capability Leases remain separate prerequisites.
- Local sovereign nodes are optional execution supply. DataNest production availability does not depend on a registered local computer.
- Resource cost metadata is informational routing metadata only; Phase E does not enable billing, charging or settlement.
- Phase F Intelligence Fabric, ILM-1, Cloud-Nest, Supository, Outcome Ledger and later programme concepts remain outside Phase E.

This section records source architecture only. Production node enrollment or autonomous local execution requires separate authenticated agent/runtime evidence and promotion.

## Project
**Resonance DataNest** is the project operating environment.

## Tools
- **UNIFI** — planning, project context, job manifests, checkpoints, artifacts, audit and human controls.
- **TranScheduler** — capability-aware queueing, dependency gating, reservations, retry/backoff, fairness and timing.

## Required authority chain
```
GitHub: DataNest-Supository/DataNest
        |
        v
Supabase: sgqdmfgjbprsoqsmgigi
```

GitHub is the source authority and Supabase is the application/control-plane data authority.

## Hosting policy
Hosting is **provider-agnostic**. The built Next.js application can run anywhere that supports the production Node.js build and the required public Supabase environment variables.

Vercel is an optional managed hosting target. It may be enabled when a Vercel workspace is available, but Resonance DataNest does not depend on Vercel for source control, data, orchestration, scheduling, or local/self-hosted operation.


## RONSAS integration boundary

RONSAS is integrated into DataNest as a **remote, authenticated, non-blocking AppDev service boundary** rather than a local runtime dependency.

```
DataNest browser
      |
      | authenticated Supabase JWT
      v
Supabase Edge Function: ronsas-status@1
      |
      | HTTPS only / AppDev allowlist
      v
https://reson8.life/
```

Rules:

- DataNest must never require `localhost`, `127.0.0.1`, `::1`, machine-local paths, desktop launchers, local control centers, or an operator session to use RONSAS integration.
- The Edge Function rejects non-HTTPS, loopback, localhost and `.local` RONSAS origins.
- RONSAS availability does not gate DataNest startup, project access, scheduling, governance, or DataNest AI; failure is surfaced as degraded integration state only.
- Integration authority is aligned with Resonance AppDev: control source `resonance36912-cell/RONSAS`, Hub source `resonance36912-cell/resonance-hub`, public Hub `https://reson8.life/`.
- RONSAS local sovereign runtimes remain independent systems and are not transitive prerequisites for the DataNest web product.
- Future RONSAS control operations must be introduced as separately versioned authenticated contracts; status access does not imply execution authority.

## Core principles
Projects own knowledge. Jobs own work. Checkpoints preserve continuity. Capabilities determine routing. Availability determines timing. UNKNOWN capability state is never execution permission.

## Security
No passwords, MFA recovery codes, reusable browser cookies, PATs, service-role keys or database passwords belong in Git.


## Think Tanks and reviewed institutional learning
Think Tanks are project-scoped collaboration spaces. Channels can be project-wide or linked to a Job Manifest.

- Project-wide channels support discussion, decision proposals, action proposals and reviewed learning.
- Job-linked channels may invoke the existing governed DataNest AI route. Every recorded AI response must map to the caller's authorized `ai_usage_requests` record for that Job and retains its `DN-AI-` trace.
- Think Tank decisions are proposals until independently confirmed by an owner/admin. A proposer cannot confirm their own decision.
- Learning candidates are not reusable project memory until independently reviewed by an owner/admin. A proposer cannot approve their own learning.
- Approved Think Tank learning is stored in `certified_memory` as `think_tank_human_reviewed`. This is reviewed retrieval memory, not automatic model training.
- Approval also submits a `reusable_knowledge` contribution for the normal contribution pipeline. It remains submitted/unscored/uncertified and cannot mint Sparks until that independent pipeline completes.
- Think Tank recognition, AI output and memory approval do not grant project roles, legal ownership, royalty rights or financial authority.


## Sparks internal-utility economy
Sparks are an internal DataNest utility layer backed by the append-only Spark ledger.

- Certified contributions may mint Project Sparks under the existing versioned contribution-scoring policy.
- Project Sparks can only be reserved for owner/admin-published project services in v1.
- A service request moves the required amount from the spendable Project account into the stakeholder's Locked account using append-only hold entries.
- Cancellation or rejection returns the held amount with compensating release entries.
- Fulfillment consumes the held amount with a service-spend entry. Historical award entries are never edited.
- The redemption path serializes account access and rejects requests above the available spendable balance.
- Cash purchase, cash redemption, peer-to-peer transfer, external transfer, secondary markets and platform spending are disabled by database policy constraints in v1.
- Spending does not change contribution history, reputation, legal ownership, royalty entitlement or project authority.
- Platform Spark accounts remain separate and visible but are not spendable in this release.


## Sovereign Governance Protocol
Sovereign Governance is a project-governance domain, not a source of legal ownership, contractual rights, royalty entitlements, financial authority or project roles.

- DataNest does not seed or silently adopt human mission, vision or protocol text. Protocol versions begin as owner/admin-authored drafts.
- A protocol draft requires a formal `protocol_change` proposal before it can be ratified.
- Formal voting is one active `project_members` member, one vote. Sparks, reputation, contribution share and capital do not weight votes.
- Proposal acceptance uses the latest vote event per active member, simple majority, quorum, and at least one supporting vote from someone other than the proposer.
- An accepted protocol-change decision does not itself alter the protocol. Owner/admin ratification is a separate execution step tied to the accepted proposal.
- Ratifying a newer protocol version supersedes the prior ratified version without deleting its history.
- Governance proposals and decisions carry database-enforced false flags for contractual, ownership, financial-authority and role-authority effects.
- Project-access stakeholders may file disputes against protocols, proposals or decisions. A filer cannot resolve their own dispute.
- Dispute resolutions are append-only correction/clarification records; they do not rewrite the challenged source record.
- All formal governance events emit `DN-GOV-` traces and project audit events.


## Project-member invitations and formal voter activation
Project-member invitations are a separate governance boundary from Job collaboration.

- Only active project owners/admins can initiate project-member invitations.
- The owner may invite `admin`, `operator` or `viewer`; an admin may invite only `operator` or `viewer`.
- The owner role is not inviteable through this flow, and self-invite is prohibited.
- Invitation delivery uses a JWT-protected Edge Function and service-role-only registration gateway.
- New and still-unconfirmed invitation accounts receive a Supabase Auth invitation; confirmed existing accounts receive a secure password-recovery link so they can establish credentials before signing in.
- Registration creates a `project_members` row with status `invited`. General project access and formal governance voting require `status='active'`, so a sent invitation cannot create an independent vote.
- After the invited person authenticates with the matching account/email, DataNest automatically accepts valid pending invitations and activates the membership.
- Invitations expire after seven days and may be revoked before acceptance. Revoked/expired invitations are not formal voters.
- The invitation audit trail remains in `project_member_invitations` and emits project events for sent, accepted and revoked states.


## Transparency and audit library
Transparency is a read-only continuity surface that publishes audit methodology, accessible source transcriptions, audit-result status, and later remediation evidence.

- Transparency is separate from the operational Audit event log. The Audit view records system events; Transparency publishes review artifacts and accountability context.
- Publishing an audit brief does not imply that the audit has been completed or that any finding has been validated.
- Each document records type, version, publication status, audit-result status, baseline source commit and database release.
- The first published artifact is the External Full-System Audit Brief v1.0. The formatted source artifact was DOCX; DataNest publishes the complete source-controlled text transcription as the accessible representation.
- Accessible transcriptions must preserve the source wording and clearly identify any normalization or transformation.
- Audit artifacts are informational evidence only. Publication does not grant governance, financial, ownership or role authority.
- Future external results should be linked to stable AUD-xxx finding IDs and remediation evidence such as Job Manifests, PRs, migrations, tests, releases and post-release verification.
- Transparency artifacts must never publish passwords, service-role keys, reusable cookies, PATs, MFA recovery material or protected personal data.


### External audit returns and remediation evidence
A published audit return is retained separately from the audit methodology and from DataNest's own validation state.

- The 25 Sep 2026 external audit return is preserved unchanged at `public/transparency/audits/external-full-system-audit-return-2026-09-25/report.md`.
- Stable `AUD-001` through `AUD-014` identifiers are indexed in `findings.json`; the auditor's proposed optimization backlog is indexed separately in `remediation-backlog.json`.
- Structured indexes are derived accessibility/workflow views. They never replace or rewrite the source artifact.
- External severity/status is reported evidence, not automatic DataNest confirmation. Every imported finding begins with `pending_datanest_validation`.
- The external auditor explicitly limited the audit to public/read-only and commit-pinned source evidence. It is not a full production certification and has no certification, governance, financial, ownership or role effect.
- A finding may be marked validated, remediated or closed only when current-release reproduction and governed implementation evidence are attached.
- Remediation evidence should connect the finding to its Job Manifest, branch/PR, acceptance test, migration/function change where relevant, release, deployment verification and closure rationale.
\n## Resonance Assistance · Legal Eagle
Legal Eagle is the first live Resonance Assistance specialist and runs through the authenticated, governed DataNest AI gateway rather than a separate ungoverned model path.

- Every Legal Eagle turn is anchored to an authorized DataNest Job used as the matter workspace.
- The user must supply the relevant jurisdiction before substantive Legal Eagle assistance is accepted.
- Legal Eagle may provide legal information, plain-language explanation, issue organization, chronology, research mapping, counsel preparation, and human-review draft structure.
- Legal Eagle is not a law firm, does not create an attorney-client relationship or legal privilege, cannot represent the user, and cannot contact courts, regulators, opposing parties, or other people on the user's behalf.
- The governed prompt prohibits fabricated statutes, cases, citations, court rules, filing requirements, and deadlines. Current-law and deadline questions must be identified for primary-source or qualified-professional verification.
- High-impact matters such as imminent deadlines, arrest or detention, personal safety, housing loss, immigration consequences, and similar risks are explicitly escalated for prompt human verification.
- Legal Eagle uses the same provider authorization, usage accounting, trace-first intake, and Job/session continuity as DataNest AI.
- Release contract: `datanest-ai-chat@2` identifies the gateway version that adds the Legal Eagle product mode and learning exclusion.
- Legal Eagle input/output events are tagged `product_mode=legal_eagle` and `learning_eligible=false`.
- Legal Eagle sessions are excluded from automatic trend extraction and project-wide learning. A legal matter therefore cannot silently become reusable institutional memory through the automatic learning pipeline.


## Intelligence Fabric and ILM-1

The Phase F source implementation adds **ILM-1** as DataNest's governed intelligence-composition layer. ILM-1 is an orchestration abstraction over approved memory, provider/model routes, tools, agents and Resource Fabric capabilities; it is **not** a trained proprietary foundation model.

- `ilm_profiles` stores versioned project-scoped operating profiles. Owner/admin activation is explicit; projects without an active ILM-1 profile continue on the existing governed DataNest AI route.
- `intelligence_route_decisions` is append-only route evidence tying the declared purpose and visibility state to certified-memory references, Phase C policy evidence, Phase E resource/capability evidence, and provider/model provenance where applicable.
- `intelligence_evaluation_runs` records versioned deterministic, policy, human-review or certification-suite evidence. Evaluation history is evidence, not self-modifying model behavior.
- `intelligence_capability_evidence` records observed fitness of a Phase E resource/capability for a declared intelligence purpose. It supplements Resource Fabric health and does not replace it.
- ILM-1 resolves in governed order: certified memory → Phase C data policy → Phase E resource candidates → approved provider/model route → append-only route evidence.
- A selected ILM route is **not** a capacity reservation, Capability Lease, Phase D execution authorization, or certified-memory promotion.
- Provider credentials remain in the existing server-side provider connection boundary and never enter Intelligence Fabric tables or browser payloads.
- Uncertified staging evidence remains current-Job/session context only. Project-wide reusable knowledge remains `certified_memory` and keeps its existing certification/promotion boundary.
- `local_only` policy cannot silently escape to an external/provider-managed route.
- The DataNest AI product identity remains provider-agnostic. Provider/model labels are operational provenance only.
- The browser may read routing, evaluation and capability evidence; service evidence writes remain backend-only.
- No Phase F source path exposes hidden chain-of-thought or claims foundation-model training/fine-tuning.
- Phase G public growth/stakeholder surfaces and Phase H Outcome Ledger/Shadow Economics remain future work.

This section records source architecture only. Production ILM-1 activation requires the Phase F migration, exact-head verification, and an explicitly active governed ILM profile.
