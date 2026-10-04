import { HUB_URL, hubUrl } from "@/lib/entitlement";

/**
 * Legacy spoke URLs → canonical Resonance Hub routes.
 *
 * The hub (reson8.life) is the source of truth for pricing, checkout,
 * billing, account, updates and support. Any legacy spoke path that used
 * to serve those surfaces forwards to the hub equivalent.
 *
 * Keys are lower-case pathnames without a trailing slash.
 */
export const HUB_REDIRECTS: Record<string, string> = {
  // Billing & checkout (hub-owned)
  "/checkout": "/checkout",
  "/cart": "/checkout",
  "/buy": "/checkout",
  "/billing": "/account",
  "/account": "/account",
  "/account/billing": "/account",
  "/invoices": "/account",
  "/subscribe": "/pricing",
  "/subscription": "/pricing",
  "/subscriptions": "/pricing",
  "/plans": "/pricing",
  "/plan": "/pricing",
  "/upgrade": "/pricing",
  "/credits": "/pricing#credits",
  "/packs": "/pricing#packs",

  // Product news & help (hub-owned)
  "/updates": "/updates",
  "/changelog": "/updates",
  "/releases": "/updates",
  "/roadmap": "/updates",
  "/support": "/support",
  "/help": "/support",
  "/faq": "/support",
  "/docs": "/docs",
  "/blog": "/blog",

  // Ecosystem / brand
  "/hub": "/",
  "/resonance": "/",
  "/reson8": "/",
  "/ecosystem": "/",
};

/** Normalise a pathname for lookup (lower-case, no trailing slash). */
export function normalizePath(pathname: string) {
  const p = pathname.toLowerCase().replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * Returns the absolute hub URL a legacy spoke path should forward to,
 * or null when the path is served by this spoke.
 */
export function resolveHubRedirect(pathname: string, search = "", hash = "") {
  const target = HUB_REDIRECTS[normalizePath(pathname)];
  if (!target) return null;
  const base = hubUrl(target);
  // Preserve query string; keep the mapped hash unless the URL carries one.
  const url = new URL(base, HUB_URL);
  if (search) url.search = search;
  if (hash) url.hash = hash;
  return url.toString();
}

/** All legacy spoke paths that forward to the hub. */
export const LEGACY_HUB_PATHS = Object.keys(HUB_REDIRECTS);
