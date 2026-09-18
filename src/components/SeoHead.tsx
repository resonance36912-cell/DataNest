import { Helmet } from "react-helmet-async";
import { DECLARED_LOCALES, hreflangAlternates, ogLocale } from "@/lib/seoLocales";

type PreloadHint = {
  href: string;
  as: "image" | "font" | "style" | "script";
  type?: string;
  fetchPriority?: "high" | "low" | "auto";
  imageSrcSet?: string;
  imageSizes?: string;
  crossOrigin?: "anonymous" | "use-credentials";
};

type Props = {
  title: string;
  description: string;
  path: string;
  /**
   * Above-the-fold assets only. Preloading below-the-fold media competes with
   * the LCP element and makes perceived load slower, not faster.
   */
  preload?: PreloadHint[];
};


// SEO source-of-truth is the Resonance Hub. Every route on this spoke canonicalizes
// to its equivalent under https://www.reson8.life/apps/sync-vision so search engines
// consolidate authority on the hub.
const HUB_BASE = "https://www.reson8.life";
const HUB_APP_PREFIX = "/apps/sync-vision";

function hubUrlFor(path: string) {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${HUB_BASE}${HUB_APP_PREFIX}${clean}`;
}

export function SeoHead({ title, description, path, preload = [] }: Props) {
  const url = hubUrlFor(path);
  // One English content variant serves every declared region, so each
  // hreflang alternate (and the canonical) resolves to the same hub URL.
  // Localized canonical variants would only be correct once genuinely
  // localized pages exist at distinct URLs.
  const alternates = hreflangAlternates();
  const primaryLocale = DECLARED_LOCALES[0] ?? "en-ZA";
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content={ogLocale(primaryLocale)} />
      {DECLARED_LOCALES.filter((l) => l !== primaryLocale && l.includes("-")).map((l) => (
        <meta key={l} property="og:locale:alternate" content={ogLocale(l)} />
      ))}
      <meta property="og:site_name" content="The Resonance Hub" />
      {alternates.map((hl) => (
        <link key={hl} rel="alternate" hrefLang={hl} href={url} />
      ))}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {preload.map((p) => (
        <link
          key={`${p.as}:${p.href}`}
          rel="preload"
          as={p.as}
          href={p.href}
          type={p.type}
          imageSrcSet={p.imageSrcSet}
          imageSizes={p.imageSizes}
          crossOrigin={p.crossOrigin}
          fetchPriority={p.fetchPriority}
        />
      ))}

    </Helmet>
  );
}
