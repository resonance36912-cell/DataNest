import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { hubRedirectFor } from "@/lib/hubRedirects";

/**
 * <HubRedirectGate />
 * Wraps the routed outlet. When the current path duplicates a hub-owned page,
 * it emits `noindex` + a canonical/refresh to the hub and performs an
 * immediate location replace so crawlers and users both land on
 * https://www.reson8.life — consolidating indexing on the hub.
 *
 * A true HTTP 301 is not possible from a static SPA; configure that at the
 * DNS/CDN layer if you need the header-level status code.
 */
export default function HubRedirectGate({ children }: { children: React.ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const target = hubRedirectFor(pathname, search, hash);
  const [redirecting, setRedirecting] = useState(Boolean(target));

  useEffect(() => {
    if (!target) {
      setRedirecting(false);
      return;
    }
    setRedirecting(true);
    // `replace` keeps the spoke URL out of history, mirroring 301 behaviour.
    window.location.replace(target);
  }, [target]);

  if (!target || !redirecting) return <>{children}</>;

  return (
    <>
      <Helmet>
        <title>Redirecting to The Resonance Hub</title>
        <meta name="robots" content="noindex,follow" />
        <link rel="canonical" href={target} />
        <meta httpEquiv="refresh" content={`0; url=${target}`} />
      </Helmet>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Redirecting to{" "}
          <a href={target} className="text-primary hover:underline">
            {target}
          </a>
        </p>
      </div>
    </>
  );
}
