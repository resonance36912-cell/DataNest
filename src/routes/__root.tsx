import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { Helmet, HelmetProvider } from "react-helmet-async";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ASYNC_CSS_SWAP, CRITICAL_CSS } from "@/lib/critical-css";
import { LazyMotionProvider } from "@/lib/lazy-motion";



import appCss from "../styles.css?url";


const ORGANIZATION_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "http://192.168.1.50:4173/#organization",
  name: "The Resonance Hub",
  url: "http://192.168.1.50:4173",
  sameAs: [
    "http://192.168.1.50:4173",
    "http://192.168.1.50:3101/",
    "http://192.168.1.50:3201/",
    "https://www.resonance-podcast.com/",
    "https://www.youtube.com/@resonance36912",
  ],
});

const WEBSITE_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "http://192.168.1.50:3401/#website",
  name: "Resonance YouTube Optimizer",
  url: "http://192.168.1.50:3401/",
  publisher: { "@id": "http://192.168.1.50:4173/#organization" },
  isPartOf: { "@id": "http://192.168.1.50:4173/#organization" },
});

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      {
        name: "google-site-verification",
        content: "2lE0pAgMEbuv72esss2JbnRc5RMH7sYsVb0OVjBRgyM",
      },
      { name: "theme-color", content: "#D826E8", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#D826E8", media: "(prefers-color-scheme: light)" },
      { name: "msapplication-TileColor", content: "#0F0A1F" },
      // NOTE: page-specific tags (title, description, og:url, og:title,
      // og:description, og:image*, twitter:title, twitter:description,
      // twitter:image*) intentionally do NOT live here. Leaf routes emit them
      // via <SEO />; duplicating them at the root made crawlers read the root
      // copy first on every page.
      { name: "author", content: "The Resonance" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "The Resonance · YouTube Optimizer" },
      { property: "og:see_also", content: "http://192.168.1.50:4173" },
      { name: "twitter:card", content: "summary_large_image" },



    ],
    links: [
      // CSS delivery: CRITICAL_CSS below is inlined so the shell paints with the
      // right tokens/typography immediately. The app stylesheet stays a normal
      // (preloaded) stylesheet — deferring it caused a full-page relayout and a
      // CLS of ~1. The cross-origin Google Fonts stylesheet — the only real
      // render blocker — is loaded async via media="print" + ASYNC_CSS_SWAP.
      { rel: "preload", as: "style", href: appCss, fetchPriority: "high" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "any" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/favicon.png" },
      { rel: "preload", as: "image", href: "/og-image.png", fetchPriority: "high" },
    ],
    styles: [{ children: CRITICAL_CSS }],

    scripts: [
      { type: "application/ld+json", children: ORGANIZATION_JSONLD },
      { type: "application/ld+json", children: WEBSITE_JSONLD },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Swap the async (media="print") stylesheets in as soon as they land. */}
        <script dangerouslySetInnerHTML={{ __html: ASYNC_CSS_SWAP }} />
        <noscript>
          <link rel="stylesheet" href={appCss} />
        </noscript>
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    const host = window.location.hostname;
    document.querySelectorAll<HTMLAnchorElement>('a[href^="http://192.168.1.50:"]').forEach((a) => {
      a.href = a.href.replace("192.168.1.50", host);
    });
  });
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LazyMotionProvider>
            <Toaster />
            <Sonner />
            <Outlet />
          </LazyMotionProvider>
        </TooltipProvider>

      </QueryClientProvider>
    </HelmetProvider>
  );
}

function NotFoundComponent() {
  return (
    <>
      {/* 404s must never be indexed, but crawlers may follow the way out. */}
      <Helmet>
        <title>Page not found – Resonance YouTube Optimizer</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="label-mono mb-4 text-primary">404</p>
      <h1 className="mb-3 text-3xl font-bold text-foreground">Page not found</h1>
      <p className="mb-8 max-w-md text-muted-foreground">
        The page you're looking for doesn't exist or has moved to The Resonance Hub.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go home
        </Link>
        <a
          href="http://192.168.1.50:4173"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-glass-border px-6 py-2.5 font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Visit the hub
        </a>
      </div>
    </div>
    </>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <h1 className="mb-3 text-2xl font-bold text-foreground">This page didn't load</h1>
      <p className="mb-8 max-w-md text-muted-foreground">
        Something went wrong on our end. You can try again or head back home.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-glass-border px-6 py-2.5 font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Go home
        </a>
      </div>
    </div>
  );
}
