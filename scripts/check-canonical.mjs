// Build-time canonical / og:url check.
//
// Guarantees that every public page template ships a correct, self-referencing
// <link rel="canonical"> + og:url, and that hub attribution to
// https://reson8.life is present everywhere.
//
// Model (deliberate):
//  - Spoke pages canonicalise to https://youtubeoptimizer.life<path> (a page
//    must canonicalise to itself, otherwise Google drops it from the index and
//    the spoke loses all its own traffic).
//  - Hub authority is expressed on every page via the hub Organization,
//    isPartOf/publisher and og:see_also — that's what points searches at
//    reson8.life.
//  - Legacy/moved routes (HubRedirect) canonicalise straight to reson8.life,
//    since those URLs really are the hub's.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

export const SPOKE_ORIGIN = "https://youtubeoptimizer.life";
export const HUB_ORIGIN = "https://reson8.life";

// Public page templates that MUST render <SEO ... path="..."> and the route
// path each is mounted at in src/App.tsx.
export const PUBLIC_PAGES = {
  "src/pages/Index.tsx": "/",
  "src/pages/Features.tsx": "/features",
  "src/pages/Pricing.tsx": "/pricing",
  "src/pages/About.tsx": "/about",
  "src/pages/Contact.tsx": "/contact",
  "src/pages/Privacy.tsx": "/privacy",
  "src/pages/Terms.tsx": "/terms",
  "src/pages/Login.tsx": "/login",
};

// Pages exempt from the self-canonical rule.
//  - NotFound / Admin*: non-indexable surfaces.
const EXEMPT_PAGES = new Set([
  "src/pages/NotFound.tsx",
  "src/pages/Admin.tsx",
  "src/pages/AdminLogin.tsx",
]);

function read(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function runCanonicalCheck() {
  const errors = [];

  // ---- 1. SEO.tsx emits a self-referencing canonical + og:url ------------
  const seo = read("src/components/SEO.tsx");
  if (!seo) {
    errors.push("src/components/SEO.tsx is missing — no page can emit a canonical.");
  } else {
    if (!seo.includes(`const SITE = "${SPOKE_ORIGIN}"`)) {
      errors.push(`src/components/SEO.tsx: SITE must be "${SPOKE_ORIGIN}".`);
    }
    if (!/const url = `\$\{SITE\}\$\{path\}`/.test(seo)) {
      errors.push("src/components/SEO.tsx: canonical URL must be built as `${SITE}${path}`.");
    }
    if (!/<link rel="canonical" href=\{url\} \/>/.test(seo)) {
      errors.push('src/components/SEO.tsx: missing <link rel="canonical" href={url} />.');
    }
    if (!/<meta property="og:url" content=\{url\} \/>/.test(seo)) {
      errors.push('src/components/SEO.tsx: missing <meta property="og:url" content={url} />.');
    }
    // Hub attribution must survive refactors.
    for (const [label, re] of [
      ["hub Organization @id", /HUB_ORG_ID = `\$\{HUB_URL\}\/#organization`/],
      ["og:see_also → hub", /<meta property="og:see_also" content=\{HUB_URL\} \/>/],
      ["isPartOf → hub org", /isPartOf: \{ "@id": HUB_ORG_ID \}/],
      ["publisher → hub org", /publisher: \{ "@id": HUB_ORG_ID \}/],
    ]) {
      if (!re.test(seo)) errors.push(`src/components/SEO.tsx: missing ${label}.`);
    }
  }

  // ---- 2. Every public page renders <SEO> with its own route path --------
  for (const [file, expectedPath] of Object.entries(PUBLIC_PAGES)) {
    const src = read(file);
    if (!src) {
      errors.push(`${file}: expected public page is missing.`);
      continue;
    }
    if (!/<SEO\b/.test(src)) {
      errors.push(`${file}: does not render <SEO> — page would have no canonical/og:url.`);
      continue;
    }
    const m = src.match(/path=\{?["']([^"']+)["']\}?/);
    if (!m) {
      errors.push(`${file}: <SEO> is missing a literal path="…" prop.`);
    } else if (m[1] !== expectedPath) {
      errors.push(
        `${file}: <SEO path="${m[1]}"> does not self-reference its route "${expectedPath}" — canonical and og:url would point at the wrong page.`
      );
    }
    // A hardcoded canonical/og:url inside a page bypasses SEO.tsx.
    if (/rel=["']canonical["']/.test(src) || /property=["']og:url["']/.test(src)) {
      errors.push(`${file}: hardcodes canonical/og:url — use the <SEO> component instead.`);
    }
  }

  // ---- 3. No unregistered public page slips through ----------------------
  const pagesDir = join(ROOT, "src/pages");
  if (existsSync(pagesDir)) {
    for (const f of readdirSync(pagesDir)) {
      if (!f.endsWith(".tsx")) continue;
      const rel = `src/pages/${f}`;
      if (rel in PUBLIC_PAGES || EXEMPT_PAGES.has(rel)) continue;
      errors.push(
        `${rel}: new page is not registered in PUBLIC_PAGES (scripts/check-canonical.mjs) — add it or mark it exempt.`
      );
    }
  }

  // ---- 4. Legacy/moved routes 301 to the hub ------------------------------
  // TanStack Start: the catch-all route issues real HTTP 301s via
  // resolveHubRedirect (replaces the old prerendered HubRedirect pages).
  const catchAll = read("src/routes/$.tsx");
  if (!catchAll) {
    errors.push("src/routes/$.tsx is missing — legacy hub paths would 404 instead of 301.");
  } else {
    if (!catchAll.includes("resolveHubRedirect")) {
      errors.push("src/routes/$.tsx: must resolve legacy paths via resolveHubRedirect.");
    }
    if (!/statusCode:\s*301/.test(catchAll)) {
      errors.push("src/routes/$.tsx: hub redirects must be permanent (statusCode: 301).");
    }
  }
  const lib = read("src/lib/hub-redirects.ts");
  if (lib && !lib.includes("HUB_URL")) {
    errors.push("src/lib/hub-redirects.ts: redirect targets must resolve against the hub origin.");
  }

  // ---- 5. Root route holds sitewide defaults ONLY -------------------------
  // Page-specific tags in __root.tsx are emitted before the leaf <SEO> copy,
  // so crawlers read the root value on every page. They must live on leaves.
  const rootRoute = read("src/routes/__root.tsx");
  if (!rootRoute) {
    errors.push("src/routes/__root.tsx is missing.");
  } else {
    const forbidden = [
      [/property:\s*"og:url"/, "og:url"],
      [/\{\s*title:\s*"/, "title"],
      [/name:\s*"description"/, "description"],
      [/property:\s*"og:title"/, "og:title"],
      [/property:\s*"og:description"/, "og:description"],
      [/name:\s*"twitter:title"/, "twitter:title"],
      [/name:\s*"twitter:description"/, "twitter:description"],
    ];
    for (const [re, name] of forbidden) {
      if (re.test(rootRoute)) {
        errors.push(
          `src/routes/__root.tsx: must not set page-specific "${name}" — it overrides every leaf route's <SEO> tag for crawlers.`
        );
      }
    }
    if (!rootRoute.includes(HUB_ORIGIN)) {
      errors.push(`src/routes/__root.tsx: must reference ${HUB_ORIGIN} (hub Organization / attribution).`);
    }
  }


  // ---- 6. sitemap.xml lists spoke-owned pages only -----------------------
  // Hub-owned surfaces (pricing/checkout/credits/docs/updates/support) belong
  // to reson8.life and must NOT be advertised from the spoke sitemap.
  const HUB_OWNED_PATHS = new Set(["/pricing"]);
  const sitemap = read("public/sitemap.xml");
  if (sitemap) {
    for (const path of Object.values(PUBLIC_PAGES)) {
      if (path === "/login") continue; // intentionally not in the sitemap
      const loc = `${SPOKE_ORIGIN}${path}`;
      const listed = sitemap.includes(`<loc>${loc}</loc>`);
      if (HUB_OWNED_PATHS.has(path)) {
        if (listed) {
          errors.push(
            `public/sitemap.xml: ${loc} is hub-owned — remove it and let ${HUB_ORIGIN}${path} carry the query.`
          );
        }
        continue;
      }
      if (!listed) {
        errors.push(`public/sitemap.xml: missing <loc>${loc}</loc>.`);
      }
    }
    if (!sitemap.includes(HUB_ORIGIN)) {
      errors.push(`public/sitemap.xml: must reference the hub sitemap on ${HUB_ORIGIN}.`);
    }
    for (const legacy of ["/upgrade", "/credits", "/checkout", "/docs", "/updates", "/support"]) {
      if (sitemap.includes(`<loc>${SPOKE_ORIGIN}${legacy}</loc>`)) {
        errors.push(`public/sitemap.xml: legacy hub path ${legacy} must not be indexable on the spoke.`);
      }
    }
  }

  return errors;
}

// Allow `node scripts/check-canonical.mjs`
if (process.argv[1] && process.argv[1].endsWith("check-canonical.mjs")) {
  const errors = runCanonicalCheck();
  if (errors.length) {
    console.error("Canonical check failed:\n" + errors.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
  console.log("Canonical check passed.");
}
