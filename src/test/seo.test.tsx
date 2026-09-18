/**
 * SEO smoke test — verifies that every crawler-facing signal points at the
 * Resonance Hub (https://www.reson8.life) so indexing consolidates there.
 *
 * Covers:
 *   - <SEO /> per-route output: canonical, og:url, twitter/og tags, robots
 *   - JSON-LD emitted per route
 *   - static index.html head tags
 *   - public/robots.txt + public/sitemap.xml
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import SEO from "@/components/SEO";
import { hubRedirectFor } from "@/lib/hubRedirects";
import { SHARE_VARIANTS, resolveShare, shareUrl, shareVariant } from "@/lib/shareMeta";

const HUB = "https://www.reson8.life";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Routes that carry public SEO, with the canonical we expect on the hub. */
const KEY_ROUTES: Array<{ path: string; expected: string }> = [
  { path: "/", expected: `${HUB}/` },
  { path: "/pricing", expected: `${HUB}/pricing` },
  { path: "/about", expected: `${HUB}/about` },
  { path: "/contact", expected: `${HUB}/contact` },
  { path: "/terms", expected: `${HUB}/terms` },
  { path: "/privacy", expected: `${HUB}/privacy` },
  // Spoke-only paths consolidate to the hub root.
  { path: "/guides/brief-to-creative", expected: `${HUB}/` },
  { path: "/library", expected: `${HUB}/` },
];

async function renderSeo(props: React.ComponentProps<typeof SEO>) {
  render(
    <HelmetProvider>
      <SEO {...props} />
    </HelmetProvider>,
  );
  await waitFor(() => {
    expect(document.querySelector("link[rel='canonical']")).not.toBeNull();
  });
}

const head = () => ({
  canonical: document.querySelector("link[rel='canonical']")?.getAttribute("href"),
  ogUrl: document.querySelector("meta[property='og:url']")?.getAttribute("content"),
  robots: document.querySelector("meta[name='robots']")?.getAttribute("content"),
  ogImage: document.querySelector("meta[property='og:image']")?.getAttribute("content"),
  twitterCard: document.querySelector("meta[name='twitter:card']")?.getAttribute("content"),
  hreflang: Object.fromEntries(
    Array.from(document.querySelectorAll("link[rel='alternate'][hreflang]")).map((l) => [
      l.getAttribute("hreflang"),
      l.getAttribute("href"),
    ]),
  ),
  jsonLd: Array.from(document.querySelectorAll("script[type='application/ld+json']")).map((s) =>
    JSON.parse(s.textContent || "{}"),
  ),
});

describe("SEO: per-route head output", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it.each(KEY_ROUTES)("canonical + og:url for $path point at the hub", async ({ path, expected }) => {
    await renderSeo({ title: `Test ${path}`, description: "Test description", path });
    const tags = head();
    expect(tags.canonical).toBe(expected);
    expect(tags.ogUrl).toBe(expected);
    expect(tags.canonical).not.toMatch(/creativestudio\.life/);
  });

  it.each(KEY_ROUTES)("hreflang for $path targets the hub canonical", async ({ path, expected }) => {
    await renderSeo({ title: `Test ${path}`, description: "Test description", path });
    const { hreflang, canonical } = head();
    expect(hreflang["en-za"]).toBe(expected);
    expect(hreflang["en"]).toBe(expected);
    expect(hreflang["x-default"]).toBe(expected);
    // Every hreflang must agree with the canonical, or crawlers ignore the set.
    for (const href of Object.values(hreflang)) expect(href).toBe(canonical);
  });

  it("emits absolute og:image and a large twitter card", async () => {
    await renderSeo({ title: "T", description: "D", path: "/" });
    const tags = head();
    expect(tags.ogImage).toMatch(/^https:\/\//);
    expect(tags.twitterCard).toBe("summary_large_image");
  });

  it("omits robots meta by default and sets noindex when asked", async () => {
    await renderSeo({ title: "T", description: "D", path: "/" });
    expect(head().robots).toBeUndefined();

    document.head.innerHTML = "";
    await renderSeo({ title: "T", description: "D", path: "/library", noindex: true });
    expect(head().robots).toBe("noindex,nofollow");
  });

  it("emits JSON-LD that references the hub", async () => {
    await renderSeo({
      title: "T",
      description: "D",
      path: "/",
      jsonLd: { "@context": "https://schema.org", "@type": "WebSite", url: `${HUB}/` },
    });
    const [ld] = head().jsonLd;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(JSON.stringify(ld)).toContain(HUB);
  });
});

describe("SEO: hub redirect map", () => {
  it("redirects hub-duplicated marketing paths to the hub", () => {
    for (const path of ["/pricing", "/about", "/contact", "/terms", "/privacy", "/updates"]) {
      expect(hubRedirectFor(path)).toBe(`${HUB}${path}`);
    }
    expect(hubRedirectFor("/pricing/")).toBe(`${HUB}/pricing`);
  });

  it("leaves app-owned routes alone", () => {
    for (const path of ["/", "/studio", "/library", "/login", "/admin", "/guides/brief-to-creative"]) {
      expect(hubRedirectFor(path)).toBeNull();
    }
  });
});

describe("SEO: static index.html", () => {
  const html = read("index.html");

  it("canonical and og:url point at the hub, not the spoke domain", () => {
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/www\.reson8\.life\/?"/);
    const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1];
    expect(ogUrl).toContain(HUB);
  });

  it("has a real title and description (not template defaults)", () => {
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const desc = html.match(/name="description" content="([^"]+)"/)?.[1] ?? "";
    expect(title.length).toBeGreaterThan(10);
    expect(title).not.toMatch(/Lovable App|Vite App/i);
    expect(desc).not.toMatch(/Lovable Generated Project/i);
  });

  it("declares hreflang en-za, en and x-default pointing at the hub", () => {
    const alts = Object.fromEntries(
      [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    expect(alts["en-za"]).toBe(`${HUB}/`);
    expect(alts["en"]).toBe(`${HUB}/`);
    expect(alts["x-default"]).toBe(`${HUB}/`);
  });

  it("declares the document language", () => {
    expect(html).toMatch(/<html lang="en-ZA"/);
  });

  it("does not sitewide-noindex the app", () => {
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
  });

  it("static JSON-LD blocks are valid and reference the hub", () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => m[1],
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const parsed = JSON.parse(block);
      expect(parsed["@context"]).toBe("https://schema.org");
    }
    expect(blocks.join(" ")).toContain(HUB);
  });
});

describe("SEO: robots.txt and sitemap.xml", () => {
  const robots = read("public/robots.txt");
  const sitemap = read("public/sitemap.xml");

  it("robots.txt does not block all crawlers and advertises the hub sitemap first", () => {
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/\s*$/m);
    const sitemaps = [...robots.matchAll(/^Sitemap:\s*(\S+)/gm)].map((m) => m[1]);
    expect(sitemaps[0]).toBe(`${HUB}/sitemap.xml`);
  });

  it("robots.txt keeps private areas out of the index", () => {
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Disallow: \/login/);
  });

  it("sitemap.xml delegates to the hub sitemap index", () => {
    expect(sitemap).toContain("<sitemapindex");
    expect(sitemap).toContain(`${HUB}/sitemap.xml`);
  });
});

// ---------------------------------------------------------------------------
// Per-route share variants
// ---------------------------------------------------------------------------
describe("per-route share variants", () => {
  const variantPaths = Object.keys(SHARE_VARIANTS);

  it("registers variants for the key public routes", () => {
    for (const p of ["/", "/pricing", "/about", "/studio", "/guides/url-to-poster"]) {
      expect(variantPaths).toContain(p);
    }
  });

  it("gives every variant unique, non-empty copy", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const [path, v] of Object.entries(SHARE_VARIANTS)) {
      expect(v.title.length, path).toBeGreaterThan(10);
      expect(v.title.length, path).toBeLessThanOrEqual(90);
      expect(v.description.length, path).toBeGreaterThanOrEqual(40);
      expect(v.description.length, path).toBeLessThanOrEqual(200);
      titles.add(v.title);
      descriptions.add(v.description);
    }
    expect(titles.size).toBe(variantPaths.length);
    expect(descriptions.size).toBe(variantPaths.length);
  });

  it("resolves variant copy and ignores route-specific URLs", () => {
    for (const path of variantPaths) {
      const resolved = resolveShare(path, { title: "fallback", description: "fallback" });
      expect(resolved.title).toBe(SHARE_VARIANTS[path].title);
      // Destination stays pinned to the hub regardless of variant copy.
      expect(shareUrl(path).startsWith("https://www.reson8.life")).toBe(true);
    }
  });

  it("normalises trailing slashes, case and query strings", () => {
    expect(shareVariant("/Pricing/")?.title).toBe(SHARE_VARIANTS["/pricing"].title);
    expect(shareVariant("/pricing?ref=hub")?.title).toBe(SHARE_VARIANTS["/pricing"].title);
  });

  it("falls back to page copy for unregistered routes", () => {
    const resolved = resolveShare("/some/unlisted/route", {
      title: "Page title",
      description: "Page description",
    });
    expect(resolved.title).toBe("Page title");
    expect(resolved.description).toBe("Page description");
  });

  it("lets an explicit image prop beat the variant image", () => {
    expect(
      resolveShare("/pricing", { title: "t", description: "d", image: "/custom.jpg" }).image,
    ).toBe("/custom.jpg");
  });
});
