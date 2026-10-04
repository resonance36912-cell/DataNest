/**
 * useTimelineKeyboard — Keyboard shortcuts for timeline editing.
 *
 * Shortcuts:
 *   Space     — Play/Pause
 *   S         — Split at playhead
 *   Q         — Trim active clip start to playhead
 *   W         — Trim active clip end to playhead
 *   Delete    — Delete active clip (ripple if enabled)
 *   ←/→       — Nudge playhead ±1 frame
 *   Shift+←/→ — Nudge playhead ±10 frames
 *   ↑/↓       — Jump to prev/next cut point
 *   M         — Add marker at playhead
 *   Ctrl+D    — Duplicate active clip
 *   ?         — Show shortcuts overlay
 *   [/]       — Zoom out/in
 *   Home      — Jump to start
 *   End       — Jump to end
 */

import { useEffect, useCallback } from "react";
export interface TimelineKeyboardActions {
  onPlayPause: () => void;
  onSplit: () => void;
  onTrimStart: () => void;
  onTrimEnd: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onNudge: (frames: number) => void;
  onJumpToCut: (direction: "next" | "prev") => void;
  onAddMarker: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onToggleShortcuts: () => void;
}

export function useTimelineKeyboard(
  actions: TimelineKeyboardActions,
  enabled: boolean = true
) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    // Ignore when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    const { key, shiftKey, ctrlKey, metaKey } = e;
    const mod = ctrlKey || metaKey;

    switch (key) {
      case " ":
        e.preventDefault();
        actions.onPlayPause();
        break;
      case "s":
      case "S":
        if (!mod) { e.preventDefault(); actions.onSplit(); }
        break;
      case "q":
      case "Q":
        if (!mod) { e.preventDefault(); actions.onTrimStart(); }
        break;
      case "w":
      case "W":
        if (!mod) { e.preventDefault(); actions.onTrimEnd(); }
        break;
      case "Delete":
      case "Backspace":
        if (!mod) { e.preventDefault(); actions.onDelete(); }
        break;
      case "d":
      case "D":
        if (mod) { e.preventDefault(); actions.onDuplicate(); }
        break;
      case "ArrowLeft":
        e.preventDefault();
        actions.onNudge(shiftKey ? -10 : -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        actions.onNudge(shiftKey ? 10 : 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        actions.onJumpToCut("prev");
        break;
      case "ArrowDown":
        e.preventDefault();
        actions.onJumpToCut("next");
        break;
      case "m":
      case "M":
        if (!mod) { e.preventDefault(); actions.onAddMarker(); }
        break;
      case "[":
        e.preventDefault();
        actions.onZoomOut();
        break;
      case "]":
        e.preventDefault();
        actions.onZoomIn();
        break;
      case "Home":
        e.preventDefault();
        actions.onJumpToStart();
        break;
      case "End":
        e.preventDefault();
        actions.onJumpToEnd();
        break;
      case "?":
        e.preventDefault();
        actions.onToggleShortcuts();
        break;
    }
  }, [enabled, actions]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/** Shortcut definitions for display in a help overlay */
export const SHORTCUT_LIST = [
  { key: "Space", label: "Play / Pause" },
  { key: "S", label: "Split at playhead" },
  { key: "Q", label: "Trim start to playhead" },
  { key: "W", label: "Trim end to playhead" },
  { key: "Delete", label: "Delete clip" },
  { key: "←/→", label: "Nudge ±1 frame" },
  { key: "Shift+←/→", label: "Nudge ±10 frames" },
  { key: "↑/↓", label: "Jump to prev/next cut" },
  { key: "M", label: "Add marker" },
  { key: "Ctrl+D", label: "Duplicate clip" },
  { key: "[/]", label: "Zoom out/in" },
  { key: "Home/End", label: "Jump to start/end" },
  { key: "?", label: "Show shortcuts" },
] as const;
