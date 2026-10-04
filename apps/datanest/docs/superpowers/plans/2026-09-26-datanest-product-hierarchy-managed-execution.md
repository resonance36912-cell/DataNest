# DataNest Product Hierarchy and Managed Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Resonance DataNest the unambiguous parent platform and execution authority while keeping RONSAS as a governed product, preserving its local Windows runtime as a DataNest-managed target rather than an independent production authority.

**Architecture:** Reuse the existing `products` / `product_records` catalog and its `metadata jsonb` field rather than adding schema. The AI & I hero becomes platform-centered: DataNest AI is fixed at the core, governed products such as RONSAS orbit it, and product application counts remain subordinate metadata. Products remains the canonical product-detail workspace. GitHub Pages + Supabase remain the current public delivery/backend path; Node/Docker stay supported for local development, recovery, controlled test, and continuity only.

**Tech Stack:** Next.js 15.5, React 19.1, TypeScript 5.9, Supabase JS 2.57, Supabase Postgres, Node `node:test`, Playwright 1.55, CSS Modules, GitHub Actions / GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-26-datanest-product-hierarchy-managed-execution-design.md`

## Global Constraints

- Resonance DataNest is the parent platform and control plane.
- RONSAS is a governed product within DataNest; it must never be presented as DataNest's parent or core.
- DataNest AI is a shared DataNest platform capability, not a RONSAS capability.
- GitHub remains source control, history, CI, and evidence authority.
- Supabase remains auth, database, storage, and backend-functions authority.
- Hosting remains replaceable delivery infrastructure, not system authority.
- RONSAS keeps its Windows local runtime, but execution/promotion authority is DataNest-managed.
- Standalone Node/Docker DataNest execution is local development, recovery, controlled test, or offline continuity only.
- Preserve `free promotion / no billing until pricing is established` and `billing_enabled=false`.
- Do not require Vercel and do not remove GitHub Pages in this change.
- Do not add a new Supabase table or change RLS for this change; use the existing product `metadata jsonb`.
- Do not introduce unrelated UI, billing, product, or repository refactors.

## Review Focus

- **Multiple governed products:** the AI & I core must remain DataNest AI when more than one product exists; each product appears as a product node rather than one product becoming the core.
- **Catalog empty/error state:** DataNest AI must remain visible and authoritative when product or product-record reads return no rows or fail.
- **Missing authority metadata:** Products must fall back to `Resonance DataNest` / `DataNest` rather than rendering blank parent/execution authority.
- **Commercial invariant:** RONSAS must continue to show free promotion / billing off after metadata/source changes.
- **Responsive/reduced-motion behavior:** the hierarchy must not introduce horizontal overflow, and the existing reduced-motion rules must still disable decorative animation.

---

### Task 1: Encode the DataNest → RONSAS authority contract in product source and Products UI

**Files:**
- Modify: `data/imports/ronsas-product-20260926.jsonl` (product record on line 1 only)
- Modify: `src/components/ProductsWorkspace.tsx` (catalog product type/helpers and governed product header/facts)
- Modify: `tests/unit/products-source.test.mjs`
- Modify: `tests/browser/products.spec.ts`

**Interfaces:**
- Consumes: existing `CatalogProduct.metadata: Record<string, unknown>`, `primary_runtime`, `operating_model`, and product catalog REST reads.
- Produces: product metadata keys `parent_platform`, `product_role`, `execution_authority`, `promotion_authority`, and `hosting_model`; visible Products UI labels for parent platform and execution authority.

- [ ] **Step 1: Write the failing unit assertions for the source contract**

In `tests/unit/products-source.test.mjs`, extend the RONSAS snapshot test so the product row must assert:

```js
assert.equal(product.parent_platform,"Resonance DataNest");
assert.equal(product.product_role,"governed_product");
assert.equal(product.execution_authority,"DataNest");
assert.equal(product.promotion_authority,"DataNest");
assert.equal(product.hosting_model,"replaceable_delivery_infrastructure");
assert.equal(product.primary_runtime,"Windows local environment");
assert.equal(product.billing_enabled,false);
```

Also extend the Products source assertions to require the copy `PARENT PLATFORM`, `RESONANCE DATANEST`, and `EXECUTION AUTHORITY`.

- [ ] **Step 2: Run the focused unit test and confirm failure**

Run: `node --test --experimental-strip-types tests/unit/products-source.test.mjs`

Expected: FAIL because the source snapshot and Products UI do not yet contain the new authority contract.

- [ ] **Step 3: Update the RONSAS product source record without changing application ownership**

Modify only the first JSONL record. Keep `primary_runtime` exactly `Windows local environment`, keep free-promotion/billing fields unchanged, and add the five authority fields above.

Change `operating_model` to:

`Local-first Windows runtime governed by Resonance DataNest, with cloud services used selectively for authentication, data, source history, deployment delivery, and evidence as governed dependencies.`

Do not change the nine application rows in this task; they remain RONSAS product records.

- [ ] **Step 4: Add authority fallbacks and hierarchy facts to `ProductsWorkspace.tsx`**

Add one focused helper:

`metadataText(metadata: Record<string,unknown>, key: string, fallback: string): string`

Use it so every product can render:

- `PARENT PLATFORM` → metadata `parent_platform` or `Resonance DataNest`
- `EXECUTION AUTHORITY` → metadata `execution_authority` or `DataNest`
- existing `Runtime` → `primary_runtime`

Add `DATANEST MANAGED` to the product flags when execution authority resolves to `DataNest`.

Keep the existing `FREE PROMOTION · BILLING OFF` flag unchanged.

- [ ] **Step 5: Update the Products browser fixture and assertions**

In `tests/browser/products.spec.ts`, add the five authority keys to the RONSAS fixture `metadata`.

Assert the rendered RONSAS product view shows:

- `Resonance DataNest` under parent platform;
- `DataNest` under execution authority;
- `DATANEST MANAGED`;
- `Windows local environment`;
- `FREE PROMOTION · BILLING OFF`.

Keep all existing Legal Eagle and mobile overflow assertions.

- [ ] **Step 6: Run focused unit and browser tests**

Run:
`node --test --experimental-strip-types tests/unit/products-source.test.mjs`

Expected: PASS.

Run:
`npx playwright test tests/browser/products.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add data/imports/ronsas-product-20260926.jsonl src/components/ProductsWorkspace.tsx tests/unit/products-source.test.mjs tests/browser/products.spec.ts
git commit -m "feat: make DataNest the product authority"
```

---

### Task 2: Refactor AI & I so DataNest AI is the core and RONSAS is a governed product node

**Files:**
- Modify: `src/components/CollaborationVisual.tsx`
- Modify: `src/components/CollaborationVisual.module.css`
- Modify: `tests/unit/products-hero-source.test.mjs`
- Modify: `tests/browser/home-optimization.spec.ts`

**Interfaces:**
- Consumes: `products` rows and `product_records` rows of `record_type="application"`.
- Produces: fixed platform core `DataNest AI`; one orbit node per governed product; application counts attached to product nodes; `Open Products` navigation remains unchanged.

- [ ] **Step 1: Replace the unit contract with the intended hierarchy**

In `tests/unit/products-hero-source.test.mjs`, change the first test to require source markers for:

- `DATANEST CORE`
- `DataNest AI`
- `Shared intelligence`
- product nodes derived from `products`
- per-product application counts
- `Open Products`

Add a negative assertion that the center is no longer derived from `primary?.name` and no longer labels the core `GOVERNED PRODUCT`.

- [ ] **Step 2: Run the hero unit test and confirm failure**

Run: `node --test --experimental-strip-types tests/unit/products-hero-source.test.mjs`

Expected: FAIL on the old RONSAS-centered core.

- [ ] **Step 3: Refactor `CollaborationVisual.tsx` to render product nodes, not application nodes**

Keep both existing Supabase reads, but change the derived model:

- products are the orbit nodes;
- application records are used only to compute each product's application count;
- cap orbit products with a constant `MAX_ORBIT_PRODUCTS` rather than `MAX_ORBIT_ITEMS`;
- each node renders product name and `N applications`;
- the center always renders:
  - small: `DATANEST CORE`
  - strong: `DataNest AI`
  - span: `Shared intelligence`
- the button remains `Open Products`.

The accessible label must describe `DataNest AI` first, followed by the governed product names and application counts.

For empty/error/loading states, the center remains DataNest AI. Only the orbit/caption changes state.

- [ ] **Step 4: Adjust the CSS without redesigning the hero**

Reuse the current orbit, sweep, card, and reduced-motion system. Make only the CSS changes needed for one or several product nodes to remain legible and non-overlapping.

Do not remove the existing `@media(prefers-reduced-motion:reduce)` coverage.

- [ ] **Step 5: Add a targeted browser fixture for the hierarchy**

In `tests/browser/home-optimization.spec.ts`, add one isolated dashboard test whose fixture includes:

- one product: RONSAS;
- nine application records tied to RONSAS.

Assert:

- `DataNest AI` is visible in the visual core;
- `RONSAS` is visible as a product node;
- the RONSAS node reports `9 applications`;
- `Open Products` navigates to `?view=products`;
- the page has no horizontal overflow at desktop and 390px widths.

Add a second product in the same fixture or a small second scenario and assert the center still says `DataNest AI`.

- [ ] **Step 6: Run focused tests**

Run:
`node --test --experimental-strip-types tests/unit/products-hero-source.test.mjs`

Expected: PASS.

Run:
`npx playwright test tests/browser/home-optimization.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/CollaborationVisual.tsx src/components/CollaborationVisual.module.css tests/unit/products-hero-source.test.mjs tests/browser/home-optimization.spec.ts
git commit -m "feat: center DataNest AI in the product constellation"
```

---

### Task 3: Make DataNest-managed delivery canonical and demote standalone hosting to recovery/test use

**Files:**
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `scripts/start-production.ps1`
- Create: `tests/unit/deployment-authority.test.mjs`

**Interfaces:**
- Consumes: current GitHub Pages + Supabase production architecture and the legacy local Node launcher.
- Produces: one canonical deployment description: DataNest-managed production with GitHub Pages as current delivery target, Supabase as backend authority, and standalone Node/Docker as local/recovery/test/continuity paths.

- [ ] **Step 1: Write the failing deployment-authority unit test**

Create `tests/unit/deployment-authority.test.mjs` that reads the three source files and asserts:

- README contains `DataNest-managed` and identifies GitHub Pages as the current public delivery target;
- deployment docs say hosting is replaceable delivery infrastructure, not system authority;
- Node and Docker sections are labeled local/recovery/test/continuity, not canonical production;
- the PowerShell launcher contains a warning that it is a legacy local/recovery launcher;
- GitHub and Supabase authority language remains present;
- no document claims RONSAS is the DataNest control plane.

- [ ] **Step 2: Run the new unit test and confirm failure**

Run: `node --test --experimental-strip-types tests/unit/deployment-authority.test.mjs`

Expected: FAIL on the existing provider-agnostic standalone-production language.

- [ ] **Step 3: Rewrite deployment copy with the approved authority model**

In `README.md`:

- keep the live GitHub Pages URL;
- describe DataNest as the parent/control platform;
- make current production `DataNest-managed public delivery: GitHub Pages + Supabase`;
- move Node/Windows and Docker under `Local development, recovery, and continuity`;
- retain provider-agnostic / replaceable-hosting language only as a delivery-layer property;
- describe Vercel as an optional future delivery target, not an authority.

In `docs/DEPLOYMENT.md`:

- lead with the DataNest-managed production model;
- preserve required runtime variables;
- relabel Windows/Node, Docker Compose, and generic containers as local/recovery/test/continuity;
- retain the health endpoint;
- state that a future delivery target change does not change product ownership or governance.

- [ ] **Step 4: Add a compatibility warning to the legacy PowerShell launcher**

Keep the filename `scripts/start-production.ps1` to avoid breaking existing shortcuts, but add an initial `Write-Warning` stating:

`Legacy local/recovery launcher only. Canonical production is DataNest-managed.`

Do not change its runtime behavior in this task.

- [ ] **Step 5: Run the deployment authority test**

Run: `node --test --experimental-strip-types tests/unit/deployment-authority.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run the complete unit suite**

Run: `npm test`

Expected: all unit tests PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/DEPLOYMENT.md scripts/start-production.ps1 tests/unit/deployment-authority.test.mjs
git commit -m "docs: make DataNest-managed delivery canonical"
```

---

### Task 4: Synchronize the live RONSAS product authority metadata after source verification

**Files:**
- Create: `docs/verification/datanest-product-hierarchy-2026-09-26.md`

**Interfaces:**
- Consumes: the Task 1 metadata contract and the existing production product row `id=24f2fa75-18b8-5b45-b624-b5dab381de9e`, `slug=ronsas`.
- Produces: production `products.metadata` matching source, with no schema/RLS change and no billing/runtime regression.

- [ ] **Step 1: Re-read the production row before mutation**

Using the Supabase production project `sgqdmfgjbprsoqsmgigi`, run a read-only query for:

`id, slug, name, primary_runtime, operating_model, commercial_mode, billing_enabled, metadata`

for RONSAS.

Expected before write: `primary_runtime="Windows local environment"`, `billing_enabled=false`.

- [ ] **Step 2: Update only the RONSAS authority metadata and operating-model sentence**

Execute one bounded DML update against the exact RONSAS product row:

```sql
update public.products
set
  operating_model = 'Local-first Windows runtime governed by Resonance DataNest, with cloud services used selectively for authentication, data, source history, deployment delivery, and evidence as governed dependencies.',
  metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'parent_platform','Resonance DataNest',
    'product_role','governed_product',
    'execution_authority','DataNest',
    'promotion_authority','DataNest',
    'hosting_model','replaceable_delivery_infrastructure'
  ),
  updated_at = now()
where id = '24f2fa75-18b8-5b45-b624-b5dab381de9e'
  and slug = 'ronsas';
```

Do not update `primary_runtime`, `commercial_mode`, or `billing_enabled`.

- [ ] **Step 3: Verify the production row after mutation**

Read the same fields back and assert:

- `parent_platform="Resonance DataNest"`
- `product_role="governed_product"`
- `execution_authority="DataNest"`
- `promotion_authority="DataNest"`
- `hosting_model="replaceable_delivery_infrastructure"`
- `primary_runtime="Windows local environment"`
- `commercial_mode="free promotion / no billing until pricing is established"`
- `billing_enabled=false`

- [ ] **Step 4: Run application verification before recording evidence**

Run:

```bash
npm test
npm run check
npm run build
npx playwright test tests/browser/home-optimization.spec.ts tests/browser/products.spec.ts
```

Expected: all PASS.

- [ ] **Step 5: Write the verification evidence**

Create `docs/verification/datanest-product-hierarchy-2026-09-26.md` containing:

- branch and head commit;
- unit/type/build/browser commands and results;
- the verified live authority metadata values;
- explicit statement that `primary_runtime`, free-promotion mode, and `billing_enabled=false` were preserved;
- statement that no Supabase schema/RLS change was made;
- current public delivery target remains GitHub Pages.

- [ ] **Step 6: Commit**

```bash
git add docs/verification/datanest-product-hierarchy-2026-09-26.md
git commit -m "docs: record DataNest hierarchy verification"
```

---

## Completion / Integration Gate

After Tasks 1–4:

1. Use `superpowers:requesting-code-review` for a whole-branch review.
2. Use `superpowers:verification-before-completion`; do not claim completion from stale test output.
3. Compare the implementation branch against `main` and confirm there are no unrelated changes.
4. Create or update the PR to `main`.
5. Let exact-head GitHub CI, PR Verification, and any required certification checks drain.
6. Merge only after required exact-head checks pass.
7. Let the existing GitHub Pages workflow publish the merged build.
8. Verify the live AI & I page shows DataNest AI as the core and RONSAS as a governed product node.
9. Verify the live Products page shows RONSAS under Resonance DataNest with `DATANEST MANAGED`, while preserving `FREE PROMOTION · BILLING OFF`.
