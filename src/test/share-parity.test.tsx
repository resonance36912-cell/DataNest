/**
 * Share-tag parity test.
 *
 * Every card platform reads a different half of the head: Facebook/LinkedIn/
 * Slack read og:*, X reads twitter:*. If the two drift, the same link renders
 * two different cards. This suite asserts they stay in lockstep for every key
 * route — including the hub-redirected marketing paths, which still render a
 * head before the redirect fires — and for the static index.html head that
 * non-JS crawlers actually see.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import SEO from "@/components/SEO";
import { HUB_REDIRECTS } from "@/lib/hubRedirects";
import { SHARE, SHARE_VARIANTS } from "@/lib/shareMeta";

const HUB = "https://www.reson8.life";

/** Spoke-owned routes that render public SEO. */
const SPOKE_ROUTES = [
  "/",
  "/library",
  "/studio",
  "/login",
  "/guides/url-to-poster",
  "/guides/brief-to-creative",
];

/** Marketing paths that redirect to the hub but still render a head first. */
const REDIRECT_ROUTES = Object.keys(HUB_REDIRECTS);

/** Union of everything that can ever be shared, deduped. */
const ALL_ROUTES = Array.from(
  new Set([...SPOKE_ROUTES, ...REDIRECT_ROUTES, ...Object.keys(SHARE_VARIANTS)]),
).map((path) => ({ path }));

async function renderSeo(path: string, extra: Record<string, unknown> = {}) {
  render(
    <HelmetProvider>
      <SEO title={`Page ${path}`} description={`Page description for ${path}`} path={path} {...extra} />
    </HelmetProvider>,
  );
  await waitFor(() => {
    expect(document.querySelector("meta[property='og:url']")).not.toBeNull();
  });
}

const og = (p: string) => document.querySelector(`meta[property='og:${p}']`)?.getAttribute("content");
const tw = (n: string) => document.querySelector(`meta[name='twitter:${n}']`)?.getAttribute("content");
const canonical = () => document.querySelector("link[rel='canonical']")?.getAttribute("href");

describe("og/twitter parity: rendered routes", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it.each(ALL_ROUTES)("$path keeps og:* and twitter:* in sync", async ({ path }) => {
    await renderSeo(path);

    // Copy parity.
    expect(tw("title"), `twitter:title for ${path}`).toBe(og("title"));
    expect(tw("description"), `twitter:description for ${path}`).toBe(og("description"));
    expect(tw("image"), `twitter:image for ${path}`).toBe(og("image"));
    expect(tw("image:alt"), `twitter:image:alt for ${path}`).toBe(og("image:alt"));

    // Destination parity — both pinned to the hub, and to the canonical.
    expect(tw("url"), `twitter:url for ${path}`).toBe(og("url"));
    expect(og("url")).toBe(canonical());
    expect(og("url")?.startsWith(HUB)).toBe(true);
    expect(tw("domain")).toBe("www.reson8.life");

    // No tag may be empty — an empty tag renders a blank card slot.
    for (const value of [og("title"), og("description"), og("image"), tw("card")]) {
      expect(value, `empty share tag on ${path}`).toBeTruthy();
    }
    expect(tw("card")).toBe(SHARE.twitterCard);
    expect(og("image")).toMatch(/^https:\/\//);
    expect(tw("image")).toMatch(/^https:\/\//);
  });

  it.each(REDIRECT_ROUTES.map((path) => ({ path })))(
    "$path (hub redirect) still emits a complete, in-sync card",
    async ({ path }) => {
      await renderSeo(path, { noindex: true });
      // noindex must not strip share tags — the card still renders when shared.
      expect(document.querySelector("meta[name='robots']")?.getAttribute("content")).toBe(
        "noindex,nofollow",
      );
      expect(og("title")).toBeTruthy();
      expect(tw("title")).toBe(og("title"));
      expect(tw("description")).toBe(og("description"));
      expect(tw("image")).toBe(og("image"));
      expect(og("url")).toBe(`${HUB}${path}`);
      expect(tw("url")).toBe(og("url"));
    },
  );

  it("keeps a per-page image override in sync across both namespaces", async () => {
    await renderSeo("/", { image: "/logo-creative-studio.png" });
    expect(og("image")).toBe(tw("image"));
    expect(og("image:alt")).toBe(tw("image:alt"));
  });

  it("emits exactly one og:title/twitter:title pair per route", async () => {
    await renderSeo("/pricing");
    expect(document.querySelectorAll("meta[property='og:title']")).toHaveLength(1);
    expect(document.querySelectorAll("meta[name='twitter:title']")).toHaveLength(1);
  });
});

describe("og/twitter parity: static index.html head", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const staticTag = (attr: "property" | "name", key: string) => {
    const re = new RegExp(
      `<meta[^>]*${attr}=["']${key.replace(/[:]/g, ":")}["'][^>]*content=["']([^"']*)["']`,
      "i",
    );
    return html.match(re)?.[1];
  };

  it("mirrors title/description/url across og and twitter", () => {
    expect(staticTag("name", "twitter:title")).toBe(staticTag("property", "og:title"));
    expect(staticTag("name", "twitter:description")).toBe(staticTag("property", "og:description"));
    expect(staticTag("name", "twitter:url")).toBe(staticTag("property", "og:url"));
    expect(staticTag("property", "og:url")?.startsWith(HUB)).toBe(true);
  });

  it("uses the first og:image candidate as twitter:image", () => {
    const firstOgImage = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i,
    )?.[1];
    expect(firstOgImage).toMatch(/^https:\/\//);
    expect(staticTag("name", "twitter:image")).toBe(firstOgImage);
  });
});
