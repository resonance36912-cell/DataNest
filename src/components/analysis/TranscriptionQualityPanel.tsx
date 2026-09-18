import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronRight, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildConfidenceReportJSON, type ConfidenceReportJSON } from "@/lib/confidenceReport";
import type { TranscriptionResult, VerificationResult } from "@/contexts/ProjectContext";

interface Props {
  transcription: TranscriptionResult | null;
  verification: VerificationResult | null;
  segments: Array<{ index: number; start_sec: number; end_sec: number; duration_sec: number; lyrics?: string | null }> | null;
}

const tierColor = (t: "high" | "med" | "low" | "unknown") =>
  t === "high" ? "bg-success" :
  t === "med" ? "bg-warning" :
  t === "low" ? "bg-destructive" :
  "bg-muted";

const tierText = (t: "high" | "med" | "low" | "unknown") =>
  t === "high" ? "text-success" :
  t === "med" ? "text-warning" :
  t === "low" ? "text-destructive" :
  "text-muted-foreground";

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptionQualityPanel({ transcription, verification, segments }: Props) {
  const [expandedSeg, setExpandedSeg] = useState<number | null>(null);
  const [showAllUncertain, setShowAllUncertain] = useState(false);

  const report: ConfidenceReportJSON | null = useMemo(() => {
    if (!transcription) return null;
    try {
      return buildConfidenceReportJSON({
        projectName: null,
        fileName: null,
        transcription,
        verification,
        useEdited: false,
        segments: segments ?? null,
      });
    } catch {
      return null;
    }
  }, [transcription, verification, segments]);

  if (!report) return null;

  const { summary, segments: segs, words } = report;
  const wordsAvail = summary.word_level_available;
  const uncertainWords = words.filter(w => w.tier === "low" || w.tier === "med");
  const visibleUncertain = showAllUncertain ? uncertainWords : uncertainWords.slice(0, 24);

  // Group words by segment for highlighted lyric display.
  const wordsBySegment = (() => {
    if (!segs.length) return new Map<number, typeof words>();
    const map = new Map<number, typeof words>();
    segs.forEach(s => map.set(s.index, []));
    words.forEach(w => {
      const seg = segs.find(s => w.start_sec >= s.start_sec && w.end_sec <= s.end_sec);
      if (seg) map.get(seg.index)?.push(w);
    });
    return map;
  })();

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Transcription Quality Report</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {summary.word_avg_confidence_pct != null && (
            <Badge variant="outline" className="text-[10px]">
              Avg word conf {summary.word_avg_confidence_pct}%
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] text-success border-success/30 bg-success/5">
            ≥85% {summary.word_high_confidence_count}
          </Badge>
          <Badge variant="outline" className="text-[10px] text-warning border-warning/30 bg-warning/5">
            60-85% {summary.word_med_confidence_count}
          </Badge>
          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 bg-destructive/5">
            &lt;60% {summary.word_low_confidence_count}
          </Badge>
        </div>
      </div>

      {!wordsAvail && (
        <div className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Per-word confidence is not available for this transcription source. Segment-level estimates only.</span>
        </div>
      )}

      {/* Segment timeline */}
      {segs.length > 0 ? (
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Segment confidence ({segs.length} segments)
          </div>
          <div className="space-y-1.5">
            {segs.map(s => {
              const isOpen = expandedSeg === s.index;
              const segWords = wordsBySegment.get(s.index) ?? [];
              return (
                <div key={s.index} className="rounded-md border border-border/60 bg-card/40 overflow-hidden">
                  <button
                    onClick={() => setExpandedSeg(isOpen ? null : s.index)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-card/70 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                      #{s.index + 1} · {fmtTime(s.start_sec)}-{fmtTime(s.end_sec)}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${tierColor(s.tier)} transition-all`}
                        style={{ width: `${s.avg_confidence_pct ?? 0}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono tabular-nums shrink-0 w-10 text-right ${tierText(s.tier)}`}>
                      {s.avg_confidence_pct != null ? `${s.avg_confidence_pct}%` : "—"}
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0 w-14 text-right">
                      {s.word_count}w · {s.low_count > 0 ? <span className="text-destructive">{s.low_count} low</span> : <span>0 low</span>}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 py-2 border-t border-border/60 bg-background/40">
                      {segWords.length > 0 ? (
                        <p className="text-xs leading-relaxed font-mono">
                          {segWords.map((w, i) => {
                            const cls =
                              w.tier === "low" ? "bg-destructive/15 text-destructive underline decoration-destructive/60 decoration-dotted underline-offset-2 rounded px-0.5" :
                              w.tier === "med" ? "bg-warning/15 text-warning rounded px-0.5" :
                              "text-foreground";
                            const title = w.confidence_pct != null ? `${w.confidence_pct}% @ ${w.start_sec.toFixed(2)}s` : "no confidence";
                            return (
                              <span key={i} className={cls} title={title}>
                                {w.text}{i < segWords.length - 1 ? " " : ""}
                              </span>
                            );
                          })}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">
                          {s.lyrics || "(no words in this segment)"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Run segmentation to see per-segment confidence.</p>
      )}

      {/* Uncertain words list */}
      {uncertainWords.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> Uncertain words ({uncertainWords.length})
            </div>
            {uncertainWords.length > 24 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAllUncertain(v => !v)}>
                {showAllUncertain ? "Show top 24" : `Show all ${uncertainWords.length}`}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleUncertain.map(w => (
              <span
                key={w.index}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono border ${
                  w.tier === "low"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-warning/10 text-warning border-warning/30"
                }`}
                title={`${fmtTime(w.start_sec)} · ${w.confidence_pct ?? "?"}%`}
              >
                {w.text}
                <span className="opacity-70 tabular-nums">{w.confidence_pct ?? "?"}%</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Scene generation uses verified lyrics — accept suggested corrections above to reduce uncertainty before generating storyboards.
          </p>
        </div>
      )}
    </div>
  );
}
