# DataNest Phase A Authority & Terminology Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing DataNest code and documentation so the approved ecosystem authority, RONSAS placement, Sparks meaning, target-state concept status, and retention-policy amendment cannot drift while later architecture phases are implemented.

**Architecture:** Phase A is deliberately narrow. It introduces one small runtime terminology module for canonical names/copy already used by the UI, adds source-contract tests around authority wording, updates architecture/UX documentation, and records the 2026-09-27 retention supersession without changing data, schemas, billing, deployment, or learning behavior. Later master-spec phases receive their own implementation plans after this one is reviewed and completed.

**Tech Stack:** Next.js 15.5.2, React 19.1.1, TypeScript 5.9.2, Node built-in test runner with `--experimental-strip-types`, Playwright 1.55.0, Supabase-backed existing runtime.

**Spec:** `docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md`

## Global Constraints

- DataNest remains the parent platform and control plane.
- RONSAS remains a governed product under `DataNest > Products > RONSAS`; it is never DataNest's parent or DataNest AI authority.
- DataNest AI remains a shared DataNest platform capability.
- GitHub remains source/history/CI/evidence authority.
- Supabase remains auth/database/storage/backend-function authority.
- Hosting remains replaceable delivery infrastructure.
- Existing free-promotion / billing-off state must remain unchanged.
- Sparks remain internal utility; they are not cash, equity, governance weight, ownership, royalties, or a speculative asset.
- The word `Sparks` must not be reused as the generic name for raw product ideas; use `Concept` or `Opportunity` for early ideas.
- Cloud-Nest, Supository, and ILM are approved target-state concepts and must not be presented as implemented live capabilities until code and evidence exist.
- The 2026-09-27 retention amendment supersedes blanket indefinite raw-input retention with policy-driven retention, but it does not authorize deletion or mutation of existing records.
- UNKNOWN capability state remains non-executable.
- No schema migration, data deletion, billing change, model training, provider switch, production promotion, or deployment-target change is part of Phase A.

## Review Focus

1. **RONSAS naming drift:** A stale imported `full_name` must still render as `Resonance Open Nova Sovereign Application Suite`; Task 1 pins the canonical runtime constant and existing override behavior.
2. **Sparks semantic collision:** Navigation/help copy must describe Sparks as earned internal utility, not as raw ideas or a generic ideation stage; Tasks 1 and 2 pin both runtime and UX documentation.
3. **Target-state overclaiming:** Cloud-Nest, Supository, or ILM must be explicitly labeled target-state/not-yet-live in authority docs; Task 2 adds source-contract tests for that wording.
4. **Retention amendment misread as deletion authority:** The older governed-memory spec must carry an explicit supersession note saying policy-driven retention does not itself delete existing records; Task 3 pins this exact safeguard.
5. **Commercial-state regression:** Phase A must preserve `FREE PROMOTION · BILLING OFF` and `billing_enabled=false`; Task 1 keeps existing product-source assertions and adds the canonical free-promotion copy to the authority contract.

---

## File Structure

- Create `src/lib/ecosystemAuthority.ts` — canonical runtime names and short user-facing authority copy that must not drift across components.
- Create `tests/unit/ecosystem-authority-contract.test.mjs` — focused regression contract for platform/product/Sparks/target-state/retention wording.
- Modify `src/components/ProductsWorkspace.tsx` — consume the canonical RONSAS full name instead of owning a local duplicate.
- Modify `src/components/DataNestApp.tsx` — align Sparks description and task-guide copy with the implemented internal-utility economy.
- Modify `README.md` — add a concise target-state architecture status section without implying implementation.
- Modify `docs/ARCHITECTURE.md` — record canonical hierarchy, target-state status, and the authoritative link to the new master ecosystem spec.
- Modify `docs/UX_WORKFLOW_ARCHITECTURE.md` — replace obsolete `Sparks — capture intent and raw ideas` wording with the current internal-utility role.
- Modify `docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md` — append an explicit 2026-09-27 retention supersession note while preserving the historical design record.

### Task 1: Canonical Runtime Authority Copy

**Files:**
- Create: `src/lib/ecosystemAuthority.ts`
- Create: `tests/unit/ecosystem-authority-contract.test.mjs`
- Modify: `src/components/ProductsWorkspace.tsx` near the current `RONSAS_FULL_NAME` declaration
- Modify: `src/components/DataNestApp.tsx` at `viewDescriptions.sparks` and `workspaceTaskGuides.sparks`

**Interfaces:**
- Produces:
  - `DATANEST_PLATFORM_NAME: "Resonance DataNest"`
  - `RONSAS_PRODUCT_NAME: "RONSAS"`
  - `RONSAS_FULL_NAME: "Resonance Open Nova Sovereign Application Suite"`
  - `RONSAS_PRODUCT_PATH: "DataNest > Products > RONSAS"`
  - `FREE_PROMOTION_LABEL: "FREE PROMOTION · BILLING OFF"`
  - `SPARKS_WORKSPACE_DESCRIPTION: "Use earned contribution utility for approved project services."`
  - `SPARKS_TASK_START: "Review earned Sparks and approved project services before reserving utility for a governed service."`
  - `SPARKS_TASK_COMPLETE: "The intended Spark service is reserved, fulfilled, cancelled, or intentionally left unchanged."`
  - `SPARKS_TASK_EVIDENCE: "Append-only Spark ledger, balances, reservations, and approved service records."`
- Consumes: no new interfaces.

- [ ] **Step 1: Write the failing runtime authority test**

Create `tests/unit/ecosystem-authority-contract.test.mjs` with Node tests that import `../../src/lib/ecosystemAuthority.ts` and assert the exact constants above.

Add a source assertion that `ProductsWorkspace.tsx` imports and uses `RONSAS_FULL_NAME` from `@/lib/ecosystemAuthority` and no longer declares its own `const RONSAS_FULL_NAME=`.

Add source assertions that `DataNestApp.tsx` uses `SPARKS_WORKSPACE_DESCRIPTION`, `SPARKS_TASK_START`, `SPARKS_TASK_COMPLETE`, and `SPARKS_TASK_EVIDENCE`.

Add a regression assertion that `ProductsWorkspace.tsx` still contains `FREE PROMOTION · BILLING OFF` or renders `FREE_PROMOTION_LABEL`, and keep the existing `tests/unit/products-source.test.mjs` assertion that imported RONSAS data has `billing_enabled=false`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

`node --test --experimental-strip-types tests/unit/ecosystem-authority-contract.test.mjs tests/unit/products-source.test.mjs tests/unit/sparks-economy-source.test.mjs`

Expected: FAIL because `src/lib/ecosystemAuthority.ts` does not yet exist and the app still owns local/obsolete copy.

- [ ] **Step 3: Add `src/lib/ecosystemAuthority.ts` with the exact exported constants**

Implement only the constants listed in the Interfaces block. Do not add target-state product flags, database state, provider logic, or feature switches to this file.

- [ ] **Step 4: Replace duplicated and obsolete runtime copy**

In `ProductsWorkspace.tsx`, import `RONSAS_FULL_NAME` and `FREE_PROMOTION_LABEL`; remove the local `RONSAS_FULL_NAME` declaration and use the imported free-promotion label where the current exact string is rendered.

In `DataNestApp.tsx`, import the four Sparks copy constants and replace only:
- `viewDescriptions.sparks`
- `workspaceTaskGuides.sparks.start`
- `workspaceTaskGuides.sparks.complete`
- `workspaceTaskGuides.sparks.evidence`

Do not change the navigation label `Sparks`, the existing Sparks RPCs, contribution logic, or workflow routing in this task.

- [ ] **Step 5: Run focused tests and TypeScript checking**

Run:

`node --test --experimental-strip-types tests/unit/ecosystem-authority-contract.test.mjs tests/unit/products-source.test.mjs tests/unit/sparks-economy-source.test.mjs`

Expected: PASS.

Run:

`npm run check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/ecosystemAuthority.ts src/components/ProductsWorkspace.tsx src/components/DataNestApp.tsx tests/unit/ecosystem-authority-contract.test.mjs
git commit -m "refactor: centralize ecosystem authority copy"
```

### Task 2: Align Architecture and UX Documentation

**Files:**
- Modify: `tests/unit/ecosystem-authority-contract.test.mjs`
- Modify: `README.md` after the canonical stack / RONSAS authority explanation
- Modify: `docs/ARCHITECTURE.md` near the top-level platform authority section
- Modify: `docs/UX_WORKFLOW_ARCHITECTURE.md` under `### Discover`

**Interfaces:**
- Consumes: canonical names/copy from Task 1 as the runtime contract.
- Produces: source-controlled documentation contract stating the same hierarchy and clearly labeling Cloud-Nest, Supository, and ILM as target-state concepts.

- [ ] **Step 1: Extend the authority test with documentation assertions**

In `tests/unit/ecosystem-authority-contract.test.mjs`, read `README.md`, `docs/ARCHITECTURE.md`, and `docs/UX_WORKFLOW_ARCHITECTURE.md`.

Add assertions that:
- README and ARCHITECTURE explicitly state DataNest is the parent platform/control plane and RONSAS is a governed product under Products.
- README and ARCHITECTURE each contain the names `Cloud-Nest`, `Supository`, and `ILM` in a section that also contains `target-state` or `not yet live`.
- Neither README nor ARCHITECTURE describes those three concepts as currently live/implemented capabilities.
- UX workflow documentation contains `Sparks — earned contribution utility for approved project services.`
- UX workflow documentation no longer contains `Sparks — capture intent and raw ideas.`
- README still preserves the free public endpoint and current GitHub Pages + Supabase authority wording.

- [ ] **Step 2: Run the contract test and verify failure**

Run:

`node --test --experimental-strip-types tests/unit/ecosystem-authority-contract.test.mjs`

Expected: FAIL because the target-state status section and corrected UX Sparks wording are not yet present.

- [ ] **Step 3: Update README target-state architecture status**

Add a concise `## Target-state architecture concepts` section that states:
- Cloud-Nest = planned governed workspace abstraction;
- Supository = planned governed knowledge/provenance abstraction;
- ILM = planned governed intelligence abstraction built first as orchestration, not a proprietary foundation-model claim;
- all three are approved target-state architecture and are **not yet live product capabilities unless separately implemented and evidenced**.

Do not add feature URLs, pricing, availability claims, or launch dates.

- [ ] **Step 4: Update `docs/ARCHITECTURE.md` with the hierarchy and target-state boundary**

Add a short section that:
- references the 2026-09-27 master ecosystem design as the current target-state authority;
- preserves current production authorities;
- states `DataNest > Products > RONSAS`;
- lists Cloud-Nest, Supository, and ILM as target-state/not-yet-live;
- states that implementation status must be evidenced separately from design approval.

Do not rewrite existing implemented governance sections or current production topology.

- [ ] **Step 5: Correct Sparks wording in the UX architecture**

Replace the Discover item `Sparks — capture intent and raw ideas.` with exactly:

`Sparks — earned contribution utility for approved project services.`

Keep Stakeholder and Think Tanks as the discovery/research surfaces; do not redefine Sparks as an ideation system.

- [ ] **Step 6: Run documentation contract tests**

Run:

`node --test --experimental-strip-types tests/unit/ecosystem-authority-contract.test.mjs tests/unit/deployment-authority.test.mjs tests/unit/ui-ux-source.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add README.md docs/ARCHITECTURE.md docs/UX_WORKFLOW_ARCHITECTURE.md tests/unit/ecosystem-authority-contract.test.mjs
git commit -m "docs: align ecosystem authority and target-state terminology"
```

### Task 3: Record the Retention Supersession Without Mutating Data

**Files:**
- Modify: `tests/unit/ecosystem-authority-contract.test.mjs`
- Modify: `docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md` immediately after the existing Execution Topology Amendment

**Interfaces:**
- Consumes: retention rule from the 2026-09-27 master spec.
- Produces: an explicit historical-spec amendment that future implementers can read without interpreting the older indefinite-retention language as current policy.

- [ ] **Step 1: Add failing retention-supersession assertions**

Extend `tests/unit/ecosystem-authority-contract.test.mjs` to read the 2026-09-24 governed-memory design and assert an exact heading:

`## Retention Supersession Amendment — 2026-09-27`

Assert that the amendment contains all of these phrases:
- `policy-driven retention`
- `classification`
- `declared purpose`
- `legal or contractual obligations`
- `does not authorize deletion`
- `existing records`

Also assert that the master 2026-09-27 ecosystem spec still contains the retention amendment and the implementation boundary.

- [ ] **Step 2: Run the contract test and verify failure**

Run:

`node --test --experimental-strip-types tests/unit/ecosystem-authority-contract.test.mjs`

Expected: FAIL because the older memory spec does not yet carry the supersession amendment.

- [ ] **Step 3: Add the retention amendment to the older memory design**

Immediately after the existing `Execution Topology Amendment — 2026-09-24`, add:

`## Retention Supersession Amendment — 2026-09-27`

The amendment must state, in substance and without deleting the historical record:
- blanket indefinite retention of all raw human/AI input is superseded;
- current target policy is policy-driven retention based on data classification, declared purpose, governance requirements, and applicable legal or contractual obligations;
- selected audit/provenance evidence may remain long-lived where required;
- the amendment does not authorize deletion, anonymization, migration, or mutation of existing records by itself;
- any enforcement or cleanup requires a separate reviewed implementation plan and evidence.

Leave the older sections intact as historical context; do not silently rewrite their original text.

- [ ] **Step 4: Run the authority tests and current AI-learning regression tests**

Run:

`node --test --experimental-strip-types tests/unit/ecosystem-authority-contract.test.mjs tests/unit/datanest-ai-policy.test.mjs tests/unit/datanest-ai-validation.test.mjs tests/unit/datanest-ai-source.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run full Phase A verification**

Run:

`npm test`

Expected: PASS.

Run:

`npm run check`

Expected: PASS.

Run:

`npm run build`

Expected: PASS.

Run:

`npm run test:browser -- tests/browser/products.spec.ts`

Expected: PASS, confirming the canonical RONSAS name and free-promotion product view still render under Products.

- [ ] **Step 6: Inspect the diff for forbidden scope expansion**

Run:

`git diff --check HEAD~3..HEAD`

Expected: no whitespace errors.

Run:

`git diff --name-only HEAD~3..HEAD`

Expected changed implementation files are limited to:
- `src/lib/ecosystemAuthority.ts`
- `src/components/ProductsWorkspace.tsx`
- `src/components/DataNestApp.tsx`
- `tests/unit/ecosystem-authority-contract.test.mjs`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/UX_WORKFLOW_ARCHITECTURE.md`
- `docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md`

The plan/spec files created by the planning workflow may also appear. No Supabase migration, Edge Function, deployment workflow, billing file, or production data artifact may be changed.

- [ ] **Step 7: Commit Task 3**

```bash
git add docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md tests/unit/ecosystem-authority-contract.test.mjs
git commit -m "docs: supersede blanket AI raw retention policy"
```

## Plan Self-Review

**Spec coverage:** This plan intentionally implements only Phase A from Section 18 of the master spec. It covers authority/terminology reconciliation, canonical DataNest/RONSAS hierarchy, target-state labels for Cloud-Nest/Supository/ILM, Sparks naming correction, and the retention-policy amendment. Phases B-H are intentionally excluded and require separate implementation plans.

**Step scan:** Each implementation step changes one focused contract: runtime authority copy, documentation authority, or historical retention supersession. No task includes schema, provider, product-lifecycle, or resource-fabric implementation.

**Type consistency:** All new runtime copy is exported from `src/lib/ecosystemAuthority.ts`; consuming components use those exact names. No new database or API type is introduced.

**Review Focus coverage:** All five review-focus risks are pinned by the new contract test or existing product/Sparks tests.

**Proportion:** The plan is intentionally smaller than the master ecosystem spec and avoids transcribing future Phase B-H implementation before those subsystems receive their own reviewed plans.
