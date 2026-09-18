/**
 * Browser-side re-run of the build validators that CAN be verified from a
 * deployed origin: sitemap/robots availability and canonical/hreflang shape.
 *
 * The full node validators (scripts/check-*.ts) still run at build time and
 * remain authoritative. This module exists so the ops runbook page can offer
 * a one-click "verify the live deploy" pass and tick the matching checklist
 * boxes automatically when everything is green.
 *
 * Everything is fetched same-origin (relative paths) so no CORS setup is
 * needed — the files live in public/ and ship with the deploy.
 */

import { DECLARED_LOCALES, hreflangAlternates } from "./seoLocales";

export type SeoCheckStatus = "pass" | "fail";

export interface SeoCheckResult {
  id: string;
  label: string;
  status: SeoCheckStatus;
  detail: string;
  /** Checklist step ids ticked when this check passes. */
  stepIds: string[];
}

type Fetcher = typeof fetch;

async function getText(
  fetchImpl: Fetcher,
  path: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetchImpl(path, { cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : "" };
  }
}

function parseXml(text: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Every <loc> under a <url> or <sitemap> node. */
function locs(doc: Document, tag: "url" | "sitemap"): string[] {
  return Array.from(doc.getElementsByTagName(tag))
    .map((n) => n.getElementsByTagName("loc")[0]?.textContent?.trim() ?? "")
    .filter(Boolean);
}

export async function runSeoLiveChecks(
  fetchImpl: Fetcher = fetch,
): Promise<SeoCheckResult[]> {
  const results: SeoCheckResult[] = [];

  const [sitemap, index, robots] = await Promise.all([
    getText(fetchImpl, "/sitemap.xml"),
    getText(fetchImpl, "/sitemap-index.xml"),
    getText(fetchImpl, "/robots.txt"),
  ]);

  // ---- 1. Sitemaps fetch + parse -------------------------------------
  const sitemapDoc = sitemap.ok ? parseXml(sitemap.text) : null;
  const indexDoc = index.ok ? parseXml(index.text) : null;
  const urlLocs = sitemapDoc ? locs(sitemapDoc, "url") : [];
  const subSitemaps = indexDoc ? locs(indexDoc, "sitemap") : [];

  if (!sitemap.ok || !sitemapDoc || urlLocs.length === 0) {
    results.push({
      id: "sitemaps",
      label: "sitemap.xml + sitemap-index.xml serve valid XML",
      status: "fail",
      detail: !sitemap.ok
        ? `/sitemap.xml returned ${sitemap.status || "a network error"}.`
        : "sitemap.xml did not parse as XML or contains no <url> entries.",
      stepIds: [],
    });
  } else if (!index.ok || !indexDoc || subSitemaps.length === 0) {
    results.push({
      id: "sitemaps",
      label: "sitemap.xml + sitemap-index.xml serve valid XML",
      status: "fail",
      detail: !index.ok
        ? `/sitemap-index.xml returned ${index.status || "a network error"}.`
        : "sitemap-index.xml did not parse or references no sub-sitemaps.",
      stepIds: [],
    });
  } else {
    results.push({
      id: "sitemaps",
      label: "sitemap.xml + sitemap-index.xml serve valid XML",
      status: "pass",
      detail: `${urlLocs.length} URLs · ${subSitemaps.length} sub-sitemaps referenced.`,
      stepIds: ["deploy-fetch"],
    });
  }

  // ---- 2. Content-addressed sub-sitemaps exist -----------------------
  const hashed = subSitemaps.filter((l) => /\.[0-9a-f]{6,}\.xml$/.test(l));
  if (subSitemaps.length === 0) {
    results.push({
      id: "hashed",
      label: "Index references content-addressed sub-sitemaps",
      status: "fail",
      detail: "No sub-sitemaps found in the index.",
      stepIds: [],
    });
  } else if (hashed.length !== subSitemaps.length) {
    results.push({
      id: "hashed",
      label: "Index references content-addressed sub-sitemaps",
      status: "fail",
      detail: `${subSitemaps.length - hashed.length} sub-sitemap(s) are missing a content hash — the build may not have regenerated them.`,
      stepIds: [],
    });
  } else {
    results.push({
      id: "hashed",
      label: "Index references content-addressed sub-sitemaps",
      status: "pass",
      detail: hashed
        .map((l) => l.split("/").pop())
        .join(", "),
      stepIds: ["prep-hash"],
    });
  }

  // ---- 3. robots.txt -------------------------------------------------
  const robotsLines = robots.ok
    ? robots.text.split("\n").map((l) => l.trim())
    : [];
  const sitemapDirectives = robotsLines
    .filter((l) => /^sitemap:/i.test(l))
    .map((l) => l.slice(l.indexOf(":") + 1).trim());
  const blocksEveryone = robotsLines.some(
    (l) => /^disallow:\s*\/$/i.test(l),
  );
  const hasStable = sitemapDirectives.some((d) => d.endsWith("/sitemap.xml"));
  const hasHashedIndex = sitemapDirectives.some((d) =>
    /sitemap-index\.[0-9a-f]{6,}\.xml$/.test(d),
  );

  if (!robots.ok) {
    results.push({
      id: "robots",
      label: "robots.txt is served with current Sitemap directives",
      status: "fail",
      detail: `/robots.txt returned ${robots.status || "a network error"}.`,
      stepIds: [],
    });
  } else if (blocksEveryone) {
    results.push({
      id: "robots",
      label: "robots.txt is served with current Sitemap directives",
      status: "fail",
      detail: "robots.txt contains a site-wide `Disallow: /` — crawlers are blocked.",
      stepIds: [],
    });
  } else if (!hasStable || !hasHashedIndex) {
    results.push({
      id: "robots",
      label: "robots.txt is served with current Sitemap directives",
      status: "fail",
      detail: !hasStable
        ? "No stable `Sitemap: …/sitemap.xml` directive found."
        : "No content-addressed `sitemap-index.<hash>.xml` directive found — the CDN may be serving a stale robots.txt.",
      stepIds: [],
    });
  } else {
    results.push({
      id: "robots",
      label: "robots.txt is served with current Sitemap directives",
      status: "pass",
      detail: `${sitemapDirectives.length} Sitemap directive(s), stable + hashed index present.`,
      stepIds: ["deploy-robots"],
    });
  }

  // ---- 4. Canonical / hreflang shape ---------------------------------
  const expected = hreflangAlternates();
  if (!sitemapDoc || urlLocs.length === 0) {
    results.push({
      id: "hreflang",
      label: "Every sitemap URL declares the full hreflang set",
      status: "fail",
      detail: "Could not read sitemap URLs.",
      stepIds: [],
    });
  } else {
    const urlNodes = Array.from(sitemapDoc.getElementsByTagName("url"));
    const bad: string[] = [];
    for (const node of urlNodes) {
      const loc = node.getElementsByTagName("loc")[0]?.textContent?.trim() ?? "";
      const alts = Array.from(node.getElementsByTagName("*"))
        .filter((el) => el.localName === "link")
        .map((el) => el.getAttribute("hreflang") ?? "");
      const missing = expected.filter((t) => !alts.includes(t));
      if (missing.length) bad.push(`${loc || "(no loc)"} → missing ${missing.join(", ")}`);
    }
    const origins = new Set(
      urlLocs.map((l) => {
        try {
          return new URL(l).origin;
        } catch {
          return "invalid";
        }
      }),
    );
    if (bad.length) {
      results.push({
        id: "hreflang",
        label: "Every sitemap URL declares the full hreflang set",
        status: "fail",
        detail: `${bad.length} URL(s) incomplete. First: ${bad[0]}`,
        stepIds: [],
      });
    } else if (origins.size !== 1 || origins.has("invalid")) {
      results.push({
        id: "hreflang",
        label: "Every sitemap URL declares the full hreflang set",
        status: "fail",
        detail: `Canonical origins are inconsistent: ${Array.from(origins).join(", ")}`,
        stepIds: [],
      });
    } else {
      results.push({
        id: "hreflang",
        label: "Every sitemap URL declares the full hreflang set",
        status: "pass",
        detail: `${urlNodes.length} URLs on ${Array.from(origins)[0]} · ${DECLARED_LOCALES.length} locales + x-default.`,
        stepIds: ["deploy-canonical", "cov-hreflang"],
      });
    }
  }

  return results;
}

/** Step ids to tick from a completed run (passing checks only). */
export function passedStepIds(results: SeoCheckResult[]): string[] {
  return results.filter((r) => r.status === "pass").flatMap((r) => r.stepIds);
}
