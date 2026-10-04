import { Helmet } from "react-helmet-async";

const SITE = "https://youtubeoptimizer.life";
const SITE_NAME = "The Resonance · YouTube Optimizer";
const DEFAULT_OG_IMAGE = `${SITE}/og-image.png`;

// The Resonance Hub is the source of truth for pricing, checkout, updates,
// support and ecosystem bundles. Every page on this spoke advertises the
// hub as publisher / owning Organization so search engines and link
// previews attribute the app to reson8.life.
const HUB_URL = "https://reson8.life";
const HUB_ORG_ID = `${HUB_URL}/#organization`;

const HUB_ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": HUB_ORG_ID,
  name: "The Resonance Hub",
  url: HUB_URL,
  sameAs: [
    HUB_URL,
    "https://epublisher.reson8.life/",
    "https://creative.reson8.life/",
    "https://www.resonance-podcast.com/",
    "https://www.youtube.com/@resonance36912",
  ],
};

interface SEOProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  jsonLd?: object | object[];
  /** Label used for this page in the BreadcrumbList (defaults to the path segment). */
  breadcrumb?: string;
}

/** Title-case a URL path segment: "content-ideas" → "Content Ideas". */
const labelFromPath = (path: string) =>
  path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .pop()!
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const SEO = ({ title, description, path, image, jsonLd, breadcrumb }: SEOProps) => {
  const url = `${SITE}${path}`;
  const ogImage = image
    ? image.startsWith("http")
      ? image
      : `${SITE}${image.startsWith("/") ? image : `/${image}`}`
    : DEFAULT_OG_IMAGE;

  // WebPage is emitted on every route and stitches this page to the hub
  // Organization via publisher/isPartOf. It sits alongside any per-page
  // jsonLd (Product, Article, FAQPage, …) the caller passes in.
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: "en",
    isPartOf: { "@id": HUB_ORG_ID },
    publisher: { "@id": HUB_ORG_ID },
    primaryImageOfPage: ogImage,
  };

  // Every non-home page carries a BreadcrumbList so crawlers understand the
  // spoke's shallow hierarchy (Home → page).
  const isHome = path === "/" || path === "";
  const breadcrumbList = isHome
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: breadcrumb ?? labelFromPath(path),
            item: url,
          },
        ],
      };

  const extra = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const blocks = [
    HUB_ORGANIZATION,
    webPage,
    ...(breadcrumbList ? [breadcrumbList] : []),
    ...extra,
  ];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:see_also" content={HUB_URL} />
      <meta property="article:publisher" content={HUB_URL} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={title} />
      {blocks.map((b, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(b)}</script>
      ))}
    </Helmet>
  );
};

export default SEO;
