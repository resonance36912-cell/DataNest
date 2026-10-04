# DataNest Phase B Portfolio Registry & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the governed Portfolio Registry, evidence-backed lifecycle and promotion operations, idempotent RONSAS baseline backfill, Product Lab linkage, and compatible Products UX defined by the approved Phase B design.

**Architecture:** Keep `products` authoritative for governed products and add a separate project-scoped Portfolio Registry for applications, modules, capabilities, candidates, external capabilities, classifications, relationships, and lifecycle history. All portfolio mutations go through security-definer RPCs with explicit project-role checks and audit events; React reads a derived `portfolio_registry_view` and preserves the existing Products, Product Lab, Portfolio Pulse, RONSAS, billing-off, and URL behavior.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Supabase RPCs, Next.js 15.5.2, React 19.1.1, TypeScript 5.9.2, Node `--test --experimental-strip-types`, Playwright 1.55.0.

**Spec:** `docs/superpowers/specs/2026-09-27-datanest-phase-b-portfolio-registry-lifecycle-design.md`

## Global Constraints

- DataNest remains the parent platform and control plane.
- RONSAS remains a governed product under `DataNest > Products > RONSAS`.
- `products` remains authoritative for governed-product identity.
- Historical RONSAS application records are provenance only; they must not create active RONSAS ownership automatically.
- Unknown or unresolved architectural ownership is `pending_review`; never infer ownership from repository, URL, deployment, brand, or historical catalog placement.
- RONSAS `billing_enabled` remains `false`; Phase B must not enable billing.
- Product Lab environment values `local|preview|staging|production` remain independent of portfolio lifecycle and product promotion.
- Classification, relationship, and lifecycle histories are append-only; rejected/superseded records remain queryable.
- Product promotion is transactional and cannot leave an orphan `products` row or a falsely promoted candidate.
- Retirement is blocked while active critical dependants or active linked Product Lab production surfaces remain.
- Existing `products`, `product_records`, RONSAS import snapshots, Product Lab surfaces/test cases/test runs, current URLs, and Portfolio Pulse governed-product semantics are preserved.
- New portfolio tables are project-scoped with RLS. Authenticated clients receive SELECT only; all portfolio state changes use governed RPCs.
- Anonymous control-plane writes remain prohibited.
- Every significant portfolio operation emits a `public.events` audit event with a `PORTFOLIO_` event type.
- No repository move/merge, runtime move, cross-product data migration, Cloud-Nest/Supository/ILM/Resource Fabric implementation, billing activation, or unrelated Phase C-H work is in scope.
- Source changes are committed and verified first; this plan does not directly apply migrations to production outside existing release/promotion gates.

## Review Focus

1. **Historical ownership claim:** imported RONSAS child records may contain `ownership:"RONSAS"`; backfill must preserve that as provenance while creating `pending_review` items with no active `product_owned` classification.
2. **Lifecycle/runtime confusion:** a Product Lab surface with `environment="production"` is runtime evidence only and cannot promote a candidate or create a governed product.
3. **Partial promotion failure:** candidate promotion must be one database transaction; any validation/write failure leaves the candidate and Product Registry unchanged.
4. **Dependency-safe retirement:** retirement must fail while another active Portfolio Item has an active `depends_on` relationship with `criticality="critical"` or while the item still has an active linked Product Lab `production` surface.
5. **Compatibility:** current `?view=products&product=ronsas&recordType=...&q=...` links, canonical RONSAS name, billing-off banner, Product Lab legacy surfaces, and Portfolio Pulse product count must remain unchanged.

---

## File Structure

- Create `supabase/migrations/20260927093000_add_portfolio_registry_foundations.sql` — registry/history tables, indexes, RLS, Product Lab nullable link, and security-invoker read model.
- Create `supabase/migrations/20260927094000_add_portfolio_registry_governed_operations.sql` — item/classification/relationship/lifecycle/promotion/deprecation/retirement RPCs, safety helpers, and audit events.
- Create `supabase/migrations/20260927095000_backfill_portfolio_registry_baseline.sql` — idempotent RONSAS baseline and historical application backfill.
- Create `tests/unit/portfolio-registry-schema-source.test.mjs` — schema/RLS/read-model source contract.
- Create `tests/unit/portfolio-registry-operations-source.test.mjs` — governed RPC, atomicity, audit, graph, and retirement source contract.
- Create `tests/unit/portfolio-registry-backfill-source.test.mjs` — RONSAS and historical-application backfill contract.
- Create `src/lib/portfolioRegistry.ts` — shared TypeScript types, labels, and role helpers.
- Create `src/components/PortfolioRegistryPanel.tsx` — registry read/detail/governed-action UI.
- Create `tests/unit/portfolio-registry-ui-source.test.mjs` — registry UI source contract.
- Create `tests/unit/product-lab-portfolio-source.test.mjs` — Product Lab linkage source contract.
- Create `tests/browser/portfolio-registry.spec.ts` — new portfolio browser behavior and compatibility checks.
- Modify `src/components/ProductLab.tsx` — optional Portfolio Item association on surfaces.
- Modify `src/components/ProductsWorkspace.tsx` — Governed Products / Portfolio Registry modes and RONSAS composition summary.
- Modify `src/components/DataNestApp.tsx` — pass current user and project role into Products workspace.
- Modify `src/app/globals.css` — registry/review/mobile styles.
- Modify `tests/unit/products-source.test.mjs` — preserve RONSAS, billing, catalog, Pulse, and URL contracts.
- Modify `tests/browser/products.spec.ts` only if fixture support is required by the additional registry reads; keep all existing assertions.
- Modify `docs/ARCHITECTURE.md` — record implemented Portfolio Registry authority only after code exists.

### Task 1: Portfolio Registry Schema, RLS & Read Model

**Files:**
- Create: `supabase/migrations/20260927093000_add_portfolio_registry_foundations.sql`
- Create: `tests/unit/portfolio-registry-schema-source.test.mjs`

**Interfaces:**
- Produces `portfolio_items`, `portfolio_classifications`, `portfolio_relationships`, `portfolio_lifecycle_events`.
- Produces `portfolio_registry_view`.
- Adds nullable `product_surfaces.portfolio_item_id uuid references public.portfolio_items(id) on delete set null`.
- Later tasks consume the exact column/value names defined here.

- [ ] **Step 1: Write the failing schema contract**

Assert the migration defines:

```js
assert.match(sql,/create table public\.portfolio_items/i);
assert.match(sql,/governed_product.*product_candidate.*application.*module.*capability.*external_capability/is);
assert.match(sql,/pending_review.*classified.*deprecated.*retired/is);
assert.match(sql,/concept.*experiment.*validating.*candidate.*active.*maintained.*deprecated.*retired/is);
assert.match(sql,/create table public\.portfolio_classifications/i);
assert.match(sql,/product_owned.*shared_datanest_capability.*independent_datanest_product.*registered_external_capability/is);
assert.match(sql,/create table public\.portfolio_relationships/i);
assert.match(sql,/contains.*uses.*provides.*depends_on.*replaces.*supersedes.*integrates_with.*derived_from/is);
assert.match(sql,/optional.*normal.*critical/is);
assert.match(sql,/create table public\.portfolio_lifecycle_events/i);
assert.match(sql,/portfolio_item_id uuid references public\.portfolio_items/i);
assert.match(sql,/create (or replace )?view public\.portfolio_registry_view/i);
assert.match(sql,/security_invoker/i);
```

Also pin:
- unique `(project_id,slug)`;
- partial unique `linked_product_id` when non-null;
- partial unique `(project_id,source_authority,source_reference)` when source reference is non-null;
- one active classification per item;
- indexes on every new FK;
- RLS on all four tables;
- authenticated read policies use `private.is_project_stakeholder(project_id) or private.is_project_member(project_id)`;
- authenticated does not receive direct INSERT/UPDATE/DELETE grants on portfolio tables;
- service role keeps backend access.

- [ ] **Step 2: Run RED**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-schema-source.test.mjs`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the foundation migration**

Use these exact state values:

- `portfolio_items.item_kind`: `governed_product|product_candidate|application|module|capability|external_capability`
- `review_state`: `pending_review|classified|deprecated|retired`
- `current_lifecycle`: nullable; when non-null one of `concept|experiment|validating|candidate|active|maintained|deprecated|retired`
- classification status: `proposed|active|superseded|rejected`
- relationship status: `proposed|active|superseded|rejected`
- lifecycle-event status: `proposed|approved|rejected`

History records include project/item IDs, rationale/reason, evidence reference, proposer/approver, and timestamps.

`portfolio_registry_view with (security_invoker=true)` resolves item identity, active classification, target product, current lifecycle, active relationship counts, linked Product Lab surface/test-run counts, and provenance fields.

Existing Product Lab rows remain valid because `portfolio_item_id` is nullable.

- [ ] **Step 4: Run schema regression**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-schema-source.test.mjs tests/unit/products-source.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927093000_add_portfolio_registry_foundations.sql tests/unit/portfolio-registry-schema-source.test.mjs
git commit -m "feat: add portfolio registry schema"
```

### Task 2: Governed Portfolio Operations, Atomic Promotion & Safety Guards

**Files:**
- Create: `supabase/migrations/20260927094000_add_portfolio_registry_governed_operations.sql`
- Create: `tests/unit/portfolio-registry-operations-source.test.mjs`

**Interfaces:**
- Consumes Task 1 schema.
- Produces:
  - `create_portfolio_item_v1(target_project uuid, target_slug text, target_name text, target_kind text, target_lifecycle text default null, target_source_authority text default null, target_source_reference text default null, target_metadata jsonb default '{}'::jsonb) returns uuid`
  - `propose_portfolio_classification_v1(target_item uuid, target_classification text, target_product uuid default null, target_rationale text default null, target_evidence_reference text default null) returns uuid`
  - `approve_portfolio_classification_v1(target_classification_id uuid) returns uuid`
  - `propose_portfolio_relationship_v1(target_source_item uuid, target_target_item uuid, target_relationship_type text, target_criticality text default 'normal', target_rationale text default null, target_evidence_reference text default null) returns uuid`
  - `approve_portfolio_relationship_v1(target_relationship_id uuid) returns uuid`
  - `propose_portfolio_lifecycle_transition_v1(target_item uuid, target_to_state text, target_reason text, target_evidence_reference text default null) returns uuid`
  - `approve_portfolio_lifecycle_transition_v1(target_event_id uuid) returns uuid`
  - `promote_product_candidate_v1(target_item uuid, target_category text, target_mission text, target_operating_model text, target_primary_runtime text, target_promotion_packet jsonb, target_evidence_reference text) returns uuid`
  - `deprecate_portfolio_item_v1(target_item uuid, target_reason text, target_evidence_reference text default null) returns uuid`
  - `retire_portfolio_item_v1(target_item uuid, target_reason text, target_evidence_reference text default null) returns uuid`

- [ ] **Step 1: Write the failing operations contract**

Assert:
- every public RPC is `security definer`, sets a safe search path, validates `auth.uid()`, is revoked from `public`, and granted only to `authenticated`/service role;
- create/propose requires `owner|admin|operator`;
- approve/promote/deprecate/retire requires `owner|admin`;
- `product_owned` requires a same-project governed product target;
- approval supersedes a prior active classification before activating the new one;
- relationship approval rejects self/cross-project links and calls a recursive `contains` cycle guard;
- retirement calls both a critical-dependant guard and an active-production-surface guard;
- promotion requires candidate kind, active independent-product classification, promotion packet, linked versioned Product Lab evidence, and one transaction;
- promotion inserts `billing_enabled=false` and accepts no billing parameter;
- every significant RPC inserts `PORTFOLIO_` evidence into `public.events`.

- [ ] **Step 2: Run RED**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-operations-source.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement private helpers**

Define private helpers:

- `portfolio_item_project(target_item uuid) returns uuid`
- `portfolio_contains_path(target_project uuid,start_item uuid,sought_item uuid) returns boolean`
- `portfolio_has_active_critical_dependants(target_item uuid) returns boolean`
- `portfolio_has_active_production_surfaces(target_item uuid) returns boolean`
- `validate_portfolio_promotion_packet(target_packet jsonb) returns void`

Promotion packet requires non-empty evidence for:
`problem_statement`, `intended_users`, `value_proposition`, `repeat_demand_evidence`, `operational_owner`, `independent_lifecycle_justification`, `product_lab_evidence`, `known_risks`, and `dependencies`.

Classification, commercial state, exact linked build identity, and governance approver are derived from authoritative current state during the RPC rather than trusted from caller-supplied JSON.

Do not grant browser execution on private helpers.

- [ ] **Step 4: Implement item/classification/relationship RPCs**

`create_portfolio_item_v1` creates only identity/current optional lifecycle; it never sets active ownership.

Classification/relationship proposals append records. Approval locks relevant rows, validates current project/state, and then activates/supersedes within the same transaction.

For active `contains`, require the contained item to have active `product_owned` classification targeting the source item's linked governed product. `uses` and `depends_on` never create ownership.

Each mutation writes a `PORTFOLIO_...` event.

- [ ] **Step 5: Implement lifecycle and promotion RPCs**

`propose_portfolio_lifecycle_transition_v1` creates a proposal only.

`approve_portfolio_lifecycle_transition_v1` approves the event, updates `current_lifecycle`, and maps review state only when entering deprecated/retired.

`deprecate_portfolio_item_v1` and `retire_portfolio_item_v1` create and approve the transition atomically for owner/admin.

`retire_portfolio_item_v1` rejects active critical dependants and any active linked Product Lab surface with `environment='production' and status='active'`, then preserves history.

`promote_product_candidate_v1`:
1. locks item;
2. requires `item_kind='product_candidate'`;
3. validates promotion packet/evidence;
4. requires active `independent_datanest_product` classification;
5. requires at least one linked Product Lab surface with non-null `build_commit` and at least one test run for that surface;
6. creates `products` using item slug/name and supplied fields;
7. writes `commercial_mode='free promotion / no billing until pricing is established'`, `billing_enabled=false`;
8. updates item to `governed_product`, links product, sets classified/active state;
9. records approved lifecycle, a `product_records` promotion decision/evidence row, and `PORTFOLIO_PRODUCT_PROMOTED`;
10. returns the new product UUID.

Any error rolls back the entire function.

- [ ] **Step 6: Run GREEN**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-schema-source.test.mjs tests/unit/portfolio-registry-operations-source.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260927094000_add_portfolio_registry_governed_operations.sql tests/unit/portfolio-registry-operations-source.test.mjs
git commit -m "feat: add governed portfolio operations"
```

### Task 3: Idempotent RONSAS Baseline & Historical Application Backfill

**Files:**
- Create: `supabase/migrations/20260927095000_backfill_portfolio_registry_baseline.sql`
- Create: `tests/unit/portfolio-registry-backfill-source.test.mjs`
- Reference: `data/imports/ronsas-product-20260926.jsonl`

**Interfaces:**
- Produces one active RONSAS governed-product Portfolio Item.
- Produces one `pending_review` application Portfolio Item for each existing RONSAS `product_records.record_type='application'` row.
- Creates no active application ownership relationship/classification.

- [ ] **Step 1: Write the failing backfill contract**

Assert:
- RONSAS resolves by existing `products.slug='ronsas'`;
- baseline classification/lifecycle is attributed to an active project owner and backfill fails clearly if none exists;
- RONSAS is `governed_product`, classified, active, linked to existing product, active `independent_datanest_product`;
- no update changes RONSAS billing/commercial state;
- historical applications come from existing `product_records` where `record_type='application'`;
- each historical app is `application`, `pending_review`, `linked_product_id=null`, `current_lifecycle=null`;
- provenance is `source_authority='product_records'`, `source_reference=pr.id::text`;
- old `payload->>'ownership'` is stored only under provenance metadata;
- migration never inserts `product_owned` for historical apps;
- repeated execution is idempotent.

Parse the current import snapshot and assert the nine historical application source records remain evidence only.

- [ ] **Step 2: Run RED**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-backfill-source.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement baseline backfill**

RONSAS:
- reuse existing product row;
- deterministic Portfolio Item slug `ronsas`;
- seed active independent-product classification and approved active lifecycle only when equivalent records do not exist;
- do not alter product commercial/billing fields.

Historical applications:
- provenance decides identity;
- generate readable slug from name;
- if slug is occupied by a different provenance source, append `-<first 8 hex chars of product_record.id>` rather than silently merging;
- preserve historical name/code/status/ownership claim under `metadata.historical_catalog`;
- create no classification, lifecycle event, or relationship.

- [ ] **Step 4: Run GREEN**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-backfill-source.test.mjs tests/unit/products-source.test.mjs tests/unit/portfolio-registry-schema-source.test.mjs tests/unit/portfolio-registry-operations-source.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927095000_backfill_portfolio_registry_baseline.sql tests/unit/portfolio-registry-backfill-source.test.mjs
git commit -m "feat: backfill portfolio registry baseline"
```

### Task 4: Link Product Lab Evidence to Portfolio Items

**Files:**
- Create: `tests/unit/product-lab-portfolio-source.test.mjs`
- Modify: `src/components/ProductLab.tsx`

**Interfaces:**
- Consumes `portfolio_registry_view`.
- Product Lab `Surface` gains `portfolio_item_id:string|null`.
- New UI option type: `PortfolioItemOption={id:string;slug:string;name:string;item_kind:string;review_state:string;current_lifecycle:string|null}`.
- Product Lab public props remain unchanged.

- [ ] **Step 1: Write failing Product Lab contract**

Assert Product Lab:
- selects `portfolio_item_id`;
- reads project `portfolio_registry_view`;
- has optional accessible `Portfolio item` selector;
- writes `portfolio_item_id:selectedPortfolioItemId||null` on surface creation;
- shows linked item name/kind/review state;
- renders legacy null links;
- states that a production surface is runtime evidence, not promotion authority;
- never calls `promote_product_candidate_v1`.

- [ ] **Step 2: Run RED**

Run:

`node --test --experimental-strip-types tests/unit/product-lab-portfolio-source.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Add portfolio context to Product Lab**

Load portfolio options, add optional selector in Surface Admin, write the nullable id, and show linked context beside selected surface metadata.

Preserve immutable build requirement, production confirmation, test-case versioning, run snapshots, realtime subscriptions, and all existing Product Lab behavior.

No classification/promotion actions belong in Product Lab.

- [ ] **Step 4: Run GREEN + TypeScript**

Run:

`node --test --experimental-strip-types tests/unit/product-lab-portfolio-source.test.mjs`

Run:

`npm run check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductLab.tsx tests/unit/product-lab-portfolio-source.test.mjs
git commit -m "feat: link Product Lab to portfolio items"
```

### Task 5: Portfolio Registry Read UX & Products Integration

**Files:**
- Create: `src/lib/portfolioRegistry.ts`
- Create: `src/components/PortfolioRegistryPanel.tsx`
- Create: `tests/unit/portfolio-registry-ui-source.test.mjs`
- Modify: `src/components/ProductsWorkspace.tsx`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/products-source.test.mjs`

**Interfaces:**
- `PortfolioRole="owner"|"admin"|"operator"|"viewer"`.
- Export `PortfolioItemKind`, `PortfolioReviewState`, `PortfolioClassification`, `PortfolioLifecycle`, `PortfolioRelationshipType`, `PortfolioRegistryRow`.
- Export pure helpers `portfolioKindLabel`, `portfolioClassificationLabel`, `portfolioLifecycleLabel`, `canProposePortfolio`, `canApprovePortfolio`.
- `PortfolioRegistryPanel` props: `{projectId:string;currentUserId:string;role:PortfolioRole;historicalRonsasProductId:string|null}`.
- `ProductsWorkspace` props become `{projectId:string;currentUserId:string;role:PortfolioRole}`.

- [ ] **Step 1: Write failing UI contracts**

Assert:
- shared types/labels/role helpers exist;
- panel reads `portfolio_registry_view`, classifications, relationships;
- labels include `Pending Review`, `Owned`, `Shared DataNest`, `Independent Product`, `External`;
- provenance and Product Lab evidence counts are visible;
- AI suggestions in metadata are labeled non-authoritative;
- no approval/promotion happens on load.

Extend `products-source.test.mjs` to require:
- Governed Products and Portfolio Registry modes;
- existing `product|recordType|q` handling remains;
- RONSAS canonical name and billing-off label remain;
- Portfolio Pulse still receives only governed `catalogProducts`.

- [ ] **Step 2: Run RED**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-ui-source.test.mjs tests/unit/products-source.test.mjs`

Expected: FAIL for missing registry UI.

- [ ] **Step 3: Implement shared types and read-only registry panel**

Create `portfolioRegistry.ts` as presentation/types only.

Create `PortfolioRegistryPanel.tsx` with project-scoped load, search/filter, detail, provenance, lifecycle/classification state, Product Lab evidence summary, active relationship summary, and `item=<slug>` URL selection.

Pending-review copy must say: `Architectural ownership has not yet been approved.`

Errors in registry loading must remain local and not break Governed Products.

- [ ] **Step 4: Integrate second Products mode and RONSAS Composition**

Use:
- default/absent section => Governed Products;
- `section=portfolio` => Portfolio Registry.

Switching modes preserves current `product`, `recordType`, and `q` values; returning to products removes only `section` and `item`.

Inside RONSAS detail add Composition groups:
- Owned: active `product_owned` targeting RONSAS;
- Shared: active shared classification plus RONSAS `uses|depends_on`;
- External: active external classification plus RONSAS integration/use;
- Pending Review: historical RONSAS provenance with no approved classification.

Never render pending historical apps as Owned.

Modify `DataNestApp` to pass user id and membership role.

- [ ] **Step 5: Add focused responsive styles**

Reuse existing panel/button/input/badge primitives where possible. Add only registry/mode/composition/detail classes and mobile stacking.

- [ ] **Step 6: Run GREEN + build checks**

Run:

`node --test --experimental-strip-types tests/unit/portfolio-registry-ui-source.test.mjs tests/unit/products-source.test.mjs tests/unit/product-lab-portfolio-source.test.mjs`

Run:

`npm run check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/portfolioRegistry.ts src/components/PortfolioRegistryPanel.tsx src/components/ProductsWorkspace.tsx src/components/DataNestApp.tsx src/app/globals.css tests/unit/portfolio-registry-ui-source.test.mjs tests/unit/products-source.test.mjs
git commit -m "feat: add portfolio registry workspace"
```

### Task 6: Governed Portfolio Actions, Browser Coverage & Architecture Record

**Files:**
- Modify: `src/components/PortfolioRegistryPanel.tsx`
- Modify: `src/components/ProductsWorkspace.tsx` only if refresh/composition routing requires it
- Create: `tests/browser/portfolio-registry.spec.ts`
- Modify: `tests/browser/products.spec.ts` only for fixture compatibility
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes Task 2 RPCs and Task 5 role helpers.
- React must not directly insert/update/delete portfolio history tables.

- [ ] **Step 1: Write failing browser coverage**

Create a fixture with:
- RONSAS active independent governed product;
- Sync Vision `pending_review` with historical RONSAS provenance containing an old ownership claim;
- one shared capability used by RONSAS;
- one external capability integrated by RONSAS;
- one Product Candidate with linked Product Lab evidence including a production surface;
- one deprecated and one retired item.

Assert:
1. `?view=products&section=portfolio&item=sync-vision` shows Pending Review and the exact pending-review explanation, not Owned.
2. Governed Products still shows RONSAS canonical full name, `FREE PROMOTION · BILLING OFF`, and Portfolio Pulse product count based only on governed products.
3. RONSAS Composition separates Shared/External/Pending Review.
4. Candidate remains a candidate even when its Product Lab surface environment is `production`.
5. 390x844 has no document horizontal overflow.
6. Existing legacy product URL still behaves as existing `products.spec.ts` requires.
7. Viewer/operator/owner role fixtures expose only the permitted actions.
8. Retirement RPC errors for either critical dependants or an active linked production surface leave displayed lifecycle unchanged.

Run:

`npm run test:browser -- tests/browser/portfolio-registry.spec.ts`

Expected: FAIL because governed controls are not implemented.

- [ ] **Step 2: Add operator proposal controls**

For `owner|admin|operator`:
- create item -> `create_portfolio_item_v1`;
- propose classification -> `propose_portfolio_classification_v1`;
- propose relationship -> `propose_portfolio_relationship_v1`;
- propose lifecycle -> `propose_portfolio_lifecycle_transition_v1`.

Require rationale for proposals. Reload registry state after successful RPC. Do not expose approval buttons to operator/viewer.

- [ ] **Step 3: Add owner/admin approval and lifecycle controls**

For `owner|admin` only:
- approve classification;
- approve relationship;
- approve lifecycle;
- deprecate;
- retire.

Retirement confirmation must state that history is preserved and database dependency guards are authoritative.

RPC failures remain local and do not hide or mutate the item in UI.

- [ ] **Step 4: Add Product Candidate promotion review**

Promotion form collects:
- category;
- mission;
- operating model;
- primary runtime;
- evidence reference;
- exact Promotion Packet keys from Task 2.

Show `FREE PROMOTION · BILLING OFF` before confirmation. Expose no billing input.

Call `promote_product_candidate_v1`; on success refresh both registry and governed-product queries.

- [ ] **Step 5: Update architecture record**

After implementation exists, add a concise Portfolio Registry section to `docs/ARCHITECTURE.md` stating:
- Product Registry remains governed-product identity authority;
- Portfolio Registry is architectural classification/lifecycle/relationship authority;
- historical RONSAS app placement is provenance, not ownership;
- Product Lab provides versioned evidence but does not promote products;
- billing-off remains unchanged.

Do not claim Phase C-H target concepts are implemented.

- [ ] **Step 6: Run full Phase B verification**

Run:

`npm test`

Run:

`npm run check`

Run:

`npm run build`

Run:

`npm run test:browser -- tests/browser/products.spec.ts tests/browser/portfolio-registry.spec.ts`

If repository PR verification runs all Playwright tests, also run:

`npm run test:browser`

Expected: all pass.

- [ ] **Step 7: Inspect scope/migration ordering**

Run:

`git diff --check <PHASE_B_BASE>...HEAD`

Run:

`git diff --name-only <PHASE_B_BASE>...HEAD`

Expected migration order:
1. `20260927093000_add_portfolio_registry_foundations.sql`
2. `20260927094000_add_portfolio_registry_governed_operations.sql`
3. `20260927095000_backfill_portfolio_registry_baseline.sql`

No unrelated billing, DataNest AI learning, Sparks, deployment-target, RONSAS runtime, Cloud-Nest, Supository, ILM, or Resource Fabric changes.

- [ ] **Step 8: Commit**

```bash
git add src/components/PortfolioRegistryPanel.tsx src/components/ProductsWorkspace.tsx tests/browser/portfolio-registry.spec.ts tests/browser/products.spec.ts docs/ARCHITECTURE.md
git commit -m "feat: complete governed portfolio lifecycle"
```

## Final Branch Review

After all tasks:

- verify no migration rewrites earlier historical migrations;
- verify authenticated clients cannot directly mutate portfolio history tables;
- verify all portfolio writes emit audit events;
- verify historical RONSAS ownership claims remain provenance-only;
- verify pending applications do not inflate Portfolio Pulse product count;
- verify Product Lab production remains evidence only;
- verify candidate promotion cannot accept/enable billing;
- verify retirement dependency guard exists at database authority, not only UI;
- verify legacy product URLs still pass;
- run all Task 6 verification commands with fresh results before PR merge.

## Plan Self-Review

**Spec coverage:** Tasks 1-6 cover identity, classification, relationship graph, lifecycle history, RLS, governed write paths, audit events, atomic promotion, deprecation/retirement, Product Lab linkage, RONSAS/historical-app backfill, read model, Products/Portfolio UX, URLs, and compatibility. Physical repository/runtime consolidation remains correctly excluded.

**Step scan:** Each task has one reviewable deliverable: schema, governed operations, backfill, Product Lab linkage, registry read UX, then governed actions/integration. No task asks the implementer to invent schema/RPC/type names.

**Type consistency:** UI types use Task 1 view fields and Task 2 RPC names. `PortfolioRole` matches existing membership roles. Product Lab adds only nullable `portfolio_item_id`.

**Review Focus:** historical ownership is pinned in Task 3 and browser Task 6; lifecycle/runtime separation in Tasks 4/6; atomic promotion in Task 2; critical-dependency and active-production-surface retirement guards in Task 2/6; compatibility in Tasks 5/6.

**Proportion:** This is one six-task vertical plan for one coherent Phase B subsystem. It deliberately excludes Phase C-H and physical application/repository consolidation.
