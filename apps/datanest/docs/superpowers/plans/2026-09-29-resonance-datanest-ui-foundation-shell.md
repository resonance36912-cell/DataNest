# Resonance DataNest UI Foundation and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical Resonance DataNest design system, responsive platform shell, workflow orientation, theme behavior, and shared UI primitives while preserving all existing workflow, recovery, deep-link, and governance behavior.

**Architecture:** Introduce typed brand/theme contracts and a canonical CSS token layer first, then extract brand, navigation, lifecycle, context, status, and evidence presentation from the current monolithic shell without rewriting underlying state logic. Migrate root DataNest workspaces progressively onto the shared primitives, keeping existing URLs, page semantics, and tests authoritative.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-resonance-datanest-ui-governance-system-design.md`

## Global Constraints

- Repository authority remains `DataNest-Supository/DataNest`.
- Display identity is **Resonance DataNest**; legal operator is **Resonance Sole Proprietorship**; business brand is **Resonance App Development**.
- **RSGP** remains unexpanded until an authoritative governance document defines it.
- The **RSGP Governed** marker must not resemble an external certification/accreditation seal.
- Primary lifecycle remains exactly **Discover → Govern → Build → Execute → Verify**.
- DataNest AI remains cross-cutting and must not appear as final authority for consequential decisions.
- Canonical typography is **Inter Tight / Inter / Instrument Serif Italic / JetBrains Mono** with deployment-safe fallbacks.
- **Sovereign Dark** is default; each migrated user-facing surface must support Accessible Light and high-contrast/reduced-effects behavior.
- Public/root layouts must remain usable without unintended horizontal overflow at 320 px.
- Existing URL history, deep links, active-work context, draft resilience, task guides, mutation recovery, keyboard switching, and evidence-confidence behavior must remain intact.
- Do not add another permanent CSS override stylesheet; durable values move into canonical tokens or focused component styles.
- Free-promotion/no-paid-checkout behavior remains unchanged.

## Review Focus

- **Corrupt or unknown stored theme preference:** fall back deterministically without blanking the page or trapping the user in an invalid theme.
- **Very long project/application/status text at 320 px:** wrap or truncate with accessible full text; never create page-level horizontal overflow.
- **Reduced-motion plus manually paused animation:** all migrated motion stops while content remains fully visible and operable.
- **Missing/unknown lifecycle phase:** shell renders without a false `aria-current` phase and still exposes navigation.
- **Status understood without color:** every approval/risk/execution state exposes text plus icon/shape semantics.

---

### Task 1: Canonical brand identity and theme contracts

**Files:**
- Create: `src/lib/brandIdentity.ts`
- Create: `src/lib/themePreference.ts`
- Create: `tests/unit/resonance-design-system-source.test.mjs`
- Modify: `src/lib/reson8.ts`

**Interfaces:**
- Produces: `RESONANCE_BUSINESS_IDENTITY`, `DATANEST_DISPLAY_NAME`, `RSGP_GOVERNANCE_LABEL`, `applicationAttribution(name:string):string`.
- Produces: `ThemePreference = "dark" | "light" | "system"`, `ResolvedTheme = "dark" | "light"`, `THEME_STORAGE_KEY`, `normalizeThemePreference(value:unknown):ThemePreference`, `resolveTheme(preference:ThemePreference,prefersDark:boolean):ResolvedTheme`.
- Consumes: existing public URLs from `src/lib/reson8.ts`.

- [ ] **Step 1: Write the failing source/contract test**

Add assertions that the new identity source contains the exact legal/business/platform names, that RSGP is stored only as `RSGP`/“RSGP Governed”, that no invented acronym expansion exists, and that theme preference exposes only `dark`, `light`, and `system`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/unit/resonance-design-system-source.test.mjs`  
Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement the identity and theme contracts**

Keep `DATANEST_CANONICAL_NAME = "DataNest"` for machine/canonical uses, add `DATANEST_DISPLAY_NAME = "Resonance DataNest"` for UI copy, and keep all operator/legal strings centralized in `brandIdentity.ts`.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/unit/resonance-design-system-source.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brandIdentity.ts src/lib/themePreference.ts src/lib/reson8.ts tests/unit/resonance-design-system-source.test.mjs
git commit -m "feat: add canonical DataNest brand and theme contracts"
```

### Task 2: Canonical design tokens and root theme application

**Files:**
- Create: `src/app/resonance-design-system.css`
- Create: `src/components/platform/ThemeControl.tsx`
- Create: `src/components/platform/ThemeBootstrapScript.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/browser/auth.smoke.spec.ts`
- Modify: `tests/unit/resonance-design-system-source.test.mjs`

**Interfaces:**
- Consumes: Task 1 theme types and storage key.
- Produces: CSS variables for surfaces, text, semantic states, product accents, typography, spacing, radii, elevation, motion, and focus.
- Root fonts are self-hosted by Next through `next/font/google`: `Inter_Tight`, `Inter`, `Instrument_Serif` (400 italic), and `JetBrains_Mono`, each exposed as a CSS variable matching the design-system tokens.
- Produces: `ThemeControl({compact?:boolean})`.
- Produces: `ThemeBootstrapScript()` containing the minimal inline bootstrap that reads `THEME_STORAGE_KEY`, honors `prefers-color-scheme`, normalizes invalid values to `system`, and sets `document.documentElement.dataset.theme` before first paint.
- Theme state is applied on `document.documentElement.dataset.theme` with values `dark` or `light`.

- [ ] **Step 1: Add failing browser tests for theme behavior**

Cover: dark default, explicit light selection persistence across reload, invalid stored value recovery, and `prefers-contrast: more`/reduced-motion classes or media-driven behavior without hiding content.

- [ ] **Step 2: Run the focused browser test and verify failure**

Run: `npx playwright test tests/browser/auth.smoke.spec.ts --grep "theme|contrast"`  
Expected: FAIL because no theme control/token layer exists.

- [ ] **Step 3: Implement `resonance-design-system.css`, Next font variables, `ThemeControl`, and `ThemeBootstrapScript`**

Use `next/font/google` in `layout.tsx` for the four approved font families so the root static export self-hosts the font assets. Define system-safe fallbacks; do not introduce Montserrat. Put shared semantic colors and surface levels in the canonical CSS file. Keep legacy selectors temporarily in existing CSS but replace durable literals touched by this task with variables.

- [ ] **Step 4: Wire root layout without adding another override layer**

Import `resonance-design-system.css` before page-specific CSS, apply the Next font variable classes on `<html>`, and render `ThemeBootstrapScript` in `<head>` before the runtime configuration scripts.

- [ ] **Step 5: Run tests**

Run: `npm run check && npx playwright test tests/browser/auth.smoke.spec.ts --grep "theme|contrast"`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/resonance-design-system.css src/components/platform/ThemeControl.tsx src/components/platform/ThemeBootstrapScript.tsx src/app/layout.tsx src/app/globals.css tests/browser/auth.smoke.spec.ts tests/unit/resonance-design-system-source.test.mjs
git commit -m "feat: add Resonance DataNest theme system"
```

### Task 3: Shared brand, governance trust, and footer primitives

**Files:**
- Create: `src/components/platform/ResonanceBrandLockup.tsx`
- Create: `src/components/platform/GovernanceTrustMark.tsx`
- Create: `src/components/platform/PlatformFooter.tsx`
- Modify: `src/components/AuthGate.tsx`
- Modify: `src/app/entry.css`
- Modify: `tests/browser/auth.smoke.spec.ts`

**Interfaces:**
- Consumes: Task 1 identity constants and existing `DATANEST_LOGO_SRC`.
- Produces: `ResonanceBrandLockup({compact?:boolean})`.
- Produces: `GovernanceTrustMark({href?:string})`, accessible name “RSGP Governed”.
- Produces: `PlatformFooter({compact?:boolean})` with operator statement, legal/governance navigation slots, Reson8 ecosystem link, and free-promotion-safe copy.

- [ ] **Step 1: Add failing auth/public-surface assertions**

Assert visible “Resonance DataNest”, “RSGP Governed”, and the operator/business hierarchy on the public/auth surface; assert no external-certification wording and no paid checkout CTA.

- [ ] **Step 2: Run the focused browser test**

Run: `npx playwright test tests/browser/auth.smoke.spec.ts`  
Expected: FAIL on the new brand/governance/footer assertions.

- [ ] **Step 3: Implement shared primitives and replace AuthGate-local brand markup**

The RSGP marker links to the future governance route but must remain functional even before that page is implemented; use the static route href rather than a JS-only dependency.

- [ ] **Step 4: Verify responsive and keyboard behavior**

Run: `npx playwright test tests/browser/auth.smoke.spec.ts`  
Expected: PASS at existing mobile coverage and new public identity checks.

- [ ] **Step 5: Commit**

```bash
git add src/components/platform src/components/AuthGate.tsx src/app/entry.css tests/browser/auth.smoke.spec.ts
git commit -m "feat: unify DataNest public brand and governance chrome"
```

### Task 4: Extract lifecycle rail, context strip, and global navigation shell

**Files:**
- Create: `src/components/platform/LifecycleRail.tsx`
- Create: `src/components/platform/ContextStrip.tsx`
- Create: `src/components/platform/GlobalNavigation.tsx`
- Create: `src/components/platform/PlatformShell.tsx`
- Create: `src/components/platform/navigationTypes.ts`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/lib/workflowPhases.ts`
- Modify: `tests/browser/home-optimization.spec.ts`
- Modify: `tests/unit/ui-ux-source.test.mjs`

**Interfaces:**
- `LifecycleRail({currentPhase,onNavigate}:{currentPhase:WorkflowPhaseId|null;onNavigate:(destination:WorkflowDestination)=>void})`.
- `ContextStrip({projectName,applicationName,phase,status,nextAction}:{projectName?:string;applicationName?:string;phase:WorkflowPhaseId|null;status?:string;nextAction?:string})`.
- `NavigationItem = {id:string;label:string;group:string;phase:WorkflowPhaseId|null;keywords:readonly string[]}` lives in `navigationTypes.ts`.
- `GlobalNavigation({items,currentView,onNavigate,onOpenQuickSwitch}:{items:readonly NavigationItem[];currentView:string;onNavigate:(view:string)=>void;onOpenQuickSwitch:()=>void})`; it does not own URL state.
- `PlatformShell({navigation,topbar,context,children,footer}:{navigation:ReactNode;topbar:ReactNode;context?:ReactNode;children:ReactNode;footer?:ReactNode})` composes layout only and does not own project data fetching or mutation state.

- [ ] **Step 1: Extend lifecycle browser tests before extraction**

Add cases for unknown/no phase, long project names at 320 px, and preserved `aria-current` behavior for a known specialist phase.

- [ ] **Step 2: Run the focused lifecycle tests**

Run: `npx playwright test tests/browser/home-optimization.spec.ts --grep "phase|context|navigation"`  
Expected: new tests fail before extraction.

- [ ] **Step 3: Extract display-only shell logic from `DataNestApp.tsx`**

Move markup and presentation only. Keep current URL parsing, view selection, active-work state, query/mutation flows, command palette state, and recovery state in their current owner unless a later task explicitly moves them.

- [ ] **Step 4: Re-run source and browser invariants**

Run: `node --test tests/unit/ui-ux-source.test.mjs && npx playwright test tests/browser/home-optimization.spec.ts --grep "phase|context|navigation"`  
Expected: PASS, including browser history and keyboard quick-switch behavior.

- [ ] **Step 5: Commit**

```bash
git add src/components/platform src/components/DataNestApp.tsx src/lib/workflowPhases.ts tests/browser/home-optimization.spec.ts tests/unit/ui-ux-source.test.mjs
git commit -m "refactor: extract DataNest platform shell"
```

### Task 5: Shared operational page, status, evidence, and governed-action primitives

**Files:**
- Create: `src/components/platform/PageHeader.tsx`
- Create: `src/components/platform/StatusIndicator.tsx`
- Create: `src/components/platform/EvidencePanel.tsx`
- Create: `src/components/platform/GovernedAction.tsx`
- Modify: `tests/unit/ui-ux-source.test.mjs`
- Modify: `src/app/globals.css`

**Interfaces:**
- `PageHeader({eyebrow,title,description,primaryAction,meta})`.
- `StatusIndicator({label,tone,detail,icon}:{label:string;tone:"neutral"|"info"|"success"|"warning"|"danger";detail?:string;icon?:ReactNode})`.
- `EvidencePanel({title,items,emptyState})`, where each item has `label`, `value`, and optional `href`.
- `GovernedAction({stage,summary,evidence,reviewer,onAction})`, with stage union `"proposed"|"checked"|"review-required"|"authorized"|"scheduled"|"executed"|"verified"`.

- [ ] **Step 1: Add failing source assertions for semantic status and governed stages**

Require text-bearing status props, the exact governed-action stage union, and no API that permits color-only state.

- [ ] **Step 2: Run the focused unit test**

Run: `node --test tests/unit/ui-ux-source.test.mjs`  
Expected: FAIL on missing shared primitives.

- [ ] **Step 3: Implement the display primitives**

Do not add authorization side effects to `GovernedAction`; this task creates a consistent presentation/control boundary only.

- [ ] **Step 4: Verify**

Run: `npm run check && node --test tests/unit/ui-ux-source.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/platform/PageHeader.tsx src/components/platform/StatusIndicator.tsx src/components/platform/EvidencePanel.tsx src/components/platform/GovernedAction.tsx src/app/globals.css tests/unit/ui-ux-source.test.mjs
git commit -m "feat: add shared DataNest operational UI primitives"
```

### Task 6: Migrate Home, AI & I, and DataNest AI onto the shared shell

**Files:**
- Create: `src/components/platform/OpportunityProjectionCard.tsx`
- Modify: `src/components/ResonanceHome.tsx`
- Modify: `src/components/DataNestAiWorkspace.tsx`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/app/datanest-ai-command-center.css`
- Modify: `src/app/datanest-ai-optimized.css`
- Modify: `src/app/datanest-ai-zoom.css`
- Modify: `tests/browser/home-optimization.spec.ts`
- Modify: `tests/browser/datanest-ai-layout.spec.ts`
- Modify: `tests/browser/datanest-ai-recovery.spec.ts`

**Interfaces:**
- Consumes: Tasks 4–5 shell/page/status primitives.
- `OpportunityProjection = {id:string;title:string;estimatedValue?:string;confidence?:string;assumptions?:readonly string[];dependencies?:readonly string[];governanceImpact?:string;nextAction?:string}` and `OpportunityProjectionCard({opportunity}:{opportunity:OpportunityProjection|null})` provide the UI-only projection slot.
- Home must expose current objective/work context, continue-work/attention regions, application shortcuts, and `OpportunityProjectionCard`; when no governed source supplies data, pass `null` and render the actionable empty state rather than fabricated values.
- DataNest AI keeps current recovery/provider/runtime behavior; only presentation hierarchy changes.

- [ ] **Step 1: Add failing tests for page anatomy and opportunity empty state**

Assert page identity, current context, primary/next action structure, no fabricated opportunity values when no source data exists, and preserved DataNest AI recovery controls.

- [ ] **Step 2: Run focused tests**

Run: `npx playwright test tests/browser/home-optimization.spec.ts tests/browser/datanest-ai-layout.spec.ts tests/browser/datanest-ai-recovery.spec.ts`  
Expected: FAIL on new anatomy/empty-state assertions only.

- [ ] **Step 3: Migrate presentation using shared primitives**

Do not invent business opportunity data. Render an explicit “no governed opportunity signal yet” path when the backend does not supply one.

- [ ] **Step 4: Verify all three suites**

Run the same Playwright command.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/platform/OpportunityProjectionCard.tsx src/components/ResonanceHome.tsx src/components/DataNestAiWorkspace.tsx src/components/DataNestApp.tsx src/app/datanest-ai-command-center.css src/app/datanest-ai-optimized.css src/app/datanest-ai-zoom.css tests/browser/home-optimization.spec.ts tests/browser/datanest-ai-layout.spec.ts tests/browser/datanest-ai-recovery.spec.ts
git commit -m "feat: align Home and DataNest AI with shared UX architecture"
```

### Task 7: Migrate Discover, Govern, and Build workspaces

**Files:**
- Modify: `src/components/StakeholderWorkspace.tsx`
- Modify: `src/components/SparksWorkspace.tsx`
- Modify: `src/components/ThinkTankWorkspace.tsx`
- Modify: `src/components/GovernanceWorkspace.tsx`
- Modify: `src/components/ProductsWorkspace.tsx`
- Modify: `src/components/ProductLab.tsx`
- Modify: `tests/browser/home-optimization.spec.ts`
- Modify: `tests/browser/products.spec.ts`
- Modify: `tests/browser/trust-policy.spec.ts`

**Interfaces:**
- Consumes: shared page/status/evidence primitives.
- Preserve current workspace-specific data/mutations.
- Empty states must explain what belongs there, why it matters, and the next action.

- [ ] **Step 1: Add lifecycle-page anatomy and empty-state tests**

Cover one representative page per phase plus the existing product/trust paths.

- [ ] **Step 2: Run focused suites and verify failure**

Run: `npx playwright test tests/browser/home-optimization.spec.ts tests/browser/products.spec.ts tests/browser/trust-policy.spec.ts`  
Expected: FAIL only on new shared-layout expectations.

- [ ] **Step 3: Migrate workspace chrome and status presentation**

Do not change governance authority rules or product/business data models.

- [ ] **Step 4: Verify**

Run the same Playwright command plus `npm run check`.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/StakeholderWorkspace.tsx src/components/SparksWorkspace.tsx src/components/ThinkTankWorkspace.tsx src/components/GovernanceWorkspace.tsx src/components/ProductsWorkspace.tsx src/components/ProductLab.tsx tests/browser/home-optimization.spec.ts tests/browser/products.spec.ts tests/browser/trust-policy.spec.ts
git commit -m "feat: align discover govern and build workspaces"
```

### Task 8: Migrate Execute and Verify surfaces without changing operational semantics

**Files:**
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/components/ExecutionAuthorityPanel.tsx`
- Modify: `src/components/TransparencyWorkspace.tsx`
- Modify: `src/components/ExternalAuditor.tsx`
- Modify: `src/components/ExternalAuditDocuments.tsx`
- Modify: `tests/browser/execution-authority.spec.ts`
- Modify: `tests/browser/transcheduler-project-gantt.spec.ts`
- Modify: `tests/browser/external-auditor.spec.ts`
- Modify: `tests/browser/home-optimization.spec.ts`

**Interfaces:**
- Execute pages expose Intent → Plan → Dependencies → Authorization → Execution → Live status → Evidence where the existing data supports those stages.
- Verify pages expose causal evidence/navigation without manufacturing missing audit facts.

- [ ] **Step 1: Add failing tests for authorization visibility and evidence-first verification**

Assert consequential execution shows authorization state before action; verify pages retain traceable evidence links and recovery paths.

- [ ] **Step 2: Run focused suites**

Run: `npx playwright test tests/browser/execution-authority.spec.ts tests/browser/transcheduler-project-gantt.spec.ts tests/browser/external-auditor.spec.ts tests/browser/home-optimization.spec.ts`  
Expected: FAIL on new presentation assertions.

- [ ] **Step 3: Apply shared shell/primitives**

Preserve all current side effects, mutation guards, authority checks, and deep links.

- [ ] **Step 4: Verify**

Run the same Playwright command plus `npm run check`.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataNestApp.tsx src/components/ExecutionAuthorityPanel.tsx src/components/TransparencyWorkspace.tsx src/components/ExternalAuditor.tsx src/components/ExternalAuditDocuments.tsx tests/browser/execution-authority.spec.ts tests/browser/transcheduler-project-gantt.spec.ts tests/browser/external-auditor.spec.ts tests/browser/home-optimization.spec.ts
git commit -m "feat: align execute and verify workspaces"
```

### Task 9: Consolidate touched CSS and remove obsolete brand-fit override

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/entry.css`
- Modify: `src/app/external-auditor.css`
- Modify: `src/app/datanest-ai-command-center.css`
- Modify: `src/app/datanest-ai-optimized.css`
- Modify: `src/app/datanest-ai-zoom.css`
- Delete when no selector remains necessary: `src/app/datanest-brand-fit.css`
- Modify: `src/app/layout.tsx`
- Modify: `tests/unit/resonance-design-system-source.test.mjs`

**Interfaces:**
- All touched durable values resolve through `resonance-design-system.css`.
- Page-specific files may keep structural selectors unique to that page; they must not redefine the canonical brand palette or font stack.

- [x] **Step 1: Add a failing source test for duplicate canonical token definitions**

Assert the obsolete brand-fit stylesheet is no longer imported and touched specialist styles do not redefine the canonical font families or core palette variables.

- [x] **Step 2: Run the source test**

Run: `node --test tests/unit/resonance-design-system-source.test.mjs`  
Expected: FAIL until consolidation is complete.

- [x] **Step 3: Consolidate CSS and remove only proven-obsolete overrides**

Do not mechanically merge unrelated specialist styles into one file.

- [x] **Step 4: Run root regression**

Run: `npm test && npm run check && npm run build`  
Expected: PASS.

- [x] **Step 5: Run representative browser regression**

Run: `npx playwright test tests/browser/auth.smoke.spec.ts tests/browser/home-optimization.spec.ts tests/browser/datanest-ai-layout.spec.ts tests/browser/products.spec.ts tests/browser/execution-authority.spec.ts tests/browser/external-auditor.spec.ts`  
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/app src/components src/lib tests
git commit -m "refactor: consolidate DataNest visual system"
```


> Completion evidence: CI #2236 PASS · PR Verification #1121 PASS · Security #642 PASS · Migration Replay #483 PASS · Edge Function Validation #480 PASS. DataNest AI Certification remains independently tracked for pre-existing clipboard timing flakiness.
