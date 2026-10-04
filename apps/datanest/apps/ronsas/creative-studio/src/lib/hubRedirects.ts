/**
 * Hub redirect map — SEO consolidation on https://www.reson8.life
 *
 * NOTE ON 301s: this app is a static SPA on Lovable hosting, which does not
 * expose server-level redirect rules, so a true HTTP 301 cannot be emitted
 * from the app itself. The strongest signal available client-side is:
 *   1. canonical + og:url pointing at the hub (already in <SEO />)
 *   2. `noindex` on the duplicated spoke page
 *   3. an immediate client-side redirect to the hub equivalent
 * Google treats a canonical + instant redirect as a strong consolidation
 * signal. For a true 301, the redirect must be configured at the DNS/CDN
 * layer for creativestudio.life (or on the hub side).
 */

export const HUB_ORIGIN = "https://www.reson8.life";

/** Spoke path -> hub path. Only pages that are genuinely duplicated on the hub. */
export const HUB_REDIRECTS: Record<string, string> = {
  "/pricing": "/pricing",
  "/about": "/about",
  "/contact": "/contact",
  "/terms": "/terms",
  "/privacy": "/privacy",
  "/updates": "/updates",
};

/** Normalise a pathname (strip trailing slash, lowercase). */
export function normalizePath(pathname: string): string {
  const p = pathname.toLowerCase().replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * Returns the absolute hub URL this spoke path should redirect to, or null
 * when the path is spoke-owned (studio, library, auth, admin, guides…).
 */
export function hubRedirectFor(pathname: string, search = "", hash = ""): string | null {
  const target = HUB_REDIRECTS[normalizePath(pathname)];
  if (!target) return null;
  return `${HUB_ORIGIN}${target}${search}${hash}`;
}
