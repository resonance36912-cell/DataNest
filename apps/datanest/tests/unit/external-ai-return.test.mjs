import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("clipboard candidate keeps only a new external AI response", async () => {
  let mod = null;
  try {
    mod = await import("../../src/lib/externalAiClipboard.ts");
  } catch {
    mod = null;
  }

  assert.equal(
    typeof mod?.selectExternalAiClipboardCandidate,
    "function",
    "expected selectExternalAiClipboardCandidate to exist"
  );

  const select = mod.selectExternalAiClipboardCandidate;
  const handoff = "RESONANCE DATANEST — LIVE EXTERNAL AI HANDOFF\n[DATANEST TRACKING HEADER]";

  assert.equal(
    select({
      clipboardText: "Completed external AI result",
      currentResponse: "",
      blockedTexts: [handoff]
    }),
    "Completed external AI result"
  );
  assert.equal(select({ clipboardText: "   ", currentResponse: "", blockedTexts: [] }), null);
  assert.equal(select({ clipboardText: handoff, currentResponse: "", blockedTexts: [handoff] }), null);
  assert.equal(
    select({
      clipboardText: "Completed external AI result",
      currentResponse: "Completed external AI result",
      blockedTexts: []
    }),
    null
  );
});

test("Return to DataNest is an always-visible dock footer, not a scrolling-body child", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );

  assert.match(
    source,
    /className="externalAiReturnDock externalAiImport"/,
    "expected a dedicated Return to DataNest dock footer"
  );
  assert.doesNotMatch(
    source,
    /\{sessionId&&<form className="externalAiReturnDock externalAiImport"/,
    "Return to DataNest must render even before a session is opened"
  );
  assert.match(
    source,
    /<\/div>\s*\n\s*<form className="externalAiReturnDock externalAiImport"/,
    "Return to DataNest must sit after the scrolling AI dock body"
  );
});

test("clipboard capture auto-fills on return without importing automatically", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );

  assert.match(source, /window\.addEventListener\("focus"/, "expected clipboard capture when DataNest regains focus");
  assert.match(source, /Paste from clipboard/, "expected a manual clipboard fallback");
  assert.doesNotMatch(source, /Paste \+ import to DataNest/, "clipboard capture must not import automatically");
});


test("clipboard auto-capture requires both permission and session opt-in", async () => {
  const mod = await import("../../src/lib/externalAiClipboard.ts");
  assert.equal(
    typeof mod.shouldAttemptClipboardAutoCapture,
    "function",
    "expected shouldAttemptClipboardAutoCapture to exist"
  );
  assert.equal(mod.shouldAttemptClipboardAutoCapture("granted", false), false);
  assert.equal(mod.shouldAttemptClipboardAutoCapture("granted", true), true);
  assert.equal(mod.shouldAttemptClipboardAutoCapture("prompt", true), false);
  assert.equal(mod.shouldAttemptClipboardAutoCapture("denied", true), false);
  assert.equal(mod.shouldAttemptClipboardAutoCapture("unsupported", true), false);
});

test("companion placement preserves the DataNest dock on a maximized desktop", async () => {
  let mod = null;
  try {
    mod = await import("../../src/lib/externalAiWindow.ts");
  } catch {
    mod = null;
  }

  assert.equal(
    typeof mod?.calculateCompanionPlacement,
    "function",
    "expected calculateCompanionPlacement to exist"
  );

  const placement = mod.calculateCompanionPlacement({
    screenLeft: 0,
    screenTop: 0,
    screenWidth: 1920,
    screenHeight: 1080,
    browserLeft: 0,
    browserTop: 0,
    browserWidth: 1920,
    browserHeight: 1000,
    dockWidth: 500,
    preferredWidth: 500
  });

  assert.equal(
    placement.left + placement.width,
    1920,
    "maximized desktop companion should dock to the right edge"
  );
  assert.ok(
    placement.reserveRight >= placement.width,
    "DataNest must reserve the companion footprint so the dock stays visible"
  );
});

test("companion rail is reserved only when the browser honors docked popup geometry", async () => {
  const { companionReserveForActualWindow } = await import("../../src/lib/externalAiWindow.ts");
  const desired = { left: 1420, top: 0, width: 500, height: 1000, reserveRight: 508 };

  assert.equal(
    companionReserveForActualWindow(desired, { left: 1422, top: 0, width: 498, height: 1000 }),
    508,
    "a popup that actually docks at the requested right edge should reserve the rail"
  );
  assert.equal(
    companionReserveForActualWindow(desired, { left: 0, top: 0, width: 1920, height: 1000 }),
    0,
    "a browser tab or ignored popup placement must not leave a blank reserved rail"
  );
});

test("companion placement uses free screen space to the right when available", async () => {
  const { calculateCompanionPlacement } = await import("../../src/lib/externalAiWindow.ts");
  const placement = calculateCompanionPlacement({
    screenLeft: 0,
    screenTop: 0,
    screenWidth: 1920,
    screenHeight: 1080,
    browserLeft: 0,
    browserTop: 20,
    browserWidth: 1180,
    browserHeight: 980,
    dockWidth: 500,
    preferredWidth: 500
  });

  assert.ok(placement.left >= 1188, "companion should sit outside DataNest when right-side screen space is available");
  assert.ok(placement.left + placement.width <= 1920, "companion must remain on-screen");
  assert.equal(placement.reserveRight, 0, "unused screen space should not reserve DataNest layout width");
});

test("Return to DataNest keeps manual fallback while reusing granted permission for session auto-return", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );

  assert.match(source, /Paste from clipboard/, "expected manual paste fallback");
  assert.match(source, /Enable session auto-return/, "expected explicit first-time auto-return control");
  assert.match(source, /Turn off auto-return/, "expected an explicit auto-return off control");
  assert.match(source, /Open companion \+ auto-return/, "expected one-click relaunch when clipboard permission already exists");
  assert.match(source, /pendingAutoReturnSession/, "expected auto-return to bind to one tracked session only");
  assert.match(source, /navigator\.permissions/, "expected clipboard permission state detection");
  assert.match(source, /Import to DataNest/, "captured responses must still require explicit governed import");
  assert.match(
    source,
    /shouldAttemptClipboardAutoCapture\(clipboardAccess,autoCaptureEnabled\)/,
    "focus capture must require both granted clipboard access and session auto-return consent"
  );
});


test("external AI return uses governed staging intake rather than legacy job_inputs import", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.match(source, /functions\.invoke\("datanest-ai-intake"/);
  assert.doesNotMatch(source, /rpc\("import_external_ai_response"/);
  assert.match(source, /datanest:external-ai-staged/);
});

test("handoff no longer describes imported output as R&D contribution", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.doesNotMatch(source, /external-AI R&D input/);
});


test("automatic clipboard capture preserves a response being reviewed or edited", async () => {
  const { selectExternalAiClipboardCandidate: select } = await import("../../src/lib/externalAiClipboard.ts");
  assert.equal(select({ clipboardText: "Unrelated newly copied text", currentResponse: "Reviewed response with my edits" }), null);
  assert.equal(select({ clipboardText: "New response", currentResponse: "   " }), "New response");
});

test("explicit paste may replace a draft but still rejects copied handoff instructions", async () => {
  const { selectExternalAiClipboardCandidate: select } = await import("../../src/lib/externalAiClipboard.ts");
  assert.equal(select({ clipboardText: "Replacement response", currentResponse: "Existing draft", allowReplace: true }), "Replacement response");
  assert.equal(select({ clipboardText: "RESONANCE DATANEST — LIVE EXTERNAL AI HANDOFF\n[DATANEST TRACKING HEADER]", currentResponse: "Existing draft", allowReplace: true }), null);
});

test("ChatGPT companion keeps the tracked handoff out of the provider URL", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.doesNotMatch(source, /searchParams\.set\("q",promptText\)/);
  assert.match(source, /providerLaunchUrl\(trackedHandoff\)/);
  assert.match(source, /openCompanionShell\(\)/);
  assert.match(source, /popup\.resizeTo\(placement\.width,placement\.height\)/);
  assert.match(source, /popup\.moveTo\(placement\.left,placement\.top\)/);
  assert.doesNotMatch(source, /"User: "\+currentUserEmail/);
  assert.match(source, /User identity: intentionally omitted from external handoff/);
});

test("external AI sidebar exposes keyboard width controls", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.match(source, /aria-label="Narrow AI sidebar"/);
  assert.match(source, /aria-label="Widen AI sidebar"/);
});


test("companion popup close clears the reserved DataNest rail", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.match(source, /window\.setInterval\(\(\)=>\{/);
  assert.match(source, /if\(popup\.closed\)\{/);
  assert.match(source, /clearCompanionTracking\(\)/);
});

test("DataNest app reserves and clears the companion rail", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/DataNestApp.tsx"),
    "utf8"
  );
  assert.match(source, /companionRailReserved/);
  assert.match(source, /onCompanionReserve=\{setCompanionReserve\}/);
  assert.match(source, /setCompanionReserve\(0\)/);
});


test("automatic clipboard capture requires the tracked trace binding", async () => {
  const { selectExternalAiClipboardCandidate: select } = await import("../../src/lib/externalAiClipboard.ts");
  assert.equal(
    select({ clipboardText: "trace-demo-1234\nBound result", currentResponse: "", traceBinding: "trace-demo-1234" }),
    "trace-demo-1234\nBound result"
  );
  assert.equal(
    select({ clipboardText: "Unrelated copied text", currentResponse: "", traceBinding: "trace-demo-1234" }),
    null
  );
  assert.equal(
    select({ clipboardText: "Manual replacement", currentResponse: "Existing draft", allowReplace: true, traceBinding: "trace-demo-1234" }),
    "Manual replacement"
  );
});
