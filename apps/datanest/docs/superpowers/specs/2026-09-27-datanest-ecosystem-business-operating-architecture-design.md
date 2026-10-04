# DataNest Ecosystem Business and Operating Architecture

**Date:** 2026-09-27  
**Repository:** DataNest-Supository/DataNest  
**Design status:** Conversational design approved; written specification pending user review  
**Scope:** Resonance DataNest market model, business and operating principles, governance, growth, intelligence, platform boundaries, product lifecycle, trust, resilience, measurement, and RONSAS placement

## 1. Purpose

This document is the master architecture for evolving Resonance DataNest from a product control plane into the governed operating and intelligence fabric for the wider Resonance ecosystem.

It consolidates the approved design discussions from 27 September 2026 and reconciles them with the existing DataNest authority documents.

The intended outcome is a public-first ecosystem that can attract broad participation while preserving human authority, provenance, privacy, platform sovereignty, product discipline, operational resilience, and clear separation between contribution, governance, ownership, and financial rights.

The design is deliberately provider-agnostic and product-extensible. DataNest does not need to own every model, server, repository, application, or cloud provider. It must govern how identities, permissions, capabilities, products, projects, knowledge, resources, evidence, and outcomes relate.

## 2. Existing authorities preserved

This specification extends rather than replaces the following existing authority model:

- DataNest is the Resonance AppDev parent platform and web control plane.
- GitHub remains source control, history, CI, and evidence authority.
- Supabase remains authentication, database, storage, and backend-function authority.
- Public hosting remains replaceable delivery infrastructure.
- RONSAS remains a governed product under DataNest Products and is not DataNest's parent, DataNest AI authority, or platform control plane.
- DataNest AI remains a shared platform capability.
- UNIFI and TranScheduler remain first-class DataNest execution tools.
- UNKNOWN capability state is never execution permission.
- Current free-promotion and billing-off state remains unchanged by this design.
- Sparks remain an internal DataNest utility layer and do not create legal ownership, royalty rights, financial authority, or governance power.

Relevant existing authorities include:

- docs/ARCHITECTURE.md
- docs/DEPLOYMENT.md
- docs/UX_WORKFLOW_ARCHITECTURE.md
- docs/datanest-ai-learning-validation-v2.md
- docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md
- docs/superpowers/specs/2026-09-26-datanest-product-hierarchy-managed-execution-design.md

Where this document explicitly supersedes a narrower earlier design decision, that amendment is stated in this document.

## 3. Canonical hierarchy

The canonical ecosystem hierarchy is:

    Resonance
      |
      +-- DataNest
          |
          +-- DataNest AI
          +-- UNIFI
          +-- TranScheduler
          +-- Governance / Audit / Certification / Learning
          +-- Cloud-Nest workspaces
          +-- Supository knowledge and provenance fabric
          +-- Resource and Capability Fabric
          +-- Product Registry
          |
          +-- Products
              |
              +-- RONSAS
              +-- future governed products

RONSAS is the first major governed product and proof point for the platform. RONSAS may compose multiple applications or modules, but shared DataNest capabilities remain outside RONSAS ownership unless an explicit relationship says otherwise.

## 4. Design principles

The ecosystem follows these cross-cutting principles:

1. Public participation can be broad; authority must always be explicit.
2. Human accountability remains above machine autonomy.
3. Value should be demonstrated before monetization.
4. Contribution, reputation, utility, governance authority, ownership, and financial rights remain separate domains.
5. Portability and interoperability are preferred over lock-in.
6. Sovereignty means enforceable control over identity, data, models, resources, and routing choices, not isolation from external ecosystems.
7. Provenance and evidence should precede claims.
8. Private processing is not automatic permission for learning, reuse, or publication.
9. Products should reuse shared capabilities rather than duplicate platform infrastructure.
10. Higher-impact actions require stronger authorization, evidence, and review.
11. History should be superseded or corrected through attributable records rather than silently rewritten.
12. Unknown or unverified execution state fails toward the least harmful local state without unnecessarily collapsing the wider platform.
13. DataNest should optimize for useful, trusted outcomes rather than raw engagement, tokens, app count, or time spent.
14. Infrastructure providers are replaceable. Governance and product identity are not defined by a hosting vendor.
15. No product, including RONSAS, may supersede the DataNest platform constitution.

## 5. Market and adoption model

### 5.1 Public-first with a governed stakeholder lane

The approved market-entry model is public-first growth with a parallel governed path for organizations, institutions, strategic partners, and funders.

The public path is:

    discover
      -> experience useful value
      -> participate
      -> create
      -> contribute
      -> collaborate
      -> produce evidence
      -> deepen relationship

The organizational path is:

    organization
      -> verified organization
      -> partner
      -> strategic collaboration

Both paths converge through governed DataNest projects, products, Think Tanks, challenges, evidence, and product participation.

Capital, popularity, reputation, or contribution volume does not automatically create platform or project authority.

### 5.2 Public proposition

The intended public proposition is:

> DataNest is an open participation environment where people, projects, products, and AI agents can create and collaborate while retaining human authority, provenance, interoperability, and governed control.

### 5.3 Trust-led discovery

DataNest should attract participants by making useful work, products, public projects, governed evidence, transparent decisions, and appropriate audit artifacts discoverable.

The platform should not depend primarily on a conventional visitor-to-pricing subscription funnel. The preferred loop is:

    useful public surface
      -> participant receives value
      -> participant creates or contributes
      -> useful artifact or outcome is produced
      -> governed evidence becomes discoverable
      -> new people discover DataNest

## 6. Business and stakeholder economy

### 6.1 Free-promotion baseline

This design preserves the existing free-promotion and billing-off state. It does not enable billing.

Commercialization is a later governed decision after repeat demand, measurable value, known cost, reliable delivery, and trust readiness are demonstrated.

### 6.2 Five value domains

DataNest explicitly separates:

- Contribution: what was created, improved, or supplied.
- Reputation: what has been independently evidenced or validated.
- Utility: what internal platform resources or services may be accessed.
- Authority: what a person, role, or agent is permitted to decide or execute.
- Economics: what explicit contractual, ownership, royalty, investment, or payment rights exist.

No domain silently converts into another.

Examples of prohibited assumptions include:

- Sparks are not votes.
- Sparks are not equity.
- Reputation is not administrative authority.
- Investment is not automatic platform governance.
- Popularity is not proof.
- Contribution is not automatic legal ownership.

### 6.3 Sparks

Sparks remain internal utility under the existing append-only ledger design.

This architecture does not introduce cash purchase, cash redemption, peer-to-peer transfer, external transfer, a secondary market, or speculative token language.

The term Spark is reserved for the existing internal utility economy. Early product ideas are called Concepts or Opportunities, not Sparks.

### 6.4 Future value-exchange options

Once evidence supports commercialization, a governed product or service may later evaluate models such as:

- generous free access with resource allowances;
- usage-based infrastructure;
- outcome-based services;
- managed environments;
- product-specific commercial offerings;
- institutional agreements;
- research or infrastructure sponsorship;
- strategic partnerships.

These are future options only. No pricing or billing change is authorized by this design.

### 6.5 Investment boundary

Investment rights arise only from explicit real-world legal agreements. Platform voting, contribution scores, Sparks, or reputation do not create equity, ownership, debt, royalty, or contractual rights.

Likewise, platform governance does not silently bind Resonance or another legal entity to ownership transfers or financial commitments.

## 7. Governance and operating constitution

### 7.1 Four governance domains

DataNest separates governance into:

**Platform governance**  
Covers DataNest architecture, constitutional controls, identity, security, audit integrity, shared services, and platform policy.

**Product governance**  
Covers product roadmap, product releases, product-specific risks, controls, and lifecycle state.

**Project governance**  
Covers project protocol, membership, work, project decisions, disputes, and project-specific authority.

**Legal and economic authority**  
Covers contracts, company ownership, investment, IP transfer, regulated obligations, and financial commitments. This remains with the legally authorized humans or entities and is never implied by platform participation.

### 7.2 Separation of powers

The intended control loop is:

    humans define purpose and authority
      -> DataNest encodes permissions and policy
      -> DataNest AI and agents recommend or execute delegated work
      -> UNIFI, TranScheduler, products, tools, and nodes perform work
      -> evidence and audit record what happened
      -> humans review outcomes and may change policy or authority

AI may become increasingly capable without becoming an independent source of constitutional authority.

### 7.3 Autonomy levels

The target autonomy model is:

- A0 Observe: retrieve, monitor, inspect, summarize.
- A1 Advise: analyze and recommend.
- A2 Prepare: draft actionable work but require approval before execution.
- A3 Execute: perform bounded, reversible work when delegated policy allows it.
- A4 High-impact: legal, financial, ownership, destructive, constitutional, or materially irreversible actions requiring explicit authorized human approval.

An agent must never grant itself a role, modify its own authority, approve its own learning, ratify its own governance proposal, rewrite audit history, or create legal or financial rights by assertion.

### 7.4 Authority Envelope

Every significant automated action should be capable of resolving an Authority Envelope containing:

- actor identity;
- human sponsor or accountable owner;
- project and product context;
- purpose;
- permitted tools and data;
- autonomy level;
- resource ceiling;
- time boundary;
- approval state;
- reversibility;
- evidence requirements;
- trace identity.

The design goal is task-scoped authority rather than broad standing credentials.

### 7.5 Decision lifecycle

Material governed decisions follow:

    idea or signal
      -> proposal
      -> impact classification
      -> evidence
      -> authorized review
      -> decision
      -> ratification when required
      -> execution
      -> verification
      -> audit
      -> reviewed learning
      -> dispute or correction when necessary

Routine work should not be forced through heavyweight voting. Governance is proportional to consequence.

### 7.6 Constitutional floor

Projects and products receive bounded sovereignty but may not weaken core platform invariants such as audit integrity, authorization boundaries, human accountability, legal-right separation, or prohibition on autonomous ownership/financial authority.

## 8. Organic growth architecture

### 8.1 DataNest as public destination

DataNest is the ecosystem front door. RONSAS is the flagship governed product and evidence that meaningful products can be built within the platform.

A public visitor should quickly understand:

- what DataNest is;
- what can be done;
- what is happening now;
- how trust can be evaluated;
- where the visitor fits;
- what useful action can be taken immediately.

### 8.2 Products as acquisition surfaces

Governed products may attract their own users, but the product experience should preserve clear DataNest attribution and a route back to the broader ecosystem.

Preferred relationship language:

> RONSAS — a DataNest product by Resonance.

### 8.3 Public artifacts

Only explicitly published content may become externally discoverable.

Eligible public artifacts may include product demonstrations, public project outputs, templates, articles, research outputs, challenge solutions, public Think Tank findings, releases, case studies, and verified contributions.

Publication is a governed state. Private work is never search-indexed merely because it was created in DataNest.

### 8.4 Challenges

DataNest may later support governed Challenges as a public mechanism for matching real problems with people or organizations capable of solving them.

Challenges should be tied to actual problems, evidence, and project or product context rather than gamified busywork.

### 8.5 Think Tanks

Think Tanks should support private, shared, and public visibility modes. Only governed public content is externally discoverable.

### 8.6 Stakeholder due diligence

Appropriate public architecture, lineage, release, audit, governance, risk, and remediation evidence should allow prospective contributors, partners, researchers, and strategic stakeholders to perform preliminary diligence without exposing private or security-sensitive data.

## 9. DataNest intelligence architecture

### 9.1 DataNest AI as intelligence authority

DataNest AI is the user-facing intelligence identity. Individual hosted models, local models, specialist agents, tools, and provider endpoints are replaceable reasoning or execution resources beneath it.

Users should not need to manage model choice for ordinary work. DataNest should route work according to capability, policy, privacy, cost, latency, reliability, and task consequence.

### 9.2 Intelligence router

The router evaluates:

- task type;
- required capability;
- privacy and data locality;
- cost;
- latency;
- context size;
- tool access;
- reliability history;
- provider policy;
- governance constraints.

The goal is the best permitted route, not simply the strongest model.

### 9.3 Role-based model collaboration

Multi-model work should use explicit roles where valuable, such as primary reasoner, evidence retriever, independent critic, specialist, verifier, and final DataNest synthesis.

Majority vote across several models is not treated as proof.

### 9.4 Supository

Supository is the governed knowledge and provenance abstraction linking content, source, creator or actor, project, product, Job, evidence, permissions, transformation lineage, AI/model involvement, certification, version, supersession history, and reuse/learning policy.

Supository may reference GitHub, Supabase Storage, external repositories, URLs, and other storage systems without duplicating every byte.

Supository is not a password or secret vault.

### 9.5 Memory hierarchy

The target memory hierarchy is:

    private Nest context
      -> Job memory
      -> project certified memory
      -> product knowledge
      -> DataNest certified reusable knowledge
      -> explicitly public knowledge

Movement upward is governed and never automatic.

### 9.6 Definition of learning

DataNest distinguishes four forms of learning:

1. Outcome learning: what happened.
2. Governed memory: what reusable knowledge was certified.
3. System adaptation: which routing, workflow, tool, or policy performs better.
4. Model adaptation: deliberate fine-tuning or training of a model.

The primary DataNest learning strategy is Levels 1 through 3. The platform does not need to retrain a foundation model continuously to improve.

### 9.7 ILM

ILM means Inclusive Language Model as a governed intelligence abstraction.

At the initial stage it does not mean that Resonance has trained its own foundation model.

The intended maturity path is:

- ILM-1: governed orchestration of approved external/local models plus certified knowledge.
- ILM-2: adaptive routing, agents, evaluations, and ecosystem learning.
- ILM-3: DataNest-controlled specialist models trained or fine-tuned only on eligible governed datasets.
- ILM-4: a possible DataNest-native model family if future scale, economics, and evidence justify it.

### 9.8 Capability Graph

DataNest should learn not only facts, but also which people, models, tools, agents, nodes, and product capabilities solve particular classes of work effectively under specific privacy, reliability, and cost conditions.

This becomes a Capability Graph consumed by DataNest AI and TranScheduler.

## 10. Platform and product operating architecture

### 10.1 DataNest as control plane

DataNest governs execution without needing to physically host every execution resource.

The control plane includes:

- Identity and Trust;
- Cloud-Nest;
- Supository;
- DataNest AI / ILM;
- Resource Fabric;
- Capability Registry;
- Product Registry;
- UNIFI;
- TranScheduler;
- Governance;
- Audit and Transparency.

A capability useful only to one product should normally remain inside that product rather than becoming a platform service.

### 10.2 Cloud-Nest

Cloud-Nest is the governed workspace abstraction, not merely cloud hosting.

A Nest joins identity, people, projects, knowledge, product access, AI context, resources, and permissions.

Expected Nest scopes include personal, project, and organization workspaces.

The term Cloud-Nest in this specification is a target architecture concept and must not be represented as a live product capability until implemented and evidenced.

### 10.3 Identity and linked authorities

DataNest should provide one DataNest identity capable of linking to external authorities such as GitHub, model providers, storage, organizational systems, or external applications.

DataNest should prefer delegated, revocable authorization such as OAuth or scoped tokens. It should not collect external passwords or reusable browser sessions as a general integration mechanism.

### 10.4 Resource Fabric

The Resource Fabric represents local machines, cloud workers, GPUs, browsers, model endpoints, storage, APIs, product capabilities, and potentially human specialist capability.

Each resource may expose:

- capability;
- availability;
- trust level;
- location;
- owner;
- cost;
- privacy suitability;
- health;
- limits.

TranScheduler resolves work against authorized capability and availability rather than machine names.

### 10.5 Sovereign nodes

Local computers may register as optional sovereign execution nodes.

Node policy must be capable of constraining allowed projects, capability categories, resource ceilings, schedules, data access, and prohibited operations.

Participation does not mean unrestricted remote-control access.

### 10.6 RONSAS boundary

RONSAS consumes shared DataNest services through stable contracts, including identity, DataNest AI, Supository, Cloud-Nest, execution orchestration, resource routing, evidence, and product lifecycle where applicable.

RONSAS retains its own product UX, product-specific workflows, roadmap, product logic, product branding, risks, controls, and product evidence.

Horizontal platform capabilities belong to DataNest; vertical product value belongs to the relevant governed product.

### 10.7 Application relationship types

Applications and capabilities must be explicitly classified as one of:

- product-owned;
- shared DataNest capability;
- independent governed DataNest product/application;
- registered external capability.

A standalone repository or URL does not by itself prove independent product status.

### 10.8 Agent registry

Agents should become registered governed capabilities with purpose, owner, permitted models, permitted tools, authority level, data scope, resource ceiling, supported tasks, version, health, and audit policy.

## 11. Product portfolio and lifecycle

### 11.1 Lifecycle

The preferred portfolio lifecycle is:

    signal or need
      -> Concept
      -> Project
      -> Experiment
      -> Capability
      -> Application or module
      -> Product Candidate
      -> Governed Product
      -> Active / Maintained / Deprecated / Retired

Not every idea becomes a product.

### 11.2 Architectural homes

A successful experiment should be classified into one primary home:

- project artifact;
- shared DataNest capability;
- module inside an existing product;
- independent product;
- registered external capability.

The reuse preference is:

    reuse
      -> extend
      -> compose
      -> build new

### 11.3 RONSAS classification

Existing applications historically associated with RONSAS must be explicitly reviewed rather than assumed to be independent products or automatically owned by RONSAS.

The review should determine whether each is:

- a RONSAS module;
- a shared DataNest capability;
- independently valuable enough to be a governed product;
- redundant and suitable for consolidation or retirement.

### 11.4 Product Candidate gate

Product Candidate is the intermediate state used before independent product promotion.

A candidate should demonstrate:

- a distinct problem;
- a distinct or clearly identifiable user/customer;
- an independent value proposition;
- repeatable demand;
- operational ownership;
- independent lifecycle justification.

### 11.5 Product Lab

Product Lab should evolve from versioned surface testing into the governed graduation laboratory for product candidates.

It should assess desirability, viability, feasibility, and portfolio fit while preserving immutable build/test evidence.

### 11.6 Product Registry

The Product Registry is the canonical business/product identity layer. Repositories implement products; repositories do not define products.

Canonical product identity should eventually include:

- identity and mission;
- owner and status;
- target users and problem;
- parent relationship;
- applications and shared capabilities;
- repositories;
- runtime and deployment;
- data and AI dependencies;
- risks and roadmap;
- evidence and economics;
- release and retirement state.

### 11.7 Retirement

Retirement must preserve source lineage, release history, audit evidence, useful certified knowledge, and reusable capabilities.

Deprecated or retired products should be removed from active experience without erasing institutional history.

## 12. Data, privacy, sovereignty, and trust

### 12.1 Dual classification

Every governed object should support both:

**Visibility / processing boundary**
- Public
- Nest Private
- Project Restricted
- Organization Restricted
- High Sensitivity
- Local Only

**Reuse / learning state**
- Runtime Only
- Session Context
- Project Learning Eligible
- Project Certified Memory
- Platform Learning Eligible
- DataNest Certified Knowledge
- Publicly Reusable

Visibility and learning are independent dimensions.

### 12.2 Processing is not learning

Permission to process data for a service does not automatically grant permission to reuse it for another project, learn from it platform-wide, publish it, or send it to another provider.

### 12.3 Retention amendment

This specification supersedes the blanket indefinite-retention assumption for all future raw DataNest AI inputs in the 2026-09-24 governed-memory design.

New rule:

> Retention follows data classification, declared purpose, governance requirements, applicable legal or contractual obligations, and explicit retention policy.

Selected audit and provenance evidence may remain long-lived or immutable. Raw personal, project, organization, and AI content should not be retained indefinitely merely because DataNest received it.

Existing implementation or stored records are not deleted by this design. Any migration, deletion, anonymization, archival, or retention enforcement requires a separate implementation plan and validated policy.

### 12.4 Audit versus raw content

Immutable audit history does not require keeping every raw content object forever.

Where content is removed or minimized, DataNest should be capable of retaining a governed tombstone containing sufficient trace identity, action, policy, hash/provenance reference, and removal evidence.

### 12.5 Lineage-aware deletion

When source content is deleted, restricted, or withdrawn, Supository lineage should identify affected derivatives and certified memories for deactivation, recertification, or other governed action.

### 12.6 Provider Trust Profile

External providers should carry a Provider Trust Profile including permitted data classes, purposes, region/locality, retention policy, training/reuse policy, security posture, contract state, cost, availability, and capability.

Routing must respect both capability and trust policy.

### 12.7 Trust Manifest

Each governed Nest, project, and product should eventually expose an applicable Trust Manifest describing data location, access, learning policy, external-provider policy, retention, publication, export capability, audit state, and governance version.

Public trust claims may only be made after the corresponding controls and evidence exist.

### 12.8 Portability

DataNest should support useful export of user- or organization-authorized records and content, including machine-readable data, human-readable manifests, provenance references, and attachments where applicable.

External authoritative objects may be referenced rather than falsely copied as DataNest-owned records.

## 13. Security, reliability, and resilience

### 13.1 Zero-trust execution

Every human, agent, application, model, node, service, or workflow is separately authorized.

Authentication alone is insufficient. Execution requires appropriate role, purpose, capability, data authority, resource authority, current health, and bounded permission.

### 13.2 Capability Leases

High-value automated execution should use short-lived Capability Leases defining actor, accountable sponsor, Job, target, allowed operations, data scope, resource ceiling, expiry, approval level, and trace identity.

Standing broad credentials should be minimized.

### 13.3 Permission gradient

Permissions should distinguish:

    observe
      -> prepare
      -> write
      -> execute
      -> promote
      -> destruct

Each transition represents increasing consequence.

### 13.4 Autonomous circuit breakers

Autonomous workflows should have time, cost, operation-count, and blast-radius limits.

The system should pause or fail closed locally when limits, policy, health, or validation state become unsafe or unknown.

A category-level emergency stop should be possible for classes such as autonomous writes, deployments, external communications, or resource execution without disabling safe read-only platform functions.

### 13.5 Production promotion

Production should be promotion-oriented rather than an experimentation surface.

The target lifecycle is:

    intent
      -> develop
      -> test
      -> staging
      -> audit
      -> verify
      -> validate
      -> stress test
      -> certify
      -> promote exact artifact
      -> production

Exact-artifact integrity should apply to code, migrations, release evidence, and governed knowledge promotion where relevant.

### 13.6 Supply-chain evidence

Product and platform releases should progressively record source commit, dependency set, build environment, tests, artifact hash, release identity, migration identity, deployment target, and certification evidence.

Signed manifests and software-bill-of-materials practices may be added where they create demonstrable value.

### 13.7 Graceful degradation

Failure of a model, node, RONSAS integration, external service, or optional capability must degrade that capability without unnecessarily collapsing DataNest authority, project state, governance, or evidence.

The preferred behavior is:

    capability unhealthy
      -> stop routing new work to it
      -> preserve Job and evidence state
      -> reroute only if permitted
      -> otherwise pause and request attention

### 13.8 Operational health

Health should distinguish reachability, authorization, functionality, performance, budget state, policy compliance, and version state rather than relying on HTTP availability alone.

### 13.9 Criticality classes

Recovery priority is:

1. authority systems;
2. state systems;
3. execution systems;
4. experience surfaces;
5. replaceable external services.

Numerical RTO/RPO targets are deferred until implementation planning because they depend on actual service and cost constraints.

### 13.10 Backups and recovery

Backups are not considered proven until restored and validated in an isolated environment.

Recovery events must preserve provenance, including failure context, restored version, data/migration state, operator, evidence, and verification result.

### 13.11 Incident lifecycle

Incidents follow:

    detect
      -> classify
      -> contain
      -> preserve evidence
      -> recover
      -> verify
      -> communicate
      -> review
      -> certified improvement

AI may assist in diagnosis and remediation but must not rewrite incident evidence.

### 13.12 Resilience testing

Resilience testing should deliberately cover dependency timeout, expired credentials, offline nodes, malformed model results, failed migrations, rate limits, duplicate dispatch, staging outage, partial deployment, provider failure, and rollback.

A safe local stop is an acceptable result when continued execution cannot be proven safe.

## 14. Measurement, economics, and ecosystem intelligence

### 14.1 North Star Set

DataNest should not optimize around one composite vanity metric.

The primary measurement set is:

- useful outcomes;
- evidence quality;
- meaningful participation;
- reuse;
- efficiency;
- trust;
- resilience.

### 14.2 Verified Outcome

The atomic value unit is a Verified Outcome:

    intended Job or activity
      -> actual result
      -> acceptance evidence
      -> verification
      -> traceable outcome

### 14.3 Outcome Ledger

A future Outcome Ledger should relate outcomes to project, product, actors, agents/models, capabilities, acceptance evidence, duration, resource use, infrastructure cost, human validation, policy state, and provenance.

It is not a financial ledger.

### 14.4 Shadow Economics

While billing remains off, DataNest should measure real resource cost without turning those measurements into charges.

Observable cost may include AI provider spend, compute, storage, external services, execution time, and other measurable infrastructure consumption.

The preferred economic metric is cost per successful verified outcome rather than cost per token.

### 14.5 Growth measurement

Public growth should distinguish:

    visitor
      -> activated participant
      -> returning participant
      -> creator
      -> contributor
      -> verified contributor
      -> collaborator or partner

Traffic and page views remain diagnostic inputs, not the primary objective.

### 14.6 Portfolio intelligence

Product metrics should include repeat usage, verified outcomes, unique value, capability reuse, operating cost, reliability, risks, support burden, and portfolio overlap.

The architecture should reward consolidation and capability reuse rather than app count.

### 14.7 Contextual reputation

Contribution and trust signals may help discovery, matching, or review, but global ranking should be de-emphasized.

Relevance should be contextual to a particular project, domain, capability, or problem.

Reputation does not create governance, ownership, royalty, or financial authority.

### 14.8 Metric Manifest

Serious metrics should be versioned through a Metric Manifest describing definition, source, time window, exclusions, owner, version, and known limitations.

Dashboards must distinguish complete, partial, estimated, stale, and unknown data.

### 14.9 Audience-specific dashboards

Different authorized audiences require different views, such as:

- public Ecosystem Pulse;
- participant My Nest;
- product owner Product Intelligence;
- operator Operations Cockpit;
- partner Collaboration Impact;
- stewardship Ecosystem Intelligence.

Public transparency should expose appropriate aggregate trends without leaking private or security-sensitive telemetry.

### 14.10 Anti-metrics

The platform must not treat raw page views, time spent, AI message count, token consumption, product count, repository count, agent count, feature count, follower count, or Sparks balance as primary success measures.

More activity is valuable only when it produces proportionately more useful, trusted outcomes.

## 15. Cross-system operating model

The consolidated operating flow is:

    people / organizations / agents / products
      -> DataNest identity and Nest context
      -> governance and Authority Envelope
      -> DataNest AI / ILM / UNIFI
      -> Job Manifest
      -> TranScheduler
      -> permitted capability or resource
      -> execution
      -> output
      -> evidence
      -> Supository
      -> verification and Outcome Ledger
      -> governed learning
      -> certified memory and Capability Graph
      -> improved future routing, products, and collaboration

Publicly eligible artifacts and outcomes may feed the organic discovery loop. Private or restricted work remains inside its governed boundary.

## 16. Required invariants

Implementation must preserve the following invariants:

1. DataNest remains the parent platform.
2. RONSAS remains a governed product under Products.
3. DataNest AI remains a shared platform capability.
4. GitHub remains source/history/CI/evidence authority.
5. Supabase remains auth/data/storage/backend authority.
6. Hosting remains replaceable delivery infrastructure.
7. Free-promotion and billing-off state remains unchanged.
8. Sparks remain internal utility and are not governance, equity, cash, or a speculative asset.
9. Product and project governance does not create legal ownership or financial rights by default.
10. AI cannot grant itself authority or approve its own high-impact changes.
11. UNKNOWN capability state is never permission to execute.
12. Private processing does not imply general learning or publication permission.
13. External providers are routed through explicit policy and trust constraints.
14. Product repositories do not replace canonical Product Registry identity.
15. Public publication is explicit and governed.
16. Audit history is preserved even when underlying raw content is legitimately removed or minimized.
17. Higher-impact action requires stronger authorization and evidence.
18. External dependency failure degrades locally where possible.
19. Metrics must preserve their definition, scope, and completeness state.
20. No public trust claim may exceed the evidence implemented by the platform.

## 17. Current-state amendments and clarifications

This design makes the following explicit amendments or clarifications to earlier work:

### 17.1 DataNest hierarchy

The 2026-09-26 product-hierarchy design remains authoritative and is incorporated here without change.

### 17.2 RONSAS

RONSAS is the flagship governed product and proof point, not DataNest's parent, platform kernel, or AI authority.

### 17.3 Sparks naming

Sparks remains the internal utility economy. Early product ideas use Concept or Opportunity terminology to avoid collision.

### 17.4 DataNest AI raw retention

The earlier blanket indefinite-retention statement for all raw AI inputs is superseded by policy-driven retention based on classification, purpose, governance, and applicable obligations.

This does not authorize immediate deletion or mutation of existing records.

### 17.5 ILM

ILM initially means a compound governed intelligence abstraction, not a claim that DataNest has trained a proprietary foundation model.

### 17.6 Cloud-Nest and Supository

Cloud-Nest and Supository are approved target architecture concepts. They must not be marketed as fully implemented product capabilities until code, controls, and evidence exist.

### 17.7 Portfolio and product boundaries

Historical naming, repositories, or URLs do not determine current product status. Application relationships require explicit classification through the Product Registry.

## 18. Implementation decomposition

This master specification is intentionally broader than a single code change. Implementation must be decomposed into sequenced workstreams while preserving one coherent architecture.

The implementation plan should at minimum sequence:

**Phase A — Authority and terminology hardening**
- reconcile current UI copy and architecture docs;
- encode canonical DataNest > Products > RONSAS hierarchy;
- mark Cloud-Nest, Supository, and ILM as target-state concepts until implemented;
- record the retention-policy amendment.

**Phase B — Portfolio and registry foundations**
- formalize product/application/capability relationship types;
- add Product Candidate and retirement concepts where appropriate;
- extend Product Lab and Product Registry evidence without duplicating current models.

**Phase C — Trust and data policy foundations**
- define data-classification and reuse/learning states;
- define Trust Manifest and Provider Trust Profile schemas;
- implement retention policy safely and non-destructively;
- preserve current RBAC/RLS and AI file-access boundaries.

**Phase D — Authority and execution controls**
- implement Authority Envelope representation;
- add capability-lease and autonomy-level policy where justified;
- extend scheduler/resource state without weakening existing fail-closed behavior.

**Phase E — Resource and capability fabric**
- generalize registered capabilities, nodes, external services, agents, and health metadata;
- preserve local sovereignty as optional node execution rather than production dependency.

**Phase F — Intelligence fabric**
- extend governed memory with routing/evaluation/capability evidence;
- implement ILM-1 as the DataNest abstraction over approved models, tools, memory, and agents;
- avoid model-training claims unless a separate governed training program exists.

**Phase G — Growth and stakeholder surfaces**
- make public discovery, products, public projects/artifacts, and transparency useful without exposing restricted data;
- add challenge or public collaboration features only after governance and publication boundaries exist.

**Phase H — Outcome and ecosystem intelligence**
- define Verified Outcome and Metric Manifest;
- introduce Outcome Ledger and Shadow Economics;
- build audience-specific dashboards from governed evidence.

Each phase should use the smallest change set that preserves existing architecture and should be independently verifiable.

## 19. Non-goals

This specification does not:

- enable billing or change pricing;
- create a tradable token or cryptocurrency;
- grant investors governance control;
- turn contribution into equity or royalties;
- replace Supabase;
- require Vercel or any specific hosting provider;
- remove GitHub Pages immediately;
- merge RONSAS into DataNest;
- merge all applications into one code repository;
- remove local development, recovery, or controlled-test paths;
- automatically publish user content;
- train foundation-model weights from raw user input;
- claim that ILM is currently a proprietary foundation model;
- create unrestricted remote-control access to user computers;
- delete existing AI staging data solely because the retention model has changed;
- expose chain-of-thought;
- weaken current RLS, RBAC, certification, audit, or promotion controls.

## 20. Acceptance criteria for the architecture programme

The architecture programme is considered correctly implemented only when evidence demonstrates that:

1. Public and internal descriptions consistently present DataNest as the parent platform.
2. RONSAS appears under Products and consumes shared DataNest capabilities through explicit boundaries.
3. Application ownership/relationship type is explicit rather than inferred.
4. DataNest AI is provider-agnostic at the product identity level.
5. Public growth surfaces do not expose private or organization-restricted data.
6. Publication, processing, learning, and reuse are represented as distinct permissions.
7. Retention policy is classification/purpose driven and does not silently destroy required audit provenance.
8. High-impact agent actions require stronger authorization than low-impact read/advice actions.
9. Capability health and authorization affect scheduling and routing.
10. External dependency outages degrade locally without destroying platform authority or project state.
11. Product graduation and retirement are governed and evidence-backed.
12. Product Lab evidence is tied to exact build/test identity.
13. Shared capabilities can be reused across products without duplicating ownership.
14. Metrics expose scope/completeness and do not present partial data as global truth.
15. Outcome measurement connects resource consumption to accepted results.
16. Billing remains disabled until separately authorized.
17. Sparks remain internal utility only.
18. DataNest trust claims can be traced to implemented controls and evidence.
19. Existing security, certification, governance, and source/backend authority boundaries remain intact.
20. The implementation is testable in phases without requiring a single disruptive platform rewrite.

## 21. Review and implementation boundary

This document records the approved conversational architecture in written form.

It does not itself authorize implementation, schema mutation, production changes, deletion, billing changes, model training, or deployment.

The next required step is user review of this written specification.

Only after the written specification is approved should a detailed implementation plan be created under the Superpowers planning workflow. Implementation begins only after that plan is reviewed and its execution method is selected.
