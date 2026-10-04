# Resonance DataNest RONSAS UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every consolidated RONSAS application to the approved Resonance DataNest visual, operator, governance, legal-navigation, accessibility, and free-promotion contract while preserving each app’s specialist workflow and existing framework.

**Architecture:** Define one machine-readable cross-app brand contract plus a validator, then implement thin app-local adapters instead of forcing a monorepo UI package or framework rewrite. React/Vite applications receive focused brand adapter styles and footer/legal attribution updates; simple static applications receive equivalent CSS/markup adapters. The DataNest Pages bundler publishes the seven static-host-capable user-facing applications under the DataNest app namespace; YouTube Optimizer remains a governed external SSR launch target at its canonical runtime origin.

**Tech Stack:** Vite, React 18/19, Tailwind 3/4, plain HTML/CSS/JS apps, Node test runner, Vitest, Bun, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-29-resonance-datanest-ui-governance-system-design.md`

## Global Constraints

- All app source/runtime/build authority remains in `DataNest-Supository/DataNest`.
- Legal operator is **Resonance Sole Proprietorship**; business brand is **Resonance App Development**; parent platform is **Resonance DataNest**.
- App attribution uses “a governed Resonance DataNest application by Resonance App Development” or equivalent approved wording.
- RSGP remains unexpanded and must not look like an external certification seal.
- Canonical fonts are Inter Tight / Inter / Instrument Serif Italic / JetBrains Mono. Package-managed apps load them through app-local `@fontsource` packages; simple apps copy the same `@fontsource` assets into their build output from app-local dependencies. System fallbacks remain only as load-failure fallbacks.
- Each migrated app preserves one product accent while using the shared surface/semantic palette.
- Each migrated user-facing surface must include a light-surface override and `prefers-contrast: more`/reduced-effects rules. Existing manual theme controls are preserved where present; adding a new manual switch is not required in apps that currently rely on system preference.
- Existing app routing, startup recovery, local/sovereign guards, auth, data processing, and specialist workflow behavior must not be rewritten for visual consistency.
- Free-promotion/no-paid-checkout remains active; migration must not introduce paid CTAs.
- App legal pages remain review-gated until the central legal review process approves replacement text.
- DataNest Pages continues to publish apps that already support static hosting under `/DataNest/apps/<slug>/`; YouTube Optimizer remains a DataNest-governed SSR runtime unless a separate runtime-conversion design is approved.

## Review Focus

- **App-local framework differences:** adapter changes must not assume all apps share React version, Tailwind version, router, or build tool.
- **Deep links under GitHub Pages base paths:** app routes and static assets continue to work beneath `/DataNest/apps/<slug>/`.
- **Legacy pricing/checkout copy:** any visible pricing-era CTA that contradicts free promotion is removed or relabeled.
- **Dynamic legal dates or unverified privacy claims:** migrated legal pages expose review state and do not manufacture approval/effective dates.
- **YouTube Optimizer runtime mismatch:** do not force its TanStack Start/Nitro SSR runtime into a static Pages bundle; DataNest must still surface it as a governed application with an explicit runtime/launch contract.

---

### Task 1: Add the canonical cross-app brand contract and validator

**Files:**
- Create: `apps/ronsas/shared/resonance-brand-contract.json`
- Create: `scripts/validate-ronsas-brand-contract.mjs`
- Modify: `scripts/validate-ronsas-imports.mjs`
- Modify: `.github/workflows/ronsas-app-validation.yml`

**Interfaces:**
- Contract fields: `schema`, `operator`, `businessBrand`, `platform`, `governanceLabel`, `governanceRoute`, `legalRoute`, `promotionState`, `fonts`, `surfaceTokens`, `semanticTokens`, `appAccents`.
- `promotionState` must encode free promotion and `paidCheckoutActive:false`.
- Validator reads the contract and each app adapter/source marker; it reports drift with app/path-specific messages.

- [x] **Step 1: Write the failing validator contract**

Make the script require exact approved identity strings, no RSGP expansion, required accent keys for every app, and free-promotion state.

- [x] **Step 2: Run and verify failure**

Run: `node scripts/validate-ronsas-brand-contract.mjs`  
Expected: FAIL because the contract/adapters are absent.

- [x] **Step 3: Create the contract and wire baseline validation**

At this task only, validate the contract itself and allow app-adapter checks to report “not migrated” until subsequent tasks add each adapter; do not mark them compliant prematurely.

- [x] **Step 4: Add workflow invocation**

Run the validator before per-app matrix builds.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/shared scripts/validate-ronsas-brand-contract.mjs scripts/validate-ronsas-imports.mjs .github/workflows/ronsas-app-validation.yml
git commit -m "feat: define RONSAS DataNest brand contract"
```


> Task 1 evidence: validator existed before contract and therefore defined the RED condition; current contract satisfies exact identity/font/token/accent/free-promotion checks, import validation requires it, and RONSAS Application Validation canonical-brand job passes before the app matrix.


> Task 1 evidence: validator RED on missing contract → GREEN local validator; RONSAS Application Validation canonical brand-contract job PASS. App-adapter checks remain incremental until each app migration task.

### Task 2: Migrate Creative Studio

**Files:**
- Create: `apps/ronsas/creative-studio/src/resonance-datanest-adapter.css`
- Modify: `apps/ronsas/creative-studio/src/main.tsx`
- Modify: `apps/ronsas/creative-studio/src/components/brand/ResonanceFooter.tsx`
- Modify: `apps/ronsas/creative-studio/src/pages/Terms.tsx`
- Modify: `apps/ronsas/creative-studio/src/pages/Privacy.tsx`
- Modify: `apps/ronsas/creative-studio/src/index.css`
- Modify: `apps/ronsas/creative-studio/package.json`
- Modify: `apps/ronsas/creative-studio/package-lock.json`
- Create or modify: `apps/ronsas/creative-studio/src/lib/resonanceDataNestBrand.test.ts`
- Modify: `scripts/validate-ronsas-brand-contract.mjs`

**Interfaces:**
- Adapter maps the app’s existing variables to the canonical DataNest surface, typography, semantic, focus, and Creative Studio accent tokens.
- Footer renders operator/business/platform attribution, DataNest legal/governance links, and free-promotion-safe copy.
- Terms/Privacy render existing substantive content only as legacy/review-gated content until central legal approval supersedes it; replace dynamic “today” date with explicit metadata/status presentation.

- [x] **Step 1: Add failing Vitest/source assertions**

Require the canonical operator/platform attribution, DataNest legal/governance routes, no dynamic legal date, no paid checkout CTA, and reduced-motion-safe adapter rules.

- [x] **Step 2: Run app tests**

Run: `cd apps/ronsas/creative-studio && npm test`  
Expected: FAIL on new assertions.

- [x] **Step 3: Implement the adapter and footer/legal migration**

Add app-local `@fontsource-variable/inter-tight`, `@fontsource-variable/inter`, `@fontsource/instrument-serif`, and `@fontsource-variable/jetbrains-mono`; import their CSS before the app adapter in `main.tsx`. Import `resonance-datanest-adapter.css` after the existing index stylesheet so it acts as the deliberate app adapter, not an uncontrolled global override.

- [x] **Step 4: Validate build and contract**

Run: `cd apps/ronsas/creative-studio && npm test && npm run build -- --base=/DataNest/apps/creative-studio/`  
Run: `node scripts/validate-ronsas-brand-contract.mjs --app creative-studio`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/creative-studio scripts/validate-ronsas-brand-contract.mjs
git commit -m "feat: align Creative Studio with Resonance DataNest"
```


> Task 2 evidence: Creative Studio migration assertions RED (4/4 failed, 138 existing tests passed) → GREEN normal npm ci + 142/142 tests + DataNest-base production build + strict --app creative-studio brand validator. Fontsource lock records were generated by npm and committed with integrity metadata.

### Task 3: Migrate ePublisher

**Files:**
- Create: `apps/ronsas/epublisher/src/resonance-datanest-adapter.css`
- Modify: `apps/ronsas/epublisher/src/main.tsx`
- Modify: `apps/ronsas/epublisher/src/components/brand/ResonanceFooter.tsx`
- Modify: `apps/ronsas/epublisher/src/pages/Terms.tsx`
- Modify: `apps/ronsas/epublisher/src/pages/Privacy.tsx`
- Modify: `apps/ronsas/epublisher/src/index.css`
- Modify: `apps/ronsas/epublisher/package.json`
- Modify: `apps/ronsas/epublisher/package-lock.json`
- Create or modify: `apps/ronsas/epublisher/src/lib/resonanceDataNestBrand.test.ts`
- Modify: `scripts/validate-ronsas-brand-contract.mjs`

**Interfaces:**
- Preserve ePublisher’s existing light theme support, RTL behavior, StoryForge components, and routes.
- Adapter must map existing `--font-display/body/accent/mono` variables to the approved canonical families and keep ePublisher’s approved magenta accent.

- [x] **Step 1: Add failing tests for attribution, typography, theme, and legal-state behavior**

- [x] **Step 2: Run app verification**

Run: `cd apps/ronsas/epublisher && npm test && npm run build:types`  
Expected: FAIL on new migration assertions.

- [x] **Step 3: Implement adapter/footer/legal changes**

Load the four canonical families through app-local `@fontsource` imports before the adapter. Remove or relabel legacy Hub pricing links that imply paid access; keep free-promotion language.

- [x] **Step 4: Verify**

Run: `cd apps/ronsas/epublisher && npm test && npm run build:types && npm run build -- --base=/DataNest/apps/epublisher/`  
Run: `node scripts/validate-ronsas-brand-contract.mjs --app epublisher`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/epublisher scripts/validate-ronsas-brand-contract.mjs
git commit -m "feat: align ePublisher with Resonance DataNest"
```


> Task 3 evidence: RONSAS Application Validation ePublisher job PASS; Vitest 44 files / 413 tests passed, build:types passed, and Vite production build passed with base /DataNest/apps/epublisher/.

### Task 4: Migrate SyncVision without weakening sovereign/local behavior

**Files:**
- Create: `apps/ronsas/syncvision/src/resonance-datanest-adapter.css`
- Modify: `apps/ronsas/syncvision/src/main.tsx`
- Modify: `apps/ronsas/syncvision/src/components/brand/ResonanceFooter.tsx`
- Modify: `apps/ronsas/syncvision/src/components/Layout.tsx`
- Modify: `apps/ronsas/syncvision/src/index.css`
- Modify: `apps/ronsas/syncvision/package.json`
- Modify: `apps/ronsas/syncvision/package-lock.json`
- Create or modify: `apps/ronsas/syncvision/src/lib/resonanceDataNestBrand.test.ts`
- Modify: `scripts/validate-ronsas-brand-contract.mjs`

**Interfaces:**
- Preserve `installSovereignNetworkGuard()`, crash logging, global error listeners, FFmpeg vendoring, and current video workflow.
- Adapter uses the canonical SyncVision accent (`#42e7ff`) from the cross-app brand contract and DataNest shared semantics.
- Global footer/legal/governance links must not replace specialist scene/action controls.

- [x] **Step 1: Add failing brand and sovereign-preservation tests**

Assert the startup network guard remains called before React mount, adapter is imported, attribution exists, and no paid CTA appears.

- [x] **Step 2: Run app verification**

Run: `cd apps/ronsas/syncvision && npm run typecheck && npm test`  
Expected: FAIL on new migration assertions only.

- [x] **Step 3: Implement UI adapter changes**

Load the four canonical families through app-local `@fontsource` imports before the adapter. Do not alter FFmpeg package pins, local service endpoints, or sovereign guard behavior.

- [x] **Step 4: Verify**

Run: `cd apps/ronsas/syncvision && npm run typecheck && npm test && npm run build -- --base=/DataNest/apps/syncvision/`  
Run: `node scripts/validate-ronsas-imports.mjs && node scripts/validate-ronsas-brand-contract.mjs --app syncvision`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/syncvision scripts/validate-ronsas-brand-contract.mjs
git commit -m "feat: align SyncVision with Resonance DataNest"
```


> Task 4 evidence: SyncVision RONSAS validation job PASS on exact head after two RED blockers were fixed: unused promotion import, then missing canonical font dependencies. Typecheck passed; 6 test files / 17 tests passed including sovereign-local and FFmpeg contracts; production build passed with governed @ffmpeg/core 0.12.10 vendoring preserved.

### Task 5: Migrate YouTube Optimizer and remove stale legal/commercial presentation

**Files:**
- Create: `apps/ronsas/youtube-optimizer/src/resonance-datanest-adapter.css`
- Modify: `apps/ronsas/youtube-optimizer/src/routes/__root.tsx`
- Modify: `apps/ronsas/youtube-optimizer/src/components/SiteHeader.tsx`
- Modify: `apps/ronsas/youtube-optimizer/src/components/SiteFooter.tsx`
- Modify: `apps/ronsas/youtube-optimizer/src/pages/Terms.tsx`
- Modify: `apps/ronsas/youtube-optimizer/src/pages/Privacy.tsx`
- Modify: `apps/ronsas/youtube-optimizer/src/styles.css`
- Modify: `apps/ronsas/youtube-optimizer/package.json`
- Modify: `apps/ronsas/youtube-optimizer/bun.lock`
- Create or modify: `apps/ronsas/youtube-optimizer/src/lib/resonanceDataNestBrand.test.ts`
- Modify: `scripts/validate-ronsas-brand-contract.mjs`

**Interfaces:**
- Preserve TanStack router/start behavior and current React 19/Tailwind 4 stack.
- Terms/Privacy must remove stale billing/cancellation wording that contradicts free promotion and mark unapproved policy content as review-gated.
- Remove unsupported privacy guarantees such as “industry-standard encryption” unless separate implementation evidence is linked and reviewed.

- [x] **Step 1: Locate the real application entry before editing**

Run: `grep -R "src/styles.css\|./styles.css" -n apps/ronsas/youtube-optimizer/src apps/ronsas/youtube-optimizer | head -20`  
Expected: identify the exact entry module; update this plan’s working notes if the file name differs from conventional `main.tsx`.

- [x] **Step 2: Add failing tests for free-promotion and legal claim safety**

Require no billing/cancellation SEO description, no unsupported security guarantee, DataNest attribution, and legal/governance links.

- [x] **Step 2: Run tests**

Run: `cd apps/ronsas/youtube-optimizer && bun run typecheck && bun run test`  
Expected: FAIL on migration assertions.

- [x] **Step 3: Implement adapter/header/footer/legal changes**

Add the four canonical `@fontsource` packages to the Bun lockfile and import their CSS from `src/routes/__root.tsx`. Import `resonance-datanest-adapter.css?url` there and add it as a stylesheet link after the existing `appCss` link so the adapter is explicit and compatible with TanStack Start SSR.

- [x] **Step 4: Verify app**

Run: `cd apps/ronsas/youtube-optimizer && bun run typecheck && bun run test && bun run build -- --base=/DataNest/apps/youtube-optimizer/`  
Run: `node scripts/validate-ronsas-brand-contract.mjs --app youtube-optimizer`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/youtube-optimizer scripts/validate-ronsas-brand-contract.mjs
git commit -m "feat: align YouTube Optimizer with Resonance DataNest"
```

> Task 5 evidence: existing YouTube Optimizer migration is present on the reconciled source, preserves TanStack Start/Nitro SSR, canonical local fonts, governed footer/legal links, free-promotion presentation, and review-gated legal copy. RONSAS Application Validation #149 passed the YouTube Optimizer type-check, test, and build job on the final implementation head.

### Task 6: Migrate the four simple static applications

**Files:**
- Modify: `apps/ronsas/career-compass/index.html`
- Modify: `apps/ronsas/career-compass/styles.css`
- Modify: `apps/ronsas/career-compass/test/logic.test.mjs`
- Modify: `apps/ronsas/career-compass/package.json`
- Modify: `apps/ronsas/career-compass/package-lock.json`
- Modify: `apps/ronsas/career-compass/scripts/build.mjs`
- Modify: `apps/ronsas/sovereign-forge/index.html`
- Modify: `apps/ronsas/sovereign-forge/styles.css`
- Modify: `apps/ronsas/sovereign-forge/test/logic.test.mjs`
- Modify: `apps/ronsas/sovereign-forge/package.json`
- Modify: `apps/ronsas/sovereign-forge/package-lock.json`
- Modify: `apps/ronsas/sovereign-forge/scripts/build.mjs`
- Modify: `apps/ronsas/lyricsync-studio/index.html`
- Modify: `apps/ronsas/lyricsync-studio/styles.css`
- Modify: `apps/ronsas/lyricsync-studio/test/logic.test.mjs`
- Modify: `apps/ronsas/lyricsync-studio/package.json`
- Modify: `apps/ronsas/lyricsync-studio/package-lock.json`
- Modify: `apps/ronsas/lyricsync-studio/scripts/build.mjs`
- Modify: `apps/ronsas/scene-song-spark/index.html`
- Modify: `apps/ronsas/scene-song-spark/styles.css`
- Modify: `apps/ronsas/scene-song-spark/test/logic.test.mjs`
- Modify: `apps/ronsas/scene-song-spark/package.json`
- Modify: `apps/ronsas/scene-song-spark/package-lock.json`
- Modify: `apps/ronsas/scene-song-spark/scripts/build.mjs`
- Modify: `scripts/validate-ronsas-brand-contract.mjs`

**Interfaces:**
- Each app receives the canonical operator/platform footer, RSGP marker/link, DataNest Legal/Governance links, focus/motion/semantic token mappings, and its approved accent.
- Do not introduce React/Tailwind dependencies into these apps.

- [x] **Step 1: Add source tests in each existing Node test suite**

Assert required attribution/link text, no checkout/pricing CTA, token presence, and no page-level horizontal overflow rules such as fixed minimum widths that exceed the viewport.

- [x] **Step 2: Run all four suites and verify failure**

Run:
```bash
(cd apps/ronsas/career-compass && npm test)
(cd apps/ronsas/sovereign-forge && npm test)
(cd apps/ronsas/lyricsync-studio && npm test)
(cd apps/ronsas/scene-song-spark && npm test)
```
Expected: FAIL on new source assertions.

- [x] **Step 3: Implement static markup/CSS adapters and build-time font copying**

Add the four canonical `@fontsource` dependencies to each simple app. Extend each `scripts/build.mjs` to copy only the required WOFF2/CSS assets into that app's `dist/fonts` output, and reference those local assets from `styles.css`. Keep existing app logic files untouched unless a visual control requires an accessible label fix.

- [x] **Step 4: Build and validate**

Run the four `npm test && npm run build` commands and `node scripts/validate-ronsas-brand-contract.mjs`.  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/ronsas/career-compass apps/ronsas/sovereign-forge apps/ronsas/lyricsync-studio apps/ronsas/scene-song-spark scripts/validate-ronsas-brand-contract.mjs
git commit -m "feat: align simple RONSAS apps with Resonance DataNest"
```

> Task 6 evidence: all four static apps were verified RED before implementation, then GREEN after governed footer/legal attribution, accessibility modes, canonical app accents, and app-local Fontsource build assets were added. RONSAS Application Validation #149 passed Career Compass, SovereignForge, LyricSync Studio, Scene Song Spark, and the aggregate DataNest Pages bundle. The aggregate bundler now installs each static app's locked local dependencies before copying WOFF2 font assets.

### Task 7: Register YouTube Optimizer as a governed SSR launch target

**Files:**
- Modify: `src/lib/ronsasApps.ts`
- Modify: `src/components/RonsasIntegrationPanel.tsx`
- Modify: `tests/unit/ronsas-cloud-integration.test.mjs`
- Modify: `scripts/validate-ronsas-imports.mjs`

**Interfaces:**
- Extend the launch model with `launchKind:"datanest-pages"|"external-ssr"` and optional explicit `href`.
- Existing seven Pages-hosted apps keep generated `/DataNest/apps/<slug>/` launch URLs.
- YouTube Optimizer is registered as `launchKind:"external-ssr"` with its canonical SSR URL from the existing YouTube Optimizer configuration; DataNest displays the runtime distinction rather than pretending it is statically hosted.
- A future move of YouTube Optimizer into static Pages requires a separate runtime-conversion design because its current Nitro server functions and SSR checks are functional requirements.

- [x] **Step 1: Add failing launch-contract tests**

Assert seven apps resolve to DataNest Pages paths, YouTube Optimizer resolves to the explicit SSR URL, and the UI labels external SSR launch state accessibly.

- [x] **Step 2: Run focused tests**

Run: `node --test tests/unit/ronsas-cloud-integration.test.mjs && node scripts/validate-ronsas-imports.mjs`  
Expected: FAIL because the current launch model has no SSR runtime distinction.

- [x] **Step 3: Extend the launch contract and integration panel**

Preserve all existing aliases and static launch paths. Do not modify YouTube Optimizer's Nitro runtime or server functions in this UI migration.

- [x] **Step 4: Verify**

Run: `node --test tests/unit/ronsas-cloud-integration.test.mjs && node scripts/validate-ronsas-imports.mjs && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/ronsasApps.ts src/components/RonsasIntegrationPanel.tsx tests/unit/ronsas-cloud-integration.test.mjs scripts/validate-ronsas-imports.mjs
git commit -m "feat: register YouTube Optimizer governed SSR launch"
```

> Task 7 evidence: focused launch-contract tests were RED before the registry change and GREEN after distinguishing seven `datanest-pages` entries from the `external-ssr` YouTube Optimizer entry at `https://youtubeoptimizer.life`. CI #2404 passed the RONSAS import-contract validator and root unit/type/build gates on the final implementation head.

### Task 8: Enforce cross-app contract completeness

**Files:**
- Modify: `scripts/validate-ronsas-brand-contract.mjs`
- Modify: `.github/workflows/ronsas-app-validation.yml`
- Modify: `tests/unit/ronsas-cloud-integration.test.mjs`

**Interfaces:**
- Validator fails unless all eight user-facing apps are marked migrated and satisfy operator/platform/governance/free-promotion contract checks, regardless of whether runtime hosting is Pages or external SSR.
- Backend-only `sovereign-backend` is validated for repository/legal metadata only; it is not required to render UI tokens.

- [x] **Step 1: Flip validator from incremental to complete mode**

Add a `--complete` flag that requires all app adapters; use it in CI after all migration tasks land.

- [x] **Step 2: Run full application validation**

Run: `node scripts/validate-ronsas-brand-contract.mjs --complete`  
Run each app command from `.github/workflows/ronsas-app-validation.yml`.  
Expected: PASS.

- [x] **Step 3: Run bundled-output and launch-contract verification**

Run: `npm run build && node scripts/build-ronsas-pages.mjs`  
Expected: `out/apps/manifest.json` contains the seven static Pages-hosted apps, while the DataNest application registry exposes YouTube Optimizer as the eighth governed user-facing app through its SSR launch contract.

- [x] **Step 4: Commit**

```bash
git add scripts/validate-ronsas-brand-contract.mjs .github/workflows/ronsas-app-validation.yml tests/unit/ronsas-cloud-integration.test.mjs
git commit -m "test: enforce DataNest UI contract across RONSAS apps"
```

> Task 8 evidence: `--complete` validation is enforced in the RONSAS workflow across all eight user-facing apps plus Sovereign Backend authority metadata. Complete validation caught and corrected SyncVision accent drift to canonical `#42e7ff`, retained ePublisher's governed class-driven light theme, and preserved free-promotion/no-paid-checkout. Final implementation-head verification: CI #2404 PASS, PR Verification #1284 PASS including browser verification, RONSAS Application Validation #149 PASS including the Pages bundle, and Security #810 PASS.
