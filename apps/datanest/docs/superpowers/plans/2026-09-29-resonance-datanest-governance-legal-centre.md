# Resonance DataNest Governance and Legal Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public Governance & Legal Centre, versioned legal metadata, RSGP disclosure, contextual disclaimer framework, and governed-action presentation without publishing unreviewed legal claims as approved policy.

**Architecture:** Separate legal metadata/status from substantive policy copy. Root legal pages render through shared typed components and always expose approval state, version, effective date, and review ownership; draft content stays visibly review-gated until an authorized reviewer records approval. RSGP explanations, consequential-action states, and public legal navigation reuse the platform primitives from the UI foundation plan.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-resonance-datanest-ui-governance-system-design.md`

## Global Constraints

- Legal operator: **Resonance Sole Proprietorship**.
- Business brand: **Resonance App Development**.
- Platform: **Resonance DataNest**.
- RSGP remains unexpanded until an authoritative governance document defines it.
- Do not imply external certification, accreditation, or regulator endorsement.
- Draft legal/policy text must remain visibly **draft-review-required** until human/legal review is recorded.
- A dynamic current date must never be used as an approved legal effective date.
- Do not copy unverified encryption, retention, third-party AI, security, or compliance guarantees into production copy.
- Consequential-action UI uses the lifecycle **proposed → checked → review-required → authorized → scheduled → executed → verified**.
- Human/legal review governs substance; automated tests govern structure, state, links, and prohibited claims.
- Free-promotion/no-paid-checkout remains unchanged.

## Review Focus

- **Draft legal document with no approved effective date:** UI says review required and never renders today as its effective date.
- **Unknown legal document id or missing registry entry:** route returns a safe not-found state rather than mismatched policy content.
- **RSGP copy containing an invented expansion or certification language:** source test fails before merge.
- **Consequential action with no reviewer/authorization evidence:** action remains visibly review-required and cannot masquerade as authorized.
- **Legacy app legal links:** users can reach the central DataNest legal/governance destination without breaking each app’s current route during migration.

---

### Task 1: Create the legal document registry and review-state contract

**Files:**
- Create: `src/lib/legalRegistry.ts`
- Create: `tests/unit/legal-centre-source.test.mjs`

**Interfaces:**
- Produces: `LegalDocumentId = "terms" | "privacy" | "disclaimers" | "acceptable-use" | "intellectual-property" | "governance" | "accessibility"`.
- Produces: `LegalApprovalStatus = "draft-review-required" | "approved" | "superseded"`.
- Produces: `LegalDocumentMeta` with `id`, `title`, `version`, `status`, `effectiveDate:string|null`, `reviewOwner:string`, `changeSummary:string`.
- Produces: `LEGAL_DOCUMENTS`, `getLegalDocument(id:LegalDocumentId):LegalDocumentMeta`.
- Draft documents use `effectiveDate:null` until an authorized approval step changes status.

- [x] **Step 1: Write the failing registry tests**

Assert all required document ids exist, all drafts have null effective dates, no `new Date()` is used to generate legal metadata, and operator/RSGP identity comes from the canonical brand identity module.

- [x] **Step 2: Run test and verify failure**

Run: `node --test tests/unit/legal-centre-source.test.mjs`  
Expected: FAIL because `legalRegistry.ts` does not exist.

- [x] **Step 3: Implement the registry**

Start every new substantive legal document as `draft-review-required` with explicit version strings such as `0.1-draft`; do not declare a production effective date.

- [x] **Step 4: Verify**

Run: `node --test tests/unit/legal-centre-source.test.mjs && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/legalRegistry.ts tests/unit/legal-centre-source.test.mjs
git commit -m "feat: add governed legal document registry"
```


> Task 1 evidence: legal registry RED on missing file → GREEN focused source test + `npm run check`. Ruling: approval-union regex was corrected to accept standard multiline TypeScript formatting; no production behavior changed.

### Task 2: Build the shared legal-page renderer and Governance & Legal Centre index

**Files:**
- Create: `src/components/legal/LegalStatusBanner.tsx`
- Create: `src/components/legal/LegalDocumentLayout.tsx`
- Create: `src/components/legal/GovernanceLegalCentre.tsx`
- Create: `src/app/legal/page.tsx`
- Modify: `src/app/resonance-design-system.css`
- Create: `tests/browser/legal-centre.spec.ts`

**Interfaces:**
- `LegalStatusBanner({document:LegalDocumentMeta})`.
- `LegalDocumentLayout({document,children})`.
- `GovernanceLegalCentre()` renders Platform Governance, Legal, Transparency, Accessibility, and Business Identity navigation.
- `/legal` is a public static route and does not require a signed-in session.

- [x] **Step 1: Add failing browser test**

Assert `/legal` loads without auth, shows the complete business hierarchy, lists all required legal/governance categories, displays “RSGP Governed” without an acronym expansion, and has no paid checkout CTA.

- [x] **Step 2: Run the new suite**

Run: `npx playwright test tests/browser/legal-centre.spec.ts`  
Expected: FAIL because the route does not exist.

- [x] **Step 3: Implement the index and metadata banner**

Make draft/review state visually distinct but not alarming; status must be understandable without color.

- [x] **Step 4: Verify**

Run: `npx playwright test tests/browser/legal-centre.spec.ts && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/legal src/app/legal src/app/resonance-design-system.css tests/browser/legal-centre.spec.ts
git commit -m "feat: add DataNest Governance and Legal Centre"
```


> Task 2 evidence: `/legal` browser RED on missing route → GREEN public Legal Centre + `npm run check`. Ruling: RSGP presence test accepts multiple legitimate occurrences (trust signal + identity record) rather than enforcing uniqueness.

### Task 3: Add the public governance, accessibility, and business-identity disclosures

**Files:**
- Create: `src/app/governance/page.tsx`
- Create: `src/app/accessibility/page.tsx`
- Create: `src/components/legal/GovernanceDisclosure.tsx`
- Create: `src/components/legal/BusinessIdentityDisclosure.tsx`
- Modify: `src/components/platform/GovernanceTrustMark.tsx`
- Modify: `tests/browser/legal-centre.spec.ts`
- Modify: `tests/unit/legal-centre-source.test.mjs`

**Interfaces:**
- Governance disclosure explains RSGP as the platform governance structure, decision authority, AI/human review separation, and change-control path without expanding the acronym.
- Accessibility route describes keyboard, focus, motion, theme, and support behavior actually present in the platform.
- Governance trust marker routes to `/governance` or an anchored governance section.

- [x] **Step 1: Add failing copy-safety and navigation tests**

Assert no phrases matching certification/accreditation claims, no guessed RSGP expansion, trust marker keyboard access, and presence of the production review chain.

- [x] **Step 2: Run tests**

Run: `node --test tests/unit/legal-centre-source.test.mjs && npx playwright test tests/browser/legal-centre.spec.ts`  
Expected: FAIL on missing pages/disclosures.

- [x] **Step 3: Implement disclosures from approved architecture only**

Do not add factual regulatory or security claims not grounded in existing DataNest behavior.

- [x] **Step 4: Verify**

Run the same commands.  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/governance src/app/accessibility src/components/legal src/components/platform/GovernanceTrustMark.tsx tests
git commit -m "feat: add public DataNest governance disclosures"
```


> Task 3 evidence: RSGP trust-link browser RED → GREEN governance/accessibility routes; copy-safety source tests GREEN; `npm run check` GREEN. RSGP remains unexpanded and human authority is explicit.

### Task 4: Add review-gated Terms, Privacy/POPIA, Disclaimers, Acceptable Use, and IP routes

**Files:**
- Create: `src/app/terms/page.tsx`
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/disclaimers/page.tsx`
- Create: `src/app/acceptable-use/page.tsx`
- Create: `src/app/intellectual-property/page.tsx`
- Create: `src/components/legal/LegalDraftNotice.tsx`
- Modify: `tests/browser/legal-centre.spec.ts`
- Modify: `tests/unit/legal-centre-source.test.mjs`

**Interfaces:**
- Each route consumes its `LegalDocumentMeta`.
- Until substantive legal review occurs, each route exposes clearly labeled governed-draft content and an approval-state banner.
- Draft copy may state platform purpose, operator identity, AI-assisted-output review expectations, and links to existing app-specific terms only where those facts are already grounded; it must not invent guarantees, rights waivers, retention promises, or jurisdictional clauses.

- [x] **Step 1: Add failing legal-state tests**

For every route, assert version and status are visible, draft documents do not show an effective date, and generated/current dates are absent from policy status.

- [x] **Step 2: Run the suite**

Run: `npx playwright test tests/browser/legal-centre.spec.ts`  
Expected: FAIL on missing routes.

- [x] **Step 3: Implement review-gated pages**

Use concise provisional content and explicit review state; do not copy legacy app policy claims wholesale.

- [x] **Step 4: Verify source-safety rules**

Run: `node --test tests/unit/legal-centre-source.test.mjs`  
Expected: PASS, including prohibited-claim checks.

- [x] **Step 5: Verify browser routes**

Run: `npx playwright test tests/browser/legal-centre.spec.ts`  
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/app/terms src/app/privacy src/app/disclaimers src/app/acceptable-use src/app/intellectual-property src/components/legal tests
git commit -m "feat: add review-gated DataNest legal routes"
```

> Task 4 evidence: policy-route browser RED + prohibited-claim source RED → GREEN across Terms, Privacy/POPIA, Disclaimers, Acceptable Use and IP; all remain `0.1-draft`, review-required and not effective.

### Task 5: Integrate governance/legal navigation into public and authenticated chrome

**Files:**
- Modify: `src/components/platform/PlatformFooter.tsx`
- Modify: `src/components/platform/GlobalNavigation.tsx`
- Modify: `src/components/AuthGate.tsx`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `tests/browser/auth.smoke.spec.ts`
- Modify: `tests/browser/home-optimization.spec.ts`
- Modify: `tests/browser/legal-centre.spec.ts`

**Interfaces:**
- Public and authenticated surfaces expose Legal Centre, Governance, Privacy, Terms, and Disclaimers through consistent navigation.
- Dense operational headers keep the compact trust marker rather than repeating full legal copy.

- [x] **Step 1: Add failing cross-surface navigation assertions**

From signed-out and authenticated fixtures, verify legal/governance links are reachable and preserve app/work context when returning.

- [x] **Step 2: Run focused suites**

Run: `npx playwright test tests/browser/auth.smoke.spec.ts tests/browser/home-optimization.spec.ts tests/browser/legal-centre.spec.ts`  
Expected: FAIL on missing navigation.

- [x] **Step 3: Wire links and return paths**

Use ordinary hrefs for public legal routes so static export and no-JS navigation remain viable.

- [x] **Step 4: Verify**

Run the same command.  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/platform src/components/AuthGate.tsx src/components/DataNestApp.tsx tests/browser
git commit -m "feat: connect DataNest legal and governance navigation"
```

> Task 5 evidence: PR Verification #1170 browser GREEN after RED on missing public/authenticated legal links. Ruling: AuthGate itself was not duplicated with five direct links because it already composes PlatformFooter; shared footer navigation is the public source of truth, while GlobalNavigation provides the authenticated source. Cost if wrong: one additional AuthGate header link group can be added without changing routes.

### Task 6: Apply the governed-action lifecycle to consequential UI

**Files:**
- Modify: `src/components/GovernanceWorkspace.tsx`
- Modify: `src/components/GovernanceImprovementPanel.tsx`
- Modify: `src/components/ExecutionAuthorityPanel.tsx`
- Modify: `src/components/ExternalAuditor.tsx`
- Modify: `src/components/platform/GovernedAction.tsx`
- Modify: `tests/browser/execution-authority.spec.ts`
- Modify: `tests/browser/external-auditor.spec.ts`
- Modify: `tests/unit/governance-workspace-resilience.test.mjs`

**Interfaces:**
- Existing backend/authority state maps into the shared stage union; the component never upgrades a state on its own.
- `review-required` is the safe fallback when a consequential proposal lacks sufficient authorization evidence.

- [x] **Step 1: Add failing tests for missing review evidence**

Assert a proposal lacking authorization cannot render as authorized/executed; assert reviewer/evidence labels are visible when provided.

- [x] **Step 2: Run focused tests**

Run: `node --test tests/unit/governance-workspace-resilience.test.mjs && npx playwright test tests/browser/execution-authority.spec.ts tests/browser/external-auditor.spec.ts`  
Expected: FAIL on new governed-action expectations.

- [x] **Step 3: Map existing states into `GovernedAction`**

Do not change backend authority semantics; only surface existing state consistently.

- [x] **Step 4: Verify**

Run the same command plus `npm run check`.  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/GovernanceWorkspace.tsx src/components/GovernanceImprovementPanel.tsx src/components/ExecutionAuthorityPanel.tsx src/components/ExternalAuditor.tsx src/components/platform/GovernedAction.tsx tests
git commit -m "feat: standardize governed action presentation"
```


> Task 6 evidence: existing RED→GREEN governed-action assertions are present in execution-authority, external-auditor, and governance resilience tests; exact-head CI #2272 PASS and PR Verification #1154 PASS exercise the standardized presentation. Ruling: no duplicate implementation commit was added because the branch already contained the planned code before this resume. Cost if wrong: rerun the focused suites and amend presentation only; backend authority semantics remain untouched.

### Task 7: Publish the cross-application legal contract for app migration

**Files:**
- Create: `apps/ronsas/shared/legal-contract.json`
- Modify: `scripts/validate-ronsas-imports.mjs`
- Modify: `tests/unit/legal-centre-source.test.mjs`

**Interfaces:**
- JSON contains canonical operator, business brand, platform name, governance label, central legal route paths, and `policyState:"review-gated"`.
- It contains no substantive Terms/Privacy promises.
- Plan 3 app adapters consume these values conceptually and are validated against this contract.

- [x] **Step 1: Add failing contract assertions**

Require exact identity values, central route paths, no RSGP expansion, and no `approved` policy state before human/legal review.

- [x] **Step 2: Run validators**

Run: `node --test tests/unit/legal-centre-source.test.mjs && node scripts/validate-ronsas-imports.mjs`  
Expected: FAIL on missing shared contract.

- [x] **Step 3: Add the contract and import validation**

Keep the validation structural; do not mark legal content approved.

- [x] **Step 4: Verify**

Run the same commands.  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/shared/legal-contract.json scripts/validate-ronsas-imports.mjs tests/unit/legal-centre-source.test.mjs
git commit -m "feat: define cross-app DataNest legal contract"
```


> Task 7 evidence: missing-contract RED → focused GREEN; exact-head unit tests PASS, TypeScript PASS, and CI RONSAS import contracts PASS. Contract is structural only, preserves free-promotion/no-paid-checkout, and remains policyState=review-gated.

### Task 8: Record legal review requirements without fabricating approval

**Files:**
- Create: `docs/governance/legal-review/RESONANCE_DATANEST_LEGAL_REVIEW_CHECKLIST.md`
- Modify: `docs/UX_WORKFLOW_ARCHITECTURE.md`
- Modify: `tests/unit/legal-centre-source.test.mjs`

**Interfaces:**
- Checklist enumerates document id, draft version, evidence required, review owner, decision, effective date, and approval reference.
- Initial state is review-required; no reviewer name/signature is fabricated.

- [x] **Step 1: Add failing source assertion for the checklist**

Require the checklist to state that production legal approval is a human/legal decision and that blank/review-required fields are not equivalent to approval.

- [x] **Step 2: Run test**

Run: `node --test tests/unit/legal-centre-source.test.mjs`  
Expected: FAIL until checklist exists.

- [x] **Step 3: Add checklist and architecture cross-reference**

- [x] **Step 4: Verify all legal-centre tests**

Run: `node --test tests/unit/legal-centre-source.test.mjs && npm run check && npm run build && npx playwright test tests/browser/legal-centre.spec.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add docs/governance/legal-review docs/UX_WORKFLOW_ARCHITECTURE.md tests/unit/legal-centre-source.test.mjs
git commit -m "docs: add DataNest legal review gate"
```

> Task 8 evidence: checklist-missing RED → focused GREEN; exact-head CI #2319 PASS and PR Verification #1199 PASS cover unit tests, TypeScript, production build and browser verification. Checklist keeps all documents review-required until an authorized human/legal reviewer records decision, effective date and approval reference.


## Final execution review

- Final review: self-review (no subagent tool available).
- Final: fixed Legal Centre hardcoded draft label — regression test `Legal Centre policy cards derive review labels from registry status` RED→GREEN; exact-head CI #2325 and PR Verification #1205 passed after the fix.
- Final review result: no remaining Critical or Important findings identified in the Governance & Legal plan scope.


> Legal plan completion evidence: PR Verification #1238 PASS with unit tests, TypeScript, production static export, Legal Centre browser suite, authenticated/public legal navigation, Execution Authority, and External Auditor browser suites. RONSAS Application Validation #104 PASS confirms the cross-app legal/brand contracts remain valid. Task 6 implementation pre-existed this bookkeeping update and was re-verified rather than reimplemented.
