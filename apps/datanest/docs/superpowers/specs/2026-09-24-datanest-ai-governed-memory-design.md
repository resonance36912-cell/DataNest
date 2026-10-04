# DataNest AI Governed Memory Design

**Date:** 2026-09-24  
**Repository:** `DataNest-Supository/DataNest`  
**Design status:** Approved in conversation; implementation not yet started  
**Parent implementation context:** `feature/ai-companion-trace-handoff` at the approved design point  
**Target implementation branch:** `feature/datanest-ai-governed-memory` after implementation planning approval

## Execution Topology Amendment — 2026-09-24

Supabase Branching is unavailable on the current plan. The approved staging trust boundary is therefore implemented as a **dedicated Supabase project** named `DataNest AI Staging` (project ref `qchttpcyqlqnhvahprhz`) in the same Supabase organization and region as production. This amendment preserves the functional design: separate database/API/Auth credentials, isolated raw evidence, server-only cross-environment access, explicit certification/promotion, independent retention/recovery, and no raw runtime data merge into production. Any earlier reference in this document to a dedicated Supabase staging project is superseded by this dedicated staging project. Git feature-branch isolation remains unchanged.

## Retention Supersession Amendment — 2026-09-27

The earlier blanket requirement to retain all raw human and AI inputs indefinitely is superseded by **policy-driven retention**. Current target policy determines retention from data **classification**, **declared purpose**, governance requirements, and applicable **legal or contractual obligations**.

Selected audit, certification, and provenance evidence may remain long-lived where its governing policy requires that history. This amendment **does not authorize deletion**, anonymization, migration, or mutation of **existing records** by itself.

Any retention enforcement, cleanup, archival, anonymization, or deletion of existing data requires a separate reviewed implementation plan, explicit authority, and verification evidence. The original language below remains in this historical design record so the evolution of the policy is attributable rather than silently rewritten.


## 1. Purpose

Replace the current user-facing **UNIFI Copilot** and R&D-contribution workflow with **DataNest AI**, a governed internal AI layer that continuously learns from human development input and AI Companion returns without allowing raw or unverified input to become production memory.

The system must:

- accept human development input in the DataNest AI chat;
- accept AI Companion returns as a governed input source;
- preserve Job Manifest and trace lineage for every input and output;
- allow current-session use of uncertified evidence without allowing it to influence other jobs;
- learn project-wide only from certified knowledge;
- identify trends across staged evidence;
- audit, verify, validate, stress-test, and certify learnings before production promotion;
- use hybrid certification with tiered authority;
- retain raw human and AI inputs indefinitely in a persistent staging environment;
- remove contribution-scoring and stake-credit functionality from the active product;
- preserve legacy records as frozen audit evidence rather than deleting them;
- keep provider routing, usage, budget, allowlist, and security controls needed by DataNest AI;
- stage code and learning evidence separately before production release.

## 2. Approved Product Decisions

The approved decisions are:

1. **Learning model:** Certified Memory Learning. Raw inputs do not modify model weights and do not become production memory directly.
2. **Staging model:** Paired Git + Supabase staging.
3. **Contribution scope:** Remove contribution scoring, stake-credit functionality, suggested stake, external-AI credit scoring, and related acceptance/reversal UI.
4. **Memory scope:** Project-wide certified memory with complete provenance.
5. **Certification:** Hybrid certification.
6. **Human authority:** Tiered authority. Admins may certify normal project knowledge; Owner approval is required for architecture, security, governance, destructive behavior, authorization, production-policy changes, or other high-risk categories.
7. **Retention:** Raw human and AI inputs are retained indefinitely in persistent staging.
8. **Uncertified context:** Dual-context. Uncertified input may be used only in the current Job/session; certified memory may be used project-wide.
9. **Internal AI meaning:** DataNest AI is a governed internal AI layer. The inference provider can be an approved hosted or future local model, but users interact with DataNest AI rather than a provider-specific assistant.
10. **Architecture:** Governed Memory Promotion Pipeline.

## 3. Current-State Grounding

The current DataNest implementation uses:

- `RnDDashboard.tsx` for R&D collaboration, human job input, development updates, suggestion prompts, collaborators, and UNIFI Copilot chat;
- `rnd-ai-chat-v3` as the server-side AI path;
- `job_inputs`, `ai_messages`, `ai_development_updates`, and `ai_prompt_queue` as the current R&D/AI collaboration substrate;
- `contribution_ledger` and stakeholder scoring functions for contribution/stake-credit workflows;
- `external_ai_sessions` and the External AI Companion flow for provider handoff and imported external AI results;
- existing AI provider, budget, usage, and outbound allowlist controls;
- current CI that runs unit tests, TypeScript checking, dependency audit, Next.js build, release manifest generation, and a provider-agnostic Docker build;
- Playwright defined in `package.json`, but not currently part of the main CI workflow.

The redesign must preserve useful Job Manifest, provider, budget, security, and External AI trace capabilities while removing R&D-contribution semantics from the new learning architecture.

## 4. Trust Zones

### 4.1 Production DataNest

Production contains:

- live DataNest application;
- Job Manifests and operational execution controls;
- production DataNest AI runtime;
- certified project-wide memory only;
- provider/budget/security policy controls;
- append-only certified-memory versions and supersession metadata.

Production must not become the primary storage location for raw human or AI Companion development evidence.

### 4.2 Persistent DataNest AI Staging

A dedicated Supabase staging project named `DataNest AI Staging` (project ref `qchttpcyqlqnhvahprhz`), holds:

- immutable raw intake events;
- DataNest AI sessions;
- current-session uncertified context;
- trend clusters;
- learning candidates;
- validation and stress-test runs;
- certification decisions;
- supersession proposals;
- release/certification evidence.

Raw staged evidence is retained indefinitely. The staging environment must be a persistent branch, not an ephemeral preview branch, and must not be deleted as part of normal pull-request lifecycle. Because indefinite retention cannot depend on a single branch instance, implementation must include a recoverable backup/export policy for the staging evidence ledger and certification evidence.

Supabase staging-project data is treated as isolated staging data. Runtime rows are not assumed to transfer to production through schema deployment. Production learning is promoted only through the Certification & Promotion Gateway.

### 4.3 Git Implementation Staging

The implementation is developed on a Git feature branch named `feature/datanest-ai-governed-memory`.

Because the redesign depends on the approved External AI Companion trace/handoff work, the implementation branch should begin from the companion branch head unless that work has already merged to `main`. Before final production PR, the DataNest AI branch must be rebased or otherwise aligned to the resulting production base.

The branch itself is not created during design/specification. Branch creation is part of the implementation plan and execution stage.

## 5. Core Components

### 5.1 DataNest AI Workspace

The current R&D/UNIFI Copilot experience becomes a dedicated DataNest AI workspace with four functional areas:

1. **DataNest AI Chat**
   - primary human development-input surface;
   - every message is staged and traced before inference;
   - each turn displays Job ID and trust state.

2. **Current Job Context**
   - selected Job Manifest;
   - current development status;
   - recent human inputs;
   - AI Companion returns;
   - current learning candidates;
   - no contribution points, stake, or credit scoring.

3. **Certified Memory**
   - project-wide reusable certified knowledge;
   - provenance summary;
   - source Job IDs;
   - certification class;
   - version;
   - supersession state.

4. **Learning & Certification Console**
   - role-gated;
   - trend clusters;
   - candidate learnings;
   - validation evidence;
   - stress-test evidence;
   - conflicts;
   - certification actions.

### 5.2 Intake Gateway

The Intake Gateway is the only supported path for new learning input.

For every human or AI Companion input it must:

- authenticate the caller;
- resolve project, job, and session;
- validate source type;
- assign a unique trace ID;
- record source identity/provider where applicable;
- store immutable raw content;
- store content hash;
- store lineage metadata;
- return the staged event ID before inference begins.

The browser never receives staging service credentials and does not connect to the staging database with privileged credentials. The Intake Gateway runs server-side, authenticates the production DataNest caller, enforces project/job authorization, and uses server-held staging credentials to write the isolated staging environment.

If the staging write fails, the AI request fails closed. DataNest AI must not silently answer an untracked development input.

### 5.3 DataNest AI Runtime

The AI runtime assembles context in this order:

1. system governance and policy;
2. certified project-wide memory;
3. current Job Manifest;
4. current-session uncertified evidence;
5. current user message.

Uncertified current-session evidence must remain explicitly distinguishable from certified memory in the runtime envelope and UI.

The runtime may route to approved hosted or future local models through DataNest-managed provider policy. The end-user identity remains **DataNest AI**.

Cross-environment reads of current-session staged evidence also occur server-side. Production browser clients receive only authorized application responses, not branch service credentials. Certification-console reads and writes likewise pass through authenticated server-side gateways so staging isolation does not depend on client secrecy.

### 5.4 Trend Engine

The Trend Engine analyzes staged evidence to identify recurring patterns such as:

- repeated requirements;
- recurring failures;
- repeated implementation decisions;
- architecture patterns;
- recurring user requests;
- repeated provider/runtime issues;
- contradictory evidence.

A trend cluster is evidence organization, not certified knowledge.

### 5.5 Learning Candidate Builder

The Candidate Builder creates a proposed reusable learning from one or more staged evidence records.

A candidate contains:

- candidate ID;
- project ID;
- source Job IDs;
- evidence event IDs;
- normalized proposed knowledge;
- category;
- risk class;
- evidence count;
- conflict state;
- confidence/evidence indicators;
- policy version;
- created timestamp.

A candidate is not retrievable as project-wide memory until certified and promoted.

### 5.6 Certification & Promotion Gateway

This is the only route from staged learning into production certified memory.

It verifies:

- candidate state;
- required validation gates;
- content hash;
- evidence lineage;
- certification authority;
- policy version;
- risk class;
- conflict state;
- idempotency key.

Only a sealed certified-memory object and required provenance metadata are promoted. Raw staged content remains in staging.

## 6. Staging Data Model

The detailed physical DDL is deferred to the implementation plan, but the logical schema is fixed by this design.

### 6.1 `ai_intake_events`

Immutable raw input ledger.

Required fields include:

- `id`;
- `trace_id`;
- `project_id`;
- `job_id`;
- `session_id`;
- `source_type` such as `human`, `ai_companion`, `datanest_ai`, or `legacy_import`;
- `source_user_id` when applicable;
- `source_provider` when applicable;
- `external_ai_session_id` when applicable;
- `parent_event_id` when applicable;
- `content`;
- `content_hash`;
- `metadata`;
- `created_at`.

Raw content is append-only and is never overwritten by certification state changes.

### 6.2 `ai_sessions`

Tracks DataNest AI conversations and trust context.

Each inference turn references:

- Job ID;
- input event IDs;
- certified-memory IDs used;
- uncertified current-session event IDs used;
- provider route;
- policy version;
- output event ID;
- timestamps.

### 6.3 `ai_trend_clusters`

Groups related evidence and preserves the input IDs that support the grouping.

### 6.4 `ai_learning_candidates`

Holds proposed reusable learnings and their current certification lifecycle state.

### 6.5 `ai_validation_runs`

Stores immutable results for audit, verification, validation, and stress-test executions, including test suite version, candidate version, status, findings, and timestamp.

### 6.6 `ai_certification_decisions`

Immutable decision ledger containing:

- candidate ID;
- decision;
- risk class;
- automation or human authority identity;
- required authority tier;
- evidence references;
- reason;
- policy version;
- content hash;
- timestamp.

### 6.7 `ai_memory_supersessions`

Records replacement, contradiction, or deactivation relationships without deleting historical memory.

## 7. Production Certified Memory Model

Production contains a compact certified-memory store rather than the raw learning ledger.

A certified memory record includes:

- memory ID;
- project ID;
- normalized certified knowledge;
- category;
- effective version;
- certification ID;
- source Job IDs;
- source trace IDs or sealed provenance reference;
- certification class;
- confidence/evidence indicator;
- policy version;
- content hash;
- active state;
- supersedes/superseded-by relationships;
- promoted timestamp.

Production must not treat raw staging events as retrievable project-wide memory.

## 8. Certification State Machine

The required state flow is:

`INTAKE -> AUDITED -> VERIFIED -> VALIDATED -> STRESS_TESTED -> CERTIFICATION_REVIEW -> CERTIFIED`

Failure states include:

- `NEEDS_EVIDENCE`;
- `REJECTED`;
- return to an earlier gate when evidence or implementation must be revised.

No supported path may skip directly from intake to certified.

## 9. Certification Policy

### 9.1 Automated Certification

Auto-certification is permitted only when all of the following are true:

- every automated gate passes;
- the candidate is low-risk;
- evidence is sufficiently repeated;
- no unresolved contradiction exists;
- the learning remains within an already certified operating pattern;
- the candidate does not affect architecture, authorization, security, governance, destructive operations, production policy, or other high-risk categories.

### 9.2 Admin Certification

Admins may certify normal project knowledge after required gates pass.

### 9.3 Owner Certification

Owner approval is required for:

- architecture changes;
- security changes;
- authentication/authorization changes;
- governance changes;
- destructive actions;
- production-policy changes;
- conflicting knowledge;
- changes that materially affect DataNest AI's future behavior or trust boundary.

Authority checks are server-side. UI visibility is not considered an authorization mechanism.

## 10. Dual-Context Reasoning Rules

Uncertified staged input can be used immediately only when:

- it belongs to the current Job;
- it belongs to the current DataNest AI session or an explicitly linked current-session context;
- its trust state remains marked as uncertified;
- it is not written into project-wide certified memory;
- it is not used as project-wide context for another Job.

Certified memory may be used across the project.

This prevents staged information from one Job from silently becoming truth in another Job.

## 11. Auditable Reasoning Envelope

For every DataNest AI response, the system stores an operational reasoning envelope containing:

- response/output trace ID;
- project ID;
- Job ID;
- session ID;
- model/provider route;
- input event IDs;
- certified-memory IDs used;
- uncertified current-session event IDs used;
- policy version;
- timestamps;
- request/result status.

The system does **not** store or expose private model chain-of-thought. The envelope records provenance and operational evidence, not hidden internal reasoning.

## 12. External AI Companion Integration

The existing External AI Companion remains an input channel.

An imported Companion result must:

- enter staging as `source_type = ai_companion`;
- preserve provider identity;
- preserve External AI session ID;
- preserve Job ID;
- preserve existing DataNest Trace Key;
- receive a staging intake event ID and content hash;
- be usable immediately only in the same Job/session as uncertified context;
- pass the same certification pipeline before project-wide learning.

Cross-origin provider pages remain outside DataNest scraping/reading behavior.

## 13. Legacy R&D and Contribution Cleanup

### 13.1 Remove from active product

Remove active product workflows for:

- R&D Contributions panel;
- contribution scoring;
- contribution acceptance/reversal;
- suggested stake calculations;
- external-AI credit scoring;
- stakeholder contribution-share calculations;
- user-facing stake-credit allocation derived from contribution activity.

### 13.2 Preserve as legacy audit evidence

Existing `contribution_ledger` records and related historical scoring evidence are preserved as frozen legacy audit data unless a later explicit data-retention policy authorizes deletion.

They do not automatically enter DataNest AI learning.

### 13.3 Existing R&D AI tables

`job_inputs`, `ai_messages`, `ai_prompt_queue`, and `ai_development_updates` stop being the primary learning substrate.

Where historical development content is useful, an explicit migration/import process may create `legacy_import` intake events that preserve original IDs and provenance. Historical data is not silently treated as certified memory.

## 14. Provider, Budget, and Security Controls

The redesign retains operational controls needed by DataNest AI:

- provider connections;
- server-side provider credentials;
- provider/domain allowlists;
- usage accounting;
- request/token/cost budget controls where configured;
- concurrency limits;
- permitted provider/model policy;
- authentication;
- authorization;
- RLS.

These controls are decoupled from contribution scoring and stake-credit semantics.

## 15. Error Handling and Failure Modes

### 15.1 Staging failure

If intake cannot be recorded, the chat request fails closed. No untracked development response is produced.

### 15.2 Provider failure

The runtime may fall back to another approved provider route when policy allows. The resulting response must retain a complete operational trace envelope.

### 15.3 Certification service failure

Chat may continue using current-session uncertified evidence, but no candidate is promoted until certification infrastructure is healthy.

### 15.4 Promotion retry

Promotion is idempotent. Retries must not duplicate certified-memory records.

### 15.5 Conflict detection

A candidate that conflicts with active certified memory cannot auto-certify. It requires explicit review and supersession handling.

## 16. Security Requirements

All exposed staging and production tables must have appropriate RLS.

Security-sensitive operations such as certification and promotion must use server-side functions/RPCs or Edge Functions with explicit authorization. Any `SECURITY DEFINER` function must have narrowly scoped behavior, explicit search path, explicit grants, and tests proving unauthorized callers cannot use it.

Production promotion must validate authority independently of client-submitted role labels.

Secrets remain server-side and are never returned to the browser.

## 17. Stress-Testing and Certification Suite

### 17.1 Trust-boundary tests

Test:

- cross-Job leakage;
- cross-user access;
- uncertified-memory retrieval;
- direct production-memory insertion;
- lifecycle state skipping;
- privilege escalation.

### 17.2 Lineage tests

Every promoted memory must resolve through:

`memory -> certification decision -> validation runs -> candidate -> intake evidence -> Job IDs / trace IDs`

Missing required provenance blocks promotion.

### 17.3 Adversarial AI tests

Test:

- prompt injection inside human input;
- malicious AI Companion output;
- attempts to self-certify;
- fabricated certification IDs;
- poisoned trend clusters;
- contradictory evidence;
- attempts to override governance through content.

### 17.4 Certification authority tests

Verify:

- low-risk automation cannot certify high-risk categories;
- Admin cannot perform Owner-only certifications;
- UI manipulation cannot bypass server checks;
- invalid or stale policy versions are rejected.

### 17.5 Reliability and load tests

Test:

- concurrent users;
- duplicate submissions;
- request retries;
- provider timeouts;
- staging outages;
- promotion retries;
- high-volume trend processing;
- idempotent intake;
- idempotent certification and promotion.

### 17.6 Browser acceptance tests

Add Playwright CI coverage for:

1. select Job;
2. enter human development input;
3. receive trace ID;
4. receive DataNest AI response;
5. see uncertified status;
6. inspect learning candidate;
7. validate/stress-test;
8. certify with correct authority;
9. observe certified memory becoming project-wide context.

The External AI Companion import path receives equivalent end-to-end coverage.

## 18. Release Lifecycle

The implementation release gates are:

`DEVELOP -> AUDIT -> VERIFY -> VALIDATE -> STRESS TEST -> CERTIFY -> PROMOTION READY -> MAIN`

Failures in memory isolation, RLS, authorization, provenance, certification, or promotion integrity are blocking failures.

The existing CI baseline remains and is expanded rather than replaced.

Required CI/release evidence includes:

- unit tests;
- TypeScript check;
- dependency audit;
- production build;
- provider-agnostic container build;
- database migration validation;
- RLS/security tests;
- certification state-machine tests;
- promotion idempotency tests;
- Playwright browser acceptance tests;
- exact-head release manifest.

## 19. Promotion and Rollback

### 19.1 Code promotion

Only the exact candidate commit with all required checks green is eligible for production PR/merge.

### 19.2 Knowledge promotion

Knowledge promotion is separate from code merge.

The Certification & Promotion Gateway validates the sealed candidate and writes a new append-only production certified-memory version.

### 19.3 Knowledge rollback

Bad knowledge is not deleted. The current record is deactivated/superseded and an earlier valid version can become active again.

### 19.4 Code rollback

Application code can return to a previous certified release independently from knowledge rollback.

Raw staging evidence remains untouched by either rollback type.

## 20. Data Retention

Raw human and AI Companion inputs remain indefinitely in the persistent staging environment under the approved design.

Retention applies to evidence even after certification, rejection, or supersession so the system can perform longitudinal trend analysis and later re-audit.

The retention mechanism must survive branch/service recreation through documented, encrypted backup/export and restore procedures. A staging project deletion must never be treated as an acceptable retention mechanism or normal cleanup step.

## 21. Migration Strategy

Implementation must use a non-destructive migration sequence:

1. add the new staging schema and certification model;
2. add DataNest AI runtime and UI behind controlled rollout;
3. integrate External AI Companion into staged intake;
4. run migration/compatibility checks against current Job Manifest workflows;
5. optionally import selected historical development evidence as `legacy_import`;
6. run the full certification suite;
7. cut the active UI from UNIFI Copilot/R&D Contributions to DataNest AI;
8. freeze contribution/stake-credit workflows;
9. preserve legacy records read-only;
10. promote only after exact-head tests and governed acceptance pass.

No destructive historical deletion is part of this design.

## 22. Non-Goals

This redesign does not:

- train or modify foundation-model weights from raw user input;
- make uncertified evidence project-wide memory;
- expose provider credentials to users;
- expose private model chain-of-thought;
- delete historical contribution records;
- automatically merge Supabase branch runtime data into production;
- remove Job Manifests as the primary development trace anchor;
- remove provider/budget/security controls required for AI operations.

## 23. Acceptance Criteria

The redesign is complete only when all of the following are demonstrated:

- no user-facing UNIFI Copilot remains in the DataNest AI workflow;
- R&D contribution/stake-credit scoring is removed from active product behavior;
- every new human and AI Companion input is staged before inference;
- every AI response has a traceable operational envelope;
- uncertified evidence cannot influence a different Job;
- certified memory can be reused project-wide;
- every certified memory has complete lineage to source evidence and certification;
- hybrid certification rules are enforced server-side;
- Owner-only categories cannot be certified by Admin or automation;
- trend analysis produces candidates without silently promoting them;
- raw staged inputs remain retained;
- contribution history remains preserved but inactive;
- production promotion is append-only and idempotent;
- knowledge supersession preserves history;
- provider, budget, and security controls continue to function;
- the complete exact-head CI, database security checks, stress tests, and browser acceptance suite pass before production merge.

## 24. Implementation Boundary

This document authorizes the next architectural stage only: creation of a detailed implementation plan after user review of this written specification.

It does not authorize implementation, branch creation, schema deployment, Supabase branch creation, production mutation, or merging to `main` by itself. If Supabase branch creation carries plan or usage cost, implementation must obtain the required cost confirmation before creating it.
