import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, Compass, Home as HomeIcon, LifeBuoy, Sparkles } from "lucide-react";
import SEO from "@/components/SEO";
import { GlassCard, Eyebrow } from "@/components/brand/GlassCard";
import { BrandButton } from "@/components/brand/BrandButton";
import { ResonanceLogo } from "@/components/brand/ResonanceLogo";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";
import { logClientError } from "@/lib/errorLogger";

/**
 * Marketing recovery screen for any unknown route (React Router catch-all)
 * and legacy entry paths. Replaces the generic "404" with a branded surface
 * that always offers a route forward — Home, Studio, Pricing, or Contact —
 * so users never see a dead end.
 *
 * Every hit is logged (deduped) so we can see which legacy or mistyped paths
 * are driving traffic here and add explicit routes/redirects when warranted.
 */
const SUGGESTIONS: Array<{
  to: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    to: "/",
    label: "Home",
    desc: "Overview of Resonance Creative Studio.",
    icon: HomeIcon,
  },
  {
    to: "/studio",
    label: "Open the Studio",
    desc: "Generate posters, videos and social packs.",
    icon: Sparkles,
  },
  {
    to: "/pricing",
    label: "Plans & pricing",
    desc: "ZAR-first plans and pay-as-you-go bundles.",
    icon: Compass,
  },
  {
    to: "/contact",
    label: "Get help",
    desc: "Talk to us if you were expecting something else.",
    icon: LifeBuoy,
  },
];

const NotFound = () => {
  const location = useLocation();
  // Full attempted path — pathname + query + hash — so hash-routed legacy
  // links (e.g. `/#/old-flow`) and query-scoped campaigns are captured too.
  const attemptedPath =
    location.pathname + (location.search || "") + (location.hash || "");

  useEffect(() => {
    // Structured client-side log so we can chart the top mistyped/legacy paths
    // in /admin/errors and decide which deserve a real route. Fires for EVERY
    // unmatched route served via the SPA fallback (hard load) as well as
    // client-side navigations to unknown routes (SPA link click / history
    // push), because the effect key includes the full attempted path.
    const href = typeof window !== "undefined" ? window.location.href : attemptedPath;
    const origin = typeof window !== "undefined" ? window.location.origin : null;

    // Detect whether this render is the result of the SPA fallback (a hard
    // navigation where the host returned index.html for an unknown path) vs.
    // a client-side navigation that landed on the catch-all route. Useful for
    // separating "bookmarked/shared legacy URL" from "in-app dead link".
    let navigationType: "spa-fallback" | "client-navigation" | "unknown" = "unknown";
    try {
      const [nav] = (typeof performance !== "undefined" &&
        performance.getEntriesByType?.("navigation")) as PerformanceNavigationTiming[] | undefined ?? [];
      if (nav?.type === "navigate" || nav?.type === "reload") {
        // Hard load — the host served index.html for this URL (SPA fallback).
        navigationType = "spa-fallback";
      } else if (nav) {
        navigationType = "client-navigation";
      }
    } catch {
      /* best-effort telemetry */
    }

    console.warn("[404] unknown route:", attemptedPath, `(${navigationType})`);
    void logClientError({
      message: `[404] unknown route: ${attemptedPath}`,
      severity: "warn",
      // Dedupe per attempted path so repeated crawler hits don't spam the
      // table, but distinct legacy paths each still land a row.
      dedupeWindowMs: 5 * 60_000,
      dedupeKey: `not-found|${attemptedPath}`,
      context: {
        kind: "route-not-found",
        route: attemptedPath,
        attemptedPath,
        pathname: location.pathname,
        search: location.search || null,
        hash: location.hash || null,
        href,
        origin,
        navigationType,
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        loggedAt: new Date().toISOString(),
      },
    });
  }, [attemptedPath, location.pathname, location.search, location.hash]);


  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <SEO
        title="Page not found — Resonance Creative Studio"
        description="The page you're looking for isn't here. Jump into the Studio or head home to keep creating."
        path={location.pathname}
        noindex
      />

      {/* Subtle brand backdrop — matches Home/Studio gradient system. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, hsl(295 90% 60% / 0.18), transparent 70%), radial-gradient(45% 40% at 85% 100%, hsl(265 85% 65% / 0.15), transparent 70%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" aria-label="Resonance Creative Studio home">
          <ResonanceLogo height={28} />
        </Link>
        <Link
          to="/studio"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          Studio →
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-10">
        <GlassCard className="w-full text-center">
          <Eyebrow>Recovery · 404</Eyebrow>
          <h1 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">
            This page isn't here — but the Studio is.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            The link you followed doesn't match anything in Resonance Creative Studio.
            It may have moved, been mistyped, or belonged to an older version of the app.
          </p>

          {attemptedPath && attemptedPath !== "/" && (
            <p className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <span className="opacity-70">Tried:</span>
              <code className="max-w-[22ch] truncate font-mono text-[11px] text-foreground sm:max-w-none">
                {attemptedPath}
              </code>
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <BrandButton variant="brand" size="lg" asChild>
              <Link to="/studio">
                Open Studio <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </BrandButton>
            <BrandButton variant="outline" size="lg" asChild>
              <Link to="/">
                <HomeIcon className="h-4 w-4" aria-hidden="true" /> Back to Home
              </Link>
            </BrandButton>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map(({ to, label, desc, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {label}
                    <ArrowRight className="ml-1 inline h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </GlassCard>
      </main>

      <ResonanceFooter />
    </div>
  );
};

export default NotFound;
