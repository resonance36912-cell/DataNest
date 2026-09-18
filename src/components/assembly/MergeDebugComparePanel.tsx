import { useRef, useState } from "react";
import { GitCompare, Upload, Download, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  diffMergeDebugReports,
  downloadMergeDebugDiffJson,
  loadDebugBundle,
  type LoadedDebugBundle,
  type MergeDebugDiff,
} from "@/lib/merge-debug-diff";

type Slot = "a" | "b";

function BundleSlot({
  slot,
  label,
  bundle,
  onPick,
  onClear,
}: {
  slot: Slot;
  label: string;
  bundle: LoadedDebugBundle | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex-1 min-w-0 rounded border border-dashed border-border bg-muted/30 px-2 py-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        <span>{label}</span>
        {bundle && (
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={onClear}
            aria-label={`Clear bundle ${slot.toUpperCase()}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {bundle ? (
        <div className="space-y-0.5 text-[11px] font-mono truncate">
          <div className="truncate text-foreground">{bundle.file_name}</div>
          <div className="text-muted-foreground truncate">
            job {bundle.report.render_job.id?.slice(0, 8) ?? "-"} · {bundle.report.totals.scene_count} scenes ·{" "}
            {new Date(bundle.report.generated_at).toLocaleString()}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full h-8 gap-2 text-xs justify-start text-muted-foreground"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Choose merge-debug ZIP…
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function fmt(n: number | null | undefined) {
  return typeof n === "number" ? n.toFixed(3) : "—";
}

function deltaBadge(delta: number) {
  if (Math.abs(delta) < 0.005) return null;
  const sign = delta > 0 ? "+" : "";
  return (
    <span
      className={
        delta > 0
          ? "text-amber-600 dark:text-amber-400"
          : "text-emerald-600 dark:text-emerald-400"
      }
    >
      {sign}
      {delta.toFixed(3)}
    </span>
  );
}

export default function MergeDebugComparePanel() {
  const [a, setA] = useState<LoadedDebugBundle | null>(null);
  const [b, setB] = useState<LoadedDebugBundle | null>(null);
  const [diff, setDiff] = useState<MergeDebugDiff | null>(null);
  const [loading, setLoading] = useState(false);

  const pick = async (slot: Slot, file: File) => {
    try {
      setLoading(true);
      const bundle = await loadDebugBundle(file);
      if (slot === "a") setA(bundle);
      else setB(bundle);
      setDiff(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read ZIP");
    } finally {
      setLoading(false);
    }
  };

  const runDiff = () => {
    if (!a || !b) return;
    try {
      setDiff(diffMergeDebugReports(a, b));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build diff");
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-2">
        <GitCompare className="h-3.5 w-3.5" />
        Compare debug ZIPs
        <span className="text-[10px] text-muted-foreground font-normal">
          Diff windows, gaps, and overlaps between two merge runs.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <BundleSlot slot="a" label="Bundle A (baseline)" bundle={a} onPick={(f) => pick("a", f)} onClear={() => { setA(null); setDiff(null); }} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <BundleSlot slot="b" label="Bundle B (candidate)" bundle={b} onPick={(f) => pick("b", f)} onClear={() => { setB(null); setDiff(null); }} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 text-xs gap-2"
          disabled={!a || !b || loading}
          onClick={runDiff}
        >
          <GitCompare className="h-3.5 w-3.5" />
          Compare
        </Button>
        {diff && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-2"
            onClick={() => {
              downloadMergeDebugDiffJson(diff);
              toast.success("Diff JSON downloaded");
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download diff JSON
          </Button>
        )}
      </div>

      {diff && (
        <div className="mt-3 space-y-3">
          {/* Totals delta */}
          <div className="rounded border border-border overflow-hidden">
            <div className="px-2 py-1 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Totals (A → B)
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1 px-2 py-1.5 text-[11px] font-mono">
              {(Object.keys(diff.totals.a) as Array<keyof typeof diff.totals.a>).map((k) => {
                const av = diff.totals.a[k];
                const bv = diff.totals.b[k];
                const d = diff.totals.delta[k];
                return (
                  <div key={k as string} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-muted-foreground truncate">{k as string}</span>
                    <span className="text-foreground shrink-0">
                      {av} → {bv} {deltaBadge(d)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Windows diff */}
          <DiffSection
            title="effective_windows"
            summary={
              <>
                <Badge variant="outline" className="h-5 text-[10px]">+{diff.windows.added.length}</Badge>
                <Badge variant="outline" className="h-5 text-[10px]">−{diff.windows.removed.length}</Badge>
                <Badge variant="secondary" className="h-5 text-[10px]">Δ {diff.windows.changed.length}</Badge>
                <span className="text-[10px] text-muted-foreground">= {diff.windows.unchanged_count}</span>
              </>
            }
          >
            {diff.windows.added.length + diff.windows.removed.length + diff.windows.changed.length === 0 && (
              <EmptyRow>No differences in effective_windows.</EmptyRow>
            )}
            {diff.windows.removed.map((r) => (
              <div key={`r${r.scene_number}`} className="px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 text-destructive">
                − S{String(r.scene_number).padStart(2, "0")} removed (kept {fmt(r.a?.kept_sec)}s)
              </div>
            ))}
            {diff.windows.added.map((r) => (
              <div key={`a${r.scene_number}`} className="px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 text-emerald-600 dark:text-emerald-400">
                + S{String(r.scene_number).padStart(2, "0")} added (kept {fmt(r.b?.kept_sec)}s)
              </div>
            ))}
            {diff.windows.changed.map((r) => (
              <div key={`c${r.scene_number}`} className="px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0">
                <div className="text-foreground">Δ S{String(r.scene_number).padStart(2, "0")}</div>
                {r.changes.map((c, i) => (
                  <div key={i} className="pl-3 text-muted-foreground">
                    {String(c.field)}: {String(c.a)} → {String(c.b)}{" "}
                    {typeof c.delta_sec === "number" && deltaBadge(c.delta_sec)}
                  </div>
                ))}
              </div>
            ))}
          </DiffSection>

          <GapDiffSection title="timeline_gaps" section={diff.gaps} />
          <GapDiffSection title="timeline_overlaps" section={diff.overlaps} />
        </div>
      )}
    </div>
  );
}

function DiffSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <div className="ml-auto flex items-center gap-1.5">{summary}</div>
      </div>
      <div className="max-h-56 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1 text-[10px] font-mono text-muted-foreground italic">{children}</div>;
}

function GapDiffSection({
  title,
  section,
}: {
  title: string;
  section: MergeDebugDiff["gaps"];
}) {
  const total = section.added.length + section.removed.length + section.changed.length;
  return (
    <DiffSection
      title={title}
      summary={
        <>
          <Badge variant="outline" className="h-5 text-[10px]">+{section.added.length}</Badge>
          <Badge variant="outline" className="h-5 text-[10px]">−{section.removed.length}</Badge>
          <Badge variant="secondary" className="h-5 text-[10px]">Δ {section.changed.length}</Badge>
          <span className="text-[10px] text-muted-foreground">= {section.unchanged_count}</span>
        </>
      }
    >
      {total === 0 && <EmptyRow>No differences in {title}.</EmptyRow>}
      {section.removed.map((r) => (
        <div key={`r${r.key}`} className="px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 text-destructive">
          − {r.key}  (Δ {fmt(r.a?.delta_sec)}s)
        </div>
      ))}
      {section.added.map((r) => (
        <div key={`a${r.key}`} className="px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 text-emerald-600 dark:text-emerald-400">
          + {r.key}  (Δ {fmt(r.b?.delta_sec)}s)
        </div>
      ))}
      {section.changed.map((r) => (
        <div key={`c${r.key}`} className="px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0">
          Δ {r.key}: {fmt(r.a?.delta_sec)}s → {fmt(r.b?.delta_sec)}s{" "}
          {typeof r.delta_sec === "number" && deltaBadge(r.delta_sec)}
        </div>
      ))}
    </DiffSection>
  );
}
