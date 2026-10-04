// Brief synthesis from Brand DNA + selected Product + active Moodboard.
// This bypasses the scrape→analyze pipeline entirely: when a user has a
// curated product, generation reads identity from `brand_dna`, hero image
// from `products.hero_image_url`, and visual guidance from
// `moodboards.analysis`. No URL fetch, no Firecrawl race, no watchdog.

import type { CreativeBrief } from "@/pages/Studio";
import type { BrandDna, Product, Moodboard } from "@/lib/brandDna";

export interface BriefFromDnaInput {
  dna: BrandDna | null;
  product: Product;
  moodboard?: Moodboard | null;
  contentType: string;
  style: string;
  instructions?: string;
}

const CONTENT_LABEL: Record<string, string> = {
  poster: "poster",
  brochure: "brochure",
  ad: "advertisement",
  video: "short video",
  social: "social post",
};

const pickColors = (dna: BrandDna | null, moodboard?: Moodboard | null): string[] => {
  const fromMood = (moodboard?.analysis as { palette?: string[] } | undefined)?.palette;
  if (Array.isArray(fromMood) && fromMood.length) return fromMood.slice(0, 4);
  const c = dna?.colors as { primary?: string; secondary?: string; accent?: string; palette?: string[] } | undefined;
  if (c?.palette?.length) return c.palette.slice(0, 4);
  const out = [c?.primary, c?.secondary, c?.accent].filter(Boolean) as string[];
  if (out.length) return out;
  return ["#0F0B1A", "#C026D3", "#F472B6"];
};

export function briefFromDna(input: BriefFromDnaInput): CreativeBrief {
  const { dna, product, moodboard, contentType, style, instructions } = input;
  const brand = dna?.brand_name?.trim() || product.name;
  const productName = product.name;
  const headline = dna?.tagline?.trim() || `Meet ${productName}`;
  const subheadline =
    product.description?.trim() ||
    dna?.mission?.trim() ||
    `A ${style} ${CONTENT_LABEL[contentType] ?? contentType} crafted around ${brand}.`;
  const keyPoints = (
    product.key_features?.length
      ? product.key_features
      : dna?.value_props?.length
      ? dna.value_props
      : ["Quality you can trust", "Crafted with intention", "Made for South Africa"]
  ).slice(0, 4);
  const callToAction =
    contentType === "social"
      ? "Tap to learn more"
      : contentType === "video"
      ? "Watch the story"
      : "Discover more";
  const targetAudience =
    dna?.audience?.trim() ||
    "South African customers who value quality, craft and trust.";

  const moodNotes = (moodboard?.analysis as { mood?: string; lighting?: string; composition?: string } | undefined) || {};
  const voiceLine = dna?.voice_tone ? `Voice: ${dna.voice_tone}.` : "Voice: conscious, calm, confident — no hype.";
  const moodLine = [moodNotes.mood, moodNotes.lighting, moodNotes.composition].filter(Boolean).join(". ");
  const defaultDescription =
    `Create a ${style} ${CONTENT_LABEL[contentType] ?? contentType} for ${brand}. ` +
    `Lead with ${productName} as the central hero visual (use the supplied product image — never invent packaging). ` +
    `Headline: "${headline}". Support line: "${subheadline}". CTA: "${callToAction}". ` +
    `${voiceLine}${moodLine ? ` Mood: ${moodLine}.` : ""} Market: South Africa (ZAR-first, POPIA-aware).`;

  return {
    brand,
    headline,
    subheadline,
    keyPoints,
    targetAudience,
    callToAction,
    colorSuggestions: pickColors(dna, moodboard),
    instructions: instructions?.trim() || defaultDescription,
    tone: dna?.voice_tone || style,
  };
}

// Fetch a remote image (signed URL from `library` bucket) and return a base64
// data URL suitable for the generate-poster / generate-video edge functions.
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
