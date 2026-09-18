import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/adminEmails";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Home, AlertTriangle, AlertCircle, Info, ExternalLink, FileDown, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { exportFindingsCsv, exportFindingsPdf } from "@/lib/seoExport";

type Audit = {
  id: string;
  run_at: string;
  finished_at: string | null;
  status: string;
  base_url: string;
  total_findings: number;
  totals_by_level: Record<string, number>;
  error: string | null;
};

type Finding = {
  id: string;
  level: "high" | "mid" | "low";
  category: string;
  rule: string;
  message: string;
  url: string | null;
  fix_hint: string | null;
};

const LEVEL_META: Record<string, { label: string; cls: string; Icon: typeof AlertTriangle }> = {
  high: { label: "Critical", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
  mid: { label: "Warning", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", Icon: AlertCircle },
  low: { label: "Info", cls: "bg-primary/15 text-primary border-primary/30", Icon: Info },
};

const RULE_DOCS: Record<string, string> = {
  missing_title: "https://developers.google.com/search/docs/appearance/title-link",
  short_title: "https://developers.google.com/search/docs/appearance/title-link",
  long_title: "https://developers.google.com/search/docs/appearance/title-link",
  missing_description: "https://developers.google.com/search/docs/appearance/snippet",
  short_description: "https://developers.google.com/search/docs/appearance/snippet",
  long_description: "https://developers.google.com/search/docs/appearance/snippet",
  missing_canonical: "https://developers.google.com/search/docs/crawling-indexing/canonicalization",
  duplicate_canonical: "https://developers.google.com/search/docs/crawling-indexing/canonicalization",
  missing_og_tags: "https://ogp.me/",
  missing_h1: "https://developers.google.com/search/docs/appearance/structured-data/article",
  multiple_h1: "https://developers.google.com/search/docs/appearance/structured-data/article",
  img_missing_alt: "https://www.w3.org/WAI/tutorials/images/decision-tree/",
  missing_robots: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  robots_blocks_all: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  robots_no_sitemap: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  missing_sitemap: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  route_missing_in_sitemap: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap",
  sitemap_stale_entry: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap",
  page_unreachable: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
};

const AdminSeo = () => {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !(await isAdminUser(session.user.id))) {
        navigate("/admin", { replace: true });
        return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  }, [navigate]);

  const load = async () => {
    const { data: auditRow } = await supabase
      .from("seo_audits")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAudit((auditRow as Audit | null) ?? null);
    if (auditRow) {
      const { data: f } = await supabase
        .from("seo_findings")
        .select("*")
        .eq("audit_id", (auditRow as Audit).id)
        .order("level", { ascending: true });
      setFindings(((f ?? []) as Finding[]).sort((a, b) => {
        const order = { high: 0, mid: 1, low: 2 } as const;
        return order[a.level] - order[b.level];
      }));
    } else {
      setFindings([]);
    }
  };

  const runScan = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("seo-audit", { body: {} });
      if (error) throw error;
      toast.success("Audit complete");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setRunning(false);
    }
  };

  const grouped = useMemo(() => {
    const by: Record<string, Finding[]> = {};
    for (const f of findings) {
      const key = `${f.level}|${f.rule}`;
      (by[key] ??= []).push(f);
    }
    return Object.entries(by).map(([k, items]) => {
      const [level, rule] = k.split("|");
      return { level: level as Finding["level"], rule, items };
    });
  }, [findings]);

  const totals = audit?.totals_by_level ?? {};
  const t = (k: string) => Number(totals[k] ?? 0);

  if (!authorized || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-semibold">SEO Issues</h1>
            <p className="text-xs text-muted-foreground">
              {audit ? `Last scan ${formatDistanceToNow(new Date(audit.run_at), { addSuffix: true })} · ${audit.base_url}` : "No scans yet"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/admin/dashboard"><Button variant="ghost" size="sm"><Home className="w-4 h-4 mr-2" />Dashboard</Button></Link>
            <Button variant="outline" size="sm" disabled={!audit || findings.length === 0} onClick={() => audit && exportFindingsCsv(audit, findings)}>
              <FileDown className="w-4 h-4 mr-2" />CSV
            </Button>
            <Button variant="outline" size="sm" disabled={!audit || findings.length === 0} onClick={() => audit && exportFindingsPdf(audit, findings)}>
              <FileText className="w-4 h-4 mr-2" />PDF
            </Button>
            <Button size="sm" onClick={runScan} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {running ? "Scanning…" : "Run scan"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total" value={audit?.total_findings ?? 0} cls="bg-muted/30" />
          <SummaryCard label="Critical" value={t("high")} cls={LEVEL_META.high.cls} />
          <SummaryCard label="Warnings" value={t("mid")} cls={LEVEL_META.mid.cls} />
          <SummaryCard label="Info" value={t("low")} cls={LEVEL_META.low.cls} />
        </section>

        {!audit && (
          <Card className="p-12 text-center text-muted-foreground">
            No audit data yet. Click <strong>Run scan</strong> to crawl {`${"https://creativestudio.life"}`} and surface issues.
          </Card>
        )}

        {audit && findings.length === 0 && audit.status === "completed" && (
          <Card className="p-12 text-center">
            <p className="text-lg font-medium text-primary">No issues found 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">Last scan checked {audit.base_url} and came back clean.</p>
          </Card>
        )}

        <section className="space-y-4">
          {grouped.map(({ level, rule, items }) => {
            const meta = LEVEL_META[level];
            const docs = RULE_DOCS[rule];
            return (
              <Card key={`${level}-${rule}`} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={meta.cls}>
                        <meta.Icon className="w-3 h-3 mr-1" />{meta.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">{items[0].category}</span>
                    </div>
                    <h3 className="font-display text-lg">{ruleTitle(rule)}</h3>
                    {items[0].fix_hint && <p className="text-sm text-muted-foreground">{items[0].fix_hint}</p>}
                  </div>
                  {docs && (
                    <a href={docs} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                      Rule reference <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <ul className="mt-4 space-y-2 border-t border-border/40 pt-3">
                  {items.map((it) => (
                    <li key={it.id} className="flex items-start justify-between gap-4 text-sm">
                      <span className="text-foreground/90 leading-relaxed">{it.message}</span>
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline inline-flex items-center gap-1">
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
};

const SummaryCard = ({ label, value, cls }: { label: string; value: number; cls: string }) => (
  <Card className={`p-5 border ${cls}`}>
    <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
    <p className="text-3xl font-display font-semibold mt-1">{value}</p>
  </Card>
);

const ruleTitle = (rule: string) =>
  rule.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default AdminSeo;
