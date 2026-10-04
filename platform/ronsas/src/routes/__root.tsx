import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { VisitTracker } from "@/components/VisitTracker";

const POSTHOG_BOOTSTRAP_SCRIPT =
  '(function(){var allowed=["reson8.life","www.reson8.life"];if(allowed.indexOf(window.location.hostname)===-1){return;}var t=document,e=window.posthog||[];if(!e.__SV){window.posthog=e;e._i=[];e.init=function(i,s,a){function g(t,e){var o=e.split(".");if(o.length===2){t=t[o[0]];e=o[1];}t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)));};}var p=t.createElement("script");p.type="text/javascript";p.crossOrigin="anonymous";p.async=true;p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js";var r=t.getElementsByTagName("script")[0];r.parentNode.insertBefore(p,r);var u=e;if(a!==undefined){u=e[a]=[];}else{a="posthog";}u.people=u.people||[];u.toString=function(t){var e="posthog";if(a!=="posthog"){e+="."+a;}if(!t){e+=" (stub)";}return e;};u.people.toString=function(){return u.toString(1)+".people (stub)";};var o="init capture register register_once unregister identify set_config get_distinct_id alias setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroups group reset get_feature_flag get_feature_flag_payload is_feature_enabled reload_feature_flags update_early_access_feature_enrollment get_early_access_features on onFeatureFlags onSurveysLoaded onSessionId".split(" ");for(var n=0;n<o.length;n++){g(u,o[n]);}e._i.push([i,s,a]);};e.__SV=1;}window.posthog.init("phc_wiRCEGhpP86zsw9q2guDXngrr7iU7FHF9dS8sRFAY2xy",{api_host:"https://eu.i.posthog.com",ui_host:"https://eu.posthog.com",defaults:"2026-05-30",person_profiles:"identified_only",capture_pageview:"history_change",capture_pageleave:true,capture_dead_clicks:true,capture_exceptions:true,capture_performance:true,enable_recording_console_log:true,session_recording:{maskAllInputs:true},autocapture:true});window.posthog.register({ronsas_app:"hub",ronsas_environment:"production"});window.posthog.capture("ronsas_observability_boot",{ronsas_app:"hub"});})();';

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "The Resonance" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-site-verification", content: "cyauvD1JwPPom3ad_AbEip05fQr_BpFJF_Xfkcvblpw" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=Lora:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          data-ronsas-observability
          dangerouslySetInnerHTML={{ __html: POSTHOG_BOOTSTRAP_SCRIPT }}
        />
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
    <QueryClientProvider client={queryClient}>
      <VisitTracker />
      <Outlet />
    </QueryClientProvider>
  );
}
