# DataNest External Audit & Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a governed, evidence-linked external assessment workspace with selected ISO standards, traceable documentation, reviewer decisions, and approved UNIFI handoff.

**Architecture:** A project-scoped Supabase assessment ledger stores immutable source snapshots, standards profiles, findings, actions, and review events. A narrow Edge Function acquires public sources and runs DataNest AI analysis against applicable Certified Memory; the UI reads and exports the trace chain. Approved actions alone create UNIFI jobs through an idempotent RPC.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase Postgres/RLS/Edge Functions, Deno, Node tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-datanest-external-audit-optimizer-design.md`

## Global Constraints

- Product display name **DataNest External Audit & Optimizer**; short label **External Auditor**; slug `external-audit-optimizer`.
- First release: authenticated project members; `owner/admin/operator` create assessments; `owner/admin` or explicitly designated reviewer approves actions; viewers read only within project.
- Public HTTPS sources and user-supplied governed documents only; no private-repo credentials or autonomous changes.
- Selected ISO editions and applicability are pinned to each assessment revision; ISO 19011:2026 and ISO 9001:2026 are current on 2026-09-29.
- No proprietary ISO text in source or public page; metadata, original summaries, official links and authorized licensed references only.
- External input is untrusted. Raw evidence does not become Certified Memory without existing validation and promotion.
- Only approved optimization actions create UNIFI jobs; scheduler UNKNOWN never grants execution.
- Free promotion remains; no checkout, subscription or billing UI.
- Reports are assessments with explicit limits, never ISO certification or accreditation claims.

## Review Focus

1. A public URL redirects to `127.0.0.1` or a private address: acquisition refuses the redirect and records a coverage gap (Task 3).
2. A source changes after findings were drafted: the prior hash and report remain, and a new revision is required (Tasks 2 and 5).
3. A viewer tries to approve an action or fetch another project's export: server rejects both (Tasks 2 and 5).
4. ISO edition changes after an assessment: prior profile and report retain the pinned edition and show a rebaseline prompt (Tasks 1 and 6).
5. AI times out or omits an evidence citation: evidence remains resumable; no completed unsupported finding appears (Task 4).

---

## File map

- `src/lib/externalAuditStandards.ts`: versioned standards metadata and applicability choices; no licensed text.
- `src/lib/externalAuditTypes.ts`: shared assessment DTOs, states and trace IDs.
- `src/lib/externalAuditClient.ts`: typed Supabase function/RPC calls and export reads.
- `src/components/ExternalAuditor.tsx`: assessment intake, standards selection, review, and traceable documentation.
- `src/components/ExternalAuditDocuments.tsx`: document register and accessible HTML/CSV/JSON exports.
- `src/app/external-auditor.css`: scoped responsive styling.
- `src/components/DataNestApp.tsx`, `src/components/ProductsWorkspace.tsx`: navigation and product link; no broad restructuring.
- `supabase/migrations/20260929xxxxxx_external_audit_foundations.sql`: tables, RLS, access and indexes.
- `supabase/migrations/20260929xxxxxx_external_audit_operations.sql`: profile approval, finding review, action approval, and atomic idempotent UNIFI linkage.
- `supabase/migrations/20260929xxxxxx_external_audit_memory_receipts.sql`: assessment-scoped receipt extension without weakening existing job receipts.
- `supabase/functions/_shared/externalAuditFetch.ts`: safe URL resolution and bounded fetch.
- `supabase/functions/_shared/externalAuditAnalysis.ts`: structured output validation and source/criterion support checks.
- `supabase/functions/external-audit/index.ts`: authorized intake/snapshot/analysis API.
- `tests/unit/external-audit-standards.test.mjs`, `tests/unit/external-audit-fetch.test.mjs`, `tests/unit/external-audit-analysis.test.mjs`, `tests/sql/external_audit_acceptance.sql`, `tests/browser/external-auditor.spec.ts`: meaningful acceptance coverage.

### Task 1: Standards register and profile rules

**Files:** Create `src/lib/externalAuditStandards.ts`, `src/lib/externalAuditTypes.ts`, `tests/unit/external-audit-standards.test.mjs`.

**Interfaces:**
- Produce `type StandardRef={id:string;edition:string;title:string;url:string;domains:string[];kind:"requirements"|"guidance"|"quality_model"}`.
- Produce `STANDARDS_REGISTER:readonly StandardRef[]`, `selectSuggestedStandards(domains:string[]):StandardRef[]`, `validateStandardsProfile(input:StandardsProfileInput):StandardsProfile`.
- `StandardsProfile` includes `selected:{standardId:string;edition:string;applicability:string;licensedClauseRef?:string}[]`, `excluded:{standardId:string;reason:string}[]`, `reviewerId:string|null`, `approvedAt:string|null`, `version:number`.

- [ ] **Step 1: Write failing tests** for exact current editions and official URLs in the spec, conditional medical/AI suggestions, and rejection of an empty exclusion reason or unknown edition.
- [ ] **Step 2: Run** `node --test tests/unit/external-audit-standards.test.mjs`; expect failures for missing exports.
- [ ] **Step 3: Implement** the register and profile validation; preserve selected edition values instead of silently upgrading saved profiles.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Commit** standards metadata and tests.

### Task 2: Project-isolated assessment ledger

**Files:** Create `supabase/migrations/20260929xxxxxx_external_audit_foundations.sql`, `tests/sql/external_audit_acceptance.sql`.

**Interfaces:**
- Tables `external_audit_assessments` (project, target, goal, status, request key, revision), `external_audit_profiles` (assessment/revision, standard selections/exclusions, approval), `external_audit_sources` (kind, canonical reference, version/commit, fetched_at, SHA-256, locator, visibility, acquisition state), `external_audit_findings` (criterion, evidence IDs, observation, severity, confidence, state), `external_audit_actions` (finding, outcome, acceptance, priority, status, job ID), `external_audit_events` (append-only actor/time/payload), `external_audit_reviewers` (assessment, reviewer user ID, granted_by, active), and `external_audit_documents` (assessment/revision, kind, format, content hash, storage reference, generation time, visibility).
- `public.create_external_audit_v1(target_project uuid,target_request_key uuid,target_name text,target_kind text,target_goal text)` returns assessment ID and revision; duplicate key/same payload returns same ID, changed payload fails.
- RLS read for active project members and mutation permissions for operator/owner/admin; append-only evidence and events; deny cross-project foreign-key links.

- [ ] **Step 1: Add failing SQL acceptance cases** for project isolation, viewer mutation denial, duplicate request mismatch, immutable source snapshots, and cross-project evidence linking, plus reviewer grant and immutable document versions.
- [ ] **Step 2: Run** migration replay plus `tests/sql/external_audit_acceptance.sql` in the repository's SQL acceptance harness; expect the new objects missing.
- [ ] **Step 3: Implement** schema, RLS, indexes, request-key uniqueness and safe insert RPC; use existing `private.has_project_role` conventions.
- [ ] **Step 4: Rerun** acceptance SQL; expect pass with no cross-project leakage.
- [ ] **Step 5: Commit** ledger and acceptance tests.

### Task 3: Bounded source acquisition

**Files:** Create `supabase/functions/_shared/externalAuditFetch.ts`, `supabase/functions/external-audit/index.ts`, `tests/unit/external-audit-fetch.test.mjs`; add function configuration consistent with existing `datanest-ai-chat` deployment.

**Interfaces:**
- `validatePublicSourceUrl(raw:string):URL`.
- `fetchPublicSnapshot(url:URL,limits:{maxBytes:number;timeoutMs:number;maxRedirects:number}):Promise<{finalUrl:string;contentType:string;body:string;sha256:string;fetchedAt:string}>`.
- Function actions `create`, `snapshot`, `attach_document`, `read` with JWT-backed project role checks; `snapshot` writes acquisition success/failure as a new source record tied to assessment revision. `attach_document` accepts an existing governed project file reference or submitted text, verifies ownership/visibility, uses existing extraction controls, then snapshots its content hash and locator.

- [ ] **Step 1: Write failing tests** for HTTPS only, DNS/private/link-local/localhost and redirect rejection, oversized body, timeout, a normal public fixture, and cross-project or unapproved document references.
- [ ] **Step 2: Run** `node --test tests/unit/external-audit-fetch.test.mjs`; expect missing function failure.
- [ ] **Step 3: Implement** URL and each redirect-hop resolution checks, bounded response read and digest; store failures as coverage gaps. Do not fetch arbitrary URLs from browser code.
- [ ] **Step 4: Run** focused tests and Edge Function type check; expect pass.
- [ ] **Step 5: Commit** acquisition API and tests.

### Task 4: Governed AI analysis and assessment memory receipt

**Files:** Create `supabase/functions/_shared/externalAuditAnalysis.ts`, `supabase/migrations/20260929xxxxxx_external_audit_memory_receipts.sql`, `tests/unit/external-audit-analysis.test.mjs`; modify `supabase/functions/external-audit/index.ts` and the shared Certified Memory retrieval/receipt adapter only where required.

**Interfaces:**
- `validateAuditDraft(raw:unknown,context:{sourceIds:string[];criterionIds:string[]}):AuditDraft`, with `AuditDraft.findings` carrying `claimKind:"observed"|"inferred"|"unknown"`, evidence IDs, locator, limitation, severity, confidence, criterion ID and draft action.
- Function action `analyze` takes `{assessmentId,revision,clientRequestId}`, resolves approved profile and applicable Certified Memory, runs the configured provider, validates structured output, and records AI trace plus receipt.
- Extend `certified_memory_usage_receipts` with `assessment_id` and allow exactly one of `job_id` or `assessment_id`; keep existing job-scoped RPC behavior and uniqueness intact. Add service-only assessment-scoped recording RPC with the same retrieval strategy, query hash and selected IDs.

- [ ] **Step 1: Write failing tests** for unsupported citations becoming hypotheses, invalid source/criterion IDs rejected, timeout preserving pending state, and assessment receipt isolation/idempotency.
- [ ] **Step 2: Run** focused Node tests and SQL acceptance; expect missing interfaces.
- [ ] **Step 3: Implement** the analysis adapter through existing provider/policy/Certified Memory services; treat source text as data, not instructions. Persist only validated drafts and a confirmed receipt; on failure retain resumable evidence.
- [ ] **Step 4: Rerun** focused tests and SQL acceptance; expect pass.
- [ ] **Step 5: Commit** analysis and receipt extension.

### Task 5: Review decisions and atomic UNIFI handoff

**Files:** Create `supabase/migrations/20260929xxxxxx_external_audit_operations.sql`; extend `tests/sql/external_audit_acceptance.sql`; create `src/lib/externalAuditClient.ts`.

**Interfaces:**
- `public.review_external_audit_finding_v1(target_finding uuid,target_decision text,target_reason text)` records append-only decision and state.
- `public.approve_external_audit_action_v1(target_action uuid,target_request_key uuid)` checks owner/admin or an active assessment reviewer who also has an operator role, approved criterion/profile and evidence, then calls `create_job_manifest_v2` atomically and links the returned job. Duplicate/same key returns same job; changed key/payload fails. `public.close_external_audit_action_v1(target_action uuid,target_verification_source uuid,target_reason text)` requires authorized review and same-project verification evidence.
- Client methods `createAssessment`, `snapshotSource`, `analyzeAssessment`, `reviewFinding`, `approveAction`, `loadAssessment` use the exact backend contracts.

- [ ] **Step 1: Add failing SQL cases** for viewer/operator approval denial, missing evidence/profile denial, a delegated reviewer from another project, one job under concurrent retry, changed request payload rejection, append-only review history, and closure without verification evidence.
- [ ] **Step 2: Run** acceptance SQL; expect missing RPCs.
- [ ] **Step 3: Implement** narrow security-invoker/definer semantics as required, explicit role checks, atomic idempotent job linkage and trace events; no scheduler state change.
- [ ] **Step 4: Rerun** acceptance SQL and `npm run check`; expect pass.
- [ ] **Step 5: Commit** review operations and client adapter.

### Task 6: Tool page and traceable documents

**Files:** Create `src/components/ExternalAuditor.tsx`, `src/components/ExternalAuditDocuments.tsx`, `src/app/external-auditor.css`, `tests/browser/external-auditor.spec.ts`; modify `src/components/DataNestApp.tsx` and `src/components/ProductsWorkspace.tsx`.

**Interfaces:**
- `ExternalAuditor({projectId,currentUserId,role}:{projectId:string;currentUserId:string;role:PortfolioRole})`.
- `ExternalAuditDocuments({assessment,profile,sources,findings,actions,events}:ExternalAuditDocumentProps)` renders audit plan, applicability matrix, evidence register, criterion trace matrix, findings/action register, review log and assessment report.
- Export helper `buildAuditExport(kind:DocumentKind,assessment:AssessmentBundle):string` formats an authorized versioned document. A server-side `publish_external_audit_document_v1(assessment_id,revision,kind,format,content_hash,storage_ref)` writes immutable report metadata after rechecking access and revision; the stored content hash is calculated server-side from rendered content. `downloadAuditDocument(documentId:string):Promise<void>` reads the authorized immutable document. Accessible HTML is always available, with CSV/JSON downloads.

- [ ] **Step 1: Write failing browser cases** for navigation, standards edition/exclusion, evidence-to-finding drill-down, authorized immutable export with matching hash, cross-project export denial, changed source stale indicator, and unavailable inference pending state.
- [ ] **Step 2: Run** `npx playwright test tests/browser/external-auditor.spec.ts`; expect missing view.
- [ ] **Step 3: Implement** an `External Auditor` view under Products and a product-registry link; show scope/coverage, status, review actions, all versioned documents and official ISO links. Use project role controls while relying on backend RLS as authority.
- [ ] **Step 4: Run** browser test, `npm run check`, `npm run build`; expect pass.
- [ ] **Step 5: Commit** tool page and browser coverage.

### Task 7: End-to-end release evidence

**Files:** Modify `README.md` and release documentation; add deployment/function configuration to the existing CI path only where needed.

**Interfaces:** Release evidence names the feature `external-audit-optimizer`, seeded synthetic source/profile and assessment revision, memory receipt, review event, UNIFI job ID, and report hash.

- [ ] **Step 1: Add a staging acceptance fixture** covering intake → source snapshot → profile approval → analysis → reviewer approval → one Job → verification evidence → export.
- [ ] **Step 2: Run** `npm test`, `npm run check`, `npm run build`, SQL acceptance, Edge Function checks and the focused browser flow; record exact outputs.
- [ ] **Step 3: Fix only observed failures**, then rerun the affected gate.
- [ ] **Step 4: Update** docs with access, coverage limits, standards edition refresh and recovery steps; retain assisted-assessment label.
- [ ] **Step 5: Commit** release evidence and open implementation PR for normal CI/certification review. Deployment follows DataNest's existing staging/promotion gates.
