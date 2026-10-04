import { Music2, Gauge, KeyRound, Sparkles, Clock } from "lucide-react";

interface Props {
  title?: string | null;
  bpm?: number | null;
  musicKey?: string | null;
  mood?: string | null;
  durationSec?: number | null;
  sceneCount?: number;
}

function fmtDuration(s?: number | null) {
  if (!s || !Number.isFinite(s)) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Compact "production desk" summary strip for the Storyboard workspace.
 * Surfaces the real project metadata (title / BPM / key / mood / duration / scene count)
 * so the workspace reads as a music-video studio, not a generic form.
 */
export default function TrackSummaryStrip({ title, bpm, musicKey, mood, durationSec, sceneCount }: Props) {
  const dur = fmtDuration(durationSec);
  const chips: Array<{ icon: typeof Gauge; label: string; value: string | number }> = [];
  if (bpm) chips.push({ icon: Gauge, label: "BPM", value: Math.round(bpm) });
  if (musicKey) chips.push({ icon: KeyRound, label: "Key", value: musicKey });
  if (mood) chips.push({ icon: Sparkles, label: "Mood", value: mood });
  if (dur) chips.push({ icon: Clock, label: "Length", value: dur });
  if (typeof sceneCount === "number" && sceneCount > 0) {
    chips.push({ icon: Music2, label: "Scenes", value: sceneCount });
  }

  if (!title && chips.length === 0) return null;

  return (
    <div className="glass-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Music2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{title || "Untitled track"}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Track summary</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map(({ icon: Icon, label, value }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px]"
          >
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
