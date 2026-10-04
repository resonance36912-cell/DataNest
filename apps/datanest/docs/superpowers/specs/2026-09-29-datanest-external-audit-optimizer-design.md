# DataNest External Audit & Optimizer — Design

Date: 2026-09-29
Status: Design approved in conversation; implementation pending written-spec review
Repository: `DataNest-Supository/DataNest`

## 1. Intent and nomenclature

Build **DataNest External Audit & Optimizer** as a governed DataNest product workspace. It helps authenticated members assess an external project, application, website, or product, explain what the available evidence supports, and turn reviewed improvements into executable DataNest work.

- Display name: **DataNest External Audit & Optimizer**
- Short UI label: **External Auditor**
- Stable product slug: `external-audit-optimizer`
- Audit record: **Assessment**
- Output units: **Findings** and **Optimization actions**
- Lifecycle: Intake → Evidence snapshot → Analysis → Human review → Approved optimization → UNIFI Job Manifest → TranScheduler execution → Verification → Closure

This workspace is distinct from **Transparency**, which publishes DataNest's own audit documents and accountability record, and from **Product Lab**, which registers versioned product surfaces and human test runs. It is governed by DataNest, not RONSAS. It uses existing portfolio terminology without classifying every external target as a DataNest-owned product.

## 2. Users and first-release scope

The first release serves authenticated members of a DataNest project. A member with operational permission can create an assessment and submit public sources or documents they are authorized to provide. A project viewer may read permitted assessments; only an owner/admin or designated reviewer can approve optimization actions for execution. Project isolation and role checks must be enforced in the backend, not merely hidden in the UI.

Initial intake supports:
1. Public HTTPS URLs, including a live product surface.
2. Public GitHub repository URL and immutable commit/ref identity when available.
3. User-supplied documents or text via existing governed intake/upload paths, with provenance and visibility recorded.
4. A user-written goal, target type, audience, jurisdiction when relevant, and selected audit domains.

Private repository connectors, credential storage, authenticated browsing, autonomous code changes, continuous monitoring, client self-service submission, and full production certification are outside the first release. A source that cannot be fetched or observed becomes a coverage gap, never an inferred pass or fail. Public URL acquisition must use a server-side allow/deny policy against localhost, private/link-local addresses, redirects to forbidden hosts, oversized responses, and unsafe protocols. An uploaded source follows existing file size, type, extraction and authorization controls.

## 3. Relationship to DataNest AI and learning

The audit uses the existing DataNest AI request path and approved inference provider. It retrieves applicable **Verified/Certified Memory** under the project's existing applicability and visibility rules. The analysis trace carries the existing memory usage receipt (selected memory IDs, scope, strategy, counts and query hash) so a reviewer can see which certified knowledge influenced it. It must not disclose the private founder baseline, Development Command working memory, another project's data, or raw private prompts in a public report.

Assessment evidence, model suggestions, and reviewer comments are provisional project records. They do not update Certified Memory merely because the model repeated them or a finding was approved. Only eligible evidence may form learning candidates, and reusable memory requires the existing validation, certification and explicit promotion gates. The tool never claims that a new foundation model was trained or that a ChatGPT account memory was imported.

The model can suggest findings and actions. It cannot decide an external target's ownership, certification status, legal compliance, production readiness, or closure. Those claims require the appropriate human and evidence gates. Prompt-injection text in external pages and documents is treated as untrusted source content and cannot override audit policy or tool permissions.

## 4. Assessment workflow and data boundaries

### Intake

A project member creates an assessment with target name, target kind (`project`, `product`, `application`, or `website`), objective, selected audit domains, and source references. The UI shows the scope before starting. A unique request ID makes submission retry-safe.

### Evidence snapshot

For each source, record source kind, canonical URL or upload reference, retrieval time, content hash, immutable commit/version if known, access/visibility class, acquisition result, and extracted evidence reference. Preserve an accessible evidence excerpt or locator for every asserted finding. A fetch failure is recorded with its reason; it is not silently omitted. Assessment revisions use new snapshots and retain earlier evidence.

### Analysis

The analysis produces structured draft findings with: domain, claim, severity, confidence, observed evidence IDs and locators, impact, limitation/unknowns, and proposed verification. Optimization actions link to findings, state expected outcome, priority, dependency, owner suggestion, acceptance criteria, and effort estimate as a range or unknown. Avoid numerical scores without an explicit rubric and observed inputs. Findings with no source support remain hypotheses clearly labelled for verification.

The response separates **Observed**, **Inferred**, and **Unknown**. The report states source coverage and review date, including any inaccessible authenticated flows, backend controls, runtime behavior, or inaccessible private code. If inference is unavailable, preserve intake and evidence; show analysis as pending with a retry action.

### Review and execution

A reviewer may confirm, amend, reject, or request more evidence for each finding. Approval of an optimization action creates a linked UNIFI Job Manifest only after an explicit authorized user action; TranScheduler applies its normal capability, dependency, reservation, and UNKNOWN-state controls. No assessment automatically edits an external system. Verification attaches new evidence to the action and closes it only after review. History remains append-only for decisions and evidence changes.

### Export

An authorized member can export a report with scope, source baseline, findings, recommendations, limitations, reviewer state, and evidence references. Export must apply the assessment's access class and omit private material from public views. A report is an assessment of observed material, not a DataNest certification badge.

## 5. Implementation boundaries

- **UI:** A DataNest Products entry and `External Auditor` workspace with intake, source coverage, draft findings, review, action queue, history, and export. Product Lab and Transparency may link to related records but do not become the authority for external assessments.
- **Backend:** A governed Supabase schema and Edge Function orchestration for authorized intake, safe source acquisition, structured analysis, review mutations, and report readback. Use the established DataNest AI and file ingestion contracts where they fit; avoid parallel memory or provider stores.
- **Data:** Separate project-scoped assessment, source snapshot, finding, action, and review-event records. Explicit foreign keys to project, evidence, AI trace, memory receipt, portfolio item when deliberately linked, and UNIFI job when approved. RLS grants only project-role-appropriate access; service writes remain narrow and audited.
- **Execution:** Only approved actions enter UNIFI and TranScheduler through existing authorization and idempotency contracts. The auditor does not grant scheduler capabilities or bypass certification.
- **Product registry:** Register as a DataNest-governed product; an audited external target is an assessment subject, not automatically an owned portfolio item. Free promotion remains in effect; no checkout or billing surface is added.

## 6. Standards profile and traceable documentation

The auditor must use a **standards profile** selected for each assessment. The profile records the target domain, intended market/jurisdiction, assessed entity and process boundaries, selected standard identifiers and editions, applicability rationale, exclusions, licensed reference availability, reviewer, review date, and profile version. Standards provide assessment criteria only where applicable; the tool must never treat an entire standard as automatically applicable to every target. A reviewer approves the profile before any report describes standards alignment.

The first-release standards register contains these verified reference entries (status checked against ISO on 2026-09-29):

| Assessment context | Reference | Use in the tool |
| --- | --- | --- |
| Management-system audit method | [ISO 19011:2026](https://www.iso.org/standard/19011) | Audit principles, programme, conduct and auditor competence guidance; guidance is not certification. |
| General quality management, when an organizational QMS is in scope | [ISO 9001:2026](https://www.iso.org/standard/9001) | QMS requirements; do not label a product conforming from a website review. |
| Generic risk framing | [ISO 31000:2018](https://www.iso.org/standard/65694.html) | Risk-management guidance, with explicit context and treatment rationale. |
| Software/ICT product quality | [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) | Product quality model and scoped quality characteristics. |
| Quality in use for software/ICT | [ISO/IEC 25019:2023](https://www.iso.org/standard/78177.html) | Context-of-use outcomes where usage evidence exists. |
| Interactive-system design | [ISO 9241-210:2019](https://www.iso.org/standard/77520.html) | Human-centred design process; requires process evidence beyond visual inspection. |
| Information security management | [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) | ISMS requirements where the organization and management system are in scope; public surface checks cannot establish conformance. |
| Privacy information management | [ISO/IEC 27701:2025](https://www.iso.org/standard/27701) | PIMS requirements and guidance when PII controller/processor practices are in scope. |
| AI management | [ISO/IEC 42001:2023](https://www.iso.org/standard/42001) | AIMS requirements where the organization provides or uses AI. |
| AI system quality and impacts | [ISO/IEC 25059:2023](https://www.iso.org/standard/80655.html); [ISO/IEC 42005:2025](https://www.iso.org/standard/42005) | Conditional AI quality model and impact-assessment guidance. |
| Medical-device product/QMS, only when applicable | [ISO 13485:2016](https://www.iso.org/standard/59752.html); [ISO 14971:2019](https://www.iso.org/standard/72704.html) | Conditional medical-device QMS and product risk management; specialist reviewer and jurisdictional regulatory analysis are required. |

A standards-register record stores identifier, edition, title, issuer, official URL, publication/status check date, applicability rule, standards family, and replacement/supersession relationship. Edition changes do not silently rewrite existing assessments. The UI flags a superseded edition and offers a reviewer-controlled rebaseline. Future sector profiles require an approved register update. No paid ISO text is copied into the public repository or page. The page may show ISO metadata, short original summaries, official links, and an authorized organization's own licensed clause references; clause-level conformance assertions require a licensed source and a qualified reviewer.

**Traceability chain:** `assessment/revision → approved scope/profile → criterion ID + edition + applicability → evidence snapshot ID + content hash + locator → test/observation ID → finding ID + status → optimization action ID → UNIFI job ID → verification evidence → reviewer decision/closure`. Each link stores actor, timestamp, source/version, rationale, and immutable event identity. A changed source, criterion, or conclusion creates a new revision and preserves prior history. “Not assessed”, “not applicable”, “insufficient evidence”, “observation”, “potential gap”, and “verified nonconformity” are distinct states; the final state is reserved for a competent reviewer with an approved criterion and adequate evidence.

The External Auditor page includes a **Standards & Traceability** section accessible to authorized project members. It provides:

- A readable standards catalogue with edition, applicability and official ISO link; selected profile and excluded standards with reasons.
- Versioned, downloadable **audit plan**, **scope/applicability matrix**, **evidence register**, **criterion-to-evidence trace matrix**, **findings and corrective-action register**, **review/approval log**, and **assessment report**. Formats are accessible HTML and downloadable CSV/JSON/PDF where supported; each export contains assessment ID, revision, generation time, visibility and content hash.
- A drill-down from each finding to criterion, evidence locator and snapshot, observation, reviewer decision, action, job, verification and closure. Broken or restricted evidence links are visibly reported.
- A documentation/version history that distinguishes source documents, generated working records, reviewed records, and published reports. Exports enforce project access and redaction rules.

This is a documented **assessment** workflow. DataNest must not issue an ISO certificate, imply accreditation, or use an ISO conformity badge from automated analysis. A public report must explicitly state the assessed scope, reference editions, exclusions, evidence limits, reviewer identity/status and that any certification remains with an authorized certification body.

## 7. Failure and abuse handling

- Invalid/blocked URL, redirect, timeout, extraction failure, or rate limit: preserve the request and show the precise source coverage gap; allow authorized retry.
- Duplicate request or interrupted response: reuse the idempotency key and reconcile durable state before allowing another mutation.
- Model timeout, malformed structured output, or missing memory receipt: do not claim completed analysis; retain trace and evidence for retry/investigation.
- Conflicting evidence or stale source baseline: mark findings as contested or stale and require a new assessment revision before closure.
- Cross-project source references, unauthorized role, or restricted memory: deny server-side without returning source contents.
- External instructions embedded in source material: ignore as instructions and retain as quoted evidence only when relevant.

## 8. Validation and acceptance

1. A project operator can create an assessment of a public target, see each source snapshot and coverage state, and receive a structured evidence-linked draft.
2. A reviewer can approve an action and find exactly one linked UNIFI job; a viewer cannot approve or create one. UNKNOWN scheduler capability never executes.
3. A second project cannot read or mutate the assessment, sources, report, memory context, or actions.
4. A blocked/private-network URL and a redirect to it fail safely with a visible gap.
5. Unsupported claims remain hypotheses; unavailable authenticated/backend areas are listed as unverified.
6. Certified memory use creates the established receipt, while raw audit inputs never appear in reusable Certified Memory without the governed promotion process.
7. A failed inference call leaves a resumable evidence snapshot and no misleading finished report.
8. A reviewer can select a standards profile, record applicability/exclusions, trace a finding through criterion, evidence, action and closure, and open or export all required versioned documents from the tool page. Superseding an edition retains the previous baseline. An unlicensed standard shows metadata and official links without copying paid text.
9. TypeScript, relevant unit/RLS and Edge Function tests, build, and a browser flow cover intake → standards profile → review → job linkage → traceable documentation. Report export is checked for access filtering, edition metadata, evidence references and redaction.

## 9. Rollout

Implement behind project-level availability controls, validate in DataNest AI staging with synthetic external targets and cross-project tests, then promote through the existing CI and certification process. The first production release is labelled **assisted assessment**. Wider private connectors, autonomous remediation, and client submission require later designs and their own security/consent reviews.
