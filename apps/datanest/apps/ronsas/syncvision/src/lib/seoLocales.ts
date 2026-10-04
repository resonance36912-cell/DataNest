/**
 * Single source of truth for the locales this project publishes.
 *
 * Shared by the runtime (<SeoHead>), the sitemap generator, and the
 * build-time validators so hreflang sets can never drift between
 * index.html, sitemap.xml, and per-route heads.
 *
 * The app ships ONE English content variant. The extra regional tags
 * are region targeting for the same page (all alternates resolve to the
 * same hub URL) — this is the shape Google expects when a single page
 * serves several regions. Add a tag here ONLY when the hub genuinely
 * serves that region.
 *
 * `x-default` is NEVER listed here — it's a fallback marker, not a
 * locale. `hreflangAlternates()` appends it automatically.
 */
export const DECLARED_LOCALES: readonly string[] = [
  "en-ZA",
  "en-GB",
  "en-US",
  "en",
] as const;

/** Set form for O(1) membership checks in the validators. */
export const DECLARED_LOCALES_SET: ReadonlySet<string> = new Set(DECLARED_LOCALES);

/**
 * The full ordered list of hreflang tags every <url> must expose:
 * every declared locale followed by the mandatory `x-default` fallback.
 */
export function hreflangAlternates(): string[] {
  const out = DECLARED_LOCALES.filter((l) => l !== "x-default");
  out.push("x-default");
  return out;
}

/** og:locale value for a BCP-47 tag (og uses underscores). */
export function ogLocale(tag: string): string {
  return tag.replace("-", "_");
}
