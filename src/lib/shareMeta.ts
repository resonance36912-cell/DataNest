/**
 * Share / link-preview metadata (OpenGraph + Twitter).
 *
 * Single source of truth for everything a social crawler reads. Every shared
 * link resolves to The Resonance Hub (https://www.reson8.life) so shares,
 * canonical signals and indexing all point at the same destination.
 *
 * The preview IMAGE is still served from the spoke's own origin
 * (https://creativestudio.life/og-cover.jpg) because that file must return a
 * 200 to a crawler — the hub does not currently host it (it 302s). Image
 * origin does not affect attribution; og:url does.
 */

export const HUB_URL = "https://www.reson8.life";
export const ASSET_ORIGIN = "https://creativestudio.life";
/** Published Lovable origin — serves the same /public assets if the custom domain fails. */
export const ASSET_ORIGIN_FALLBACK = "https://resonancestudio.lovable.app";

export type ShareImage = {
  url: string;
  width: number;
  height: number;
  alt: string;
  type: string;
};

const ALT = "Resonance Creative Studio — AI visual content for South African brands";

export const SHARE = {
  siteName: "The Resonance",
  locale: "en_ZA",
  localeAlternate: "af_ZA",
  type: "website",
  twitterCard: "summary_large_image",
  image: {
    url: `${ASSET_ORIGIN}/og-cover.jpg`,
    width: 1536,
    height: 1024,
    alt: ALT,
    type: "image/jpeg",
  },
} as const;

/**
 * Ordered og:image candidates. Crawlers walk the list and use the first URL
 * that actually returns an image, so a dead custom domain or a missing file
 * still yields a preview instead of a bare card.
 */
export const SHARE_IMAGE_FALLBACKS: ShareImage[] = [
  { url: `${ASSET_ORIGIN}/og-cover.jpg`, width: 1536, height: 1024, alt: ALT, type: "image/jpeg" },
  { url: `${ASSET_ORIGIN_FALLBACK}/og-cover.jpg`, width: 1536, height: 1024, alt: ALT, type: "image/jpeg" },
  { url: `${ASSET_ORIGIN}/logo-creative-studio.png`, width: 1024, height: 1024, alt: ALT, type: "image/png" },
  { url: `${ASSET_ORIGIN_FALLBACK}/logo-creative-studio.png`, width: 1024, height: 1024, alt: ALT, type: "image/png" },
];

// ---------------------------------------------------------------------------
// Per-provider image variants (aspect ratios)
// ---------------------------------------------------------------------------
/**
 * Providers crop shared artwork differently. Serving a variant that already
 * matches each provider's preferred aspect ratio avoids centre-crops that
 * clip the wordmark:
 *
 * - `wide`      1200×630  (1.91:1) — Facebook, LinkedIn, Slack, X large card,
 *                                    Google/Gmail, Telegram, Discord
 * - `landscape` 1536×1024 (3:2)    — the original cover, generic fallback
 * - `square`    1080×1080 (1:1)    — WhatsApp, iMessage, Teams tiles
 * - `vertical`  1000×1500 (2:3)    — Pinterest pins
 *
 * All variants are ≤ 250 KB so WhatsApp's ~300 KB ceiling is never hit.
 * Only the ARTWORK varies — og:url / twitter:url stay pinned to the hub.
 */
export type ShareRatio = "wide" | "landscape" | "square" | "vertical";

const variant = (file: string, width: number, height: number): ShareImage => ({
  url: `${ASSET_ORIGIN}/${file}`,
  width,
  height,
  alt: ALT,
  type: "image/jpeg",
});

export const SHARE_IMAGE_VARIANTS: Record<ShareRatio, ShareImage> = {
  wide: variant("og-cover-wide.jpg", 1200, 630),
  landscape: variant("og-cover.jpg", 1536, 1024),
  square: variant("og-cover-square.jpg", 1080, 1080),
  vertical: variant("og-cover-vertical.jpg", 1000, 1500),
};

/** Same variants served from the published Lovable origin (fallback chain). */
export const SHARE_IMAGE_VARIANTS_FALLBACK: Record<ShareRatio, ShareImage> = {
  wide: { ...SHARE_IMAGE_VARIANTS.wide, url: `${ASSET_ORIGIN_FALLBACK}/og-cover-wide.jpg` },
  landscape: { ...SHARE_IMAGE_VARIANTS.landscape, url: `${ASSET_ORIGIN_FALLBACK}/og-cover.jpg` },
  square: { ...SHARE_IMAGE_VARIANTS.square, url: `${ASSET_ORIGIN_FALLBACK}/og-cover-square.jpg` },
  vertical: { ...SHARE_IMAGE_VARIANTS.vertical, url: `${ASSET_ORIGIN_FALLBACK}/og-cover-vertical.jpg` },
};

/** Which ratio each supported provider renders best with. */
export const PROVIDER_RATIO: Record<string, ShareRatio> = {
  facebook: "wide",
  linkedin: "wide",
  x: "wide",
  slack: "wide",
  telegram: "wide",
  discord: "wide",
  google: "wide",
  whatsapp: "square",
  imessage: "square",
  teams: "square",
  pinterest: "vertical",
};

/**
 * Artwork for a provider. A per-page image override always wins (the page
 * picked that art deliberately); otherwise the provider's ratio variant.
 */
export function providerImage(provider: string, override?: string): ShareImage {
  if (override) {
    const url = shareImage(override);
    return {
      url,
      width: 1200,
      height: 630,
      alt: ALT,
      type: /\.png($|\?)/i.test(url) ? "image/png" : "image/jpeg",
    };
  }
  return SHARE_IMAGE_VARIANTS[PROVIDER_RATIO[provider] ?? "wide"];
}

/**
 * Ordered og:image chain for non-JS crawlers: preferred wide variant first,
 * then the alternate ratios, then the legacy cover / logo fallbacks. Crawlers
 * take the first URL that returns an image; providers that prefer another
 * ratio pick it up from their own tag family.
 */
export function ratioImageChain(override?: string): ShareImage[] {
  const list: ShareImage[] = [
    SHARE_IMAGE_VARIANTS.wide,
    SHARE_IMAGE_VARIANTS_FALLBACK.wide,
    SHARE_IMAGE_VARIANTS.square,
    SHARE_IMAGE_VARIANTS.vertical,
    ...SHARE_IMAGE_FALLBACKS,
  ];
  if (override) list.unshift(providerImage("facebook", override));
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}




/** Hub-owned paths keep their path; spoke-only paths share as the hub root. */
export const HUB_PATHS = new Set<string>([
  "/",
  "/pricing",
  "/updates",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
]);

/** The absolute hub URL a given spoke path should share as. */
export function shareUrl(path: string): string {
  const clean = path.toLowerCase().replace(/\/+$/, "") || "/";
  return `${HUB_URL}${HUB_PATHS.has(clean) ? clean : "/"}`;
}

/** Resolve a per-page image override to an absolute, crawler-fetchable URL. */
export function shareImage(image?: string): string {
  if (!image) return SHARE.image.url;
  return image.startsWith("http") ? image : `${ASSET_ORIGIN}${image}`;
}

/**
 * Full ordered image list for a page: the optional per-page override first,
 * then the shared fallback chain (deduped). Never empty.
 */
export function shareImages(image?: string): ShareImage[] {
  const list = [...SHARE_IMAGE_FALLBACKS];
  if (image) {
    const url = shareImage(image);
    const type = /\.png($|\?)/i.test(url) ? "image/png" : "image/jpeg";
    list.unshift({ url, width: 1200, height: 630, alt: SHARE.image.alt, type });
  }
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

// ---------------------------------------------------------------------------
// Per-route share variants
// ---------------------------------------------------------------------------
/**
 * Route-specific CARD COPY (title / description / image).
 *
 * These change only what a shared card SAYS and SHOWS. They never change where
 * it points: og:url, twitter:url and canonical stay pinned to the hub via
 * shareUrl(), so all link equity and attribution still consolidate on
 * https://www.reson8.life.
 *
 * `image` may be a site-relative path (resolved against ASSET_ORIGIN) or an
 * absolute https URL. Omit it to use the shared cover.
 */
export type ShareVariant = {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
};

export const SHARE_VARIANTS: Record<string, ShareVariant> = {
  "/": {
    title: "Resonance Creative Studio — AI Content for SA Brands",
    description:
      "Turn URLs, images, docs, or prompts into AI-generated posters, ads, social packs and video for South African brands. Part of The Resonance.",
  },
  "/pricing": {
    title: "Creative Studio Packs & Credits — The Resonance",
    description:
      "Once-off project packs and credit bundles in ZAR. No monthly lock-in — all billing, bundles and support run through The Resonance Hub.",
  },
  "/about": {
    title: "About Resonance Creative Studio — The Resonance",
    description:
      "A South African AI creative studio, built as a spoke of The Resonance. Conscious tooling for brands that want expression without agency overhead.",
  },
  "/contact": {
    title: "Contact Resonance Creative Studio — The Resonance",
    description:
      "Questions about packs, credits or a bespoke campaign? Reach the Resonance team and we'll come back to you.",
  },
  "/studio": {
    title: "The Studio — Generate Posters, Ads & Video with AI",
    description:
      "Drop in a product URL, image or brief and generate on-brand posters, brochures, social packs and short video in minutes.",
  },
  "/library": {
    title: "Your Creative Library — Resonance Creative Studio",
    description:
      "Every poster, ad, social pack and video you've generated, stored securely and ready to download or remix.",
  },
  "/logo-designer": {
    title: "AI Logo Designer — Resonance Creative Studio",
    description:
      "Generate and refine logo directions for your brand, then export production-ready marks and lockups.",
  },
  "/studio/dna": {
    title: "Brand DNA — Resonance Creative Studio",
    description:
      "Capture your palette, type, tone and product truths once so every generated asset stays unmistakably yours.",
  },
  "/studio/moodboards": {
    title: "Moodboards — Resonance Creative Studio",
    description:
      "Build visual direction boards that steer every poster, ad and video your studio generates.",
  },
  "/studio/products": {
    title: "Products — Resonance Creative Studio",
    description:
      "Keep your product catalogue, imagery and verified pricing in one place so campaigns always use the right details.",
  },
  "/guides/url-to-poster": {
    title: "Guide: Turn Any Product URL into a Poster",
    description:
      "Step-by-step — paste a product link, confirm the extracted price, pick a format and export a print-ready poster.",
  },
  "/guides/brief-to-creative": {
    title: "Guide: From Brief to Finished Creative",
    description:
      "Step-by-step — turn a written brief into a full campaign pack: poster, social set, captions and short video.",
  },
  "/terms": {
    title: "Terms of Service — The Resonance",
    description:
      "The terms that govern Resonance Creative Studio, operated as a spoke of The Resonance.",
  },
  "/privacy": {
    title: "Privacy Policy — The Resonance",
    description:
      "How Resonance Creative Studio handles your data, POPIA-conscious and plainly explained.",
  },
  "/login": {
    title: "Sign in to Resonance Creative Studio",
    description:
      "Sign up or sign in to start generating on-brand creative. Billing and entitlements are managed by The Resonance Hub.",
  },
};

const normalisePath = (path: string) =>
  path.toLowerCase().split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** The registered share variant for a route, if one exists. */
export function shareVariant(path: string): ShareVariant | undefined {
  return SHARE_VARIANTS[normalisePath(path)];
}

/**
 * Resolved card copy for a route: the variant wins, with the page's own
 * title/description as fallback for routes that have no variant.
 */
export function resolveShare(
  path: string,
  fallback: { title: string; description: string; image?: string },
): Required<Pick<ShareVariant, "title" | "description">> & {
  image?: string;
  imageAlt?: string;
} {
  const v = shareVariant(path);
  return {
    title: v?.title ?? fallback.title,
    description: v?.description ?? fallback.description,
    // An explicit per-page image prop still beats the registry entry.
    image: fallback.image ?? v?.image,
    imageAlt: v?.imageAlt,
  };
}



// ---------------------------------------------------------------------------
// Provider-specific card tags
// ---------------------------------------------------------------------------
/**
 * Different link-preview providers read different tag families:
 *
 * - Facebook / LinkedIn / Slack / Telegram / Discord → OpenGraph (og:*)
 * - X (Twitter)                                      → twitter:*
 * - Google, Gmail, some Android surfaces             → schema.org microdata
 *                                                      (itemprop name/description/image)
 * - Pinterest                                        → og:* + rich-pin opt-in
 * - Microsoft Teams / Windows tiles                  → msapplication-TileImage
 * - Legacy scrapers (older forums, some CMSes)       → <link rel="image_src">
 *
 * `providerMeta()` returns the extra tags beyond og / twitter so every
 * provider resolves the same artwork, copy and destination.
 */
export type ProviderMetaTag = {
  name?: string;
  itemProp?: string;
  content: string;
};

export const TILE_COLOR = "#0a0a1f";

export function providerMeta(input: {
  title: string;
  description: string;
  /** Resolved default artwork (used where no ratio variant applies). */
  image: string;
  /** Per-page image override — wins over every ratio variant when set. */
  imageOverride?: string;
}): ProviderMetaTag[] {
  const pick = (provider: string) =>
    input.imageOverride
      ? providerImage(provider, input.imageOverride).url
      : providerImage(provider).url;

  const google = pick("google");
  const square = pick("whatsapp");
  const pin = pick("pinterest");

  return [
    // Google / Gmail annotated cards (schema.org microdata on <head>) — 1.91:1.
    { itemProp: "name", content: input.title },
    { itemProp: "description", content: input.description },
    { itemProp: "image", content: google },
    { name: "thumbnail", content: google },
    // Pinterest rich pins — 2:3 vertical pin artwork.
    { name: "pinterest-rich-pin", content: "true" },
    { name: "pinterest:media", content: pin },
    { name: "pinterest:description", content: input.description },
    // Slack / X extra card fields (rendered as labelled rows).
    { name: "twitter:label1", content: "Part of" },
    { name: "twitter:data1", content: "The Resonance" },
    { name: "twitter:label2", content: "Made for" },
    { name: "twitter:data2", content: "South Africa" },
    // Microsoft Teams / Windows tiles, WhatsApp & iMessage — 1:1 square.
    { name: "msapplication-TileImage", content: square },
    { name: "msapplication-TileColor", content: TILE_COLOR },
    // Discord / Android browser accent.
    { name: "theme-color", content: TILE_COLOR },
  ];
}


/** Providers we explicitly support, and the tag each one reads first. */
export const SHARE_PROVIDERS = [
  { id: "facebook", label: "Facebook", requires: ["og:title", "og:description", "og:image", "og:url", "og:type"] },
  { id: "linkedin", label: "LinkedIn", requires: ["og:title", "og:description", "og:image", "og:url"] },
  { id: "x", label: "X (Twitter)", requires: ["twitter:card", "twitter:title", "twitter:description", "twitter:image"] },
  { id: "slack", label: "Slack", requires: ["og:title", "og:description", "og:image", "og:site_name"] },
  { id: "whatsapp", label: "WhatsApp", requires: ["og:title", "og:description", "og:image", "og:image:type"] },
  { id: "telegram", label: "Telegram", requires: ["og:title", "og:description", "og:image"] },
  { id: "discord", label: "Discord", requires: ["og:title", "og:description", "og:image", "theme-color"] },
  { id: "pinterest", label: "Pinterest", requires: ["og:title", "og:description", "og:image", "pinterest-rich-pin"] },
  { id: "google", label: "Google / Gmail", requires: ["itemprop:name", "itemprop:description", "itemprop:image"] },
  { id: "teams", label: "Microsoft Teams", requires: ["og:title", "og:image", "msapplication-TileImage"] },
  { id: "imessage", label: "Apple iMessage", requires: ["og:title", "og:image", "og:image:type"] },
] as const;
