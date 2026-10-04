import { test, expect, request as pwRequest } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * SSR crawler contract.
 *
 * Every assertion here inspects the *initial* HTTP response — no browser, no
 * client-side JavaScript — so it proves what Googlebot and social scrapers
 * actually receive from the production build.
 *
 * Run against a production build via `bun run gate:ssr`.
 */

const BASE_URL = process.env["SSR_BASE_URL"] ?? "http://127.0.0.1:8788";
const SITE = "https://youtubeoptimizer.life";
const HUB = "https://reson8.life";

/**
 * Parse the redirect map straight out of src/lib/hub-redirects.ts.
 *
 * Reading the source (instead of importing it) keeps this spec free of the
 * app's browser-only module graph while still failing if the map drifts.
 */
function loadHubRedirects(): Record<string, string> {
  const src = readFileSync("src/lib/hub-redirects.ts", "utf8");
  const block = src.match(
    /HUB_REDIRECTS:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/,
  );
  if (!block) throw new Error("could not parse HUB_REDIRECTS from source");
  const map: Record<string, string> = {};
  for (const [, from, to] of block[1]!.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    map[from!] = to!;
  }
  if (Object.keys(map).length === 0) throw new Error("HUB_REDIRECTS is empty");
  return map;
}

const HUB_REDIRECTS = loadHubRedirects();
const LEGACY_HUB_PATHS = Object.keys(HUB_REDIRECTS);

/** Indexable spoke pages: must self-canonicalise, no noindex. */
const INDEXABLE_PAGES = [
  "/",
  "/about",
  "/contact",
  "/features",
  "/pricing",
  "/privacy",
  "/terms",
] as const;

function tag(html: string, re: RegExp) {
  return html.match(re)?.[1] ?? null;
}

const canonicalOf = (html: string) =>
  tag(html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ??
  tag(html, /<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i);

const ogUrlOf = (html: string) =>
  tag(html, /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);

const robotsOf = (html: string) =>
  tag(html, /<meta[^>]+name="robots"[^>]+content="([^"]+)"/i);

const titleOf = (html: string) => tag(html, /<title[^>]*>([^<]*)<\/title>/i);

test.describe("SSR head metadata (initial HTML, JS disabled)", () => {
  for (const path of INDEXABLE_PAGES) {
    test(`${path} serves a self-referencing canonical and unique title`, async () => {
      const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
      const res = await ctx.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} should render, not redirect`).toBe(200);

      const html = await res.text();
      const expected = `${SITE}${path === "/" ? "/" : path}`;

      expect(canonicalOf(html), `${path} canonical`).toBe(expected);
      expect(ogUrlOf(html), `${path} og:url`).toBe(expected);

      const robots = robotsOf(html);
      expect(robots ?? "index", `${path} must stay indexable`).not.toMatch(
        /noindex/i,
      );

      const title = titleOf(html);
      expect(title, `${path} title`).toBeTruthy();
      expect(title!.length, `${path} title length`).toBeLessThan(75);

      await ctx.dispose();
    });
  }

  for (const path of ["/login", "/this-route-does-not-exist"] as const) {
    test(`${path} is served noindex, follow`, async () => {
      const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
      const html = await (await ctx.get(path, { maxRedirects: 0 })).text();
      expect(robotsOf(html), `${path} robots`).toMatch(/noindex/i);
      expect(robotsOf(html), `${path} robots`).toMatch(/follow/i);
      await ctx.dispose();
    });
  }

  test("exactly one title and one og:url per page (no root duplication)", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    for (const path of INDEXABLE_PAGES) {
      const html = await (await ctx.get(path, { maxRedirects: 0 })).text();
      expect(
        (html.match(/<title[^>]*>/gi) ?? []).length,
        `${path} must emit a single <title>`,
      ).toBe(1);
      expect(
        (html.match(/property="og:url"/gi) ?? []).length,
        `${path} must emit a single og:url`,
      ).toBe(1);
    }
    await ctx.dispose();
  });

  test("no indexable page ships a meta refresh (real 301s replaced them)", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    for (const path of INDEXABLE_PAGES) {
      const html = await (await ctx.get(path, { maxRedirects: 0 })).text();
      expect(html, `${path} must not use meta-refresh forwarding`).not.toMatch(
        /http-equiv="refresh"/i,
      );
    }
    await ctx.dispose();
  });
});

test.describe("Legacy hub paths return real HTTP 301s", () => {
  test("every mapped legacy path 301s to its hub target", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const failures: string[] = [];

    for (const path of LEGACY_HUB_PATHS) {
      const res = await ctx.get(path, { maxRedirects: 0 });
      const location = res.headers()["location"];
      const expected = new URL(HUB_REDIRECTS[path]!, HUB).toString();

      if (res.status() !== 301) {
        failures.push(`${path}: status ${res.status()} (expected 301)`);
        continue;
      }
      if (location !== expected) {
        failures.push(`${path}: location ${location} (expected ${expected})`);
      }
    }

    expect(failures, `legacy redirect regressions:\n${failures.join("\n")}`)
      .toHaveLength(0);
    await ctx.dispose();
  });

  test("query strings survive the redirect", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.get("/upgrade?ref=spoke", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toContain("ref=spoke");
    await ctx.dispose();
  });
});

test.describe("robots.txt and sitemap.xml stay hub-attributed", () => {
  test("robots.txt is crawlable and points at a sitemap", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(/^\s*Disallow:\s*\/\s*$/im);
    expect(body).toMatch(/Sitemap:/i);
    await ctx.dispose();
  });

  test("sitemap.xml only lists spoke-owned pages", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const path of LEGACY_HUB_PATHS) {
      expect(xml, `sitemap must not list redirecting path ${path}`).not.toContain(
        `<loc>${SITE}${path}</loc>`,
      );
    }
    await ctx.dispose();
  });
});
