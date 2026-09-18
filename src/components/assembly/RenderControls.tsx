import { Loader2, X, Video, Download, Clapperboard, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import type { RenderResult } from "@/lib/assembly-renderer";
import { MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

const QUALITY_PRESETS = {
  "720p": { w: 1280, h: 720 },
  "1080p": { w: MASTER_QUALITY_PROFILE.assembly.width, h: MASTER_QUALITY_PROFILE.assembly.height },
  "4K": { w: 3840, h: 2160 },
} as const;

export type RenderQuality = keyof typeof QUALITY_PRESETS;

interface RenderControlsProps {
  rendering: boolean;
  renderPhase: string;
  renderPercent: number;
  renderResult: RenderResult | null;
  onCancel: () => void;
  onDownload: () => void;
}

interface RenderButtonProps {
  rendering: boolean;
  renderQuality: RenderQuality;
  onQualityChange: (q: RenderQuality) => void;
  onRender: () => void;
  disabled: boolean;
}

export { QUALITY_PRESETS };

export default function RenderControls({
  rendering,
  renderPhase,
  renderPercent,
  renderResult,
  onCancel,
  onDownload,
}: RenderControlsProps) {
  return (
    <>
      {/* Render progress bar */}
      {rendering && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">Rendering Final Video</span>
            </div>
            <Button size="sm" variant="outline" onClick={onCancel} className="gap-1 border-destructive/30 text-destructive hover:bg-destructive/10">
              <X className="h-3 w-3" /> Cancel
            </Button>
          </div>
          <Progress value={renderPercent} className="h-2" />
          <p className="text-xs text-muted-foreground">{renderPhase} — {renderPercent}%</p>
        </div>
      )}

      {/* Render result download */}
      {renderResult && !rendering && (
        <div className="glass-card p-4 border-l-4 border-accent/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-medium text-foreground">Video Ready</p>
                <p className="text-xs text-muted-foreground">
                  {(renderResult.blob.size / (1024 * 1024)).toFixed(1)} MB · {renderResult.width}×{renderResult.height}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={onDownload} className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
              <Download className="h-4 w-4" /> Download
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** Quality picker dropdown + render button for the footer */
export function RenderButton({
  rendering,
  renderQuality,
  onQualityChange,
  onRender,
  disabled,
}: RenderButtonProps) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={rendering} className="gap-1 border-accent/30 text-accent hover:bg-accent/10 px-2">
            {renderQuality} <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Render Quality</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(["720p", "1080p", "4K"] as const).map((q) => (
            <DropdownMenuItem key={q} onClick={() => onQualityChange(q)} className={renderQuality === q ? "bg-accent/10 font-semibold" : ""}>
              {q} ({QUALITY_PRESETS[q].w}×{QUALITY_PRESETS[q].h})
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={onRender}
        disabled={disabled}
        className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
        {rendering ? "Rendering…" : `Render ${renderQuality}`}
      </Button>
    </>
  );
}
