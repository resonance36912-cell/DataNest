# DataNest Mobile Navigation Accessibility — Resume Checkpoint

Date: 2026-10-03
Branch: `work/mobile-navigation-accessibility-20261003`
Base protected `main`: `068372247da65f3028bb9b509dca44b5b42bb87a`
Current test-first head: `f7859b172b214421285cd198ac3170e7efdb3cb7`
Current synchronized failing head: `6c5b74a7fccb429dd04159733ce07d18ea4b153f`
Current PR base observed during diagnosis: `8a0e1e46d83c36f180c340ffbb28c513164b3e40`
Predecessor: PR #465 (merged)

## Intent

Continue the October 3 UX reconciliation as a separate, reviewable accessibility change. Do not revive PR #442 or the retired public-root/`/workspace/` assumptions.

## Current gate

`tests/browser/navigation-reconciliation.spec.ts` now defines the required compact/mobile navigation contract on the authenticated current root:

- when compact navigation is closed, the sidebar is inert;
- opening the menu exposes `#datanest-navigation` as a modal dialog;
- the close-menu control receives initial focus;
- `main.mainPane` becomes inert while navigation is open;
- body scrolling is locked while the modal navigation is open;
- Tab/Shift+Tab remain contained within the navigation dialog;
- Escape closes navigation and restores focus to the menu launcher;
- selecting the already-current workspace closes navigation and restores launcher focus;
- selecting a different workspace closes navigation and allows the existing workspace-title focus behavior to take over;
- crossing back to desktop width removes modal/inert/scroll-lock state.

The test is intentionally added before the product implementation so the follow-up has a precise failing/passing acceptance boundary.

## Proven exact-head blocker

On synchronized head `6c5b74a7fccb429dd04159733ce07d18ea4b153f`, CI and PR Verification fail in the shared `npm test` lane before browser verification.

The exact failing source-contract test is:

- `tests/unit/ui-ux-source.test.mjs:406`
- `platform shell extraction keeps layout display-only and phase-safe`
- assertion contract: `PlatformShell.tsx` must not contain `useState`, `useEffect`, `getSupabase`, or `window.history`.

The current branch violates that contract because the compact-navigation observer, focus trap, scroll lock, and modal-state logic were implemented inside `src/components/platform/PlatformShell.tsx` using `useState` and `useEffect`.

This is an implementation-placement defect, not evidence that the unit contract should be weakened. The checkpoint's original implementation target already places compact-navigation ownership in `DataNestApp.tsx` and passes only `navigationOpen` into the display-only `PlatformShell`.

Do not repair this by deleting or relaxing the source-contract assertion, and do not hide the behavior behind another stateful child of `PlatformShell` merely to satisfy the regex.

## Implementation target

Reconcile only the mobile navigation accessibility delta into the current `src/components/DataNestApp.tsx`.

Expected design, adapted from the retired #444 hunk but applied to current code rather than copied wholesale:

1. Track compact navigation with `matchMedia("(max-width: 900px)")`.
2. Add refs for the navigation container and menu launcher.
3. When compact navigation opens:
   - set body overflow to hidden and restore the prior value on close/cleanup;
   - focus `.closeMenu` on the next animation frame;
   - close on Escape via a helper that restores launcher focus.
4. Add a compact-only focus trap for Tab/Shift+Tab across visible interactive elements in the sidebar.
5. Use `PlatformShell navigationOpen={compactNavigation&&mobileOpen}` so the main pane is inert while the mobile navigation dialog is active.
6. On the sidebar, apply dialog semantics only while compact navigation is open; keep the closed compact sidebar inert and remove inert behavior on desktop.
7. Route close button and scrim through the focus-restoring close helper.
8. For navigation selection:
   - selecting the current view while the mobile dialog is open should use the close helper and restore menu focus;
   - selecting a different view should retain the existing view-change/title-focus flow.
9. Add `type="button"` to mobile menu/close/scrim controls where needed.
10. Restore `src/components/platform/PlatformShell.tsx` to display-only rendering; it may consume `navigationOpen` but must not own navigation state/effects.

Do not replace the full historical `DataNestApp.tsx`; preserve all newer recovery, workspace, AI-context, and command-palette logic.

## Verification

After implementation, require a fresh exact-head run of:

- CI;
- PR Verification including the new mobile regression and UI-governance visual review;
- Security scan / Semgrep;
- DataNest AI Certification;
- all protected-main governance trees.

Address review comments on the exact head and obtain required code-owner approval before merge.

## Promotion boundary

This checkpoint does not authorize protected-main merge or deployment. Human/code-owner approval and all required exact-head checks remain mandatory.

## Resume instruction

Resume from branch `work/mobile-navigation-accessibility-20261003`. First restore `PlatformShell.tsx` to its display-only contract and move the compact-navigation state/effects into the current `DataNestApp.tsx` without replacing newer app logic. Treat `tests/browser/navigation-reconciliation.spec.ts` as the executable acceptance contract. Then rerun exact-head protected-main verification. Do not weaken `tests/unit/ui-ux-source.test.mjs`, do not revive the retired #442 route model, and do not merge or deploy until required checks and human/code-owner approval are complete.


## Remediation applied

The branch-head remediation moves compact-navigation state and effects into `DataNestApp.tsx`, restores `PlatformShell.tsx` to display-only rendering, and leaves the browser acceptance contract unchanged. Exact source anchors must match before any write occurs.

Resume by checking exact-head CI and PR Verification. Do not weaken the source-contract test and do not merge until all protected-main gates and fresh human/code-owner approval are satisfied.
