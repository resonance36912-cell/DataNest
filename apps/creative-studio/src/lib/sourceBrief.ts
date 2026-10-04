// Browser mirror of supabase/functions/_shared/sourceBrief.ts
export type SourceType =
  | "website"
  | "youtube"
  | "product"
  | "article"
  | "social"
  | "unknown";

export interface SourceBrief {
  sourceUrl: string;
  sourceType: SourceType;
  brandName: string;
  pageTitle: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  offer: string;
  products: string[];
  services: string[];
  audience: string;
  benefits: string[];
  proofPoints: string[];
  pricing: string;
  callsToAction: string[];
  colors: string[];
  images: string[];
  logo: string;
  links: string[];
  rawMarkdown: string;
  screenshot: string | null;
  confidenceScore: number;
  extractionWarnings: string[];
  // Optional, additive — populated from HTML head/JSON-LD when available.
  pageType?: "product" | "article" | "podcast" | "video" | "business" | "generic";
  canonicalUrl?: string;
  themeColor?: string;
  language?: string;
  productMeta?: {
    name?: string;
    brand?: string;
    sku?: string;
    price?: string;
    currency?: string;
    availability?: string;
    rating?: string;
    reviewCount?: string;
  };
  articleMeta?: { author?: string; publishedAt?: string };
  jsonLdTypes?: string[];
  complianceFlags?: Array<{ term: string; sentence: string; suggestion: string }>;
  // Universal product-scrape outputs.
  heroImageUrl?: string;
  imageConfidence?: "high" | "medium" | "low" | "none";
  imageSource?: "jsonld" | "og" | "twitter" | "logo" | "screenshot" | "scraped" | "search-fallback";
  usedFallbackSearch?: boolean;
  // Populated by optimize-source-images when the heuristic pass returns
  // low / no confidence. Generators prefer optimizedImages.hero over
  // heroImageUrl when present and the original confidence was low/none.
  optimizedImages?: {
    hero?: string;
    heroConfidence: "high" | "medium" | "low" | "none";
    ranked: Array<{ url: string; score: number; reason: string; isScreenshot: boolean }>;
    screenshot: string | null;
    capturedScreenshot: boolean;
    contentType: string;
    aspectRatio: string;
    warnings?: string[];
  };
}


export interface RankedSourceImage {
  url: string;
  score: number;
  source: "logo" | "screenshot" | "scraped";
  reasons: string[];
}

export function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export interface SourceChecklist {
  brand: boolean;
  hero: boolean;
  offer: boolean;
  benefits: boolean;
  cta: boolean;
  images: boolean;
  pricing: boolean;
}

export function checklistFor(b: SourceBrief): SourceChecklist {
  return {
    brand: !!b.brandName,
    hero: !!b.heroHeadline,
    offer: !!b.offer,
    benefits: (b.benefits?.length ?? 0) >= 3,
    cta: (b.callsToAction?.length ?? 0) > 0,
    images: (b.images?.length ?? 0) > 0 || !!b.logo,
    pricing: !!b.pricing,
  };
}
