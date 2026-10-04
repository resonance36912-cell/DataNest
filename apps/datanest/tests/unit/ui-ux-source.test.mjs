import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appSource = fs.readFileSync(path.join(repoRoot, "src/components/DataNestApp.tsx"), "utf8");
const homeSource = fs.readFileSync(path.join(repoRoot, "src/components/ResonanceHome.tsx"), "utf8");
const journeySource = fs.readFileSync(path.join(repoRoot, "src/components/PurposeJourney.tsx"), "utf8");
const aiWorkspaceSource = fs.readFileSync(path.join(repoRoot, "src/components/DataNestAiWorkspace.tsx"), "utf8");
const workflowPhasesSource = fs.readFileSync(path.join(repoRoot, "src/lib/workflowPhases.ts"), "utf8");
const globalNavigationSource = fs.readFileSync(path.join(repoRoot, "src/components/platform/GlobalNavigation.tsx"), "utf8");
const lifecycleRailSource = fs.readFileSync(path.join(repoRoot, "src/components/platform/LifecycleRail.tsx"), "utf8");
const contextStripSource = fs.readFileSync(path.join(repoRoot, "src/components/platform/ContextStrip.tsx"), "utf8");
const platformShellSource = fs.readFileSync(path.join(repoRoot, "src/components/platform/PlatformShell.tsx"), "utf8");
const navigationTypesSource = fs.readFileSync(path.join(repoRoot, "src/components/platform/navigationTypes.ts"), "utf8");
const readOptionalSource = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
};
const pageHeaderSource = readOptionalSource("src/components/platform/PageHeader.tsx");
const statusIndicatorSource = readOptionalSource("src/components/platform/StatusIndicator.tsx");
const evidencePanelSource = readOptionalSource("src/components/platform/EvidencePanel.tsx");
const governedActionSource = readOptionalSource("src/components/platform/GovernedAction.tsx");
const sessionDraftSource = fs.readFileSync(path.join(repoRoot, "src/lib/sessionDraft.ts"), "utf8");
const governanceSource = fs.readFileSync(path.join(repoRoot, "src/components/GovernanceWorkspace.tsx"), "utf8");
const thinkTankSource = fs.readFileSync(path.join(repoRoot, "src/components/ThinkTankWorkspace.tsx"), "utf8");
const productLabSource = fs.readFileSync(path.join(repoRoot, "src/components/ProductLab.tsx"), "utf8");
const authGateSource = fs.readFileSync(path.join(repoRoot, "src/components/AuthGate.tsx"), "utf8");
const legalDocumentLayoutSource = fs.readFileSync(path.join(repoRoot, "src/components/legal/LegalDocumentLayout.tsx"), "utf8");
const legalCentreSource = fs.readFileSync(path.join(repoRoot, "src/components/legal/GovernanceLegalCentre.tsx"), "utf8");
const transparencyPageSource = fs.readFileSync(path.join(repoRoot, "src/app/transparency/page.tsx"), "utf8");
const assurancePageSource = fs.readFileSync(path.join(repoRoot, "src/app/assurance/page.tsx"), "utf8");
const resonanceDesignSystemSource = fs.readFileSync(path.join(repoRoot, "src/app/resonance-design-system.css"), "utf8");
const sparksSource = fs.readFileSync(path.join(repoRoot, "src/components/SparksWorkspace.tsx"), "utf8");
const projectMembersSource = fs.readFileSync(path.join(repoRoot, "src/components/ProjectMembersPanel.tsx"), "utf8");
const authoritySource = fs.readFileSync(path.join(repoRoot, "src/components/ExecutionAuthorityPanel.tsx"), "utf8");
const resourceFabricSource = fs.readFileSync(path.join(repoRoot, "src/components/ResourceFabricPanel.tsx"), "utf8");
const singleFlightSource = fs.readFileSync(path.join(repoRoot, "src/lib/singleFlight.ts"), "utf8");
const pendingMutationSource = fs.readFileSync(path.join(repoRoot, "src/lib/pendingMutation.ts"), "utf8");
const durableRecoverySource = fs.readFileSync(path.join(repoRoot, "src/lib/durableRecovery.ts"), "utf8");
const recoveryDiagnosticsSource = fs.readFileSync(path.join(repoRoot, "src/components/RecoveryDiagnosticsPanel.tsx"), "utf8");
const mutationReconciliationSource = fs.readFileSync(path.join(repoRoot, "src/lib/mutationReconciliation.ts"), "utf8");
const supabaseSource = fs.readFileSync(path.join(repoRoot, "src/lib/supabase.ts"), "utf8");
const unifiIdempotencyMigrationSource = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260927180402_add_unifi_idempotent_manifest_v2.sql"), "utf8");
const productLabEvidenceMigrationSource = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260924145008_version_product_lab_evidence_and_dedupe_test_credit.sql"), "utf8");
const durableRecoveryMigrationSource = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260927202758_add_durable_mutation_recovery_ledger.sql"), "utf8");
const durableRecoveryHardeningSource = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260927203127_harden_durable_mutation_recovery_idempotency.sql"), "utf8");
const durableRecoveryObservabilitySource = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260927213827_add_mutation_recovery_observability.sql"), "utf8");
const cssSource = fs.readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");
const entryCssSource = fs.readFileSync(path.join(repoRoot, "src/app/entry.css"), "utf8");

test("shared operational primitives require text-bearing semantic state and exact governed stages", () => {
  assert.notEqual(pageHeaderSource, "", "PageHeader must exist");
  assert.match(pageHeaderSource, /eyebrow:string/);
  assert.match(pageHeaderSource, /title:string/);
  assert.match(pageHeaderSource, /description\?:string/);
  assert.match(pageHeaderSource, /primaryAction\?:ReactNode/);
  assert.match(pageHeaderSource, /meta\?:ReactNode/);

  assert.notEqual(statusIndicatorSource, "", "StatusIndicator must exist");
  assert.match(statusIndicatorSource, /label:string/);
  assert.match(statusIndicatorSource, /tone:"neutral"\|"info"\|"success"\|"warning"\|"danger"/);
  assert.match(statusIndicatorSource, /detail\?:string/);
  assert.match(statusIndicatorSource, /icon\?:ReactNode/);
  assert.doesNotMatch(statusIndicatorSource, /label\?:string|color\?:string|hex\?:string/);

  assert.notEqual(evidencePanelSource, "", "EvidencePanel must exist");
  assert.match(evidencePanelSource, /type EvidenceItem = \{/);
  assert.match(evidencePanelSource, /label:string/);
  assert.match(evidencePanelSource, /value:string/);
  assert.match(evidencePanelSource, /href\?:string/);
  assert.match(evidencePanelSource, /emptyState\?:ReactNode/);

  assert.notEqual(governedActionSource, "", "GovernedAction must exist");
  assert.match(governedActionSource, /type GovernedActionStage = "proposed"\|"checked"\|"review-required"\|"authorized"\|"scheduled"\|"executed"\|"verified"/);
  assert.match(governedActionSource, /stage:GovernedActionStage/);
  assert.match(governedActionSource, /summary:string/);
  assert.match(governedActionSource, /evidence\?:ReactNode/);
  assert.match(governedActionSource, /reviewer\?:string/);
  assert.match(governedActionSource, /onAction\?:\(\)=>void/);
  assert.doesNotMatch(governedActionSource, /getSupabase|useEffect|fetch\(|\.rpc\(/);
});

test("mobile navigation keeps refresh and release controls reachable", () => {
  assert.match(appSource, /className="mobileNavActions"/);
  assert.match(appSource, />Refresh workspace<\/button>/);
  assert.match(appSource, /"Reload latest"/);
  assert.match(
    cssSource,
    /@media\(max-width:720px\)\{[\s\S]*?\.releaseAction,\.refreshAction\{display:none\}[\s\S]*?\.mobileNavActions\{display:grid/,
    "mobile replacement actions must appear when top-bar refresh controls are hidden"
  );
});

test("navigation remains scrollable without pushing mobile footer controls off-screen", () => {
  assert.match(
    cssSource,
    /\.navStack\{[^}]*flex:1 1 auto;min-height:0/,
    "navigation should consume remaining sidebar height and scroll independently"
  );
});

test("desktop AI dock cannot consume more than 42 percent of the viewport", () => {
  assert.match(
    cssSource,
    /\.externalAiDock\{[^}]*max-width:min\(760px,42vw\)/,
    "base desktop dock should preserve room for the DataNest workspace"
  );
  assert.doesNotMatch(
    cssSource,
    /\.appFrame\.aiDockOpen \.externalAiDock\{[^}]*max-width:none/,
    "mid-size desktop layout must not remove the dock width cap"
  );
});

test("workspace navigation persists in the URL and follows browser history", () => {
  assert.match(appSource, /const viewKeys = new Set<ViewKey>/);
  assert.match(appSource, /searchParams\.get\("view"\)/);
  assert.match(appSource, /searchParams\.set\("view",next\)/);
  assert.match(appSource, /history\.pushState/);
  assert.match(appSource, /addEventListener\("popstate",syncViewFromUrl\)/);
  assert.match(appSource, /removeEventListener\("popstate",syncViewFromUrl\)/);
});

test("workspace navigation canonicalizes overview and invalid view URLs", () => {
  assert.match(
    appSource,
    /requested&&\(!valid\|\|requested==="overview"\)[\s\S]*?searchParams\.delete\("view"\)[\s\S]*?history\.replaceState/,
    "overview and invalid workspace parameters should be cleaned without creating a history loop"
  );
});

test("mobile navigation exposes menu relationships and closes with Escape", () => {
  assert.match(appSource, /id="datanest-navigation" aria-label="DataNest navigation"/);
  assert.match(appSource, /aria-controls="datanest-navigation" aria-expanded=\{mobileOpen\}/);
  assert.match(globalNavigationSource, /aria-label="Project workspaces"/);
  assert.match(appSource, /event\.key==="Escape"/);
});


test("mobile operational tables become labeled cards without forced horizontal widths", () => {
  assert.match(appSource, /className="jobTableRow"[\s\S]*?data-label="Job"[\s\S]*?data-label="Title"[\s\S]*?data-label="Status"/);
  assert.match(appSource, /schedulerRow[\s\S]{0,500}?key=\{job\.id\}[\s\S]*?data-label="Job"[\s\S]*?data-label="Controls"/);
  assert.match(appSource, /dataRow[\s\S]{0,500}?key=\{run\.id\}[\s\S]*?data-label="Run"[\s\S]*?data-label="Started"/);
  assert.match(
    cssSource,
    /@media\(max-width:720px\)\{[\s\S]*?\.jobTable,\.schedulerTable,\.dataTable\{overflow:visible!important\}[\s\S]*?min-width:0!important[\s\S]*?content:attr\(data-label\)/,
    "mobile operational rows should be self-contained labeled cards rather than horizontal tables"
  );
});


test("quick switch command palette is keyboard accessible and searchable", () => {
  assert.match(appSource, /aria-label="Quick switch DataNest workspace"/);
  assert.match(appSource, /aria-label="Search DataNest workspaces"/);
  assert.match(appSource, /event\.ctrlKey\|\|event\.metaKey/);
  assert.match(appSource, /event\.key\.toLowerCase\(\)==="k"/);
  assert.match(appSource, /aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.match(appSource, /viewDescriptions\[item\.key\]/);
  assert.match(appSource, /commandInputRef\.current\?\.focus\(\{preventScroll:true\}\)/);
});

test("quick switch preserves canonical workspace navigation", () => {
  assert.match(appSource, /onClick=\{\(\)=>chooseCommandItem\(item\)\}/);
  assert.match(appSource, /function chooseCommandItem\(item:CommandItem\)[\s\S]*?item\.kind==="external"[\s\S]*?chooseCommandView\(item\.key\)/);
  assert.match(appSource, /function chooseCommandView\(nextView:ViewKey\)[\s\S]*?setView\(nextView\)[\s\S]*?closeCommandPalette\(nextView===view\)/);
});


test("mobile scheduler uses a compact status select while desktop keeps filter chips", () => {
  assert.match(appSource, /className="schedulerFilterMobile"/);
  assert.match(appSource, /aria-label="Status filter"/);
  assert.match(appSource, /className="filterBar schedulerFilterDesktop"/);
  assert.match(
    cssSource,
    /@media\(max-width:720px\)\{[\s\S]*?\.schedulerFilterDesktop\{display:none\}[\s\S]*?\.schedulerFilterMobile\{display:grid/,
    "mobile should replace the chip grid with a compact select"
  );
});


test("quick switch traps modal focus and restores focus to a live launcher", () => {
  assert.match(appSource, /commandReturnFocusRef/);
  assert.match(appSource, /function closeCommandPalette\(restoreFocus=true\)/);
  assert.match(appSource, /function trapCommandFocus\(/);
  assert.match(appSource, /onKeyDown=\{trapCommandFocus\}/);
  assert.match(appSource, /const commandOpenRef=useRef\(false\)/);
  assert.match(appSource, /if\(commandOpenRef\.current\)closeCommandPalette\(\)/);
  assert.match(appSource, /commandOpenRef\.current=true/);
  assert.match(appSource, /commandOpenRef\.current=false/);
  assert.match(appSource, /const liveLauncher=quickSwitchButtonRef\.current/);
  assert.match(appSource, /if\(liveLauncher\?\.isConnected\)liveLauncher\.focus\(\{preventScroll:true\}\)/);
  assert.match(appSource, /else if\(returnTarget\?\.isConnected\)returnTarget\.focus\(\{preventScroll:true\}\)/);
  assert.match(appSource, /\},\[view,viewReady,commandOpen\]\);/);
});


test("quick switch opens the first search result with Enter", () => {
  assert.match(appSource, /function handleCommandSearchKeyDown\(/);
  assert.match(appSource, /event\.key==="Enter"/);
  assert.match(appSource, /commandItems\[0\]/);
  assert.match(appSource, /const selected=commandActiveIndex>0&&commandItems\[commandActiveIndex\]/);
  assert.match(appSource, /chooseCommandItem\(selected\)/);
});


test("quick switch Enter does nothing for an empty search", () => {
  assert.match(appSource, /commandQuery\.trim\(\)/);
});


test("quick switch supports arrow-key result selection before Enter", () => {
  assert.match(appSource, /commandActiveIndex/);
  assert.match(appSource, /event\.key==="ArrowDown"/);
  assert.match(appSource, /event\.key==="ArrowUp"/);
  assert.match(appSource, /commandItems\[commandActiveIndex\]/);
  assert.match(appSource, /aria-selected=\{commandActiveIndex===index\}/);
});


test("workspace architecture follows the consolidated DataNest operating lifecycle", () => {
  for (const group of ["HOME","THINK","GOVERN","BUILD","EXECUTE","PROVE","ADMIN"]) {
    assert.match(appSource, new RegExp('group:"'+group+'"'));
  }
  assert.match(appSource, /key:"ai",label:"DataNest AI",group:"HOME"/);
  assert.match(globalNavigationSource, /groupOrder=\["HOME","THINK","GOVERN","BUILD","EXECUTE","PROVE","ADMIN"\]/);
  assert.match(globalNavigationSource, /open=\{group==="HOME"\|\|items\.some/);
  assert.match(globalNavigationSource, /item\.id==="ai"\?"aiHeroNav"/);
  assert.match(navigationTypesSource, /export type NavigationItem = \{/);
  assert.match(navigationTypesSource, /phase:WorkflowPhaseId\|null/);
  assert.match(navigationTypesSource, /keywords:readonly string\[\]/);
});

test("authentication password fields provide accessible visibility controls", () => {
  assert.match(authGateSource, /showPassword \? "text" : "password"/);
  assert.match(authGateSource, /aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
  assert.match(authGateSource, /showNewPassword \? "Hide new password" : "Show new password"/);
  assert.match(authGateSource, /showConfirmPassword \? "Hide confirmation password" : "Show confirmation password"/);
  assert.match(authGateSource, /autoComplete="current-password"\s+aria-label="Password"/);
  assert.match(authGateSource, /autoComplete="new-password" aria-label="Confirm password"/);
  assert.match(entryCssSource, /\.passwordField\{/);
  assert.match(entryCssSource, /\.passwordToggle\{/);
});

test("session-check failures keep the sign-in shell usable", () => {
  assert.doesNotMatch(authGateSource, /startup = "connection-error"/);
  assert.match(authGateSource, /setStartup\("signed-out"\)/);
  assert.match(authGateSource, /You can still sign in/);
  assert.match(authGateSource, /Retry session check/);
  assert.match(entryCssSource, /\.sessionCheckNote\.sessionCheckError/);
});

test("entry experience is usable before session resolution completes", () => {
  assert.match(authGateSource, /useState<StartupState>\("signed-out"\)/);
  assert.doesNotMatch(authGateSource, /if \(startup === "loading"\)/);
  assert.match(authGateSource, /checkingSession/);
  assert.match(authGateSource, /Email me a magic link/);
  assert.match(authGateSource, /Forgot password\?/);
  assert.match(authGateSource, /function friendlyAuthError\(/);
  assert.match(authGateSource, /We couldn’t sign you in/);
  assert.match(authGateSource, /JavaScript is required to sign in/);
});

test("signed-in home collapses duplicate navigation cards into one task-oriented intent bar", () => {
  assert.match(homeSource, /className="panel homeIntentBar"/);
  assert.match(homeSource, /aria-label="Current project intent"/);
  assert.match(homeSource, /Review blocked work/);
  assert.match(homeSource, /Create governed work/);
  assert.doesNotMatch(homeSource, /aria-label="Continue your work"/);
  assert.doesNotMatch(homeSource, /aria-label="Needs attention"/);
  assert.doesNotMatch(homeSource, /aria-label="Applications"/);
  assert.match(cssSource, /\.homeIntentBar\{/);
});

test("workspace status metadata never claims READY before a project record exists", () => {
  assert.match(appSource, /project\?\.status\?\.toUpperCase\(\) \|\| \(loadingCore \? "CHECKING" : "UNAVAILABLE"\)/);
  assert.doesNotMatch(appSource, /project\?\.status \|\| "READY"/);
});

test("public entry link surfaces follow the shared theme tokens", () => {
  assert.match(entryCssSource, /\.landingHubLink\{[^}]*background:var\(--surface-work\)/);
  assert.doesNotMatch(entryCssSource, /\.landingHubLink\{[^}]*background:rgba\(20,12,38/);
});

test("public document and evidence routes retain contextual theme access", () => {
  assert.match(legalDocumentLayoutSource, /<ThemeControl compact \/>/);
  assert.match(legalCentreSource, /<ThemeControl compact \/>/);
  assert.match(transparencyPageSource, /<ThemeControl compact \/>/);
  assert.match(assurancePageSource, /<ThemeControl compact \/>/);
  assert.match(cssSource, /\.publicEvidenceHeaderActions/);
  assert.match(resonanceDesignSystemSource, /\.legalDocumentHeader \{/);
});

test("theme control is contextual rather than a persistent signed-in overlay", () => {
  const layoutSource = fs.readFileSync(path.join(repoRoot, "src/app/layout.tsx"), "utf8");
  assert.doesNotMatch(layoutSource, /themeControlDock/);
  assert.match(appSource, /<ThemeControl compact/);
  assert.match(authGateSource, /<span className="landingThemeControl"><ThemeControl compact/);
  assert.match(entryCssSource, /\.landingThemeControl/);
});


test("workflow continuity maps specialist workspaces without breaking direct navigation", () => {
  assert.match(appSource, /const workflowNext:Partial<Record<ViewKey,ViewKey>>/);
  assert.match(appSource, /overview:"ai"/);
  assert.match(appSource, /unifi:"scheduler"/);
  assert.match(appSource, /runs:"checkpoints"/);
  assert.match(appSource, /audit:"transparency"/);
  assert.match(appSource, /aria-label="Workspace progression"/);
  assert.match(appSource, /Continue · \{nextViewItem\.label\} →/);
  assert.match(appSource, /key=\{view\} className="viewStage workspaceArrival"/);
});

test("page header exposes current lifecycle phase and preserves quick switching", () => {
  assert.match(appSource, /currentGroup=currentNavItem\?\.group\|\|"HOME"/);
  assert.match(appSource, /DATANEST_CANONICAL_NAME\.toUpperCase\(\)\} · \{currentGroup\.toUpperCase\(\)\}/);
  assert.match(appSource, /Ctrl\/Cmd \+ K to toggle/);
});

test("AI & I home communicates the five-stage operating loop from shared phase data", () => {
  for (const label of ["Discover","Govern","Build","Execute","Verify"]) {
    assert.match(workflowPhasesSource, new RegExp('label:"'+label+'"'));
  }
  assert.match(journeySource, /workflowPhases/);
  assert.match(journeySource, /onNavigate\(item\.destination\)/);
  assert.match(homeSource, /<PurposeJourney onNavigate=\{onNavigate\}\/\>/);
  assert.match(homeSource, /onNavigate\("ai"\)/);
  assert.match(homeSource, />Enter DataNest AI</);
});

test("workflow transitions respect reduced-motion preferences and pause state", () => {
  assert.match(cssSource, /html:not\(\[data-motion-paused="true"\]\) \.workspaceArrival\{animation:workspaceArrive/);
  assert.match(cssSource, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.viewStage\{animation:none!important\}/);
  assert.match(cssSource, /html\[data-motion-paused="true"\] \.workspaceArrival[\s\S]*?animation:none!important/);
});


test("workspace task contracts explain start, completion and evidence", () => {
  assert.match(appSource, /const workspaceTaskGuides:Partial<Record<ViewKey,WorkspaceTaskGuide>>/);
  assert.match(appSource, /START HERE/);
  assert.match(appSource, /COMPLETE WHEN/);
  assert.match(appSource, /EVIDENCE/);
  assert.match(appSource, /aria-label=\{currentLabel\+" task guide"\}/);
  for (const view of ["ai","stakeholder","sparks","thinktank","governance","products","productlab","unifi","scheduler","runs","checkpoints","audit","transparency","settings"]) {
    assert.match(appSource, new RegExp(view+':\\{'));
  }
  assert.match(cssSource, /\.workspaceTaskGuide\{/);
});

test("Product Lab empty state gives operators a direct recovery action", () => {
  const productLabSource = fs.readFileSync(path.join(repoRoot, "src/components/ProductLab.tsx"), "utf8");
  assert.match(productLabSource, /Register product surface/);
  assert.match(productLabSource, /id="product-surface-admin"/);
  assert.match(productLabSource, /scrollIntoView\(\{behavior:"smooth",block:"start"\}\)/);
});


test("workflow guidance adapts to live execution state while keeping lifecycle fallback", () => {
  assert.match(appSource, /function resolveWorkflowRecommendation\(/);
  assert.match(appSource, /view==="overview"[\s\S]*?summary\.blocked>0[\s\S]*?key:"scheduler"/);
  assert.match(appSource, /view==="overview"[\s\S]*?summary\.running>0[\s\S]*?key:"runs"/);
  assert.match(appSource, /view==="ai"[\s\S]*?summary\.total===0[\s\S]*?key:"unifi"/);
  assert.match(appSource, /view==="scheduler"[\s\S]*?summary\.running>0[\s\S]*?key:"runs"/);
  assert.match(appSource, /view==="scheduler"[\s\S]*?summary\.blocked>0[\s\S]*?key:"unifi"/);
  assert.match(appSource, /return \{key:fallback,reason:defaultReason,adaptive:false\}/);
  assert.match(appSource, /STATE-AWARE/);
  assert.match(appSource, /LIFECYCLE/);
  assert.match(cssSource, /\.workflowMode\.adaptive\{/);
});


test("operational empty states route users to prerequisite workspaces", () => {
  assert.match(appSource, /No project jobs yet/);
  assert.match(appSource, /Open UNIFI Planner/);
  assert.match(appSource, /Show all jobs/);
  assert.match(appSource, /No execution runs yet[\s\S]*?Open TranScheduler/);
  assert.match(appSource, /No checkpoints yet[\s\S]*?Open Runs/);
  assert.match(appSource, /No audit events yet[\s\S]*?Open Checkpoints/);
  assert.match(appSource, /function EmptyState\(\{title,text,actionLabel,onAction\}/);
  assert.match(cssSource, /\.emptyState \.emptyStateAction\{/);
});


test("specialist workspaces retain persistent lifecycle orientation", () => {
  assert.match(appSource, /workflowPhaseForView\(view\)/);
  assert.match(appSource, /<LifecycleRail/);
  assert.match(lifecycleRailSource, /aria-label="DataNest lifecycle phases"/);
  assert.match(lifecycleRailSource, /workflowPhases\.map/);
  assert.match(lifecycleRailSource, /aria-current=\{active\?"step":undefined\}/);
  assert.match(lifecycleRailSource, /"Go to "\+phase\.label\+" phase"/);
  assert.match(lifecycleRailSource, />AI CORE</);
  assert.match(lifecycleRailSource, />cross-phase</);
  assert.match(workflowPhasesSource, /\["stakeholder","sparks","thinktank"\]/);
  assert.match(workflowPhasesSource, /\["products","productlab"\]/);
  assert.match(workflowPhasesSource, /\["unifi","scheduler","runs"\]/);
  assert.match(workflowPhasesSource, /\["checkpoints","audit","transparency"\]/);
  assert.match(workflowPhasesSource, /WorkflowDestination = typeof workflowPhases\[number\]\["destination"\] \| "ai"/);
  assert.match(cssSource, /\.workflowPhaseRail\{/);
  assert.match(cssSource, /@media\(max-width:860px\)[\s\S]*?\.workflowPhaseRail\{overflow-x:auto/);
  assert.match(cssSource, /@media\(max-width:520px\)[\s\S]*?\.workflowPhaseRail\{margin-top:-2px;overflow:visible;flex-direction:column/);
  assert.match(cssSource, /\.workflowPhaseSteps button>span\{display:none\}/);
});

test("platform shell extraction keeps layout display-only and phase-safe", () => {
  assert.match(appSource, /<PlatformShell/);
  assert.match(appSource, /<GlobalNavigation/);
  assert.doesNotMatch(appSource, /<ContextStrip/);
  assert.match(appSource, /className="topbarMeta"/);
  assert.match(platformShellSource, /navigation:ReactNode/);
  assert.match(platformShellSource, /topbar:ReactNode/);
  assert.match(platformShellSource, /context\?:ReactNode/);
  assert.doesNotMatch(platformShellSource, /useState|useEffect|getSupabase|window\.history/);
  assert.match(contextStripSource, /aria-label="Workspace context"/);
  assert.match(globalNavigationSource, /onNavigate:\(view:string\)=>void/);
  assert.match(globalNavigationSource, /aria-current=\{currentView===item\.id\?"page":undefined\}/);
});




test("active Job context persists across workspace handoffs", () => {
  assert.match(appSource, /datanest\.activeWorkContext:/);
  assert.match(appSource, /window\.sessionStorage\.setItem\(key,JSON\.stringify\(next\)\)/);
  assert.match(appSource, /isActiveWorkContext\(parsed\)/);
  assert.match(appSource, /aria-label="Active work context"/);
  assert.match(appSource, /Return to DataNest AI/);
  assert.match(appSource, /activeContextActionForView/);
  assert.match(appSource, /Schedule active Job/);
  assert.match(appSource, /Review active Job runs/);
  assert.match(appSource, /Open active Job checkpoints/);
  assert.match(appSource, /Trace active Job audit/);
  assert.match(appSource, /Review transparency evidence/);
  assert.match(appSource, /Clear context/);
  assert.match(appSource, /preferredJobId=\{activeDataNestAiSession\?\.jobId\|\|null\}/);
  assert.match(cssSource, /\.activeWorkContext\{/);
  assert.match(cssSource, /@media\(max-width:600px\)[\s\S]*?\.activeWorkContext\{grid-template-columns:1fr/);
});

test("DataNest AI restores the handed-off Job instead of resetting to the first Job", () => {
  assert.match(aiWorkspaceSource, /preferredJobId\?:string\|null/);
  assert.match(aiWorkspaceSource, /preferredJobId&&next\.some\(job=>job\.id===preferredJobId\)/);
  assert.match(aiWorkspaceSource, /jobNumber:selectedJob\.job_number/);
  assert.match(aiWorkspaceSource, /title:selectedJob\.title/);
  assert.match(aiWorkspaceSource, /status:selectedJob\.status/);
  assert.doesNotMatch(aiWorkspaceSource, /useEffect\(\(\)=>\(\)=>onActiveSessionChange\(null\)/);
});


test("active Job context remains visible inside operational evidence views without filtering project data", () => {
  assert.match(appSource, /Scheduler[\s\S]*?activeJobId=\{activeDataNestAiSession\?\.jobId\|\|null\}/);
  assert.match(appSource, /Runs[\s\S]*?activeJobId=\{activeDataNestAiSession\?\.jobId\|\|null\}/);
  assert.match(appSource, /Checkpoints[\s\S]*?activeJobId=\{activeDataNestAiSession\?\.jobId\|\|null\}/);
  assert.match(appSource, /Audit[\s\S]*?activeJobId=\{activeDataNestAiSession\?\.jobId\|\|null\}/);
  assert.match(appSource, /data-active-context=\{job\.id===activeJobId\?"true":undefined\}/);
  assert.match(appSource, /data-active-context=\{active\?"true":undefined\}/);
  assert.match(appSource, /ACTIVE CONTEXT/);
  assert.match(appSource, /const schedulerJobs=useMemo\(\(\)=>requirementFocus\?\(requirementJobs\?\?\[\]\):jobs,\[jobs,requirementFocus,requirementJobs\]\)/);
  assert.match(appSource, /const statusVisible=filter==="ALL"\?schedulerJobs:schedulerJobs\.filter\(item=>item\.status===filter\)/);
  assert.doesNotMatch(appSource, /jobs\.filter\(item=>item\.id===activeJobId\)/);
  assert.match(cssSource, /\.schedulerRow\.contextMatch/);
  assert.match(cssSource, /\.ganttRow\.contextMatch/);
  assert.match(cssSource, /\.dataRow\.contextMatch/);
  assert.match(cssSource, /\.checkpointCard\.contextMatch/);
  assert.match(cssSource, /\.timelineItem\.contextMatch/);
  assert.match(cssSource, /\.contextMatchTag\{/);
});


test("active work context exposes safe page-specific continuation actions", () => {
  assert.match(appSource, /if\(view==="productlab"\)return \{key:"unifi",label:"Plan active Job in UNIFI"/);
  assert.match(appSource, /if\(view==="unifi"\)return \{key:"scheduler",label:"Schedule active Job"/);
  assert.match(appSource, /if\(view==="scheduler"\)return \{key:"runs",label:"Review active Job runs"/);
  assert.match(appSource, /if\(view==="runs"\)return \{key:"checkpoints",label:"Open active Job checkpoints"/);
  assert.match(appSource, /if\(view==="checkpoints"\)return \{key:"audit",label:"Trace active Job audit"/);
  assert.match(appSource, /if\(view==="audit"\)return \{key:"transparency",label:"Review transparency evidence"/);
  assert.match(appSource, /return \{key:"ai",label:"Return active Job to AI"/);
  assert.match(appSource, /onClick=\{\(\)=>setView\(activeContextAction\.key\)\}/);
  assert.match(cssSource, /\.activeWorkContextHint\{/);
  assert.match(cssSource, /\.activeWorkContextPrimary\{/);
});


test("active Job evidence signal is explicitly page-scoped and non-authoritative", () => {
  assert.match(appSource, /type ActiveContextEvidence = \{ state:"visible"\|"not-visible"\|"context"; label:string; detail:string \}/);
  assert.match(appSource, /function activeContextEvidenceForView/);
  assert.match(appSource, /On this page:/);
  assert.match(appSource, /No matching Job record is loaded on this page/);
  assert.match(appSource, /No matching run is loaded on this page/);
  assert.match(appSource, /No matching checkpoint is loaded on this page/);
  assert.match(appSource, /No matching audit event is loaded on this page/);
  assert.match(appSource, /role="status" aria-label="Visible evidence signal"/);
  assert.match(cssSource, /\.activeWorkContextEvidence\.visible/);
  assert.match(cssSource, /\.activeWorkContextEvidence\.not-visible/);
  const helperStart = appSource.indexOf("function activeContextEvidenceForView");
  const helperEnd = appSource.indexOf("function tone", helperStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart);
  const evidenceHelperSource = appSource.slice(helperStart,helperEnd);
  assert.doesNotMatch(evidenceHelperSource, /\bcomplete(?:d|ion)?\b/i);
});


test("active Job journey rail shows location without claiming completion", () => {
  assert.match(appSource, /const activeJobJourneySteps:Array<\{key:ViewKey;label:string;detail:string\}>/);
  assert.match(appSource, /key:"unifi",label:"Plan"/);
  assert.match(appSource, /key:"scheduler",label:"Schedule"/);
  assert.match(appSource, /key:"runs",label:"Run"/);
  assert.match(appSource, /key:"checkpoints",label:"Checkpoint"/);
  assert.match(appSource, /key:"audit",label:"Audit"/);
  assert.match(appSource, /aria-label="Active Job journey"/);
  assert.match(appSource, /Location only · not completion state/);
  assert.match(appSource, /aria-current=\{current\?"step":undefined\}/);
  assert.match(appSource, /onClick=\{\(\)=>setView\(step\.key\)\}/);
  assert.match(cssSource, /\.activeWorkContextJourney\{/);
  assert.match(cssSource, /\.activeWorkContextJourneySteps button\.active/);
  const journeyStart = appSource.indexOf("const activeJobJourneySteps");
  const journeyEnd = appSource.indexOf("function activeContextActionForView", journeyStart);
  assert.ok(journeyStart>=0&&journeyEnd>journeyStart);
  const journeySource = appSource.slice(journeyStart,journeyEnd);
  assert.doesNotMatch(journeySource, /status|completed|verified|passed/i);
});


test("active evidence can anchor to its rendered record without filtering", () => {
  assert.match(appSource, /const focusActiveContextRecord=useCallback/);
  assert.match(appSource, /document\.querySelector<HTMLElement>\('\[data-active-context="true"\]'\)/);
  assert.match(appSource, /prefers-reduced-motion: reduce/);
  assert.match(appSource, /target\.scrollIntoView\(\{behavior:reduceMotion\?"auto":"smooth",block:"center"\}\)/);
  assert.match(appSource, /target\.focus\(\{preventScroll:true\}\)/);
  assert.match(appSource, /Jump to visible evidence ↓/);
  assert.match(appSource, /tabIndex=\{job\.id===activeJobId\?-1:undefined\}/);
  assert.match(appSource, /tabIndex=\{active\?-1:undefined\}/);
  assert.match(appSource, /manifestCard.*contextMatch/);
  assert.match(cssSource, /\.activeWorkContextEvidenceJump\{/);
  assert.match(cssSource, /\.contextMatch:focus\{/);
  assert.match(cssSource, /\.manifestCard\.contextMatch\{/);
  assert.match(appSource, /Active Job evidence is loaded, but its matching record is not rendered in this workspace view\./);
  assert.doesNotMatch(appSource, /filter\(item=>item\.id===activeJobId\)/);
});


test("active context jump can reveal a hidden Scheduler record without changing governed state", () => {
  assert.match(appSource, /const ACTIVE_CONTEXT_REVEAL_EVENT="datanest:reveal-active-context"/);
  assert.match(appSource, /function focusRenderedActiveContextRecord\(\):boolean/);
  assert.match(appSource, /if\(focusRenderedActiveContextRecord\(\)\)return/);
  assert.match(appSource, /if\(view==="scheduler"\)/);
  assert.match(appSource, /window\.dispatchEvent\(new CustomEvent\(ACTIVE_CONTEXT_REVEAL_EVENT\)\)/);
  assert.match(appSource, /window\.addEventListener\(ACTIVE_CONTEXT_REVEAL_EVENT,revealActiveContext\)/);
  assert.match(appSource, /setFilter\("ALL"\)/);
  assert.match(appSource, /setViewMode\("gantt"\)/);
  assert.match(appSource, /window\.requestAnimationFrame\(\(\)=>window\.requestAnimationFrame/);
  assert.match(appSource, /Active Job revealed in TranScheduler\./);
  assert.match(appSource, /Prepared Job evidence not visible/);
  assert.doesNotMatch(appSource, /updateJobStatus[\s\S]{0,300}?ACTIVE_CONTEXT_REVEAL_EVENT/);
});


test("active Job can be located across paginated Job pages without changing governed state", () => {
  assert.match(appSource, /const \[locatingActiveJob,setLocatingActiveJob\]=useState\(false\)/);
  assert.match(appSource, /const pendingActiveJobPageFocusRef=useRef\(false\)/);
  assert.match(appSource, /const locateActiveJobPage=useCallback\(async\(\)=>/);
  assert.match(appSource, /Math\.ceil\(jobCount\/PAGE_SIZE\)/);
  assert.match(appSource, /\.select\("id,status"\)/);
  assert.match(appSource, /\.order\("priority",\{ascending:false\}\)/);
  assert.match(appSource, /\.order\("created_at",\{ascending:false\}\)/);
  assert.match(appSource, /setJobPage\(page\)/);
  assert.match(appSource, /if\(rows\.length<PAGE_SIZE\)break/);
  assert.match(appSource, /seenPageSignatures=new Set<string>\(\)/);
  assert.match(appSource, /Job pagination did not advance/);
  assert.match(appSource, /Locate active Job page →/);
  assert.match(appSource, /Active Job was not found in the project Job pages checked\./);
  assert.match(appSource, /Active Job exists in the project but is not a prepared UNIFI record/);
  assert.doesNotMatch(appSource, /locateActiveJobPage[\s\S]{0,1200}?updateJobStatus/);
});


test("active Job evidence locator spans paginated Runs, Checkpoints, and Audit without mutations", () => {
  assert.match(appSource, /const \[locatingActiveEvidence,setLocatingActiveEvidence\]=useState\(false\)/);
  assert.match(appSource, /pendingActiveEvidenceFocusRef=useRef<"runs"\|"checkpoints"\|"audit"\|null>\(null\)/);
  assert.match(appSource, /const locateActiveEvidencePage=useCallback\(async\(\)=>/);
  assert.match(appSource, /from\("runs"\)\.select\("id,job_id"\)\.order\("started_at",\{ascending:false\}\)/);
  assert.match(appSource, /from\("checkpoints"\)\.select\("id,job_id"\)\.order\("created_at",\{ascending:false\}\)/);
  assert.match(appSource, /from\("events"\)\.select\("id,job_id"\)\.eq\("project_id",project\.id\)\.order\("created_at",\{ascending:false\}\)/);
  assert.match(appSource, /if\(rows\.length<PAGE_SIZE\)break/);
  assert.match(appSource, /Locate active evidence page →/);
  assert.match(appSource, /Active Job .* evidence located and focused/);
  assert.doesNotMatch(appSource, /locateActiveEvidencePage[\s\S]{0,2600}?updateJobStatus/);
});


test("workspace presentation state is URL-addressable without exposing active Job identity", () => {
  assert.match(appSource, /const operationalUrlStateKeys=\["page","mode","filter","sort","interests","focus"\] as const/);
  assert.match(appSource, /const workspaceScopedUrlStateKeys=\[\.\.\.operationalUrlStateKeys,"section"\] as const/);
  assert.match(appSource, /const paginatedWorkspaceViews=new Set<ViewKey>\(\["unifi","scheduler","runs","checkpoints","audit"\]\)/);
  assert.match(appSource, /function scopeUrlToWorkspace\(url:URL,view:ViewKey\)/);
  assert.match(appSource, /function urlPageIndex\(url:URL\)/);
  assert.match(appSource, /function schedulerViewModeFromUrl\(url:URL\):SchedulerViewMode/);
  assert.match(appSource, /function schedulerFilterFromUrl\(url:URL\):SchedulerFilter/);
  assert.match(appSource, /function schedulerSortModeFromUrl\(url:URL\):SchedulerSortMode/);
  assert.match(appSource, /function schedulerInterestOnlyFromUrl\(url:URL\)/);
  assert.match(appSource, /workspaceScopedUrlStateKeys\.forEach\(key=>url\.searchParams\.delete\(key\)\)/);
  assert.match(appSource, /operationalUrlStateKeys\.forEach\(key=>url\.searchParams\.delete\(key\)\)/);
  assert.match(appSource, /if\(view!=="governance"&&view!=="products"\)url\.searchParams\.delete\("section"\)/);
  assert.match(appSource, /if\(page>0\)url\.searchParams\.set\("page",String\(page\+1\)\)/);
  assert.match(appSource, /if\(schedulerViewMode!=="gantt"\)url\.searchParams\.set\("mode",schedulerViewMode\)/);
  assert.match(appSource, /if\(schedulerFilter!=="ALL"\)url\.searchParams\.set\("filter",schedulerFilter\)/);
  assert.match(appSource, /if\(schedulerSortMode!=="priority"\)url\.searchParams\.set\("sort",schedulerSortMode\)/);
  assert.match(appSource, /if\(schedulerInterestOnly\)url\.searchParams\.set\("interests","1"\)/);
  assert.match(appSource, /window\.history\.replaceState\(window\.history\.state,"",nextUrl\)/);
  assert.match(appSource, /filter=\{schedulerFilter\} viewMode=\{schedulerViewMode\} sortMode=\{schedulerSortMode\}/);
  assert.doesNotMatch(appSource, /searchParams\.set\("job(?:Id|_id)"/i);
  assert.doesNotMatch(appSource, /searchParams\.set\("session(?:Id|_id)"/i);
});


test("workspace scoping is shared by history restoration and copied deep links", () => {
  assert.match(appSource, /function scopeUrlToWorkspace\(url:URL,view:ViewKey\)\{[\s\S]*?paginatedWorkspaceViews\.has\(view\)[\s\S]*?view!=="scheduler"[\s\S]*?view!=="governance"/);
  assert.match(appSource, /const originalUrl=url\.toString\(\);[\s\S]*?scopeUrlToWorkspace\(url,next\);[\s\S]*?history\.replaceState/);
  assert.match(appSource, /scopeUrlToWorkspace\(shareUrl,view\)/);
});


test("shared workspace links clamp stale pages only with exact counts and strip release cache-busters when copied", () => {
  assert.match(appSource, /else if\(count===null\)\{\s*setJobs/);
  assert.match(appSource, /else if\(count===null\)\{\s*setRuns/);
  assert.match(appSource, /else if\(count===null\)\{\s*setCheckpoints/);
  assert.match(appSource, /else if\(count===null\)\{\s*setEvents/);
  assert.match(appSource, /const lastPage=Math\.max\(0,Math\.ceil\(total\/PAGE_SIZE\)-1\)/);
  assert.match(appSource, /if\(page>lastPage\)\{\s*setJobPage\(lastPage\)/);
  assert.match(appSource, /if\(page>lastPage\)\{\s*setRunPage\(lastPage\)/);
  assert.match(appSource, /if\(page>lastPage\)\{\s*setCheckpointPage\(lastPage\)/);
  assert.match(appSource, /if\(page>lastPage\)\{\s*setEventPage\(lastPage\)/);
  assert.match(appSource, /async function copyWorkspaceLink\(\)/);
  assert.match(appSource, /shareUrl\.searchParams\.delete\("release"\)/);
  assert.match(appSource, /shareUrl\.searchParams\.delete\("_reload"\)/);
  assert.match(appSource, /navigator\.clipboard\.writeText\(shareUrl\.toString\(\)\)/);
  assert.match(appSource, />Copy view link<\/button>/);
  assert.doesNotMatch(appSource, /shareUrl\.searchParams\.set\("job(?:Id|_id)"/i);
  assert.doesNotMatch(appSource, /shareUrl\.searchParams\.set\("session(?:Id|_id)"/i);
});


test("browser-session drafts are scoped, reload-safe, and clear synchronously after unmounted success", () => {
  assert.match(sessionDraftSource, /const SESSION_DRAFT_PREFIX="datanest\.sessionDraft\."/);
  assert.match(sessionDraftSource, /window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(sessionDraftSource, /window\.sessionStorage\.setItem\(storageKey,current\)/);
  assert.match(sessionDraftSource, /window\.sessionStorage\.removeItem\(storageKey\)/);
  assert.match(sessionDraftSource, /const valueRef=useRef\(initialValue\)/);
  assert.match(sessionDraftSource, /const setDraftValue=useCallback<Dispatch<SetStateAction<T>>>/);
  assert.match(sessionDraftSource, /const stored=persistValue\(nextValue\)/);
  assert.match(sessionDraftSource, /if\(mountedRef\.current\)\{\s*setValue\(nextValue\)/);
  assert.doesNotMatch(sessionDraftSource, /localStorage/);
});

test("authored workflow drafts are user-and-project scoped on high-value workspaces", () => {
  assert.match(appSource, /const draftPrefix="unifi:"\+project\.id\+":"\+currentUserId\+":"/);
  assert.match(governanceSource, /const draftPrefix="governance:"\+projectId\+":"\+currentUserId\+":"/);
  assert.match(thinkTankSource, /const draftPrefix="thinktank:"\+projectId\+":"\+currentUserId\+":"/);
  assert.match(productLabSource, /const draftPrefix="productlab:"\+projectId\+":"\+currentUserId\+":"/);
  assert.match(appSource, /Browser-session draft active/);
  assert.match(governanceSource, /Browser-session draft active/);
  assert.match(thinkTankSource, /Browser-session draft active/);
  assert.match(productLabSource, /Browser-session draft active/);
});

test("Think Tank message drafts are isolated per selected thread", () => {
  assert.match(thinkTankSource, /draftPrefix\+"message:"\+selectedThreadId/);
  assert.match(thinkTankSource, /draftPrefix\+"thread:"\+selectedChannelId\+":title"/);
});


test("authentication credentials are excluded from browser-session draft persistence", () => {
  assert.match(authGateSource, /const \[password, setPassword\] = useState\(""\)/);
  assert.match(authGateSource, /const \[newPassword, setNewPasswordValue\] = useState\(""\)/);
  assert.match(authGateSource, /const \[confirmPassword, setConfirmPassword\] = useState\(""\)/);
  assert.doesNotMatch(authGateSource, /useSessionDraftState|sessionDraft|sessionStorage\.setItem/);
});


test("single-flight actions lock synchronously, release in finally, and protect page unload", () => {
  assert.match(singleFlightSource, /if\(activeRef\.current!==null\)return \{started:false\}/);
  assert.match(singleFlightSource, /activeRef\.current=key/);
  assert.match(singleFlightSource, /finally\{\s*activeRef\.current=null/);
  assert.match(singleFlightSource, /addEventListener\("beforeunload",protectInFlightRequest\)/);
  assert.match(singleFlightSource, /removeEventListener\("beforeunload",protectInFlightRequest\)/);
});

test("mutation-heavy workspaces use the shared single-flight boundary", () => {
  assert.match(appSource, /useSingleFlight\(\)/);
  assert.match(productLabSource, /useSingleFlight\(\)/);
  assert.match(governanceSource, /useSingleFlight\(\)/);
  assert.match(thinkTankSource, /useSingleFlight\(\)/);
  assert.match(sparksSource, /useSingleFlight\(\)/);
  assert.match(projectMembersSource, /useSingleFlight\(\)/);
  assert.match(authoritySource, /useSingleFlight\(\)/);
  assert.match(resourceFabricSource, /useSingleFlight\(\)/);
});

test("pending mutation journal preserves identity, lifecycle state, and same-tab change signals", () => {
  assert.match(pendingMutationSource, /const PENDING_MUTATION_PREFIX="datanest\.pendingMutation\."/);
  assert.match(pendingMutationSource, /PENDING_MUTATION_EVENT="datanest:pending-mutation-change"/);
  assert.match(pendingMutationSource, /PENDING_MUTATION_AGING_MS=15\*60\*1000/);
  assert.match(pendingMutationSource, /PENDING_MUTATION_STALE_MS=60\*60\*1000/);
  assert.match(pendingMutationSource, /verificationState:"unverified"/);
  assert.match(pendingMutationSource, /lastCheckedAt:null/);
  assert.match(pendingMutationSource, /durable:false/);
  assert.match(pendingMutationSource, /restorePendingMutation/);
  assert.match(pendingMutationSource, /markPendingMutationDurable/);
  assert.match(pendingMutationSource, /requestKey:crypto\.randomUUID\(\)/);
  assert.match(pendingMutationSource, /window\.sessionStorage\.setItem\(storageKey\(scope\),JSON\.stringify\(next\)\)/);
  assert.match(pendingMutationSource, /window\.dispatchEvent\(new CustomEvent\(PENDING_MUTATION_EVENT,\{detail:\{scope\}\}\)\)/);
  assert.match(pendingMutationSource, /markPendingMutationVerification/);
  assert.match(pendingMutationSource, /reason==="confirmed_absent_new_intent"&&existing\.verificationState!=="confirmed_absent"/);
  assert.match(pendingMutationSource, /classifyPendingMutationAge/);
  assert.match(pendingMutationSource, /existing&&existing\.kind===kind&&JSON\.stringify\(existing\.payload\)===JSON\.stringify\(payload\)/);
  assert.match(mutationReconciliationSource, /state:"confirmed"/);
  assert.match(mutationReconciliationSource, /state:"not_recorded"/);
  assert.match(mutationReconciliationSource, /state:"pending"/);
});

test("UNIFI manifest creation has a server idempotency key and reconciles ambiguous outcomes", () => {
  assert.match(unifiIdempotencyMigrationSource, /add column if not exists client_request_id uuid/);
  assert.match(unifiIdempotencyMigrationSource, /create unique index if not exists jobs_project_client_request_id_uidx/);
  assert.match(unifiIdempotencyMigrationSource, /create or replace function public\.create_job_manifest_v2/);
  assert.match(unifiIdempotencyMigrationSource, /where project_id=target_project\s+and client_request_id=target_request_key/);
  assert.match(unifiIdempotencyMigrationSource, /Client request key already exists for a different UNIFI Job Manifest payload/);
  assert.match(appSource, /create_job_manifest_v3/);
  assert.match(appSource, /target_request_key:intent\.requestKey/);
  assert.match(appSource, /\.eq\("client_request_id",intent\.requestKey\)/);
  assert.match(appSource, /Previous UNIFI submission was not recorded/);
  assert.match(appSource, /UNIFI submission outcome is still unconfirmed/);
  assert.match(appSource, /Recheck server state/);
});

test("Spark reservations reconcile against authoritative request-key state", () => {
  assert.match(sparksSource, /getOrCreatePendingMutation\(redemptionRequestScope,"spark_redemption",payload\)/);
  assert.match(sparksSource, /target_request_key:intent\.requestKey/);
  assert.match(sparksSource, /\.eq\("request_key",intent\.requestKey\)/);
  assert.match(sparksSource, /Recovered confirmed Spark reservation/);
  assert.match(sparksSource, /Previous Spark reservation was not recorded/);
  assert.match(sparksSource, /Spark reservation outcome is still unconfirmed/);
  assert.match(sparksSource, /disabled=\{redemptionEditLocked\}/);
});

test("PostgREST automatic retries are disabled so mutation reconciliation remains explicit", () => {
  assert.match(supabaseSource, /db:\s*\{\s*retry:\s*false\s*\}/);
});

test("Product Lab test evidence uses request identity for authoritative reconciliation", () => {
  assert.match(productLabEvidenceMigrationSource, /add column if not exists request_id uuid/);
  assert.match(productLabEvidenceMigrationSource, /create unique index if not exists product_test_runs_user_request_idx/);
  assert.match(productLabEvidenceMigrationSource, /on public\.product_test_runs\(tester_user_id,request_id\)/);
  assert.match(productLabSource, /getOrCreatePendingMutation\(testRunRequestScope,"product_test_run",payload\)/);
  assert.match(productLabSource, /request_id:intent\.requestKey/);
  assert.match(productLabSource, /\.eq\("tester_user_id",currentUserId\)/);
  assert.match(productLabSource, /\.eq\("request_id",intent\.requestKey\)/);
  assert.match(productLabSource, /Recovered confirmed Product Lab test evidence/);
  assert.match(productLabSource, /Previous Product Lab test result was not recorded/);
  assert.match(productLabSource, /Product Lab test result is still unconfirmed/);
  assert.match(productLabSource, /disabled=\{testRunEditLocked\}/);
});

test("Product Lab mutation feedback remains visible after workspace navigation", () => {
  assert.match(appSource, /<ProductLab[^>]*setNotice=\{setNotice\} setError=\{setError\}/);
  assert.match(productLabSource, /Product Lab action in progress/);
  assert.doesNotMatch(productLabSource, /const \[notice,setNotice\]=useState/);
  assert.doesNotMatch(productLabSource, /const \[error,setError\]=useState/);
});

test("global recovery center scopes, hydrates, ages, and preserves unresolved operations across account transitions", () => {
  assert.match(appSource, /const suffix=project\.id\+":"\+session\.user\.id/);
  assert.match(appSource, /scope:"unifi-job:"\+suffix/);
  assert.match(appSource, /scope:"sparks-redemption:"\+suffix/);
  assert.match(appSource, /scope:"productlab-test-run:"\+suffix/);
  assert.match(appSource, /listDurableRecoveries\(project\.id\)/);
  assert.match(appSource, /restorePendingMutation\(descriptor\.scope,durableRecoveryToPendingIntent\(serverRecovery\)\)/);
  assert.match(appSource, /const \[recoveryHydrated,setRecoveryHydrated\]=useState\(false\)/);
  assert.match(appSource, /view==="sparks"&&recoveryHydrated/);
  assert.match(appSource, /view==="productlab"&&recoveryHydrated/);
  assert.match(appSource, /view==="unifi"&&recoveryHydrated/);
  assert.match(appSource, /classifyPendingMutationAge\(intent\.startedAt\)/);
  assert.match(appSource, /window\.setInterval\(durableSync,60000\)/);
  assert.match(appSource, /window\.addEventListener\(PENDING_MUTATION_EVENT,localSync\)/);
  assert.match(appSource, /aria-label="Unresolved operations"/);
  assert.match(appSource, /AUTHORITATIVE RECOVERY/);
  assert.match(appSource, /durable ledger/);
  assert.match(appSource, /SAFE RETRY/);
  assert.match(appSource, /STALE/);
  assert.match(appSource, /Review &amp; reconcile →/);
  assert.match(appSource, /request identity preserved/);
  assert.match(appSource, /openPendingRecovery\(item\)/);
  assert.match(appSource, /remain preserved in this browser session and, when durably registered, in the recovery ledger/);
  assert.doesNotMatch(appSource, /signOut\(\)[\s\S]{0,220}clearPendingMutation/);
  assert.match(cssSource, /\.mutationRecoveryItem\.stale\{/);
  assert.match(cssSource, /\.mutationRecoveryTopButton\{/);
});


test("deterministic reconciliation persists continuity before writes and finalizes durable state before cleanup", () => {
  assert.match(appSource, /registerDurableRecovery\(project\.id,requestScope,intent\)/);
  assert.match(appSource, /markPendingMutationDurable\(requestScope,\{attemptCount:durable\.attemptCount,lastAttemptAt:durable\.lastAttemptAt\}\)/);
  assert.match(appSource, /resolveDurableRecovery\(project\.id,requestScope,intent\.requestKey,"confirmed"\)/);
  assert.match(appSource, /markDurableRecoveryVerification\(project\.id,requestScope,intent\.requestKey,"confirmed_absent"\)/);
  assert.match(appSource, /resolveDurableRecovery\(project\.id,requestScope,pending\.requestKey,"superseded_after_absence"\)/);
  assert.match(sparksSource, /registerDurableRecovery\(projectId,redemptionRequestScope,intent\)/);
  assert.match(sparksSource, /markPendingMutationDurable\(redemptionRequestScope,\{attemptCount:durable\.attemptCount,lastAttemptAt:durable\.lastAttemptAt\}\)/);
  assert.match(sparksSource, /resolveDurableRecovery\(projectId,redemptionRequestScope,intent\.requestKey,"confirmed"\)/);
  assert.match(productLabSource, /registerDurableRecovery\(projectId,testRunRequestScope,intent\)/);
  assert.match(productLabSource, /markPendingMutationDurable\(testRunRequestScope,\{attemptCount:durable\.attemptCount,lastAttemptAt:durable\.lastAttemptAt\}\)/);
  assert.match(productLabSource, /resolveDurableRecovery\(projectId,testRunRequestScope,intent\.requestKey,"confirmed"\)/);
  assert.match(productLabSource, /Use Change evidence before creating different intent/);
});


test("durable recovery database contract is user scoped, invoker based, and non-destructive", () => {
  assert.match(durableRecoveryMigrationSource, /create schema if not exists recovery/);
  assert.match(durableRecoveryMigrationSource, /create table if not exists recovery\.mutation_recovery_ledger/);
  assert.match(durableRecoveryMigrationSource, /alter table recovery\.mutation_recovery_ledger enable row level security/);
  assert.match(durableRecoveryMigrationSource, /create unique index if not exists mutation_recovery_one_active_scope_uidx/);
  assert.match(durableRecoveryMigrationSource, /where resolved_at is null/);
  assert.match(durableRecoveryMigrationSource, /create policy mutation_recovery_select_own/);
  assert.match(durableRecoveryMigrationSource, /create policy mutation_recovery_insert_own/);
  assert.match(durableRecoveryMigrationSource, /create policy mutation_recovery_update_own/);
  assert.match(durableRecoveryMigrationSource, /security invoker/);
  assert.match(durableRecoveryMigrationSource, /revoke delete,truncate,references,trigger/);
  assert.doesNotMatch(durableRecoveryMigrationSource, /security definer/i);
  assert.match(durableRecoveryHardeningSource, /if exact_row\.resolved_at is not null/);
  assert.match(durableRecoveryHardeningSource, /'active',false/);
  assert.match(durableRecoveryHardeningSource, /already finalized with a different resolution/);
});

test("durable recovery client uses only governed recovery RPCs", () => {
  assert.match(durableRecoverySource, /list_mutation_recoveries_v1/);
  assert.match(durableRecoverySource, /register_mutation_recovery_v1/);
  assert.match(durableRecoverySource, /mark_mutation_recovery_verification_v1/);
  assert.match(durableRecoverySource, /resolve_mutation_recovery_v1/);
  assert.match(durableRecoverySource, /durable:true/);
  assert.doesNotMatch(durableRecoverySource, /\.from\("mutation_recovery_ledger"\)/);
});


test("recovery observability exposes read-only sanitized telemetry", () => {
  assert.match(durableRecoveryObservabilitySource, /get_mutation_recovery_diagnostics_v1/);
  assert.match(durableRecoveryObservabilitySource, /security invoker/);
  assert.match(durableRecoveryObservabilitySource, /request_suffix/);
  assert.match(durableRecoveryObservabilitySource, /attempt_count/);
  assert.match(durableRecoveryObservabilitySource, /resolved_24h/);
  assert.match(durableRecoveryObservabilitySource, /stale_total/);
  assert.match(durableRecoveryObservabilitySource, /revoke all on function public\.get_mutation_recovery_diagnostics_v1\(uuid\) from public,anon/);
  assert.doesNotMatch(durableRecoveryObservabilitySource, /'payload'/);
  assert.doesNotMatch(durableRecoveryObservabilitySource, /\b(insert|update|delete)\b/i);
});

test("recovery diagnostics UI is read-only and exposes synchronization health", () => {
  assert.match(recoveryDiagnosticsSource, /RECOVERY OBSERVABILITY/);
  assert.match(recoveryDiagnosticsSource, /Sync recovery ledger/);
  assert.match(recoveryDiagnosticsSource, /Review open recoveries/);
  assert.match(recoveryDiagnosticsSource, /Peak attempts/);
  assert.match(recoveryDiagnosticsSource, /Resolved 24h/);
  assert.match(recoveryDiagnosticsSource, /authoritative domain records still determine whether a mutation succeeded/);
  assert.doesNotMatch(recoveryDiagnosticsSource, /force|replay|mark success/i);
  assert.match(appSource, /recoveryLastSyncedAt/);
  assert.match(appSource, /recoverySyncing/);
  assert.match(appSource, /<RecoveryDiagnosticsPanel/);
  assert.match(cssSource, /\.recoveryDiagnosticMetrics\{/);
  assert.match(cssSource, /\.recoveryDiagnosticRow\{/);
});

test("pending mutation continuity carries durable attempt telemetry", () => {
  assert.match(pendingMutationSource, /attemptCount:number/);
  assert.match(pendingMutationSource, /lastAttemptAt:string\|null/);
  assert.match(pendingMutationSource, /attemptCount:0/);
  assert.match(pendingMutationSource, /markPendingMutationDurable\([\s\S]{0,500}attemptCount/);
  assert.match(durableRecoverySource, /get_mutation_recovery_diagnostics_v1/);
  assert.match(durableRecoverySource, /attemptCount:record\.attemptCount/);
  assert.match(durableRecoverySource, /lastAttemptAt:record\.lastAttemptAt/);
  assert.match(appSource, /item\.attemptCount/);
});
