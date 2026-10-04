import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * OpenGraph / Twitter preview-image contract.
 *
 * Assertions run against the *initial* SSR HTML of the production build (no
 * browser, no client JS) and then fetch each referenced image, so CI fails if
 * a page ships no preview image, a relative URL, or a broken asset.
 *
 * Run via `bun run gate:ssr`.
 */

const BASE_URL = process.env["SSR_BASE_URL"] ?? "http://127.0.0.1:8788";
const SITE = "https://youtubeoptimizer.life";

/** Every page whose share preview matters (indexable pages + the auth surface). */
const PREVIEW_PAGES = [
  "/",
  "/about",
  "/contact",
  "/features",
  "/pricing",
  "/privacy",
  "/terms",
  "/login",
] as const;

function metaAll(html: string, attr: "property" | "name", key: string) {
  const re = new RegExp(
    `<meta[^>]+(?:${attr}="${key}"[^>]+content="([^"]*)"|content="([^"]*)"[^>]+${attr}="${key}")[^>]*>`,
    "gi",
  );
  return [...html.matchAll(re)].map((m) => m[1] ?? m[2] ?? "");
}

const meta = (html: string, attr: "property" | "name", key: string) =>
  metaAll(html, attr, key)[0] ?? null;

async function getHtml(path: string) {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.get(path, { headers: { "user-agent": "facebookexternalhit/1.1" } });
  expect(res.status(), `${path} status`).toBe(200);
  const html = await res.text();
  await ctx.dispose();
  return html;
}

/** Map an absolute production image URL back onto the local test server. */
const localUrl = (absolute: string) =>
  absolute.startsWith(SITE) ? absolute.slice(SITE.length) : absolute;

test.describe("OpenGraph preview images (initial SSR HTML)", () => {
  for (const path of PREVIEW_PAGES) {
    test(`${path} declares a single, absolute, reachable og:image`, async () => {
      const html = await getHtml(path);

      const images = metaAll(html, "property", "og:image");
      expect(images.length, `${path} must declare exactly one og:image`).toBe(1);

      const ogImage = images[0]!;
      expect(ogImage, `${path} og:image must be an absolute https URL`).toMatch(
        /^https:\/\//,
      );
      expect(ogImage, `${path} og:image must not be a placeholder`).not.toMatch(
        /example\.com|placeholder|lovable\.dev\/opengraph/i,
      );

      // Dimensions + alt text: required for a well-rendered card.
      expect(meta(html, "property", "og:image:width")).toBe("1200");
      expect(meta(html, "property", "og:image:height")).toBe("630");
      const alt = meta(html, "property", "og:image:alt");
      expect(String(alt ?? "").trim(), `${path} needs og:image:alt`).not.toBe("");

      // Secure URL, when present, must match the primary image.
      const secure = meta(html, "property", "og:image:secure_url");
      if (secure) expect(secure).toBe(ogImage);

      // Twitter card mirrors the same image.
      const twitterImages = metaAll(html, "name", "twitter:image");
      expect(twitterImages.length, `${path} must declare one twitter:image`).toBe(1);
      expect(twitterImages[0]).toBe(ogImage);
      expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");

      // The asset itself must exist in the production build and be an image.
      const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
      const asset = await ctx.get(localUrl(ogImage));
      expect(asset.status(), `${path} og:image is not reachable: ${ogImage}`).toBe(200);
      const contentType = asset.headers()["content-type"] ?? "";
      expect(contentType, `${path} og:image is not served as an image`).toMatch(
        /^image\//,
      );
      const bytes = (await asset.body()).byteLength;
      expect(bytes, `${path} og:image is suspiciously small`).toBeGreaterThan(1024);
      await ctx.dispose();
    });
  }

  test("the root template no longer emits page-level og:image tags", async () => {
    // Every preview page carries exactly one og:image (asserted above), which
    // only holds while the root shell stays out of the image business.
    const html = await getHtml("/");
    expect(metaAll(html, "property", "og:image").length).toBe(1);
    expect(metaAll(html, "name", "twitter:image").length).toBe(1);
  });
});
