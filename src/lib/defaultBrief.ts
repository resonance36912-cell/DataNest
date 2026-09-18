// Default fallback CreativeBrief + description generator. Used when scrape/analyze
// cannot synthesise a brief (e.g. URL reader timed out, source is too thin, or
// the user clicked Generate without any analysis). Keeps generation unblocked
// instead of hard-stopping the pipeline.

import type { CreativeBrief } from "@/pages/Studio";
import type { SourceBrief } from "@/lib/sourceBrief";

export interface DefaultBriefInput {
  url?: string;
  files?: File[];
  contentType: string;
  style: string;
  instructions?: string;
  sourceBrief?: SourceBrief | null;
}

const titleCase = (s: string) =>
  s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

const hostFromUrl = (url?: string): string | null => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
};

const brandFromHost = (host: string | null): string | null => {
  if (!host) return null;
  const root = host.split(".").slice(-2, -1)[0] || host;
  return titleCase(root);
};

const brandFromFile = (file?: File | null): string | null => {
  if (!file) return null;
  const base = file.name.replace(/\.[^.]+$/, "");
  return titleCase(base).slice(0, 40) || null;
};

const CONTENT_LABEL: Record<string, string> = {
  poster: "poster",
  brochure: "brochure",
  ad: "advertisement",
  video: "short video",
  social: "social post",
};

/**
 * Build a sensible default brief from whatever signals we have — even a bare
 * URL or a single upload. Never returns null; always safe to feed to generation.
 */
export const buildDefaultBrief = (input: DefaultBriefInput): CreativeBrief => {
  const { url, files = [], contentType, style, instructions, sourceBrief: sb } = input;
  const host = hostFromUrl(url);
  const brand =
    sb?.brandName?.trim() ||
    brandFromHost(host) ||
    brandFromFile(files[0]) ||
    "Your Brand";

  const product =
    sb?.products?.[0] ||
    sb?.services?.[0] ||
    sb?.pageTitle ||
    sb?.heroHeadline ||
    (files[0] ? brandFromFile(files[0]) : null) ||
    `${titleCase(style)} ${CONTENT_LABEL[contentType] ?? contentType}`;

  const headline =
    sb?.heroHeadline?.trim() ||
    (product ? `Meet ${product}` : `Introducing ${brand}`);

  const subheadline =
    sb?.heroSubheadline?.trim() ||
    sb?.metaDescription?.trim() ||
    sb?.offer?.trim() ||
    `A ${style} ${CONTENT_LABEL[contentType] ?? contentType} crafted around ${brand}.`;

  const keyPoints = (
    sb?.benefits?.length ? sb.benefits :
    sb?.proofPoints?.length ? sb.proofPoints :
    ["Quality you can trust", "Crafted with intention", "Made for South Africa"]
  ).slice(0, 4);

  const callToAction =
    sb?.callsToAction?.[0]?.trim() ||
    (contentType === "social" ? "Tap to learn more" :
     contentType === "video"  ? "Watch the story" :
     "Discover more");

  const targetAudience =
    sb?.audience?.trim() ||
    "South African customers who value quality, craft and trust.";

  const colorSuggestions =
    (sb?.colors && sb.colors.length ? sb.colors : ["#0F0B1A", "#C026D3", "#F472B6"]).slice(0, 4);

  const defaultDescription =
    `Create a ${style} ${CONTENT_LABEL[contentType] ?? contentType} for ${brand}. ` +
    `Lead with ${product} as the hero. Headline: "${headline}". ` +
    `Support line: "${subheadline}". CTA: "${callToAction}". ` +
    `Voice: conscious, calm, confident — no hype. Market: South Africa (ZAR-first, POPIA-aware).`;

  return {
    brand,
    headline,
    subheadline,
    keyPoints,
    targetAudience,
    callToAction,
    colorSuggestions,
    instructions: instructions?.trim() || defaultDescription,
    tone: style,
  };
};
