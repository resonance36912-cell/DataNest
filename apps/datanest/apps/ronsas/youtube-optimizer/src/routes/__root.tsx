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
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ASYNC_CSS_SWAP, CRITICAL_CSS } from "@/lib/critical-css";
import { LazyMotionProvider } from "@/lib/lazy-motion";



import appCss from "../styles.css?url";
import resonanceDataNestCss from "../resonance-datanest-adapter.css?url";


const POSTHOG_BOOTSTRAP_SCRIPT = "(function(){var allowed=[\"youtube.reson8.life\",\"youtubeoptimizer.life\",\"www.youtubeoptimizer.life\"];if(allowed.indexOf(window.location.hostname)===-1){return;}var t=document,e=window.posthog||[];if(!e.__SV){window.posthog=e;e._i=[];e.init=function(i,s,a){function g(t,e){var o=e.split(\".\");if(o.length===2){t=t[o[0]];e=o[1];}t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)));};}var p=t.createElement(\"script\");p.type=\"text/javascript\";p.crossOrigin=\"anonymous\";p.async=true;p.src=s.api_host.replace(\".i.posthog.com\",\"-assets.i.posthog.com\")+\"/static/array.js\";var r=t.getElementsByTagName(\"script\")[0];r.parentNode.insertBefore(p,r);var u=e;if(a!==undefined){u=e[a]=[];}else{a=\"posthog\";}u.people=u.people||[];u.toString=function(t){var e=\"posthog\";if(a!==\"posthog\"){e+=\".\"+a;}if(!t){e+=\" (stub)\";}return e;};u.people.toString=function(){return u.toString(1)+\".people (stub)\";};var o=\"init capture register register_once unregister identify set_config get_distinct_id alias setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroups group reset get_feature_flag get_feature_flag_payload is_feature_enabled reload_feature_flags update_early_access_feature_enrollment get_early_access_features on onFeatureFlags onSurveysLoaded onSessionId\".split(\" \");for(var n=0;n<o.length;n++){g(u,o[n]);}e._i.push([i,s,a]);};e.__SV=1;}window.posthog.init(\"phc_wiRCEGhpP86zsw9q2guDXngrr7iU7FHF9dS8sRFAY2xy\",{api_host:\"https://eu.i.posthog.com\",ui_host:\"https://eu.posthog.com\",defaults:\"2026-05-30\",person_profiles:\"identified_only\",capture_pageview:\"history_change\",capture_pageleave:true,capture_dead_clicks:true,capture_exceptions:true,capture_performance:true,enable_recording_console_log:true,session_recording:{maskAllInputs:true},autocapture:true});window.posthog.register({ronsas_app:\"youtube\",ronsas_environment:\"production\"});window.posthog.capture(\"ronsas_observability_boot\",{ronsas_app:\"youtube\"});})();";

const ORGANIZATION_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://reson8.life/#organization",
  name: "The Resonance Hub",
  url: "https://reson8.life",
  sameAs: [
    "https://reson8.life",
    "https://epublisher.reson8.life/",
    "https://creative.reson8.life/",
    "https://www.resonance-podcast.com/",
    "https://www.youtube.com/@resonance36912",
  ],
});

const WEBSITE_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://youtubeoptimizer.life/#website",
  name: "Resonance YouTube Optimizer",
  url: "https://youtubeoptimizer.life/",
  publisher: { "@id": "https://reson8.life/#organization" },
  isPartOf: { "@id": "https://reson8.life/#organization" },
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
      { property: "og:see_also", content: "https://reson8.life" },
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
      { rel: "stylesheet", href: resonanceDataNestCss },
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
    <html data-rdn-app="youtube-optimizer" lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script data-ronsas-observability dangerouslySetInnerHTML={{ __html: POSTHOG_BOOTSTRAP_SCRIPT }} />
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
          href="https://reson8.life"
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
