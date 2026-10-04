import { Sparkles, CheckCircle2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import type { HdJobState } from "@/hooks/useHdRendering";

interface HdRenderSectionProps {
  previewScenes: any[];
  hdReadyScenes: any[];
  allHd: boolean;
  hasVideos: boolean;
  hdJobs: Record<number, HdJobState>;
  renderingAll: boolean;
  activeHdCount: number;
  scenes: any[];
  onRenderAll: () => void;
}

export default function HdRenderSection({
  previewScenes, hdReadyScenes, allHd, hasVideos, hdJobs,
  renderingAll, activeHdCount, scenes, onRenderAll,
}: HdRenderSectionProps) {
  return (
    <>
      {previewScenes.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Render <Badge variant="outline" className="border-primary text-primary font-bold text-xs px-2 py-0.5">HD</Badge> for Export
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {previewScenes.length} scene{previewScenes.length > 1 ? "s" : ""} at preview quality.
                {hdReadyScenes.length > 0 && ` ${hdReadyScenes.length} already HD.`}
                {" "}Choose HD rendering for high-quality final exports.
              </p>
            </div>
            <Button onClick={onRenderAll} disabled={renderingAll || activeHdCount > 0} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              {renderingAll || activeHdCount > 0 ? (<><Loader2 className="h-4 w-4 animate-spin" /> Rendering…</>) : (<><Sparkles className="h-4 w-4" /> Render All HD</>)}
            </Button>
          </div>

          {Object.keys(hdJobs).length > 0 && (
            <div className="space-y-2">
              {Object.entries(hdJobs).map(([idxStr, job]) => {
                const idx = parseInt(idxStr);
                if (!scenes[idx]) return null;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium w-20 shrink-0 truncate">Scene {idx + 1}</span>
                      {job.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : job.status === "error" ? <X className="h-3.5 w-3.5 text-destructive" /> : null}
                    </div>
                    <ProcessProgressBar progress={job.progress} active={job.status === "running"} label={job.status === "done" ? "Complete!" : job.status === "error" ? "Failed" : "Rendering HD…"} barHeight="h-1.5" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {allHd && hasVideos && (
        <div className="glass-card p-4 flex items-center gap-3 border-green-500/20 bg-green-500/5">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-600">All videos are HD rendered and ready for export.</span>
        </div>
      )}
    </>
  );
}
