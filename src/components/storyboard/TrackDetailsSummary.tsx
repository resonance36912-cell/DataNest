import { Music, User, Sparkles, Palette, Ratio, FileText, AlertTriangle, Info } from "lucide-react";
import type { TrackDetails, TrackDetailIssues, TrackDetailAdjustments, TrackDetailAdjustment } from "@/lib/track-details";

interface Props {
  details: TrackDetails;
  /** Fallback mood from analysis verification if trackDetails.mood is empty. */
  fallbackMood?: string | null;
  /** Per-field validation errors from validateTrackDetailInputs — when
   *  present, the row renders red and the summary shows an inline
   *  blocking warning so users understand why Generate is disabled. */
  issues?: TrackDetailIssues;
  /** Non-blocking sanitisation notes — e.g. "vertical" coerced to 9:16,
   *  visual_style trimmed to 200 chars, aspect ratio defaulted because
   *  the persisted value was missing. Rendered as an amber notice so the
   *  user can see exactly which value the prompts will use. */
  adjustments?: TrackDetailAdjustments;
}

/**
 * Read-only summary of the Track Details the user entered on Upload —
 * shown in the storyboard editor so they can confirm title, artist,
 * mood, visual style, and aspect ratio before spending credits to
 * generate scenes. These same values are threaded into the
 * generate-storylines and generate-scene-image prompts.
 */
export default function TrackDetailsSummary({ details, fallbackMood, issues, adjustments }: Props) {
  const mood = details.mood || fallbackMood || "";
  const aspectIssue = issues?.aspect_ratio;
  const styleIssue = issues?.visual_style;
  const aspectAdj = !aspectIssue ? adjustments?.aspect_ratio : undefined;
  const styleAdj = !styleIssue ? adjustments?.visual_style : undefined;

  const rows: Array<{
    key: string;
    icon: typeof Music;
    label: string;
    value: string;
    muted?: boolean;
    error?: string;
    note?: TrackDetailAdjustment;
  }> = [
    { key: "title", icon: Music, label: "Title", value: details.song_title || "—", muted: !details.song_title },
    { key: "artist", icon: User, label: "Artist", value: details.artist_name || "—", muted: !details.artist_name },
    { key: "mood", icon: Sparkles, label: "Mood", value: mood || "—", muted: !mood },
    { key: "style", icon: Palette, label: "Visual style", value: details.visual_style || "—", muted: !details.visual_style, error: styleIssue, note: styleAdj },
    { key: "aspect", icon: Ratio, label: "Aspect ratio", value: details.aspect_ratio, error: aspectIssue, note: aspectAdj },
  ];

  const lyricsChars = details.pasted_lyrics.trim().length;
  const hasBlockingIssue = !!(aspectIssue || styleIssue);
  const adjustmentList = [aspectAdj, styleAdj].filter(Boolean) as TrackDetailAdjustment[];
  const hasAdjustments = adjustmentList.length > 0;

  return (
    <section
      aria-label="Track details summary"
      className={`glass-card p-4 space-y-3 ${hasBlockingIssue ? "border-destructive/50" : ""}`}
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Track details</h2>
          <p className="text-[11px] text-muted-foreground">
            Confirm these before generating — they flow into every storyline and scene-image prompt.
          </p>
        </div>
        {lyricsChars > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
            <FileText className="h-3 w-3" />
            Pasted lyrics: {lyricsChars.toLocaleString()} chars
          </span>
        )}
      </header>
      {hasBlockingIssue && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold">Fix these before generating</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {aspectIssue && <li>{aspectIssue}</li>}
              {styleIssue && <li>{styleIssue}</li>}
            </ul>
            <div className="text-[11px] text-destructive/80">
              The Generate buttons are disabled until this is resolved. Go back to the Upload step to correct these fields.
            </div>
          </div>
        </div>
      )}
      {!hasBlockingIssue && hasAdjustments && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold">Some values were auto-adjusted</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {adjustmentList.map((a, i) => (
                <li key={i}>{a.message}</li>
              ))}
            </ul>
            <div className="text-[11px] opacity-80">
              Prompts will use the adjusted values above. Edit the Upload step to change them.
            </div>
          </div>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(({ key, icon: Icon, label, value, muted, error, note }) => {
          const isNote = !error && !!note;
          return (
            <div
              key={key}
              aria-invalid={!!error || undefined}
              className={`flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-1.5 ${
                error
                  ? "border-destructive/50 bg-destructive/5"
                  : isNote
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-border/40 bg-muted/20"
              }`}
            >
              <Icon
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  error ? "text-destructive" : isNote ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                }`}
              />
              <div className="min-w-0">
                <dt
                  className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider ${
                    error ? "text-destructive" : isNote ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                  }`}
                >
                  {label}
                  {isNote && (
                    <span className="rounded-sm bg-amber-500/15 px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide">
                      {note!.kind}
                    </span>
                  )}
                </dt>
                <dd
                  className={`truncate text-xs font-medium ${
                    error
                      ? "text-destructive"
                      : muted
                      ? "text-muted-foreground/70 italic"
                      : "text-foreground"
                  }`}
                  title={error || note?.message || value}
                >
                  {value}
                </dd>
                {error && (
                  <p className="mt-0.5 text-[10px] leading-tight text-destructive">{error}</p>
                )}
                {isNote && (
                  <p className="mt-0.5 text-[10px] leading-tight text-amber-600 dark:text-amber-400">
                    {note!.message}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
