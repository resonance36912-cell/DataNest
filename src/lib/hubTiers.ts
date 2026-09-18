/**
 * Canonical Resonance Hub tier metadata for Sync Vision.
 * Source of truth: https://reson8.life/pricing
 * Keep display names + prices in lock-step with the Hub — every paywall,
 * locked-step banner and upgrade CTA in this app reads from here.
 */
import type { Tier } from "@/lib/entitlement";

export type HubTier = "creator" | "pro" | "business" | "all_access";

export interface HubTierMeta {
  /** Exact display name used on reson8.life (case-sensitive). */
  name: string;
  /** Pack price reference — empty when the Hub is the source of truth. */
  priceZAR: string;
  /** One-line tagline shown under the tier label in paywalls. */
  tagline: string;
}

export const HUB_TIERS: Record<HubTier, HubTierMeta> = {
  creator: {
    name: "Creator",
    priceZAR: "",
    tagline:
      "Unlocks AI character generation, scene video generation and the final video merge.",
  },
  pro: {
    name: "Pro",
    priceZAR: "",
    tagline:
      "Adds HD rendering and priority queue across the whole Sync Vision pipeline.",
  },
  business: {
    name: "Business",
    priceZAR: "",
    tagline: "Team seats, bulk renders and SLA support for studios.",
  },
  all_access: {
    name: "All-Access",
    priceZAR: "",
    tagline: "Every Resonance app — Sync Vision, Hub tools and future launches — bundled.",
  },
};

/** Pretty-print any tier (including `free`/`null`) for "You're on …" chips. */
export function tierDisplayName(tier: Tier): string {
  if (!tier || tier === "free") return "Free";
  if (tier === "starter") return "Starter";
  return HUB_TIERS[tier as HubTier]?.name ?? tier;
}
