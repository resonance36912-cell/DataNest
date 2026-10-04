/**
 * Compact diagnostics panel — shows media integrity, hydration status, and export readiness.
 * Intended for the Storyboard/Export steps to surface issues before they become errors.
 */

import { useState, useMemo } from "react";
import { Activity, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/contexts/ProjectContext";
import { checkProjectIntegrity, getStagedErrorSummary, type ProjectIntegrity, type ErrorStage } from "@/lib/media-contract";

const stageLabels: Record<ErrorStage, string> = {
  upload: "Upload",
  storage: "Storage",
  signing: "URL Signing",
  hydration: "Hydration",
  storyboard: "Storyboard",
  rendering: "Rendering",
  export: "Export",
  edge_function: "Backend",
  db_read: "DB Read",
  db_write: "DB Write",
};

export default function DiagnosticsPanel() {
  const { audioUrl, scenes, verification, transcription, characterConfirmed } = useProject();
  const [expanded, setExpanded] = useState(false);

  const integrity: ProjectIntegrity = useMemo(() => {
    return checkProjectIntegrity(
      audioUrl,
      scenes.map(s => ({
        scene_number: s.scene_number,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl,
        segmentAudioUrl: s.segmentAudioUrl,
      }))
    );
  }, [audioUrl, scenes]);

  const errorSummary = useMemo(() => getStagedErrorSummary(), [scenes]);
  const totalErrors = Object.values(errorSummary).reduce((a, b) => a + b, 0);

  const statusIcon = integrity.exportReady
    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
    : integrity.legacyBase64Count > 0
      ? <XCircle className="h-4 w-4 text-destructive" />
      : <AlertTriangle className="h-4 w-4 text-yellow-500" />;

  const workflowState = {
    audio: !!audioUrl,
    transcription: !!transcription,
    analysis: !!verification,
    character: characterConfirmed,
    scenes: scenes.length > 0,
    images: integrity.storageBackedImages > 0,
    videos: scenes.some(s => s.videoUrl),
    exportReady: integrity.exportReady,
  };

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 text-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground">Diagnostics</span>
        {statusIcon}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
          {integrity.scenesHydrated}/{integrity.scenesTotal} scenes
          {integrity.legacyBase64Count > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              {integrity.legacyBase64Count} legacy
            </Badge>
          )}
          {totalErrors > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-yellow-500 text-yellow-600">
              {totalErrors} errors
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {/* Workflow state */}
          <div className="grid grid-cols-4 gap-1 text-xs">
            {Object.entries(workflowState).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1">
                {val
                  ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                  : <XCircle className="h-3 w-3 text-muted-foreground/50" />}
                <span className={val ? "text-foreground" : "text-muted-foreground"}>
                  {key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
                </span>
              </div>
            ))}
          </div>

          {/* Media breakdown */}
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>Audio signed: {integrity.audioSigned ? "✓" : "✗"}</div>
            <div>Storage-backed images: {integrity.storageBackedImages}/{integrity.scenesTotal}</div>
            <div>Legacy base64: {integrity.legacyBase64Count}</div>
            <div>Export ready: {integrity.exportReady ? "✓" : "✗"}</div>
            <div>Last check: {new Date(integrity.lastChecked).toLocaleTimeString()}</div>
          </div>

          {/* Error buckets */}
          {totalErrors > 0 && (
            <div className="text-xs">
              <div className="font-medium text-foreground mb-1">Error Buckets:</div>
              <div className="flex flex-wrap gap-1">
                {(Object.entries(errorSummary) as [ErrorStage, number][])
                  .filter(([, count]) => count > 0)
                  .map(([stage, count]) => (
                    <Badge key={stage} variant="outline" className="text-xs px-1.5 py-0">
                      {stageLabels[stage]}: {count}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {/* Scene issues */}
          {integrity.scenes.some(s => s.issues.length > 0) && (
            <div className="text-xs">
              <div className="font-medium text-foreground mb-1">Scene Issues:</div>
              {integrity.scenes
                .filter(s => s.issues.length > 0)
                .slice(0, 5)
                .map(s => (
                  <div key={s.sceneNumber} className="text-muted-foreground">
                    Scene {s.sceneNumber}: {s.issues.join(", ")}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
