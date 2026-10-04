/**
 * Hub redirect policy.
 *
 * The Resonance Hub (https://www.reson8.life) is the SEO source of truth.
 * Public/marketing routes served from a spoke domain are redirected to their
 * hub equivalent so crawlers consolidate on the hub URLs.
 *
 * NOTE: static hosting cannot emit a real HTTP 301 here — this performs a
 * client-side replace (no history entry), paired with the canonical tags that
 * already point at the hub. DNS/CDN-level 301s must be configured at the
 * registrar/proxy for a true server redirect.
 */

export const HUB_ORIGIN = "https://www.reson8.life";
export const HUB_BASE_PATH = "/apps/sync-vision";

/** Hosts that must NOT redirect (previews, local dev, the hub itself). */
const EXEMPT_HOST_RE = /(^localhost$|^127\.0\.0\.1$|\.lovable\.app$|(^|\.)reson8\.life$)/i;

/** Public routes that carry SEO value and map onto hub pages. */
const PUBLIC_ROUTE_MAP: Record<string, string> = {
  "/": "",
  "/about": "/about",
  "/ecosystem": "/ecosystem",
};

/** Bypass for humans who explicitly want to stay on the spoke. */
export const STAY_PARAM = "stay";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Resolve the hub URL a given spoke location should redirect to.
 * Returns null when no redirect should happen.
 */
export function resolveHubRedirect(loc: {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
}): string | null {
  if (EXEMPT_HOST_RE.test(loc.hostname)) return null;

  const search = loc.search ?? "";
  if (new URLSearchParams(search).has(STAY_PARAM)) return null;

  const path = normalizePath(loc.pathname);
  const hubPath = PUBLIC_ROUTE_MAP[path];
  if (hubPath === undefined) return null; // app route — leave it alone

  return `${HUB_ORIGIN}${HUB_BASE_PATH}${hubPath}${search}${loc.hash ?? ""}`;
}
