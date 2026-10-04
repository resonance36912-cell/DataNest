# Resonance DataNest UI, Governance, and Legal System Design

**Date:** 2026-09-29  
**Repository authority:** `DataNest-Supository/DataNest`  
**Status:** Conversational design approved; written specification pending final user review  
**Scope:** Resonance DataNest root platform and all consolidated applications under `apps/ronsas/*`

## 1. Purpose

This specification defines the target experience architecture for Resonance DataNest across public, authenticated, operational, governance, legal, and consolidated application surfaces.

The redesign must make DataNest feel like one coherent governed operating platform rather than a collection of independently styled pages and applications. It must improve usability, visual consistency, responsive behavior, accessibility, workflow continuity, legal/operator clarity, and evidence traceability without weakening proven workflow behavior, governance gates, security controls, or the current free-promotion policy.

The design is architectural rather than cosmetic. It standardizes:

- business and platform identity;
- the shared design system;
- page and workflow architecture;
- legal and disclaimer presentation;
- RSGP governance presentation;
- application attribution;
- migration boundaries;
- validation, review, and production authorization.

## 2. Success Criteria

The design is successful when:

1. DataNest presents one recognizable Resonance visual language across the root platform and all consolidated applications.
2. Users can understand where they are, what matters now, what action is available next, and what evidence supports the current state.
3. The existing lifecycle remains explicit and consistent: **Discover → Govern → Build → Execute → Verify**.
4. DataNest AI remains a cross-cutting collaborator rather than being presented as the final decision-maker for consequential actions.
5. Business ownership and platform operation are clear without overcrowding dense operational screens.
6. Legal content is centralized, versioned, reviewable, and never silently published from AI-generated drafts.
7. RSGP governance is visible as a platform trust and control concept without implying external certification or accreditation.
8. Existing deep links, active-work context, draft resilience, mutation recovery, browser behavior, accessibility controls, and security thresholds remain intact unless a separately approved change intentionally replaces them.
9. The redesign does not reintroduce pricing, checkout, subscriptions, or paid CTAs while free promotion remains the active business direction.
10. Production release evidence is traceable from design approval through implementation, automated verification, review, authorization, deployment, and post-deployment verification.

## 3. Authoritative Product and Business Hierarchy

The UI shall use the following hierarchy:

- **Resonance Sole Proprietorship** — legal/operator entity.
- **Resonance App Development** — application-development business brand.
- **Resonance DataNest** — parent platform, ecosystem control plane, and governed operating environment.
- **Applications, functions, and service offerings** — products and capabilities governed through DataNest, including RONSAS and the consolidated applications and services.

RSGP sits across this hierarchy as the governance structure. It is not a separate company, product, or certification mark.

The acronym **RSGP must remain unexpanded in product copy until an authoritative governance document defines its expansion**. The interface must not invent or infer what the letters stand for.

### 3.1 Display strategy

The approved identity strategy is **brand-first with a governed legal layer**.

Dense operational screens use:

- primary identity: **Resonance DataNest**;
- compact trust signal: **RSGP Governed**.

The compact **RSGP Governed** trust marker must open or link to a concise explanation of the applicable governance context and a route to the Governance & Legal Centre. Its visual treatment must not resemble an external certification seal.

The complete operator statement appears consistently on:

- sign-in and public surfaces;
- the global footer;
- Governance & Legal Centre;
- Terms;
- Privacy/POPIA;
- Disclaimers;
- About/Governance;
- application footers;
- service-specific disclosures.

Base operator wording should follow this direction:

> Resonance DataNest is operated by Resonance Sole Proprietorship under the Resonance App Development brand. Platform applications, functions, and service offerings are governed through the RSGP governance structure.

Final production legal wording remains subject to authorized human/legal review.

### 3.2 Application attribution

Each consolidated application shall expose a consistent attribution pattern such as:

> SyncVision — a governed Resonance DataNest application by Resonance App Development.

The specific app retains its product name and approved accent. The attribution links back to DataNest and to the shared Governance & Legal Centre.

## 4. Visual System

### 4.1 Theme model

The primary platform experience remains **Resonance Sovereign Spectrum**:

- deep navy/black operational surfaces;
- restrained violet-magenta brand energy;
- cyan for information and system intelligence;
- semantic green, amber, and red reserved for state;
- product-specific accent colors used deliberately rather than as independent competing themes.

Supported presentation behavior:

1. **Sovereign Dark** — primary/default experience.
2. **Accessible Light** — required on each user-facing surface by completion of that surface's migration, with equivalent semantic state and contrast; surfaces not yet migrated may retain their existing theme behavior.
3. **High-contrast/reduced-effects behavior** — required on each migrated user-facing surface and driven by accessibility preferences and system/user motion settings, not treated as a decorative theme.

### 4.2 Canonical typography

The approved Resonance type system is:

- **Inter Tight** — page titles, headings, navigation emphasis, major metrics.
- **Inter** — body copy, forms, tables, operational controls.
- **Instrument Serif Italic** — sparingly on public/editorial hero moments; never used for operational data.
- **JetBrains Mono** — governance IDs, audit references, timestamps, technical state, compact system labels.

The directional mockup generated during design review is not a font specification. It must not introduce Montserrat or any other replacement typography.

Implementation must choose a deployment-safe font-loading method that works with the repository's static export and application build paths. Font files must not be exposed or shared outside normal application delivery.

### 4.3 Token model

The canonical token layer must cover:

- color;
- typography;
- spacing;
- radii;
- elevation;
- motion;
- breakpoints;
- semantic status;
- application accents;
- governance states.

The current accumulation of visual overrides must not be extended by another permanent stylesheet layer. Existing CSS may remain during migration, but durable values should progressively move into canonical tokens or focused component styles.

### 4.4 Surface hierarchy

Operational UI shall use four principal surface levels:

1. base canvas;
2. navigation/chrome;
3. work surface;
4. elevated control/dialog.

The redesign should reduce nested bordered-card stacks, excessive blur, and persistent neon glow. Glow is an attention mechanism, not a default decoration.

### 4.5 Status language

No meaningful state may rely on color alone.

Status presentation should combine:

- icon or shape;
- explicit text;
- semantic color;
- supporting evidence or explanation when applicable.

Example:

> Approved — Human authorization recorded

rather than an unexplained green indicator.

### 4.6 Motion

Motion must be purposeful:

- micro-interaction: approximately 120–180 ms;
- normal state transition: approximately 180–240 ms;
- panel/dialog transition: approximately 220–300 ms;
- prefer opacity and transform;
- avoid layout-shifting animation;
- avoid decorative infinite animation in operational workspaces;
- retain system `prefers-reduced-motion` behavior;
- retain DataNest's pause-animation control as authoritative.

AI/loading animation must represent real system state rather than merely appearing active.

## 5. Shared Page Architecture

Most operational pages shall follow this anatomy:

1. **Page identity** — title and purpose.
2. **Context** — project/application, lifecycle phase, governance state.
3. **Primary action** — one dominant next action where a clear next step exists.
4. **Situation summary** — current state and material blockers.
5. **Working surface** — the actual operational tool.
6. **Evidence and status** — audit, validation, confidence, source, or execution evidence.
7. **Next governed action** — what follows and what approval is required.

Each page must help answer:

- Where am I?
- What matters now?
- What can I do next?
- What evidence proves the current state?

## 6. Global Shell

The authenticated shell shall converge on:

### 6.1 Left navigation

- AI & I
- DataNest AI
- Discover
- Govern
- Build
- Execute
- Verify
- Applications
- Tasks & Projects
- Data & Files
- Reports & Insights
- Governance & Legal
- Settings

Navigation remains responsive and may group or collapse items, but the active lifecycle stage must stay evident.

### 6.2 Top bar

The top bar may include:

- global search / command palette;
- current work context;
- notifications;
- system state;
- RSGP Governed trust marker;
- account controls.

### 6.3 Context strip

Below the top bar, a compact context strip shall orient the user:

**Project/Application → lifecycle phase → current status → next governed action**

This becomes a consistent orientation anchor across workspaces.

## 7. Workflow Architecture

The current lifecycle remains authoritative:

**Discover → Govern → Build → Execute → Verify**

DataNest AI remains cross-cutting.

### 7.1 Home / Command Centre

The home experience is an operational launch surface, not a generic dashboard.

Priority sections:

- current objective and lifecycle state;
- continue your work;
- pending approvals;
- interrupted or draft workflows;
- needs attention;
- application launch shortcuts;
- business opportunity and projection signals;
- explainable AI recommendations.

### 7.2 Discover

Discover contains:

- Stakeholders;
- Sparks;
- Think Tanks;
- Business Opportunities;
- research;
- market/competitor signals where available;
- opportunity projections.

Opportunity records should support:

**Opportunity → evidence → assumptions → estimated value → confidence → dependencies → governance impact → recommended next step**

AI identification must not automatically promote an opportunity into execution.

### 7.3 Govern

Govern becomes the decision layer between discovery and execution.

Primary capabilities:

- governance overview;
- decision register;
- Platform Update Suggester;
- control/policy library;
- review queues;
- human/external authorization.

The update flow is:

**self-audit → suggested update → impact assessment → human/external review → approval/rejection → scheduled implementation → verification → production authorization**

A suggestion never becomes live merely because it was AI-generated.

### 7.4 Build

Build consolidates:

- Product Lab;
- application development;
- content/assets;
- AI-assisted creation;
- integrations/configuration;
- prototypes;
- test environments.

Every build item should surface owner, purpose, lifecycle stage, AI involvement, dependencies, governance classification, evidence, and readiness.

Readiness states should distinguish at least:

- Draft;
- Prototype;
- Reviewable;
- Approved for execution;
- Production candidate.

### 7.5 Execute

Execute includes:

- UNIFI Planner;
- TranScheduler;
- deployment/run control;
- automation;
- task execution;
- service operations;
- application launches.

Execution pages should expose:

**Intent → Plan → Dependencies → Authorization → Execution → Live status → Evidence**

External, destructive, financial, regulatory, or production-impact actions must visibly expose authorization state before execution.

### 7.6 Verify

Verify includes:

- checkpoints;
- audits;
- test evidence;
- production validation;
- outcome verification;
- incident findings;
- regulatory evidence;
- transparency records.

Verification must make the causal chain navigable:

**why → who approved → what ran → what changed → what evidence exists → what remains unresolved**

## 8. DataNest AI and AI & I

### 8.1 DataNest AI

DataNest AI may:

- interpret context;
- summarize evidence;
- recommend next steps;
- identify missing information;
- propose updates;
- highlight risk;
- assist drafting;
- detect contradictions;
- surface precedent;
- project opportunity or impact.

For consequential work, responses should increasingly surface:

- Recommendation;
- Why;
- Evidence used;
- Confidence;
- Assumptions;
- Governance impact;
- Human action required.

The UX must not visually position DataNest AI as final authority for consequential decisions.

### 8.2 AI & I

AI & I is the collaborative entry surface around current work context rather than a disconnected chatbot.

Relevant context may include:

- active project;
- relevant documents;
- recent decisions;
- pending tasks;
- applicable governance;
- prior AI work;
- unresolved issues.

Conversation outputs should be convertible into governed artifacts, tasks, decisions, opportunities, or application actions where supported.

## 9. Tasks, Projects, and Applications

### 9.1 Tasks & Projects

Tasks should expose:

**Project → phase → application → owner → priority → evidence requirement → status → next action**

Useful views include:

- My Work;
- delegated/team work;
- AI-proposed work;
- Awaiting Review;
- Blocked;
- Completed;
- Audit Required.

### 9.2 Applications

Application cards should expose:

- identity;
- purpose;
- current operational state;
- relevant project;
- last activity;
- governance state;
- availability.

Where technically feasible, navigation should preserve context:

**DataNest → app → work → evidence → return to DataNest**

## 10. Active Work Context and Continuity

The redesign must preserve and strengthen a lightweight Active Work Context containing:

- current project;
- lifecycle phase;
- selected application;
- selected artifact/task;
- recent evidence;
- pending action.

Existing URL history, deep linking, draft resilience, task guides, mutation recovery, keyboard switching, and evidence-confidence behavior are protected architectural constraints.

No visual refactor may remove them accidentally.

## 11. Governance & Legal Centre

The global centre is a first-class destination.

### 11.1 Platform Governance

- RSGP overview;
- decision authority;
- AI governance;
- human/external review;
- change control.

### 11.2 Legal

- Terms & Conditions;
- Privacy / POPIA;
- Disclaimers;
- Acceptable Use;
- Intellectual Property;
- service-specific addenda.

### 11.3 Transparency

- platform update history;
- governance changes;
- audit records;
- material policy changes.

### 11.4 Accessibility

- accessibility statement;
- motion settings;
- support pathways.

### 11.5 Business Identity

- Resonance Sole Proprietorship;
- Resonance App Development;
- Resonance DataNest;
- governed application/service hierarchy.

Legal records must carry:

- version;
- effective date;
- approval state;
- review owner;
- change history.

A dynamic current date must never masquerade as an approved legal effective date.

Unverified claims about encryption, retention, third-party AI handling, security guarantees, or regulatory compliance must not be copied into production legal text without evidence.

## 12. Governed Action Model

Consequential actions use the shared lifecycle:

**AI proposed → system checked → human/external review required → authorized → scheduled → executed → verified**

The UI should expose:

- originator;
- applicable control/governance context;
- evidence;
- review state;
- authorization identity;
- resulting verification.

This model applies to:

- production deployment;
- destructive changes;
- legal/policy changes;
- material external publication;
- regulated actions;
- financial/economic authority;
- other high-impact actions defined by governance.

Low-risk ordinary interface actions must not be burdened with unnecessary approval ceremony.

## 13. Legal Drafting and Production Policy

Legal or policy text created or materially changed during this redesign is a **governed draft** until authorized review is complete.

Required treatment:

1. drafting may occur in development;
2. automated checks may verify structure and links;
3. human/legal review must approve substance;
4. approved version/effective-date metadata must be recorded;
5. only then may the production legal content be authorized for release.

The product must not describe AI-generated legal language as legal advice or as externally certified policy.

## 14. Accessibility and Responsive Behavior

The redesign must preserve or improve:

- skip navigation;
- keyboard operation;
- visible focus;
- semantic headings;
- accessible names;
- responsive navigation;
- reduced-motion behavior;
- pause-animation behavior;
- readable labels and status text;
- 320 px no-horizontal-overflow baseline for public/root layouts;
- practical touch target sizing;
- non-color-only status communication.

Tables remain tables where comparison matters. On narrow screens, action-oriented row interfaces may convert to structured cards; comparison-heavy tables may use deliberate, labeled horizontal scrolling.

## 15. Error and Empty States

Empty states must explain:

- what belongs in the space;
- why it matters;
- what the user should do next.

Error states should provide:

- what failed;
- whether any work was preserved;
- recovery or retry action;
- evidence/reference information when available.

Existing deterministic recovery behavior must be preserved.

## 16. Component Architecture

The implementation should progressively introduce focused shared modules rather than expanding `DataNestApp.tsx`.

Expected boundaries include:

- canonical brand identity/constants;
- design tokens;
- platform shell;
- global navigation;
- context header;
- lifecycle rail;
- page header;
- platform footer;
- RSGP trust marker;
- semantic status indicator;
- evidence panel;
- governed action component;
- legal metadata/content layer.

Exact filenames may vary during implementation planning, but each unit must have a clear single purpose and testable interface.

## 17. Consolidated Application Strategy

All application work remains inside the single authoritative repository `DataNest-Supository/DataNest`.

Current consolidated application roots include:

- `apps/ronsas/career-compass`;
- `apps/ronsas/creative-studio`;
- `apps/ronsas/epublisher`;
- `apps/ronsas/lyricsync-studio`;
- `apps/ronsas/scene-song-spark`;
- `apps/ronsas/sovereign-forge`;
- `apps/ronsas/syncvision`;
- `apps/ronsas/youtube-optimizer`;
- `apps/ronsas/sovereign-backend` for backend services.

The first migration should use a canonical design/brand contract plus thin per-app adapters. It must not force all applications onto a new framework simply for styling consistency.

A future shared package may be justified after the contract proves stable, but it is not a prerequisite for this redesign.

## 18. Migration Phases

### Phase 1 — Foundation

Introduce:

- canonical tokens;
- canonical typography mapping;
- business/platform identity source;
- RSGP trust marker;
- footer/legal navigation;
- page primitives.

Do not change business workflow semantics.

### Phase 2 — Root DataNest shell

Normalize:

- public/auth surface;
- shell/navigation;
- context strip;
- Home;
- AI & I;
- DataNest AI;
- Discover;
- Govern;
- Build;
- Execute;
- Verify.

Preserve deep links and continuity behavior.

### Phase 3 — Governance & Legal Centre

Implement:

- business identity;
- RSGP disclosure;
- versioned legal navigation;
- legal metadata;
- governed update/review state;
- contextual disclaimers;
- review-gated legal drafts.

### Phase 4 — Consolidated applications

Migrate application presentation progressively using the common contract while preserving each app's specialist workflow and approved accent.

### Phase 5 — Certification and production review

Complete:

- unit/type/build verification;
- browser verification;
- responsive visual review;
- accessibility review;
- app-specific validation;
- security validation;
- governance-impact review;
- legal review where applicable;
- external/human review;
- production authorization;
- post-deployment verification;
- dossier/evidence update.

## 19. Validation and Regression Gates

Existing repository gates are preserved.

### 19.1 Root CI

`.github/workflows/ci.yml` currently validates:

- unit tests;
- TypeScript;
- production dependency audit;
- release manifest generation;
- production build;
- RONSAS import contracts;
- provider-agnostic container build.

The redesign must keep these gates passing.

### 19.2 PR verification

`.github/workflows/pr-verification.yml` validates:

- unit tests;
- TypeScript;
- production static export;
- browser verification across major root experiences.

The redesign should extend browser coverage for:

- 320/390/768/1440 responsive behavior;
- no unintended horizontal overflow;
- keyboard focus;
- motion and reduced motion;
- legal/governance navigation;
- correct operator identity on public/legal surfaces;
- RSGP trust marker behavior;
- lifecycle continuity;
- responsive tables/work surfaces.

### 19.3 Consolidated application validation

`.github/workflows/ronsas-app-validation.yml` validates the consolidated applications and DataNest Pages bundle. It remains the app migration safety net.

### 19.4 Security

`.github/workflows/security-scan.yml` retains:

- project invariants;
- gitleaks;
- high-severity production dependency auditing;
- Semgrep with error-level enforcement.

No design change may weaken these thresholds.

## 20. Visual Review

Automated tests are necessary but not sufficient for visual approval.

Representative browser review must cover:

- desktop;
- tablet;
- mobile;
- long labels;
- dense tables;
- dialogs;
- empty states;
- error states;
- loading/AI activity;
- focus states;
- overlays;
- application handoffs;
- legal and governance surfaces.

The generated design-system collage is **directional reference only**. It is not a pixel-perfect specification. Approved Resonance typography, existing product behavior, accessibility, and this written spec take precedence.

## 21. Production Authorization Chain

The redesign's production chain is:

**self-audit → automated verification → security validation → visual/UX review → governance-impact review → legal review where applicable → external/human review → production authorization → deployment → post-deployment verification → dossier/evidence update**

A successful build or merge is not equivalent to production authorization.

The platform dossier should record:

- approved design specification;
- implementation plan;
- relevant commits and pull requests;
- automated test evidence;
- security evidence;
- review outcomes;
- legal version metadata;
- production authorization;
- deployment identity;
- post-deployment verification.

## 22. Free-Promotion Constraint

The redesign must preserve the established billing-off/free-promotion state.

It must not:

- add checkout links;
- add paid pricing;
- add subscription CTAs;
- restore SKU validation intended only for paid checkout;
- imply that a paid transaction is required to use currently promoted free services.

Any future commercial reactivation requires a separate approved governance decision.

## 23. Non-Goals

This project does not:

- replace Supabase authority or backend architecture;
- rewrite all app frameworks;
- change governance thresholds unrelated to UI/UX;
- weaken security gates;
- redefine ownership or legal/economic authority;
- invent an expansion for RSGP;
- claim ISO, regulatory, or third-party certification;
- autonomously publish legal policy;
- reintroduce billing;
- replace proven workflow state management solely for visual cleanliness.

## 24. Implementation Principle

The core implementation rule is:

> **Consolidate presentation and identity around proven workflow behavior; do not destabilize governance, recovery, traceability, or security to make the interface look cleaner.**

The end state is one business identity, one design language, one workflow lifecycle, one governance vocabulary, one legal centre, and one evidence chain, while specialist applications retain the workflows and accents they genuinely need.
