import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * JSON-LD structured-data contract.
 *
 * Every assertion inspects the *initial* SSR HTML (no browser, no client JS),
 * so it proves what Google's rich-results crawler actually receives from the
 * production build. Run via `bun run gate:ssr`.
 */

const BASE_URL = process.env["SSR_BASE_URL"] ?? "http://127.0.0.1:8788";
const SITE = "https://youtubeoptimizer.life";
const HUB_ORG_ID = "https://reson8.life/#organization";

/** Types every indexable page must emit, plus its page-specific requirements. */
const PAGE_SCHEMAS: Record<string, string[]> = {
  "/": ["Organization", "WebPage", "WebSite", "SoftwareApplication"],
  "/about": ["Organization", "WebPage", "BreadcrumbList", "AboutPage"],
  "/contact": [
    "Organization",
    "WebPage",
    "BreadcrumbList",
    "ContactPage",
    "FAQPage",
  ],
  "/features": [
    "Organization",
    "WebPage",
    "BreadcrumbList",
    "SoftwareApplication",
  ],
  "/pricing": ["Organization", "WebPage", "BreadcrumbList", "SoftwareApplication"],
  "/privacy": ["Organization", "WebPage", "BreadcrumbList"],
  "/terms": ["Organization", "WebPage", "BreadcrumbList"],
};

type Node = Record<string, unknown>;

/** Extract + parse every <script type="application/ld+json"> block. */
function parseJsonLd(html: string, path: string): Node[] {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => m[1]!.trim());

  expect(blocks.length, `${path} has no JSON-LD blocks`).toBeGreaterThan(0);

  const nodes: Node[] = [];
  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `${path} has invalid JSON-LD: ${(err as Error).message}\n${raw.slice(0, 200)}`,
      );
    }
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Node)["@graph"])
        ? ((parsed as Node)["@graph"] as Node[])
        : [parsed as Node];
    nodes.push(...items);
  }
  return nodes;
}

const typesOf = (nodes: Node[]) =>
  nodes.flatMap((n) => {
    const t = n["@type"];
    return Array.isArray(t) ? (t as string[]) : t ? [t as string] : [];
  });

test.describe("JSON-LD structured data (initial SSR HTML)", () => {
  for (const [path, requiredTypes] of Object.entries(PAGE_SCHEMAS)) {
    test(`${path} emits valid, complete schema markup`, async () => {
      const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
      const res = await ctx.get(path, { headers: { "user-agent": "Googlebot" } });
      expect(res.status(), `${path} status`).toBe(200);
      const html = await res.text();
      await ctx.dispose();

      const nodes = parseJsonLd(html, path);
      const types = typesOf(nodes);

      for (const required of requiredTypes) {
        expect(types, `${path} is missing @type ${required}`).toContain(required);
      }

      for (const node of nodes) {
        // Schema.org context + a concrete type on every node.
        const ctxVal = node["@context"];
        if (ctxVal !== undefined) {
          expect(
            String(ctxVal),
            `${path} node has a non-schema.org @context`,
          ).toMatch(/^https?:\/\/schema\.org\/?$/);
        }
        expect(node["@type"], `${path} node is missing @type`).toBeTruthy();

        // No empty / placeholder values leaking into rich results.
        for (const [key, value] of Object.entries(node)) {
          if (typeof value === "string") {
            expect(
              value.trim(),
              `${path} node ${String(node["@type"])} has empty "${key}"`,
            ).not.toBe("");
            expect(
              value,
              `${path} node ${String(node["@type"])} has placeholder "${key}"`,
            ).not.toMatch(/lorem ipsum|TODO|undefined|\[object Object\]/i);
          }
        }

        // @id / url must be absolute so nodes can be linked across pages.
        for (const key of ["@id", "url"] as const) {
          const value = node[key];
          if (typeof value === "string") {
            expect(value, `${path} ${key} must be absolute`).toMatch(/^https?:\/\//);
          }
        }
      }

      // The WebPage node must self-reference this URL and attribute to the hub.
      const expectedUrl = path === "/" ? `${SITE}/` : `${SITE}${path}`;
      const webPage = nodes.find((n) => n["@type"] === "WebPage");
      expect(webPage, `${path} has no WebPage node`).toBeTruthy();
      expect(webPage!["url"], `${path} WebPage url`).toBe(expectedUrl);
      expect(
        JSON.stringify(webPage!["publisher"]),
        `${path} WebPage must be published by the hub Organization`,
      ).toContain(HUB_ORG_ID);

      // Hub Organization node identity is stable across pages.
      const hubOrg = nodes.find((n) => n["@id"] === HUB_ORG_ID);
      expect(hubOrg, `${path} is missing the hub Organization node`).toBeTruthy();
      expect(hubOrg!["name"]).toBe("The Resonance Hub");

      // Breadcrumbs, when present, must be ordered and end on this page.
      const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList");
      if (crumbs) {
        const items = crumbs["itemListElement"] as Node[];
        expect(Array.isArray(items) && items.length >= 2).toBe(true);
        items.forEach((item, i) => {
          expect(item["@type"]).toBe("ListItem");
          expect(item["position"]).toBe(i + 1);
          expect(String(item["name"]).trim()).not.toBe("");
          expect(String(item["item"])).toMatch(/^https?:\/\//);
        });
        expect(items.at(-1)!["item"]).toBe(expectedUrl);
      }
    });
  }

  test("FAQPage questions carry non-empty answers", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const html = await (await ctx.get("/contact")).text();
    await ctx.dispose();

    const faq = parseJsonLd(html, "/contact").find(
      (n) => n["@type"] === "FAQPage",
    );
    expect(faq, "/contact has no FAQPage node").toBeTruthy();
    const questions = faq!["mainEntity"] as Node[];
    expect(Array.isArray(questions) && questions.length > 0).toBe(true);
    for (const q of questions) {
      expect(q["@type"]).toBe("Question");
      expect(String(q["name"]).trim()).not.toBe("");
      const answer = q["acceptedAnswer"] as Node;
      expect(answer?.["@type"]).toBe("Answer");
      expect(String(answer?.["text"]).trim()).not.toBe("");
    }
  });

  test("free-promotion /pricing emits no purchasable Product or Offer schema", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const html = await (await ctx.get("/pricing")).text();
    await ctx.dispose();

    const nodes = parseJsonLd(html, "/pricing");
    const types = typesOf(nodes);
    expect(types, "/pricing must not advertise a paid Product during free promotion").not.toContain("Product");
    expect(
      types.some((type) => /Offer|AggregateOffer/.test(String(type))),
      "/pricing must not expose paid Offer schema during free promotion",
    ).toBe(false);

    const app = nodes.find((n) => n["@type"] === "SoftwareApplication");
    expect(app, "/pricing should describe the application").toBeTruthy();
    expect(String(app!["name"]).trim()).not.toBe("");
    expect(String(app!["description"]).trim()).not.toBe("");
  });

  test("legacy hub redirects emit no JSON-LD", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.get("/upgrade", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    await ctx.dispose();
  });
});
