/**
 * TrackLaneHeaders — Left-side track headers with mute/lock/visibility controls
 * for Video, Overlay, Caption, and Audio lanes.
 */

import { useCallback } from "react";
import {
  Eye, EyeOff, Lock, Unlock, Volume2, VolumeX,
  Film, Layers, Type, Music,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TrackState {
  visible: boolean;
  locked: boolean;
  muted: boolean;
}

export interface TrackStates {
  video: TrackState;
  overlay: TrackState;
  caption: TrackState;
  audio: TrackState;
}

export const DEFAULT_TRACK_STATES: TrackStates = {
  video:   { visible: true, locked: false, muted: false },
  overlay: { visible: true, locked: false, muted: false },
  caption: { visible: true, locked: false, muted: false },
  audio:   { visible: true, locked: false, muted: false },
};

type TrackKey = keyof TrackStates;

const TRACK_META: Record<TrackKey, { label: string; icon: typeof Film; color: string }> = {
  video:   { label: "Video",   icon: Film,   color: "text-primary" },
  overlay: { label: "Overlay", icon: Layers, color: "text-accent" },
  caption: { label: "Caption", icon: Type,   color: "text-amber-400" },
  audio:   { label: "Audio",   icon: Music,  color: "text-emerald-400" },
};

interface TrackLaneHeaderProps {
  trackKey: TrackKey;
  state: TrackState;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onToggleMute: () => void;
  compact?: boolean;
}

function TrackLaneHeader({
  trackKey, state, onToggleVisible, onToggleLock, onToggleMute, compact,
}: TrackLaneHeaderProps) {
  const meta = TRACK_META[trackKey];
  const Icon = meta.icon;
  const dimmed = !state.visible;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 border-b border-border/20 transition-opacity",
        dimmed && "opacity-40",
        compact ? "h-[52px]" : "h-[60px]",
      )}
    >
      {/* Track icon + label */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", meta.color)} />
        <span className="text-[10px] font-medium text-foreground truncate">{meta.label}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleVisible}
              className={cn(
                "h-5 w-5 rounded flex items-center justify-center transition-colors",
                state.visible
                  ? "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  : "text-muted-foreground/40 hover:text-foreground hover:bg-secondary",
              )}
            >
              {state.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {state.visible ? "Hide" : "Show"} {meta.label}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleMute}
              className={cn(
                "h-5 w-5 rounded flex items-center justify-center transition-colors",
                state.muted
                  ? "text-destructive/70 hover:text-destructive hover:bg-secondary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
            >
              {state.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {state.muted ? "Unmute" : "Mute"} {meta.label}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleLock}
              className={cn(
                "h-5 w-5 rounded flex items-center justify-center transition-colors",
                state.locked
                  ? "text-amber-500 hover:text-amber-400 hover:bg-secondary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
            >
              {state.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {state.locked ? "Unlock" : "Lock"} {meta.label}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

interface TrackLaneHeadersProps {
  tracks: TrackStates;
  onUpdate: (tracks: TrackStates) => void;
  /** Which tracks to show — defaults to all */
  visibleTracks?: TrackKey[];
  compact?: boolean;
}

export default function TrackLaneHeaders({
  tracks, onUpdate, visibleTracks, compact,
}: TrackLaneHeadersProps) {
  const shown = visibleTracks || (["video", "overlay", "caption", "audio"] as TrackKey[]);

  const toggle = useCallback(
    (key: TrackKey, prop: keyof TrackState) => {
      onUpdate({ ...tracks, [key]: { ...tracks[key], [prop]: !tracks[key][prop] } });
    },
    [tracks, onUpdate],
  );

  return (
    <div className="flex flex-col border-r border-border/30 bg-card/50 w-[100px] flex-shrink-0">
      {shown.map((key) => (
        <TrackLaneHeader
          key={key}
          trackKey={key}
          state={tracks[key]}
          onToggleVisible={() => toggle(key, "visible")}
          onToggleLock={() => toggle(key, "locked")}
          onToggleMute={() => toggle(key, "muted")}
          compact={compact}
        />
      ))}
    </div>
  );
}

/** Empty lane placeholder for tracks without content yet */
export function EmptyTrackLane({ label, height }: { label: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center border-b border-border/20 text-[9px] text-muted-foreground/40 italic"
      style={{ height: height || 52 }}
    >
      No {label.toLowerCase()} clips
    </div>
  );
}
