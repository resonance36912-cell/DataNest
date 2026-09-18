/**
 * TimelineToolbar — Snap toggle, zoom controls, timecode display, editing actions.
 */

import PreloadProgressIndicator from "./PreloadProgressIndicator";
import {
  Magnet, ZoomIn, ZoomOut, Maximize2, Scissors, Flag,
  ChevronLeft, ChevronRight, Keyboard, Trash2, Copy,
  ArrowRightToLine, ToggleLeft, ToggleRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTimecode, ZOOM_LEVELS } from "@/lib/timeline-engine";
import { SHORTCUT_LIST } from "@/hooks/useTimelineKeyboard";

interface TimelineToolbarProps {
  snapEnabled: boolean;
  onToggleSnap: () => void;
  rippleEnabled: boolean;
  onToggleRipple: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onZoomToFit: () => void;
  playheadTimeSec: number;
  shortcutsOpen: boolean;
  onShortcutsOpenChange: (open: boolean) => void;
  onSplit: () => void;
  onAddMarker: () => void;
  onJumpToCut: (direction: "next" | "prev") => void;
  onRippleDelete?: () => void;
  onCloseGap?: () => void;
  onDuplicate?: () => void;
  hasActiveClip: boolean;
  hasGaps: boolean;
}

export default function TimelineToolbar({
  snapEnabled, onToggleSnap,
  rippleEnabled, onToggleRipple,
  zoom, onZoomChange, onZoomToFit,
  playheadTimeSec, shortcutsOpen, onShortcutsOpenChange,
  onSplit, onAddMarker, onJumpToCut,
  onRippleDelete, onCloseGap, onDuplicate,
  hasActiveClip, hasGaps,
}: TimelineToolbarProps) {
  const zoomPct = Math.round(((zoom - ZOOM_LEVELS[0]) / (ZOOM_LEVELS[ZOOM_LEVELS.length - 1] - ZOOM_LEVELS[0])) * 100);

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap px-1 py-1.5 border-b border-border/30">
        {/* Timecode */}
        <Badge variant="outline" className="font-mono text-[11px] px-2 py-0.5 tabular-nums border-primary/30 text-primary mr-1">
          {formatTimecode(playheadTimeSec)}
        </Badge>

        <div className="h-4 w-px bg-border/40 mx-0.5" />

        {/* Snap Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm" variant={snapEnabled ? "default" : "outline"}
              onClick={onToggleSnap}
              className={`h-7 w-7 p-0 ${snapEnabled ? "bg-primary text-primary-foreground" : ""}`}
            >
              <Magnet className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Snap {snapEnabled ? "ON" : "OFF"} — clips snap to edges, playhead & markers
          </TooltipContent>
        </Tooltip>

        {/* Ripple Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm" variant={rippleEnabled ? "default" : "outline"}
              onClick={onToggleRipple}
              className={`h-7 w-7 p-0 ${rippleEnabled ? "bg-accent text-accent-foreground" : ""}`}
            >
              {rippleEnabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Auto Ripple {rippleEnabled ? "ON" : "OFF"} — auto-close gaps on delete/trim
          </TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border/40 mx-0.5" />

        {/* Editing Actions */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={onSplit} disabled={!hasActiveClip} className="h-7 w-7 p-0">
              <Scissors className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Split at playhead (S)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={onAddMarker} className="h-7 w-7 p-0">
              <Flag className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Add marker (M)</TooltipContent>
        </Tooltip>

        {onDuplicate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={onDuplicate} disabled={!hasActiveClip} className="h-7 w-7 p-0">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Duplicate clip (Ctrl+D)</TooltipContent>
          </Tooltip>
        )}

        {onRippleDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={onRippleDelete} disabled={!hasActiveClip} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Ripple delete (Delete)</TooltipContent>
          </Tooltip>
        )}

        {onCloseGap && hasGaps && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={onCloseGap} className="h-7 px-2 gap-1 text-[10px]">
                <ArrowRightToLine className="h-3 w-3" /> Close Gaps
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Close all gaps in timeline</TooltipContent>
          </Tooltip>
        )}

        <div className="h-4 w-px bg-border/40 mx-0.5" />

        {/* Jump to cut */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => onJumpToCut("prev")} className="h-7 w-7 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Previous cut (↑)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => onJumpToCut("next")} className="h-7 w-7 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Next cut (↓)</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Preload progress */}
        <PreloadProgressIndicator />

        {/* Zoom Controls */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={onZoomToFit} className="h-7 w-7 p-0">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Zoom to fit</TooltipContent>
        </Tooltip>

        <Button size="sm" variant="outline" onClick={() => onZoomChange(Math.max(ZOOM_LEVELS[0], zoom - 20))} className="h-7 w-7 p-0">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <div className="w-20">
          <Slider
            value={[zoom]}
            min={ZOOM_LEVELS[0]}
            max={ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            step={10}
            onValueChange={([v]) => onZoomChange(v)}
            className="h-4"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => onZoomChange(Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], zoom + 20))} className="h-7 w-7 p-0">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[9px] text-muted-foreground tabular-nums w-8 text-right">{zoomPct}%</span>

        <div className="h-4 w-px bg-border/40 mx-0.5" />

        {/* Shortcuts help */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={() => onShortcutsOpenChange(true)} className="h-7 w-7 p-0">
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>
      </div>

      {/* Shortcuts Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={onShortcutsOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" /> Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {SHORTCUT_LIST.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
                <span className="text-xs text-muted-foreground">{label}</span>
                <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
