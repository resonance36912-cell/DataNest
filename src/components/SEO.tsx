import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";

import {
  SHARE,
  SHARE_IMAGE_VARIANTS,
  providerImage,
  providerMeta,
  ratioImageChain,
  resolveShare,
  shareUrl,
} from "@/lib/shareMeta";


// SEO + share previews are consolidated on the Resonance Hub — every canonical,
// og:url and twitter:url points at https://www.reson8.life. See
// src/lib/shareMeta.ts for the single source of truth.

interface SEOProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

const SEO = ({ title, description, path, image, jsonLd, noindex }: SEOProps) => {
  const url = shareUrl(path);
  // Per-route card copy (title/description/image) comes from the share-variant
  // registry; the destination stays pinned to the hub via shareUrl().
  const share = resolveShare(path, { title, description, image });
  // Ordered candidates start with the 1.91:1 wide variant (best for Facebook,
  // LinkedIn, Slack, X and Google) and include the square / vertical ratios so
  // a provider that prefers them still finds a live URL.
  const candidates = ratioImageChain(share.image).map((c) =>
    share.imageAlt ? { ...c, alt: share.imageAlt } : c,
  );
  // react-helmet-async dedupes <meta> by property, so the ordered og:image
  // chain can only live in the static head (see index.html). Here we probe the
  // candidates at runtime and publish the first one that actually loads, so a
  // dead asset origin still yields a working preview for JS-executing crawlers.
  const [resolved, setResolved] = useState(candidates[0]);

  useEffect(() => {
    let cancelled = false;
    setResolved(candidates[0]);
    const probe = (i: number) => {
      if (cancelled || i >= candidates.length) return;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setResolved(candidates[i]);
      };
      img.onerror = () => probe(i + 1);
      img.src = candidates[i].url;
    };
    probe(0);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.map((c) => c.url).join("|")]);

  // X renders a 2:1-ish large card, so it always gets the wide variant unless
  // the page supplied its own artwork.
  const twitterImage = share.image
    ? providerImage("x", share.image)
    : resolved.url === SHARE_IMAGE_VARIANTS.wide.url
      ? resolved
      : SHARE_IMAGE_VARIANTS.wide;

  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {/* hreflang: single English (South Africa) edition, hub-hosted canonical.
          en-ZA, en and x-default all resolve to the same hub URL so crawlers
          treat the spoke page as a duplicate of the hub page, not a rival. */}
      <link rel="alternate" hrefLang="en-za" href={url} />
      <link rel="alternate" hrefLang="en" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />

      <meta property="og:title" content={share.title} />
      <meta property="og:description" content={share.description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={SHARE.type} />
      <meta property="og:site_name" content={SHARE.siteName} />
      <meta property="og:locale" content={SHARE.locale} />
      <meta property="og:locale:alternate" content={SHARE.localeAlternate} />
      <meta property="og:image" content={resolved.url} />
      <meta property="og:image:secure_url" content={resolved.url} />
      <meta property="og:image:type" content={resolved.type} />
      <meta property="og:image:width" content={String(resolved.width)} />
      <meta property="og:image:height" content={String(resolved.height)} />
      <meta property="og:image:alt" content={resolved.alt} />

      <meta name="twitter:card" content={SHARE.twitterCard} />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:domain" content="www.reson8.life" />
      <meta name="twitter:title" content={share.title} />
      <meta name="twitter:description" content={share.description} />
      <meta name="twitter:image" content={twitterImage.url} />
      <meta name="twitter:image:width" content={String(twitterImage.width)} />
      <meta name="twitter:image:height" content={String(twitterImage.height)} />
      <meta name="twitter:image:alt" content={resolved.alt} />

      {/* Provider-specific card tags (Google/Gmail microdata, Pinterest rich
          pins, Slack/X label rows, Teams tiles, Discord accent) — same copy,
          same artwork, same hub destination as the og / twitter pair. */}
      {providerMeta({
        title: share.title,
        description: share.description,
        image: resolved.url,
        imageOverride: share.image,
      }).map((t) =>
        t.itemProp ? (
          <meta key={`ip-${t.itemProp}`} itemProp={t.itemProp} content={t.content} />
        ) : (
          <meta key={t.name} name={t.name} content={t.content} />
        ),
      )}
      <link rel="image_src" href={resolved.url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      {ldArray.map((ld, i) => (

        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEO;
