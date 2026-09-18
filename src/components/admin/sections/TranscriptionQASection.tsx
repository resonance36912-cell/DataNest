import { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AdminSection } from "../AdminSection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface QARow {
  version_id: string;
  project_id: string | null;
  project_title: string | null;
  user_id: string;
  version_number: number;
  status: string;
  type: string;
  created_at: string;
  lines_count: number;
  words_count: number;
  audio_duration_sec: number;
  covered_sec: number;
  avg_confidence: number | null;
  words_missing_timing: number;
  avg_line_duration_sec: number | null;
  has_error: boolean;
}

const LIMITS = ["25", "50", "100", "200"] as const;

function fmtSec(s: number | null | undefined): string {
  if (!s || !Number.isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(0).padStart(2, "0");
  return `${m}:${r}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function coverageOf(r: QARow): number {
  if (!r.audio_duration_sec || r.audio_duration_sec <= 0) return 0;
  return Math.min(1, r.covered_sec / r.audio_duration_sec);
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TranscriptionQASection() {
  const [rows, setRows] = useState<QARow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("50");
  const [onlyErrors, setOnlyErrors] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("transcription_qa_summary", {
        p_limit: parseInt(limit, 10),
      });
      if (error) throw error;
      setRows((data ?? []) as QARow[]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load transcription QA", {
        description: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [limit]);

  const filtered = useMemo(
    () => (onlyErrors ? rows.filter((r) => r.has_error) : rows),
    [rows, onlyErrors]
  );

  const kpis = useMemo(() => {
    const total = rows.length;
    if (total === 0) return null;
    const errors = rows.filter((r) => r.has_error).length;
    const emptyWords = rows.filter((r) => r.words_count === 0).length;
    const missingTimingTotal = rows.reduce((s, r) => s + r.words_missing_timing, 0);
    const wordsTotal = rows.reduce((s, r) => s + r.words_count, 0);
    const avgCoverage =
      rows.reduce((s, r) => s + coverageOf(r), 0) / total;
    const avgConfRows = rows.filter((r) => r.avg_confidence != null);
    const avgConf =
      avgConfRows.length > 0
        ? avgConfRows.reduce((s, r) => s + (r.avg_confidence ?? 0), 0) /
          avgConfRows.length
        : null;
    return {
      total,
      errors,
      emptyWords,
      errorRate: errors / total,
      avgCoverage,
      avgConf,
      missingTimingRate: wordsTotal > 0 ? missingTimingTotal / wordsTotal : 0,
    };
  }, [rows]);

  return (
    <AdminSection
      icon={FileText}
      title="Transcription QA"
      description="Per-run timing coverage, word/line health, and error rates across all recent transcript versions."
      action={
        <div className="flex items-center gap-2">
          <Select value={limit} onValueChange={(v) => setLimit(v as typeof limit)}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITS.map((l) => (
                <SelectItem key={l} value={l}>Last {l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant={onlyErrors ? "default" : "outline"}
            onClick={() => setOnlyErrors((v) => !v)}
            className="h-8 gap-1.5 text-xs"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Errors only
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {/* KPIs */}
      {kpis && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Runs" value={String(kpis.total)} />
          <Kpi
            label="Error rate"
            value={fmtPct(kpis.errorRate)}
            tone={kpis.errorRate > 0.1 ? "bad" : kpis.errorRate > 0 ? "warn" : "good"}
            sub={`${kpis.errors} flagged`}
          />
          <Kpi
            label="Empty word_tokens"
            value={String(kpis.emptyWords)}
            tone={kpis.emptyWords > 0 ? "bad" : "good"}
          />
          <Kpi
            label="Avg coverage"
            value={fmtPct(kpis.avgCoverage)}
            tone={kpis.avgCoverage < 0.5 ? "bad" : kpis.avgCoverage < 0.8 ? "warn" : "good"}
          />
          <Kpi
            label="Words missing timing"
            value={fmtPct(kpis.missingTimingRate)}
            tone={kpis.missingTimingRate > 0.05 ? "warn" : "good"}
          />
          <Kpi
            label="Avg confidence"
            value={kpis.avgConf == null ? "—" : kpis.avgConf.toFixed(2)}
            sub="word-level"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="min-w-full text-xs">
          <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Run</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Lines</th>
              <th className="px-3 py-2">Words</th>
              <th className="px-3 py-2">Audio</th>
              <th className="px-3 py-2">Coverage</th>
              <th className="px-3 py-2">Avg line</th>
              <th className="px-3 py-2">Missing timing</th>
              <th className="px-3 py-2">Conf</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  {loading ? "Loading…" : "No transcript runs in this window."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const cov = coverageOf(r);
              const covBad = r.audio_duration_sec > 0 && cov < 0.3;
              const covWarn = !covBad && cov < 0.7;
              return (
                <tr
                  key={r.version_id}
                  className={`border-t border-border/40 ${r.has_error ? "bg-destructive/5" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-mono text-[11px]">v{r.version_number}</div>
                    <div className="text-[10px] text-muted-foreground">{relTime(r.created_at)}</div>
                  </td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <div className="truncate">{r.project_title ?? "—"}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {r.project_id?.slice(0, 8) ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.lines_count}</td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className={r.words_count === 0 ? "text-destructive font-semibold" : ""}>
                      {r.words_count}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtSec(r.audio_duration_sec)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${
                            covBad ? "bg-destructive" : covWarn ? "bg-yellow-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.round(cov * 100)}%` }}
                        />
                      </div>
                      <span className="tabular-nums">{fmtPct(cov)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtSec(r.avg_line_duration_sec)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.words_missing_timing > 0 ? (
                      <span className="text-yellow-500">{r.words_missing_timing}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.avg_confidence == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      r.avg_confidence.toFixed(2)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.has_error ? (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> error
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-[10px] text-emerald-500 border-emerald-500/40">
                        <CheckCircle2 className="h-3 w-3" /> {r.status}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Coverage = sum of word durations / audio span. A run is flagged when{" "}
        <code>word_tokens</code> is empty or coverage &lt; 30%.
      </p>
    </AdminSection>
  );
}

function Kpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls =
    tone === "bad" ? "text-destructive" :
    tone === "warn" ? "text-yellow-500" :
    tone === "good" ? "text-emerald-500" : "";
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
