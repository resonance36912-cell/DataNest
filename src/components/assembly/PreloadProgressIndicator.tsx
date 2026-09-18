import { usePreloadProgress } from "@/hooks/useVideoPreloader";
import { HardDrive, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Compact indicator showing how many scene videos are cached.
 * Renders inline in the timeline toolbar area.
 */
export default function PreloadProgressIndicator() {
  const { total, cached, inFlight } = usePreloadProgress();

  if (total === 0) return null;

  const allCached = cached >= total;
  const pct = Math.round((cached / total) * 100);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-[10px] tabular-nums select-none">
          {allCached ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <HardDrive className="h-3 w-3 text-muted-foreground animate-pulse" />
          )}
          <div className="flex items-center gap-1">
            <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  allCached ? "bg-green-500" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={allCached ? "text-green-400" : "text-muted-foreground"}>
              {cached}/{total}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {allCached
          ? "All scene videos cached — smooth playback ready"
          : `Buffering: ${cached} of ${total} cached${inFlight > 0 ? `, ${inFlight} downloading` : ""}`}
      </TooltipContent>
    </Tooltip>
  );
}
