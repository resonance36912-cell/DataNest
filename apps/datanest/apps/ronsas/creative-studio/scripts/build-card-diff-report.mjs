#!/usr/bin/env node
/**
 * Build a self-contained HTML diff report for failed provider-card visual tests.
 *
 * Playwright writes `<snapshot>-expected.png`, `-actual.png` and `-diff.png`
 * into `test-results/<test-dir>/` for every failed `toHaveScreenshot`. This
 * script collects those triplets, groups them by provider / route / browser
 * and inlines them (base64) into ONE portable HTML file — so the report can be
 * uploaded as a CI artifact or opened straight from disk with no server.
 *
 * Usage:
 *   node scripts/build-card-diff-report.mjs [--results test-results]
 *                                           [--out test-results/card-diff-report.html]
 *                                           [--copy /mnt/documents/card-diff-report.html]
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const RESULTS_DIR = arg("results", "test-results");
const OUT = arg("out", join(RESULTS_DIR, "card-diff-report.html"));
const COPY_TO = arg("copy", "");

const PROVIDER_LABELS = {
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  pinterest: "Pinterest",
  google: "Google / Gmail",
  teams: "Microsoft Teams",
  imessage: "iMessage",
};

const ROUTE_LABELS = { home: "/", pricing: "/pricing" };

/** Recursively list files under a directory. */
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Guess the browser engine from the Playwright result directory name. */
function browserOf(dirPath) {
  const name = basename(dirPath);
  for (const engine of ["chromium", "firefox", "webkit"]) {
    if (name.endsWith(`-${engine}`) || name.includes(`-${engine}-`)) return engine;
  }
  return "unknown";
}

function inline(file) {
  if (!file || !existsSync(file)) return null;
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

function dims(file) {
  // Minimal PNG IHDR read: width/height are big-endian uint32 at bytes 16..24.
  try {
    const buf = readFileSync(file);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function collect() {
  const files = walk(RESULTS_DIR).filter((f) => f.endsWith("-actual.png"));
  return files
    .map((actual) => {
      const dir = dirname(actual);
      const stem = basename(actual).replace(/-actual\.png$/, "");
      const expected = join(dir, `${stem}-expected.png`);
      const diff = join(dir, `${stem}-diff.png`);
      const [providerId, routeId = "home"] = stem.split("-");
      const errorContext = join(dir, "error-context.md");
      return {
        stem,
        dir,
        provider: PROVIDER_LABELS[providerId] || providerId,
        providerId,
        route: ROUTE_LABELS[routeId] || `/${routeId}`,
        browser: browserOf(dir),
        actual: inline(actual),
        expected: inline(expected),
        diff: inline(diff),
        actualDims: dims(actual),
        expectedDims: existsSync(expected) ? dims(expected) : null,
        note: existsSync(errorContext)
          ? readFileSync(errorContext, "utf8").slice(0, 600)
          : "",
      };
    })
    .sort((a, b) =>
      `${a.provider}${a.route}${a.browser}`.localeCompare(`${b.provider}${b.route}${b.browser}`),
    );
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function pane(label, src, meta, kind) {
  if (!src) {
    return `<figure class="pane missing"><figcaption>${esc(label)}</figcaption><div class="empty">no ${esc(label.toLowerCase())} image</div></figure>`;
  }
  return `<figure class="pane ${kind}">
      <figcaption>${esc(label)}${meta ? ` <span class="dims">${meta.w}×${meta.h}</span>` : ""}</figcaption>
      <img src="${src}" alt="${esc(label)} thumbnail/title region" loading="lazy" />
    </figure>`;
}

function render(items) {
  const failures = items.length;
  const engines = [...new Set(items.map((i) => i.browser))].sort();
  const cards = items
    .map(
      (i, idx) => `
  <section class="case" data-browser="${esc(i.browser)}" id="case-${idx}">
    <header>
      <h2>${esc(i.provider)}</h2>
      <div class="tags">
        <span class="tag route">${esc(i.route)}</span>
        <span class="tag engine">${esc(i.browser)}</span>
        <span class="tag size">size ${i.expectedDims?.w ?? "?"}×${i.expectedDims?.h ?? "?"} → ${i.actualDims?.w ?? "?"}×${i.actualDims?.h ?? "?"}</span>
      </div>
    </header>
    <div class="panes">
      ${pane("Expected", i.expected, i.expectedDims, "expected")}
      ${pane("Actual", i.actual, i.actualDims, "actual")}
      ${pane("Diff", i.diff, null, "diff")}
    </div>
    <details><summary>Snapshot &amp; context</summary><pre>${esc(i.stem)}.png
${esc(i.note || "no error context recorded")}</pre></details>
  </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Provider card visual diff report</title>
<style>
  :root {
    --bg: hsl(222 47% 6%);
    --surface: hsl(222 40% 10%);
    --line: hsl(265 40% 24%);
    --text: hsl(0 0% 96%);
    --muted: hsl(0 0% 66%);
    --magenta: hsl(295 90% 60%);
    --violet: hsl(265 85% 65%);
    --pink: hsl(325 90% 65%);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font-family: Manrope, ui-sans-serif, system-ui, sans-serif; padding: 32px; }
  h1, h2 { font-family: Sora, ui-sans-serif, system-ui, sans-serif; margin: 0; }
  header.top { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 28px; }
  .brand { background: linear-gradient(135deg, var(--violet), var(--magenta), var(--pink));
    -webkit-background-clip: text; background-clip: text; color: transparent; font-size: 28px; }
  .sub { color: var(--muted); margin-top: 8px; font-size: 14px; }
  .filters { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
  .filters button { background: var(--surface); color: var(--text); border: 1px solid var(--line);
    border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
  .filters button[aria-pressed="true"] { border-color: var(--magenta); color: var(--magenta); }
  .case { background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
    padding: 20px; margin-bottom: 20px; }
  .case > header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .case h2 { font-size: 18px; }
  .tags { display: flex; gap: 8px; flex-wrap: wrap; }
  .tag { font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .tag.engine { color: var(--violet); border-color: var(--violet); }
  .tag.warn { color: var(--pink); border-color: var(--pink); }
  .panes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .pane { margin: 0; }
  figcaption { font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
    color: var(--muted); margin-bottom: 8px; display: flex; gap: 8px; align-items: baseline; }
  .dims { color: var(--violet); letter-spacing: 0; text-transform: none; }
  .pane img { width: 100%; height: auto; display: block; border-radius: 10px;
    border: 1px solid var(--line); background: #fff; }
  .pane.diff img { border-color: var(--pink); }
  .empty { border: 1px dashed var(--line); border-radius: 10px; padding: 28px 12px;
    text-align: center; color: var(--muted); font-size: 13px; }
  details { margin-top: 14px; }
  summary { cursor: pointer; color: var(--muted); font-size: 13px; }
  pre { white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,.35);
    border: 1px solid var(--line); border-radius: 10px; padding: 12px; font-size: 12px; color: var(--muted); }
  .pass { text-align: center; padding: 60px 20px; color: var(--muted); }
</style>
</head>
<body>
  <header class="top">
    <h1 class="brand">Provider card visual diff report</h1>
    <p class="sub">${failures} failing snapshot${failures === 1 ? "" : "s"}${
      engines.length ? ` · ${engines.join(", ")}` : ""
    } · generated ${new Date().toISOString()}</p>
    ${
      failures
        ? `<div class="filters" id="filters">
      <button data-engine="all" aria-pressed="true">All engines</button>
      ${engines.map((e) => `<button data-engine="${esc(e)}" aria-pressed="false">${esc(e)}</button>`).join("")}
    </div>`
        : ""
    }
  </header>
  ${
    failures
      ? cards
      : `<div class="pass">No failed screenshot comparisons found in <code>${esc(RESULTS_DIR)}</code> — every provider card matched its baseline.</div>`
  }
  <script>
    const filters = document.getElementById("filters");
    if (filters) {
      filters.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const engine = btn.dataset.engine;
        for (const b of filters.querySelectorAll("button"))
          b.setAttribute("aria-pressed", String(b === btn));
        for (const c of document.querySelectorAll(".case"))
          c.style.display = engine === "all" || c.dataset.browser === engine ? "" : "none";
      });
    }
  </script>
</body>
</html>`;
}

const items = collect();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, render(items), "utf8");
console.log(`Wrote ${OUT} (${items.length} failing snapshot${items.length === 1 ? "" : "s"})`);

if (COPY_TO) {
  mkdirSync(dirname(COPY_TO), { recursive: true });
  copyFileSync(OUT, COPY_TO);
  console.log(`Copied to ${COPY_TO}`);
}
