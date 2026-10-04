#!/usr/bin/env node
/**
 * Pricing Autopaste Dispatcher
 * ----------------------------
 * Takes the paste-ready blocks emitted by `scripts/pricing-audit.mjs`
 * (read from a file, stdin, or regenerated on the fly) and dispatches each
 * one to the correct Lovable workspace project.
 *
 * What "autopaste" means here:
 *   - Lovable does NOT (yet) expose an API to programmatically post a chat
 *     message into another project from inside an agent run.
 *   - So this dispatcher does the next best thing:
 *       1. Parses every "📋 Paste into <Spoke> chat:" block.
 *       2. Resolves <Spoke> → workspace project (ID + chat URL) via the
 *          SPOKES map below.
 *       3. Writes each block to /mnt/documents/autopaste/<spoke>.md so it
 *          survives across runs.
 *       4. Pipes the block into the system clipboard (pbcopy / xclip /
 *          wl-copy / clip.exe — whichever is available) one spoke at a
 *          time, gated on <Enter> so you can paste between hops.
 *       5. Prints the project chat URL for each spoke — open it, hit
 *          Cmd/Ctrl-V, Enter. Done.
 *
 * Usage:
 *   node scripts/pricing-audit.mjs                       # regenerate diffs
 *   node scripts/pricing-autopaste.mjs                   # dispatch all
 *   node scripts/pricing-autopaste.mjs --spoke epublisher
 *   node scripts/pricing-autopaste.mjs --no-clipboard    # just write files + URLs
 *   node scripts/pricing-autopaste.mjs --input -         # read blocks from stdin
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Workspace map — resolved via cross_project--search_project on 2026-05-29.
// Update IDs here if a project is renamed or duplicated.
// ---------------------------------------------------------------------------
const SPOKES = {
  "Creative Studio": {
    slug: "creative_studio",
    projectId: "97b94bfd-a5ce-4eb4-90e1-d66ef91222a9", // this project (self)
    chatUrl: "https://lovable.dev/projects/97b94bfd-a5ce-4eb4-90e1-d66ef91222a9",
    targetFile: "src/pages/Pricing.tsx",
    self: true, // skip dispatch — applied directly by this agent
  },
  "ePublisher": {
    slug: "epublisher",
    projectId: "d4f4cc50-72ca-429a-9d4e-e37bdc204cce",
    chatUrl: "https://lovable.dev/projects/d4f4cc50-72ca-429a-9d4e-e37bdc204cce",
    targetFile: "src/pages/Pricing.tsx",
    status: "exists",
  },
  "SyncVision": {
    slug: "syncvision",
    projectId: "e28ed45f-715e-4508-81b6-709b85412722",
    chatUrl: "https://lovable.dev/projects/e28ed45f-715e-4508-81b6-709b85412722",
    targetFile: "src/pages/Pricing.tsx",
    status: "needs-create", // verified missing on 2026-05-29
  },
  "YouTube Optimizer": {
    slug: "youtube_optimizer",
    projectId: "f4621346-e76e-4337-9a7d-c89f3ab2dcda",
    chatUrl: "https://lovable.dev/projects/f4621346-e76e-4337-9a7d-c89f3ab2dcda",
    targetFile: "src/pages/Pricing.tsx",
    status: "exists",
  },
};

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const onlySlug = argVal("--spoke");
const noClipboard = flag("--no-clipboard");
const inputPath = argVal("--input") ?? resolve(ROOT, "docs/pricing/spoke-diffs.md");

// ---------------------------------------------------------------------------
// Source: read blocks from file or stdin
// ---------------------------------------------------------------------------
async function readInput() {
  if (inputPath === "-") {
    return await new Promise((resolveP) => {
      let buf = "";
      process.stdin.on("data", (c) => (buf += c));
      process.stdin.on("end", () => resolveP(buf));
    });
  }
  if (!existsSync(inputPath)) {
    console.error(`No input at ${inputPath}. Run \`node scripts/pricing-audit.mjs\` first.`);
    process.exit(2);
  }
  return readFileSync(inputPath, "utf8");
}

// ---------------------------------------------------------------------------
// Parser: split on the "📋 Paste into <Spoke> chat:" header
// ---------------------------------------------------------------------------
function parseBlocks(raw) {
  const HEADER = /^📋 Paste into (.+?) chat:\s*$/m;
  const blocks = [];
  const parts = raw.split(/^---\s*$/m);
  for (const part of parts) {
    const m = part.match(HEADER);
    if (!m) continue;
    blocks.push({ spokeName: m[1].trim(), body: part.trim() });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Clipboard — try the first tool that exists
// ---------------------------------------------------------------------------
function copyToClipboard(text) {
  const candidates = [
    ["pbcopy", []],
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
    ["clip.exe", []],
  ];
  for (const [cmd, cmdArgs] of candidates) {
    const probe = spawnSync("which", [cmd], { stdio: "ignore" });
    if (probe.status !== 0) continue;
    const r = spawnSync(cmd, cmdArgs, { input: text });
    if (r.status === 0) return cmd;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------
function prompt(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const raw = await readInput();
const blocks = parseBlocks(raw);

if (!blocks.length) {
  console.error("No '📋 Paste into <Spoke> chat:' blocks found in input.");
  process.exit(2);
}

const outDir = resolve("/mnt/documents/autopaste");
mkdirSync(outDir, { recursive: true });

const dispatch = [];
for (const b of blocks) {
  const spoke = SPOKES[b.spokeName];
  if (!spoke) {
    console.warn(`⚠  Unknown spoke "${b.spokeName}" — add it to SPOKES map. Skipping.`);
    continue;
  }
  if (onlySlug && spoke.slug !== onlySlug) continue;
  dispatch.push({ ...spoke, name: b.spokeName, body: b.body });
}

if (!dispatch.length) {
  console.error("No matching spokes after filtering.");
  process.exit(2);
}

console.log(`\nDispatching ${dispatch.length} block(s)…\n`);

const interactive = process.stdin.isTTY && !noClipboard;

for (let i = 0; i < dispatch.length; i++) {
  const d = dispatch[i];
  const file = resolve(outDir, `${d.slug}.md`);
  writeFileSync(file, d.body);

  const tag = d.self
    ? "[self — apply directly in this project]"
    : d.status === "needs-create"
      ? "[needs-create — Pricing.tsx missing]"
      : "[ready]";

  console.log(`${i + 1}/${dispatch.length}  ${d.name}  ${tag}`);
  console.log(`        file:  ${file}`);
  console.log(`        chat:  ${d.chatUrl}`);
  console.log(`        target: ${d.targetFile}`);

  if (d.self) {
    console.log(`        ↳ this is the Creative Studio project — apply locally, no paste needed.\n`);
    continue;
  }

  if (interactive) {
    const tool = copyToClipboard(d.body);
    if (tool) {
      console.log(`        ✓ copied to clipboard via ${tool}`);
      if (i < dispatch.length - 1) {
        await prompt(`        → open chat URL, paste, then press <Enter> for next spoke… `);
      } else {
        console.log(`        → open chat URL and paste. Done.\n`);
      }
    } else {
      console.log(`        (no clipboard tool found — paste from the file above)\n`);
    }
  } else {
    console.log(`        (non-interactive — paste contents of file above into chat URL)\n`);
  }
}

console.log(`\nAll blocks written to ${outDir}.`);
console.log(`Re-run with --spoke <slug> to dispatch a single spoke.`);
