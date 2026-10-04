import { readFileSync } from "node:fs";

const source = readFileSync("src/pages/Index.tsx", "utf8");
const required = [
  "illustrative_demo",
  "Example velocity",
  "Example score",
  "9.2/10",
  "Illustrative example — not your channel results.",
  "Example feed",
];

const missing = required.filter((text) => !source.includes(text));
const banned = [
  "scanning_channel...",
  ">Velocity</p>",
  ">Resonance</p>",
  ">Live feed</span>",
];
const stale = banned.filter((text) => source.includes(text));

if (missing.length || stale.length) {
  console.error("Public metric-label verification failed.");
  for (const item of missing) console.error("Missing:", item);
  for (const item of stale) console.error("Stale:", item);
  process.exit(1);
}

console.log("✓ Hero demo metrics are clearly labeled illustrative.");
