import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, Home, Loader2, X, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import {
  SHARE,
  SHARE_PROVIDERS,
  SHARE_VARIANTS,
  PROVIDER_RATIO,
  providerImage,
  providerMeta,
  ratioImageChain,
  resolveShare,
  shareUrl,
} from "@/lib/shareMeta";

type Tag = { key: string; value: string };
type ProbeState = "pending" | "ok" | "fail";

type RefreshOutcome = "refreshed" | "warmed" | "manual" | "skipped" | "failed";
type RefreshResult = {
  provider: string;
  label: string;
  outcome: RefreshOutcome;
  detail: string;
  debuggerUrl?: string;
};
type RefreshReport = { url: string; results: RefreshResult[] };

/** Live origins whose link-preview caches we can purge/warm. */
const REFRESH_ORIGINS = [
  "https://creativestudio.life",
  "https://resonancestudio.lovable.app",
];

const OUTCOME_STYLE: Record<RefreshOutcome, string> = {
  refreshed: "text-emerald-500",
  warmed: "text-sky-500",
  manual: "text-amber-500",
  skipped: "text-muted-foreground",
  failed: "text-destructive",
};


const ROUTES = Object.keys(SHARE_VARIANTS);

/** The exact og/twitter/provider tag set SEO.tsx emits for a route. */
function buildTags(path: string, imageUrl: string, image: ReturnType<typeof ratioImageChain>[number]): Tag[] {
  const url = shareUrl(path);
  const share = resolveShare(path, { title: "", description: "" });
  const base: Tag[] = [
    { key: "canonical", value: url },
    { key: "og:title", value: share.title },
    { key: "og:description", value: share.description },
    { key: "og:url", value: url },
    { key: "og:type", value: SHARE.type },
    { key: "og:site_name", value: SHARE.siteName },
    { key: "og:locale", value: SHARE.locale },
    { key: "og:locale:alternate", value: SHARE.localeAlternate },
    { key: "og:image", value: imageUrl },
    { key: "og:image:secure_url", value: imageUrl },
    { key: "og:image:type", value: image.type },
    { key: "og:image:width", value: String(image.width) },
    { key: "og:image:height", value: String(image.height) },
    { key: "og:image:alt", value: share.imageAlt ?? image.alt },
    { key: "twitter:card", value: SHARE.twitterCard },
    { key: "twitter:url", value: url },
    { key: "twitter:domain", value: "www.reson8.life" },
    { key: "twitter:title", value: share.title },
    { key: "twitter:description", value: share.description },
    { key: "twitter:image", value: imageUrl },
    { key: "twitter:image:alt", value: share.imageAlt ?? image.alt },
  ];
  const extras = providerMeta({
    title: share.title,
    description: share.description,
    image: imageUrl,
    imageOverride: share.image,
  }).map((t) => ({ key: t.itemProp ? `itemprop:${t.itemProp}` : t.name!, value: t.content }));
  return [...base, ...extras, { key: "link rel=image_src", value: imageUrl }];
}

const AdminSharePreview = () => {
  const [path, setPath] = useState<string>("/");
  const [probes, setProbes] = useState<Record<string, ProbeState>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshReport, setRefreshReport] = useState<RefreshReport[] | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);


  const candidates = useMemo(() => {
    const share = resolveShare(path, { title: "", description: "" });
    return ratioImageChain(share.image);
  }, [path]);

  // Probe every candidate exactly the way SEO.tsx does, so the page shows
  // which artwork URL a crawler will actually land on.
  useEffect(() => {
    let cancelled = false;
    setProbes(Object.fromEntries(candidates.map((c) => [c.url, "pending" as ProbeState])));
    candidates.forEach((c) => {
      const img = new Image();
      img.onload = () => !cancelled && setProbes((p) => ({ ...p, [c.url]: "ok" }));
      img.onerror = () => !cancelled && setProbes((p) => ({ ...p, [c.url]: "fail" }));
      img.src = c.url;
    });
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  const resolvedImage = candidates.find((c) => probes[c.url] === "ok") ?? candidates[0];
  const share = resolveShare(path, { title: "", description: "" });
  const tags = useMemo(
    () => buildTags(path, resolvedImage.url, resolvedImage),
    [path, resolvedImage],
  );
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.key.toLowerCase(), t.value])), [tags]);

  const copyAll = () => {
    const text = tags
      .map((t) =>
        t.key.startsWith("og:")
          ? `<meta property="${t.key}" content="${t.value}" />`
          : t.key.startsWith("itemprop:")
          ? `<meta itemprop="${t.key.slice(9)}" content="${t.value}" />`
          : t.key === "canonical"
          ? `<link rel="canonical" href="${t.value}" />`
          : t.key === "link rel=image_src"
          ? `<link rel="image_src" href="${t.value}" />`
          : `<meta name="${t.key}" content="${t.value}" />`,
      )
      .join("\n");
    void navigator.clipboard.writeText(text);
    toast.success("Meta tags copied");
  };

  /**
   * Ask the backend to purge/warm the link-preview cache for this route on
   * every provider we can reach programmatically. Providers with no public
   * purge API come back as `manual` with a one-click debugger link.
   */
  const refreshPreviews = async (scope: "route" | "all") => {
    setRefreshing(true);
    setRefreshReport(null);
    try {
      const paths = scope === "all" ? ROUTES : [path];
      const urls = REFRESH_ORIGINS.flatMap((o) =>
        paths.map((p) => `${o}${p === "/" ? "/" : p}`),
      ).slice(0, 20);

      const { data, error } = await supabase.functions.invoke("refresh-link-previews", {
        body: { urls },
      });
      if (error) throw error;
      const report = (data?.report ?? []) as RefreshReport[];
      setRefreshReport(report);
      setRefreshedAt(new Date().toLocaleTimeString());
      const s = data?.summary ?? {};
      toast.success(
        `Previews refreshed — ${s.refreshed ?? 0} purged, ${s.warmed ?? 0} warmed, ${s.manual ?? 0} manual, ${s.failed ?? 0} failed`,
      );
    } catch (e) {
      console.error("refresh-link-previews failed", e);
      toast.error(e instanceof Error ? e.message : "Could not refresh link previews");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Share Preview Inspector — Resonance Creative Studio"
        description="Inspect the exact provider card meta tags and resolved artwork emitted for each route."
        path="/admin/share-preview"
        noindex
      />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Share Preview Inspector</h1>
            <p className="text-sm text-muted-foreground">
              Exact og / twitter / provider tags and resolved artwork for any route.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => refreshPreviews("route")} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh previews
            </Button>
            <Button variant="outline" size="sm" onClick={() => refreshPreviews("all")} disabled={refreshing}>
              All routes
            </Button>
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy tags
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/dashboard"><Home className="mr-1.5 h-3.5 w-3.5" /> Admin</Link>
            </Button>
          </div>
        </div>

        {refreshReport && (
          <Card className="mb-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">
                Cache refresh results
              </span>
              <span className="text-xs text-muted-foreground">{refreshedAt}</span>
            </div>
            <div className="divide-y divide-border">
              {refreshReport.map((r) => (
                <div key={r.url} className="px-4 py-3">
                  <p className="mb-2 break-all font-mono text-[11px] text-primary">{r.url}</p>
                  <ul className="space-y-1">
                    {r.results.map((res) => (
                      <li key={res.provider} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`w-20 font-medium ${OUTCOME_STYLE[res.outcome]}`}>
                          {res.outcome}
                        </span>
                        <span className="w-40 text-foreground">{res.label}</span>
                        <span className="min-w-0 flex-1 text-muted-foreground">{res.detail}</span>
                        {res.debuggerUrl && (
                          <a
                            href={res.debuggerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            debugger <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="mb-6 p-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Route
          </label>
          <div className="flex flex-wrap gap-2">
            {ROUTES.map((r) => (
              <button
                key={r}
                onClick={() => setPath(r)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  path === r
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              Card preview
            </div>
            <div className="p-4">
              <div className="overflow-hidden rounded-lg border border-border">
                <img
                  src={resolvedImage.url}
                  alt={share.imageAlt ?? resolvedImage.alt}
                  className="aspect-[1.91/1] w-full bg-muted object-cover"
                />
                <div className="space-y-1 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">www.reson8.life</p>
                  <p className="text-sm font-semibold text-foreground">{share.title}</p>
                  <p className="text-xs text-muted-foreground">{share.description}</p>
                </div>
              </div>
              <a
                href={shareUrl(path)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {shareUrl(path)} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              Artwork ratio variants &amp; fallback chain
            </div>
            <ul className="divide-y divide-border">
              {candidates.map((c, i) => {
                const state = probes[c.url] ?? "pending";
                const used = c.url === resolvedImage.url;
                return (
                  <li key={c.url} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                    {state === "pending" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : state === "ok" ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.url}>
                      {c.url}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{c.width}×{c.height}</span>
                    {used && <Badge variant="secondary" className="shrink-0">in use</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Provider coverage
          </div>
          <ul className="divide-y divide-border">
            {SHARE_PROVIDERS.map((p) => {
              const missing = p.requires.filter((r) => !tagMap.get(r.toLowerCase()));
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                  {missing.length === 0 ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <span className="w-32 font-medium text-foreground">{p.label}</span>
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {PROVIDER_RATIO[p.id] ?? "wide"} · {providerImage(p.id, share.image).width}×
                    {providerImage(p.id, share.image).height}
                  </Badge>
                  <span className="text-muted-foreground">
                    {missing.length === 0 ? p.requires.join(", ") : `missing: ${missing.join(", ")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Emitted tags ({tags.length})
          </div>
          <ul className="divide-y divide-border font-mono text-[11px]">
            {tags.map((t) => (
              <li key={t.key} className="grid gap-1 px-4 py-2 md:grid-cols-[220px_1fr]">
                <span className="text-primary">{t.key}</span>
                <span className="break-words text-muted-foreground">{t.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default AdminSharePreview;
