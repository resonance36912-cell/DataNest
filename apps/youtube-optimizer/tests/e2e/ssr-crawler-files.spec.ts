import { test, expect, request as pwRequest } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * robots.txt / sitemap.xml contract for the PRODUCTION build.
 *
 * Both files are served as static assets from public/ and must stay in sync
 * with the real route tree. Everything here is asserted against the served
 * bytes (no browser, no JS), so it reflects exactly what crawlers fetch.
 */

const BASE_URL = process.env["SSR_BASE_URL"] ?? "http://127.0.0.1:8788";
const SITE = "https://youtubeoptimizer.life";
const HUB = "https://reson8.life";

/**
 * Routes that must NOT appear in the sitemap:
 *  - "/$"           catch-all / 404
 *  - "/login"       noindex auth surface
 *  - "/admin*"      private
 *  - "/pricing"     hub-owned: reson8.life carries the query
 */
const NON_INDEXABLE = new Set(["/$", "/login", "/admin", "/admin/login", "/pricing"]);

/** Read the generated route tree so coverage can never silently drift. */
function appRoutes(): string[] {
  const src = readFileSync("src/routeTree.gen.ts", "utf8");
  const block = src.match(/export interface FileRoutesByTo \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("could not parse FileRoutesByTo from src/routeTree.gen.ts");
  const routes = [...block[1]!.matchAll(/'([^']+)':/g)].map((m) => m[1]!);
  if (routes.length === 0) throw new Error("FileRoutesByTo parsed as empty");
  return routes;
}

const INDEXABLE_ROUTES = appRoutes().filter(
  (r) => !NON_INDEXABLE.has(r) && !r.includes("$") && !r.startsWith("/api/"),
);

async function fetchText(path: string) {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.get(path);
  const body = await res.text();
  const contentType = res.headers()["content-type"] ?? "";
  const status = res.status();
  await ctx.dispose();
  return { status, body, contentType };
}

test.describe("robots.txt (production build)", () => {
  test("is served as plain text and never blocks the whole site", async () => {
    const { status, body, contentType } = await fetchText("/robots.txt");
    expect(status).toBe(200);
    expect(contentType).toMatch(/text\/plain/);
    expect(body, "a global Disallow: / would deindex the site").not.toMatch(
      /^\s*Disallow:\s*\/\s*$/im,
    );
    expect(body).toMatch(/^User-agent:\s*\*/im);
    expect(body).toMatch(/^Allow:\s*\/\s*$/im);
  });

  test("explicitly allows the crawlers we care about", async () => {
    const { body } = await fetchText("/robots.txt");
    for (const agent of ["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit"]) {
      const block = new RegExp(`User-agent:\\s*${agent}\\s*\\nAllow:\\s*/`, "i");
      expect(body, `robots.txt must allow ${agent}`).toMatch(block);
    }
  });

  test("advertises both the spoke and the hub sitemap", async () => {
    const { body } = await fetchText("/robots.txt");
    const sitemaps = [...body.matchAll(/^Sitemap:\s*(\S+)$/gim)].map((m) => m[1]!);
    expect(sitemaps).toContain(`${SITE}/sitemap.xml`);
    expect(sitemaps).toContain(`${HUB}/sitemap.xml`);
    for (const url of sitemaps) {
      expect(url, "sitemap directives must be absolute https URLs").toMatch(
        /^https:\/\//,
      );
    }
  });

  test("every advertised spoke sitemap actually resolves", async () => {
    const { body } = await fetchText("/robots.txt");
    const spokeSitemaps = [...body.matchAll(/^Sitemap:\s*(\S+)$/gim)]
      .map((m) => m[1]!)
      .filter((u) => u.startsWith(SITE));
    expect(spokeSitemaps.length).toBeGreaterThan(0);
    for (const url of spokeSitemaps) {
      const { status } = await fetchText(new URL(url).pathname);
      expect(status, `${url} must be reachable`).toBe(200);
    }
  });
});

test.describe("sitemap.xml (production build)", () => {
  test("is served as XML with a well-formed urlset", async () => {
    const { status, body, contentType } = await fetchText("/sitemap.xml");
    expect(status).toBe(200);
    expect(contentType).toMatch(/xml/);
    expect(body).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(body).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(body.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  test("entries are absolute, unique, spoke-owned and validly annotated", async () => {
    const { body } = await fetchText("/sitemap.xml");
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThan(0);
    expect(new Set(locs).size, "duplicate <loc> entries").toBe(locs.length);

    for (const loc of locs) {
      expect(loc, `${loc} must be an absolute spoke URL`).toMatch(
        new RegExp(`^${SITE}/`),
      );
      expect(loc, `${loc} must not carry a query or fragment`).not.toMatch(/[?#]/);
    }

    for (const freq of [...body.matchAll(/<changefreq>([^<]+)<\/changefreq>/g)]) {
      expect(
        ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"],
      ).toContain(freq[1]);
    }
    for (const prio of [...body.matchAll(/<priority>([^<]+)<\/priority>/g)]) {
      const value = Number(prio[1]);
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("covers every indexable route in the route tree", async () => {
    const { body } = await fetchText("/sitemap.xml");
    const missing = INDEXABLE_ROUTES.filter(
      (route) => !body.includes(`<loc>${SITE}${route}</loc>`),
    );
    expect(
      missing,
      `sitemap.xml is missing indexable routes: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  test("lists nothing that is non-indexable or not a real route", async () => {
    const { body } = await fetchText("/sitemap.xml");
    const paths = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]!).pathname,
    );
    const allowed = new Set(INDEXABLE_ROUTES);
    for (const path of paths) {
      const normalized = path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
      expect(
        allowed.has(normalized),
        `${normalized} is listed in sitemap.xml but is not an indexable app route`,
      ).toBe(true);
    }
  });

  test("every listed URL is served with a 200 and self-canonicalises", async () => {
    const { body } = await fetchText("/sitemap.xml");
    const paths = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]!).pathname,
    );
    for (const path of paths) {
      const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
      const res = await ctx.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} in sitemap must return 200`).toBe(200);
      const html = await res.text();
      const canonical =
        html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ?? null;
      expect(canonical, `${path} canonical`).toBe(
        `${SITE}${path === "/" ? "/" : path}`,
      );
      expect(
        html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/i)?.[1] ?? "index",
        `${path} is in the sitemap so it must stay indexable`,
      ).not.toMatch(/noindex/i);
      await ctx.dispose();
    }
  });

  test("attributes hub-owned surfaces to the hub", async () => {
    const { body } = await fetchText("/sitemap.xml");
    expect(body, "sitemap must reference the hub sitemap").toContain(HUB);
    for (const hubOwned of ["/pricing", "/upgrade", "/credits", "/checkout", "/docs", "/updates", "/support"]) {
      expect(body, `${hubOwned} is hub-owned`).not.toContain(
        `<loc>${SITE}${hubOwned}</loc>`,
      );
    }
  });
});
