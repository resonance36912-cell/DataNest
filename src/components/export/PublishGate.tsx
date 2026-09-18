/**
 * Publish gate UI strip rendered above the final-export / publish action in
 * the Export step. Surfaces per-scene QA verdicts from `usePublishGate` and
 * disables the wrapped trigger when any scene has critical defects.
 */
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePublishGate, type SceneQaStatus } from "@/hooks/usePublishGate";

interface Props {
  projectId: string | null | undefined;
  /** Render prop receives canPublish so the host can disable its publish CTA. */
  children?: (state: { canPublish: boolean; blockingReason?: string }) => React.ReactNode;
}

const statusColor: Record<SceneQaStatus, string> = {
  passed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  pending: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  running: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  skipped: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function PublishGate({ projectId, children }: Props) {
  const gate = usePublishGate(projectId);

  if (!projectId) return null;

  const qualityBlocked = gate.missingVideoCount > 0 || gate.nonMasterCount > 0;
  const Icon = gate.failedCount > 0 || qualityBlocked ? ShieldAlert : gate.pendingCount > 0 ? ShieldQuestion : ShieldCheck;
  const headlineColor =
    gate.failedCount > 0 || qualityBlocked
      ? "text-rose-300"
      : gate.warningCount > 0
        ? "text-amber-300"
        : "text-emerald-300";

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${headlineColor}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${headlineColor}`}>
            {gate.loading
              ? "Loading scene QA…"
              : gate.failedCount > 0
                ? `Publishing blocked — ${gate.failedCount} scene${gate.failedCount === 1 ? "" : "s"} failed automated QA`
                : gate.missingVideoCount > 0
                  ? `Publishing blocked — ${gate.missingVideoCount} scene${gate.missingVideoCount === 1 ? " has" : "s have"} no video`
                : gate.nonMasterCount > 0
                  ? `Publishing blocked — ${gate.nonMasterCount} scene${gate.nonMasterCount === 1 ? " is" : "s are"} below master quality`
                : gate.pendingCount > 0
                  ? `${gate.pendingCount} scene${gate.pendingCount === 1 ? "" : "s"} pending QA — final export is held until verification finishes`
                  : gate.warningCount > 0
                    ? `${gate.warningCount} scene${gate.warningCount === 1 ? "" : "s"} flagged with non-blocking warnings`
                    : "All scenes passed automated QA"}
          </div>
          {gate.blockingReason && (
            <div className="text-xs text-rose-300/80 mt-1">{gate.blockingReason}</div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={gate.runQaAll}
          disabled={gate.qaInFlight || gate.loading || gate.scenes.length === 0}
        >
          {gate.qaInFlight ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
          )}
          Run QA on all
        </Button>
      </div>

      {gate.scenes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {gate.scenes.map((s) => (
            <button
              key={s.sceneId}
              type="button"
              onClick={() => gate.runQaFor(s.sceneId)}
              disabled={gate.qaInFlight}
              title={s.summary || s.defectCodes.join(", ") || s.status}
              className={`text-[10px] px-2 py-0.5 rounded border font-mono ${statusColor[s.status]} hover:opacity-80 transition`}
            >
              S{String(s.sceneNumber).padStart(2, "0")} · {s.status}
              {s.defectCodes.length > 0 && ` (${s.defectCodes.length})`}
            </button>
          ))}
        </div>
      )}

      {gate.failedCount > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          {gate.scenes
            .filter((s) => s.status === "failed")
            .map((s) => (
              <div key={s.sceneId} className="text-xs text-slate-300">
                <Badge variant="destructive" className="mr-2">
                  S{String(s.sceneNumber).padStart(2, "0")}
                </Badge>
                {s.summary || s.defectCodes.join(", ") || "Critical defect detected"}
              </div>
            ))}
        </div>
      )}

      {children?.({ canPublish: gate.canPublish, blockingReason: gate.blockingReason })}
    </div>
  );
}
