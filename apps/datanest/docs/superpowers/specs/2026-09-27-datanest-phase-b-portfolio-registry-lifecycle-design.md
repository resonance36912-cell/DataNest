# DataNest Phase B Portfolio Registry & Lifecycle Design

**Date:** 2026-09-27  
**Repository:** DataNest-Supository/DataNest  
**Parent authority:** `docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md`  
**Design status:** Conversational design approved; written specification pending user review  
**Implementation status:** Not authorized by this document

## 1. Purpose

Phase B introduces the governed portfolio layer required to classify, relate, promote, consolidate, deprecate, and retire DataNest applications and capabilities without forcing every useful thing into the existing Product Registry.

The goal is to let DataNest answer, with evidence and history:

- what is a governed product;
- what is only a product candidate;
- what is an application, module, or capability;
- what belongs to a product;
- what is shared across products;
- what is external;
- what remains unclassified;
- what depends on what;
- what can safely be consolidated or retired;
- what changed classification over time and why.

Phase B is deliberately additive. It preserves the current `products`, `product_records`, Product Lab evidence, project RLS, billing-off state, RONSAS governed-product status, and existing Products workspace behavior while adding a portfolio identity and classification layer around them.

## 2. Existing authorities preserved

Phase B must preserve all relevant Phase A and platform invariants:

- DataNest remains the parent platform and control plane.
- RONSAS remains a governed product under `DataNest > Products > RONSAS`.
- DataNest AI remains a shared platform capability.
- GitHub remains source/history/CI/evidence authority.
- Supabase remains authentication, database, storage, and backend-function authority.
- Hosting remains replaceable delivery infrastructure.
- RONSAS billing remains disabled.
- Product Registry identity is not inferred from repositories, URLs, deployments, or brands.
- Sparks remain internal utility and are unrelated to product-idea naming.
- Historical records are preserved rather than rewritten to match present classification.
- Unknown or unresolved architectural ownership remains `pending_review`; DataNest must not guess.
- No Cloud-Nest, Supository, ILM, Resource Fabric, commercial billing, or unrelated Phase C-H behavior is implemented by Phase B.

## 3. Core doctrine

Phase B adopts these rules:

> Existence, ownership, usage, dependency, and product status are separate facts.

> Register first. Classify explicitly. Promote with evidence. Reuse before duplicating. Preserve history. Retire only after dependencies are safe.

A repository, URL, deployment, brand, current runtime, or historical catalog placement is evidence about an item, not proof of its architectural home.

A product is a governed business and operating identity, not a Git repository or a single deployment.

## 4. Chosen architecture

The existing `products` table remains authoritative for governed products.

Phase B adds a separate **Portfolio Registry** for durable identity before or outside governed-product promotion. This avoids overloading `product_records`, whose rows are already product-owned by schema because `product_id` is mandatory.

The model has four primary structures:

1. `portfolio_items` — durable identity and current summarized state;
2. `portfolio_classifications` — append-only architectural-home decisions;
3. `portfolio_relationships` — append-only composition, use, dependency, replacement, and integration links;
4. `portfolio_lifecycle_events` — append-only lifecycle transitions.

A derived read model presents the current active state to the application.

Product Lab gains one optional link from a product surface to a Portfolio Item so testing evidence can inform classification and promotion without Product Lab becoming the authority for either.

## 5. Portfolio identity

### 5.1 Portfolio Item

A Portfolio Item represents a durable thing that DataNest needs to reason about architecturally.

Target fields include:

- `id`
- `project_id`
- `slug`
- `name`
- `item_kind`
- `review_state`
- `linked_product_id` nullable
- `source_authority` nullable
- `source_reference` nullable
- `metadata`
- `created_by`
- `created_at`
- `updated_at`

The current project-level stable identity is `project_id + slug`.

### 5.2 Item kinds

Initial controlled values:

- `governed_product`
- `product_candidate`
- `application`
- `module`
- `capability`
- `external_capability`

These kinds describe what the item is. They do not describe where it belongs or what stage it is in.

### 5.3 Review states

Initial controlled values:

- `pending_review`
- `classified`
- `deprecated`
- `retired`

Review state is intentionally separate from lifecycle state. `pending_review` is a valid, truthful state and is preferred to inferred ownership.

### 5.4 Governed products remain in `products`

A `governed_product` Portfolio Item links to an existing `products.id`.

The Portfolio Item does not replace or duplicate the governed Product Registry. It adds architectural identity, relationship, lifecycle, and provenance context around that product.

RONSAS is the initial baseline:

- item kind: `governed_product`
- review state: `classified`
- classification: `independent_datanest_product`
- linked product: existing RONSAS `products.id`
- lifecycle: `active`

## 6. Architectural classification

### 6.1 Classification values

The active architectural-home classification is one of:

- `product_owned`
- `shared_datanest_capability`
- `independent_datanest_product`
- `registered_external_capability`

An item with no approved active classification remains `pending_review`.

### 6.2 Classification history

Target fields for `portfolio_classifications`:

- `id`
- `project_id`
- `portfolio_item_id`
- `classification`
- `target_product_id` nullable
- `status` such as `proposed`, `active`, `superseded`, `rejected`
- `rationale`
- `evidence_reference` nullable
- `proposed_by`
- `approved_by` nullable
- `created_at`
- `approved_at` nullable
- `superseded_at` nullable

The schema and governed write path must guarantee that only one architectural classification is active for an item at a time.

`product_owned` requires an existing target governed product in the same project.

### 6.3 Authority

Operators may create Portfolio Items, attach evidence, and propose classifications.

Owners/admins may activate or supersede architectural classifications.

AI may recommend a classification but never activates one.

## 7. Portfolio relationships

### 7.1 Relationship purpose

Relationships describe how items interact. Classification describes where an item belongs. These concepts remain separate.

Target relationship types:

- `contains`
- `uses`
- `provides`
- `depends_on`
- `replaces`
- `supersedes`
- `integrates_with`
- `derived_from`

### 7.2 Relationship fields

Target fields for `portfolio_relationships`:

- `id`
- `project_id`
- `source_item_id`
- `target_item_id`
- `relationship_type`
- `criticality` nullable: `optional`, `normal`, `critical`
- `status`: `proposed`, `active`, `superseded`, `rejected`
- `rationale`
- `evidence_reference` nullable
- `proposed_by`
- `approved_by` nullable
- `created_at`
- `approved_at` nullable
- `superseded_at` nullable

### 7.3 Relationship invariants

The governed write path must reject:

- self-reference;
- cross-project relationships without a separately authorized future mechanism;
- direct circular `contains` structures;
- activation of relationships that violate the active classification;
- retirement of an item with unresolved active critical dependants.

Usage does not imply ownership.

A relationship such as `RONSAS uses Capability X` does not make Capability X a RONSAS-owned item.

### 7.4 Historical RONSAS child applications

The existing RONSAS `product_records` application rows are preserved as historical catalog evidence.

Their historical placement under the RONSAS catalog must not be transformed into an active `product_owned` classification.

Migration should instead create separate Portfolio Items with:

- item kind: `application`
- review state: `pending_review`
- no active architectural classification
- provenance pointing to the exact historical `product_records` row/import source

A dedicated active ownership relationship is not created during backfill.

## 8. Lifecycle model

### 8.1 Controlled lifecycle states

Portfolio lifecycle states are:

- `concept`
- `experiment`
- `validating`
- `candidate`
- `active`
- `maintained`
- `deprecated`
- `retired`

These are portfolio states, not Product Lab environments.

Product Lab environments remain independently represented as `local`, `preview`, `staging`, and `production`.

A production surface does not prove a governed-product promotion.

### 8.2 Lifecycle events

Target fields for `portfolio_lifecycle_events`:

- `id`
- `project_id`
- `portfolio_item_id`
- `from_state` nullable for first event
- `to_state`
- `reason`
- `evidence_reference` nullable
- `proposed_by`
- `approved_by` nullable
- `created_at`

Current lifecycle may be cached on `portfolio_items` for read efficiency, but lifecycle events preserve how that state was reached.

### 8.3 Authority

Operators may propose lifecycle transitions and attach evidence.

Owners/admins approve product promotion, architectural reclassification, deprecation, and retirement.

Lower-risk routine maintenance transitions may be delegated later but are not required for the first Phase B release.

## 9. Product Candidate and promotion

### 9.1 Product Candidate

A candidate keeps a durable Portfolio Item identity while being tested and reviewed.

A candidate does not receive a governed `products` row until promotion succeeds.

### 9.2 Promotion criteria

Promotion requires evidence for:

- distinct problem;
- identifiable user/customer;
- independent value proposition;
- repeatable demand;
- operational owner;
- independent lifecycle justification;
- Product Lab/build evidence appropriate to the item;
- known dependencies and risks;
- resolved architectural classification;
- explicit governance approval.

A standalone URL, repository, name, or working prototype is insufficient.

### 9.3 Promotion Packet

A promotion review should present one packet containing:

- candidate identity;
- problem statement;
- intended users;
- value proposition;
- demand evidence;
- Product Lab evidence;
- exact tested builds/releases;
- known risks;
- operating owner;
- dependencies;
- current classification;
- commercial state;
- approval record.

### 9.4 Atomic promotion

Promotion must be transactional.

The governed operation verifies all required evidence and authority, then:

1. creates the governed `products` row;
2. links the Portfolio Item to the new product;
3. changes item kind to `governed_product`;
4. records lifecycle transition to `active`;
5. records the promotion decision/evidence.

Failure rolls back the promotion as a unit.

There must be no candidate marked promoted without a corresponding Product Registry identity.

### 9.5 Commercial state

Product promotion does not enable billing.

The initial promotion path must default to the existing governed commercial baseline unless separately authorized:

- `billing_enabled = false`
- commercial mode remains free promotion / no billing until separately governed.

## 10. Product Lab integration

### 10.1 Evidence link

Add an optional `portfolio_item_id` to `product_surfaces`.

Legacy Product Lab surfaces without a Portfolio Item remain valid.

No mandatory direct Portfolio Item field is required on every test case or test run in Phase B because evidence can be resolved through the surface and its versioned snapshots.

### 10.2 Separation of authority

Product Lab answers:

- which surface;
- which environment;
- which exact build/release;
- which tests;
- which results;
- which evidence.

Portfolio governance answers:

- where the item belongs;
- whether it is a candidate;
- whether it should be promoted;
- whether it should be deprecated or retired.

Passing Product Lab tests never automatically creates a product or classification.

## 11. Reuse and consolidation

### 11.1 Reuse doctrine

Before approving new portfolio development, DataNest should prefer:

1. reuse;
2. extend;
3. compose;
4. build new.

The registry should make existing, candidate, external, and retired capabilities discoverable so duplication is deliberate rather than accidental.

### 11.2 Shared capability test

A capability is a candidate for `shared_datanest_capability` when evidence shows meaningful product-neutral reuse, a generic interface, reduced duplication, and platform-level governance fit.

No item is auto-classified as shared merely because multiple records have similar names.

### 11.3 Product-owned module test

An item is normally product-owned when its primary value is product-specific, its users and workflows align with that product, cross-product reuse is weak, and separation would increase complexity without independent value.

### 11.4 Independent-product test

Independent product promotion requires the full promotion criteria in Section 9. Repositories, public URLs, and brands are supporting evidence only.

### 11.5 Overlap detection

DataNest AI or registry queries may flag probable overlap. Such flags are proposals for review, not merge authority.

### 11.6 Consolidation lifecycle

A consolidation proceeds through:

1. identify overlap;
2. choose target architectural home;
3. map active consumers and dependencies;
4. map data/interfaces/URLs;
5. execute a separately governed migration plan;
6. validate consumers;
7. deprecate the redundant item;
8. retire only after blocking dependencies are cleared.

Phase B records these states and relationships. It does not itself perform repository, runtime, or data migrations.

## 12. Deprecation and retirement

### 12.1 Deprecation

`deprecated` means:

- existing use may continue temporarily;
- new adoption is discouraged;
- replacement or exit path should be identified;
- active dependencies remain visible;
- retirement evidence is accumulating.

### 12.2 Retirement guard

Retirement must fail closed when unresolved active critical consumers remain.

The retirement review should account for:

- active governed consumers;
- Product Lab production surfaces;
- explicit `depends_on` relationships;
- known public routes;
- unresolved risks;
- archival requirements;
- replacement/redirect state where applicable.

### 12.3 Retirement preserves history

Retirement preserves:

- Portfolio Item identity;
- source references;
- release/test evidence;
- classification history;
- relationship history;
- governance decisions;
- risks;
- retirement rationale;
- reusable knowledge and provenance references.

No retirement operation deletes historical evidence by default.

## 13. Derived read model

To avoid duplicating event-resolution logic across React components, Phase B should expose a derived read model such as `portfolio_registry_view`.

The read model should resolve:

- Portfolio Item identity;
- item kind;
- review state;
- active classification;
- target product if applicable;
- current lifecycle;
- active relationship counts;
- Product Lab evidence summary where available;
- historical provenance summary.

The view is derived state. Append-only history tables remain authoritative.

## 14. Governed write operations

Significant writes should use governed database functions/RPCs rather than unrelated browser writes.

Target operations include:

- `propose_portfolio_classification(...)`
- `approve_portfolio_classification(...)`
- `propose_portfolio_relationship(...)`
- `approve_portfolio_relationship(...)`
- `transition_portfolio_lifecycle(...)`
- `promote_product_candidate(...)`
- `deprecate_portfolio_item(...)`
- `retire_portfolio_item(...)`

Exact function signatures belong in the implementation plan.

These operations must validate project scope, caller authority, current state, conflicting active records, dependency guards, and evidence requirements inside one transaction where consistency requires it.

## 15. RLS and authority

The new tables follow existing project-scoped RLS patterns.

Target authority:

**Viewer/stakeholder**
- read permitted portfolio state for projects they are authorized to view.

**Operator**
- create Portfolio Items;
- attach evidence/provenance;
- propose classification;
- propose relationships;
- propose lifecycle transitions.

**Owner/admin**
- activate/supersede classification;
- activate/supersede governed relationships;
- promote Product Candidates;
- deprecate items;
- retire items.

**Service role**
- backend-only authority consistent with current Supabase policy.

Anonymous control-plane writes remain prohibited.

## 16. Migration strategy

### 16.1 Additive stages

Phase B migrates in four stages:

**Stage 1 — schema + backfill**
- create portfolio structures;
- add nullable Product Lab link;
- backfill RONSAS and historical applications;
- current UX remains operational.

**Stage 2 — dual-read**
- expose registry data beside existing product data;
- registry is visible but current product views remain intact.

**Stage 3 — governed workflows**
- enable classification, relationship, lifecycle, promotion, deprecation, and retirement operations.

**Stage 4 — portfolio authority**
- Portfolio Registry becomes the current architectural classification authority;
- existing Product Registry remains the governed product identity authority;
- historical `product_records` remain provenance.

### 16.2 Idempotent backfill

Backfill must use deterministic project-scoped slugs or another explicit stable mapping so repeated deployment does not create duplicate Portfolio Items.

Ambiguous normalization such as `Sync Vision` vs `SyncVision` must not be silently merged solely by name normalization. Ambiguity produces a review condition.

### 16.3 RONSAS backfill

RONSAS is linked to its existing product row and marked as an active governed product.

No RONSAS product status, billing state, source authority, or integration contract changes during backfill.

### 16.4 Historical application backfill

Existing application child records in the RONSAS import create separate Portfolio Items in `pending_review`.

Their source record/import reference is retained as provenance.

No active ownership classification is created automatically.

### 16.5 No destructive cleanup

Phase B does not delete:

- `products`;
- `product_records`;
- RONSAS import snapshots;
- Product Lab surfaces/tests/runs;
- source repositories;
- historical audit evidence.

Any future archival cleanup requires separate design and review.

## 17. User experience

### 17.1 Products workspace

The current Products workspace evolves into two coordinated views:

- **Governed Products** — existing product-centric catalog;
- **Portfolio Registry** — all registered portfolio items and their classification/lifecycle state.

Existing governed product UX stays functional.

### 17.2 RONSAS view

RONSAS remains product-centric.

A Composition area may show:

- Owned;
- Shared;
- External;
- Pending Review.

Historical application items begin under Pending Review until classification is approved.

### 17.3 Portfolio Item detail

A Portfolio Item detail surface should show:

- name and kind;
- review state;
- active classification;
- lifecycle;
- provenance;
- Product Lab evidence summary;
- active relationships/dependencies;
- relevant proposals/decisions;
- governed actions available to the current role.

The UI must distinguish `unknown`, `none`, and `pending review`.

### 17.4 Classification review

Classification review is evidence-first.

It should show provenance, known usage, dependencies, Product Lab evidence, source references, overlap signals, and any AI recommendation before presenting approval actions.

AI recommendations must be visibly non-authoritative.

### 17.5 Product Candidate view

Candidates should display progress against the independent-product criteria and Product Lab evidence without implying promotion.

Evidence sufficiency may make a promotion review available; it must not trigger automatic promotion.

### 17.6 Product Lab

Product Lab gains portfolio context but stays focused on testing.

A surface may show the linked Portfolio Item and provide navigation back to its registry detail.

### 17.7 Portfolio Pulse

Portfolio Pulse product cards continue to represent governed products only.

Portfolio Registry may expose separate counts such as candidates, pending reviews, shared capabilities, deprecated items, and retired items.

Pending applications must never inflate the governed product count.

## 18. URL compatibility

Existing URLs remain valid, including current product selection and record-filter query parameters.

The target extension may use parameters such as:

- `?view=products&section=portfolio`
- `?view=products&item=<portfolio-slug>`

Exact parameter names may be adjusted in the implementation plan if required by existing routing constraints, but backward compatibility for current product URLs is mandatory.

## 19. Error handling and fail-closed rules

Phase B must fail safely under ambiguity.

Required behavior includes:

- no classification -> `pending_review`;
- contradictory active classifications -> reject activation;
- `product_owned` without a valid target governed product -> reject;
- candidate promotion without required owner/evidence/classification -> reject;
- stale or mismatched Product Lab build evidence -> reject promotion;
- relationship self-reference -> reject;
- circular containment -> reject;
- cross-project relationship -> reject;
- unknown historical application ownership -> preserve as `pending_review`;
- retirement with active critical dependants -> block;
- Product Lab `production` environment without promotion approval -> remains non-product if not already a governed product;
- AI recommendation without owner/admin confirmation -> no state change.

## 20. Testing strategy

Implementation must include regression and new behavior tests.

### 20.1 Database and RLS

Test:

- valid item kinds;
- valid classification values;
- valid lifecycle states;
- valid relationship types/criticality;
- one active classification where required;
- same-project target validation;
- operator proposal permissions;
- owner/admin approval permissions;
- anonymous denial;
- cross-project isolation.

### 20.2 Promotion

Test:

- successful atomic candidate promotion;
- missing owner blocks promotion;
- unresolved classification blocks promotion;
- stale Product Lab evidence blocks promotion;
- failed promotion leaves no orphan `products` row;
- promotion keeps billing disabled unless separately authorized.

### 20.3 Relationships and retirement

Test:

- usage does not create ownership;
- self-reference rejected;
- containment cycle rejected;
- superseded relationships remain queryable;
- active critical dependency blocks retirement;
- retirement preserves history.

### 20.4 Migration

Test:

- RONSAS links to existing governed product;
- RONSAS billing/commercial state remains unchanged;
- each historical RONSAS application becomes one `pending_review` Portfolio Item;
- repeated backfill is idempotent;
- ambiguous name matching creates review state rather than silent merge;
- historical `product_records` remain present.

### 20.5 Product Lab

Test:

- existing unlinked surfaces remain valid;
- linked surfaces return portfolio context;
- Product Lab `production` does not imply product promotion;
- existing test history remains unchanged.

### 20.6 Browser regression

Test:

- Products page still opens;
- RONSAS remains selectable;
- canonical RONSAS full name remains visible;
- billing-off banner remains visible;
- product record search/filter and copied URLs remain functional;
- Portfolio Pulse still treats RONSAS as the governed product;
- Portfolio Registry clearly distinguishes Owned, Shared, External, and Pending Review;
- candidates, deprecated items, and retired items are visibly distinct;
- historical applications appear as pending review rather than RONSAS-owned.

## 21. Rollback

The migration is additive.

Before Portfolio Registry authority is fully adopted, rollback may:

- hide or disable new registry UI;
- stop new governed registry writes;
- preserve already-created registry history;
- continue serving the existing Products workspace and Product Lab.

Because Phase B does not delete legacy product structures, rollback must not require reconstructing them from backup.

## 22. Observability and audit

Significant Phase B events should emit ordinary project/audit evidence for:

- Portfolio Item creation;
- classification proposal/approval/supersession;
- relationship proposal/approval/supersession;
- lifecycle transitions;
- product promotion;
- deprecation;
- retirement.

A portfolio decision must not exist only as invisible metadata.

## 23. Explicit non-goals

Phase B does not:

- classify every historical Resonance application during initial implementation;
- move, merge, rename, archive, or delete repositories;
- move runtimes or deployment targets;
- migrate application data between products;
- enable billing;
- change Sparks economics;
- change DataNest AI learning policy;
- implement Resource Fabric;
- implement Cloud-Nest, Supository, or ILM;
- change RONSAS remote integration authority;
- create public marketplace behavior;
- automatically merge overlapping capabilities;
- allow AI to approve classification or promotion;
- delete legacy catalog or Product Lab history.

## 24. Initial-release boundary

The first Phase B release succeeds when:

1. Portfolio Registry structures exist with project-scoped RLS.
2. RONSAS is correctly linked as the baseline governed product.
3. Historical applications are registered as `pending_review` without inferred ownership.
4. Product Lab surfaces may link to Portfolio Items without breaking legacy evidence.
5. Classification and lifecycle history are append-only and governed.
6. Product Candidate promotion is evidence-backed and transactional.
7. Relationship semantics distinguish use, dependency, composition, replacement, and ownership.
8. Retirement is dependency-aware.
9. Existing Products/Product Lab/Portfolio Pulse behavior remains compatible.
10. Existing URLs continue to resolve.
11. Billing remains off.
12. No unrelated Phase C-H subsystem is introduced.

## 25. Implementation boundary

This written specification records the approved Phase B design.

It does not authorize database migration, UI implementation, Product Lab mutation, backfill execution, or production deployment by itself.

The next required step is user review of this written specification.

Only after written-spec approval should a Phase B implementation plan be created through the Superpowers planning workflow. Implementation begins only after that plan is reviewed and an execution method is selected.
