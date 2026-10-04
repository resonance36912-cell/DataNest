/**
 * Provider card coverage.
 *
 * Every common link-preview provider reads a slightly different tag family.
 * These tests assert that both the runtime head (<SEO />) and the static
 * index.html head satisfy each provider's minimum set, with matching copy,
 * artwork and hub destination.
 */
import fs from "node:fs";
import path from "node:path";

import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { beforeEach, describe, expect, it } from "vitest";

import SEO from "@/components/SEO";
import { SHARE_IMAGE_VARIANTS, SHARE_PROVIDERS, TILE_COLOR, shareUrl } from "@/lib/shareMeta";

const INDEX_HTML = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
const STATIC_HEAD = INDEX_HTML.slice(0, INDEX_HTML.indexOf("</head>"));

function headValue(key: string): string | undefined {
  if (key.startsWith("itemprop:")) {
    const el = document.head.querySelector(`meta[itemprop="${key.slice(9)}"]`);
    return el?.getAttribute("content") ?? undefined;
  }
  const el =
    document.head.querySelector(`meta[property="${key}"]`) ??
    document.head.querySelector(`meta[name="${key}"]`);
  return el?.getAttribute("content") ?? undefined;
}

function staticValue(key: string): string | undefined {
  const attr = key.startsWith("itemprop:")
    ? `itemprop=["']${key.slice(9)}["']`
    : `(?:property|name)=["']${key}["']`;
  const re = new RegExp(`<meta[^>]*${attr}[^>]*>`, "i");
  const tag = STATIC_HEAD.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1];
}

async function renderSEO(pathname: string) {
  document.head.innerHTML = "";
  render(
    <HelmetProvider>
      <SEO
        title="Resonance Creative Studio — AI Content for SA Brands"
        description="Turn URLs, images, docs, or prompts into AI-generated posters, ads, social posts and cinematic videos."
        path={pathname}
      />
    </HelmetProvider>,
  );
  await waitFor(() => expect(document.head.querySelector('meta[property="og:image"]')).toBeTruthy());
}

describe("runtime provider cards", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  for (const provider of SHARE_PROVIDERS) {
    it(`${provider.label} finds every tag it reads`, async () => {
      await renderSEO("/");
      for (const key of provider.requires) {
        expect(headValue(key), `${provider.label} needs ${key}`).toBeTruthy();
      }
    });
  }

  it("serves the right ratio variant to each provider family", async () => {
    await renderSEO("/pricing");
    const og = headValue("og:image");
    expect(og).toBeTruthy();
    // Wide 1.91:1 for og / X / Google-Gmail.
    expect(headValue("twitter:image")).toBe(SHARE_IMAGE_VARIANTS.wide.url);
    expect(headValue("itemprop:image")).toBe(SHARE_IMAGE_VARIANTS.wide.url);
    expect(headValue("thumbnail")).toBe(SHARE_IMAGE_VARIANTS.wide.url);
    // Square 1:1 for tiles / WhatsApp / iMessage.
    expect(headValue("msapplication-TileImage")).toBe(SHARE_IMAGE_VARIANTS.square.url);
    // Vertical 2:3 for Pinterest pins.
    expect(headValue("pinterest:media")).toBe(SHARE_IMAGE_VARIANTS.vertical.url);
    expect(document.head.querySelector('link[rel="image_src"]')?.getAttribute("href")).toBe(og);
  });

  it("keeps every ratio variant on disk, sized and under the WhatsApp ceiling", () => {
    const expected: Record<string, [number, number]> = {
      "og-cover-wide.jpg": [1200, 630],
      "og-cover-square.jpg": [1080, 1080],
      "og-cover-vertical.jpg": [1000, 1500],
    };
    for (const [file, [w, h]] of Object.entries(expected)) {
      const abs = path.resolve(process.cwd(), "public", file);
      expect(fs.existsSync(abs), `${file} missing`).toBe(true);
      expect(fs.statSync(abs).size, `${file} too large`).toBeLessThan(300_000);
      const variant = Object.values(SHARE_IMAGE_VARIANTS).find((v) => v.url.endsWith(file))!;
      expect([variant.width, variant.height]).toEqual([w, h]);
    }
  });

  it("keeps microdata copy in sync with the og card", async () => {
    await renderSEO("/about");
    expect(headValue("itemprop:name")).toBe(headValue("og:title"));
    expect(headValue("itemprop:description")).toBe(headValue("og:description"));
  });

  it("still points every provider at the hub", async () => {
    await renderSEO("/studio");
    expect(headValue("og:url")).toBe(shareUrl("/studio"));
    expect(headValue("twitter:url")).toBe(shareUrl("/studio"));
    expect(headValue("og:url")).toMatch(/^https:\/\/www\.reson8\.life/);
  });

  it("emits Discord/Android accent and Pinterest opt-in", async () => {
    await renderSEO("/");
    expect(headValue("theme-color")).toBe(TILE_COLOR);
    expect(headValue("pinterest-rich-pin")).toBe("true");
  });

  it("declares an image MIME type for WhatsApp and iMessage", async () => {
    await renderSEO("/");
    expect(headValue("og:image:type")).toMatch(/^image\/(jpeg|png)$/);
  });
});

describe("static index.html provider cards", () => {
  for (const provider of SHARE_PROVIDERS) {
    it(`${provider.label} works for non-JS crawlers`, () => {
      for (const key of provider.requires) {
        expect(staticValue(key), `index.html needs ${key}`).toBeTruthy();
      }
    });
  }

  it("static microdata matches the static og card", () => {
    expect(staticValue("itemprop:name")).toBe(staticValue("og:title"));
    expect(staticValue("itemprop:description")).toBe(staticValue("og:description"));
    expect(staticValue("itemprop:image")).toBe(staticValue("og:image"));
  });

  it("ships apple-touch-icon and image_src for legacy scrapers", () => {
    expect(STATIC_HEAD).toMatch(/<link[^>]*rel=["']apple-touch-icon["']/i);
    expect(STATIC_HEAD).toMatch(/<link[^>]*rel=["']image_src["']/i);
  });

  it("keeps the primary preview image under WhatsApp's 300KB ceiling", () => {
    const bytes = fs.statSync(path.resolve(process.cwd(), "public/og-cover.jpg")).size;
    expect(bytes).toBeLessThan(300_000);
  });
});
