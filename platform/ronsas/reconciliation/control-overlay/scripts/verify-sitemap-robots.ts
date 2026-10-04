#!/usr/bin/env bun
/**
 * Verify sitemap.xml and robots.txt expose the governed RONSAS Hub routes and
 * the pricing paths that back each canonical pricing anchor.
 *
 * Fetches from BASE_URL (default http://localhost:8080). Exits non-zero on
 * any missing entry so CI fails loudly.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

// Hub pricing routes (each redirects to /pricing#<anchor>). One per paid app
// EXCEPT `all_access`, which is a bundle SKU without its own pricing route.
const HUB_PRICING_PATHS = [
  "/pricing",
  "/epublisher/pricing",
  "/creative-studio/pricing",
  "/sync-vision/pricing",
  "/youtube-optimizer/pricing",
];

// Public deep-link routes MUST redirect to the canonical pricing hash.
// Hash fragments are client-side state and are not required to appear in raw SSR HTML.
const PRICING_REDIRECTS = [
  { path: "/epublisher/pricing", location: "/pricing#epublisher" },
  { path: "/creative-studio/pricing", location: "/pricing#creative-studio" },
  { path: "/sync-vision/pricing", location: "/pricing#sync-vision" },
  { path: "/youtube-optimizer/pricing", location: "/pricing#youtube-optimizer" },
] as const;

type Failure = { file: string; missing: string };
const failures: Failure[] = [];

async function fetchText(path: string): Promise<string> {
  const res = await fetch(new URL(path, BASE).toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

// ---- robots.txt --------------------------------------------------------
console.log("robots.txt:");
const robots = await fetchText("/robots.txt");
if (!/^User-agent:\s*\*/m.test(robots)) {
  failures.push({ file: "robots.txt", missing: "User-agent: * block" });
}
if (!/^Allow:\s*\//m.test(robots) || /^Disallow:\s*\/\s*$/m.test(robots)) {
  failures.push({ file: "robots.txt", missing: "Allow: / (or accidentally disallows all)" });
}
if (!/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/i.test(robots)) {
  failures.push({ file: "robots.txt", missing: "Sitemap: ...sitemap.xml directive" });
}
console.log(failures.length === 0 ? "  ✓ passes core checks" : "  ✗ see failures below");

// ---- sitemap.xml -------------------------------------------------------
console.log("\nsitemap.xml:");
const sitemap = await fetchText("/sitemap.xml");
const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());

function has(needle: string): boolean {
  return locs.some((l) => l.endsWith(needle) || l === needle);
}

// Hub pricing paths must appear as absolute URLs ending with the path.
for (const path of HUB_PRICING_PATHS) {
  if (has(path)) {
    console.log(`  ✓ ${path}`);
  } else {
    console.log(`  ✗ missing hub path: ${path}`);
    failures.push({ file: "sitemap.xml", missing: `hub path ${path}` });
  }
}

// ---- pricing deep-link redirects ---------------------------------------
console.log("\npricing deep-link redirects:");
for (const expected of PRICING_REDIRECTS) {
  const res = await fetch(new URL(expected.path, BASE).toString(), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const location = res.headers.get("location") ?? "";
  const resolved = new URL(location || expected.path, BASE);
  const actualTarget = `${resolved.pathname}${resolved.hash}`;
  const redirectStatus = [301, 302, 303, 307, 308].includes(res.status);

  if (redirectStatus && actualTarget === expected.location) {
    console.log(`  ✓ ${expected.path} → ${expected.location}`);
  } else {
    console.log(
      `  ✗ ${expected.path}: expected redirect to ${expected.location}; got HTTP ${res.status} → ${actualTarget}`,
    );
    failures.push({
      file: expected.path,
      missing: `redirect to ${expected.location}`,
    });
  }
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f.file}: ${f.missing}`);
  process.exit(1);
}
console.log(`OK — sitemap, robots.txt, and pricing deep links all valid (base: ${BASE})`);
