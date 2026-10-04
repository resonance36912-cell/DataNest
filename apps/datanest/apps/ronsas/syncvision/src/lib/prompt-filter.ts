// Apply the transcript-export filters (skip empty + min confidence) to the
// lyric data that feeds scene/storyboard and character prompt generation, so
// the AI sees the same cues the user will export.
import { supabase } from "@/integrations/supabase/client";

export interface PromptFilterSettings {
  enabled: boolean;
  skip_empty: boolean;
  min_confidence_enabled: boolean;
  min_confidence: number;
}

export const DEFAULT_PROMPT_FILTER_SETTINGS: PromptFilterSettings = {
  enabled: false,
  skip_empty: false,
  min_confidence_enabled: false,
  min_confidence: 0.5,
};

export function normalisePromptFilterSettings(raw: any): PromptFilterSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROMPT_FILTER_SETTINGS };
  return {
    enabled: !!raw.enabled,
    skip_empty: !!raw.skip_empty,
    min_confidence_enabled: !!raw.min_confidence_enabled,
    min_confidence: typeof raw.min_confidence === "number" ? raw.min_confidence : 0.5,
  };
}

export interface FilteredLyricLine {
  line_index: number;
  text: string;
  start_sec: number | null;
  end_sec: number | null;
  confidence: number | null;
}

export interface FilteredLyricsResult {
  lines: FilteredLyricLine[];
  excludedCount: number;
  totalCount: number;
  combinedText: string;
}

/**
 * Pull lyric_lines + word_tokens for the active transcript version and apply
 * the prompt-filter settings. Lines without measurable confidence are dropped
 * whenever the min-confidence filter is on (matches export semantics).
 */
export async function loadFilteredLyricLines(
  projectId: string,
  transcriptVersionId: string,
  settings: PromptFilterSettings,
): Promise<FilteredLyricsResult> {
  const { data: rawLines } = await supabase
    .from("lyric_lines")
    .select("id, line_index, text, start_sec, end_sec")
    .eq("project_id", projectId)
    .eq("transcript_version_id", transcriptVersionId)
    .order("line_index", { ascending: true });

  const lineRows = rawLines ?? [];
  if (!lineRows.length) {
    return { lines: [], excludedCount: 0, totalCount: 0, combinedText: "" };
  }

  let confidenceByLineId = new Map<string, number | null>();
  if (settings.min_confidence_enabled) {
    const ids = lineRows.map((l) => l.id);
    const { data: words } = await supabase
      .from("word_tokens")
      .select("lyric_line_id, confidence")
      .in("lyric_line_id", ids);
    const acc = new Map<string, { sum: number; n: number }>();
    for (const w of words ?? []) {
      if (typeof w.confidence !== "number") continue;
      const cur = acc.get(w.lyric_line_id) ?? { sum: 0, n: 0 };
      cur.sum += w.confidence;
      cur.n += 1;
      acc.set(w.lyric_line_id, cur);
    }
    for (const id of ids) {
      const e = acc.get(id);
      confidenceByLineId.set(id, e && e.n > 0 ? e.sum / e.n : null);
    }
  }

  const keep: FilteredLyricLine[] = [];
  let excluded = 0;
  for (const row of lineRows) {
    const text = (row.text ?? "").trim();
    if (settings.skip_empty && text === "") { excluded++; continue; }
    const conf = confidenceByLineId.get(row.id) ?? null;
    if (settings.min_confidence_enabled) {
      if (conf == null || conf < settings.min_confidence) { excluded++; continue; }
    }
    keep.push({
      line_index: row.line_index,
      text: row.text ?? "",
      start_sec: row.start_sec,
      end_sec: row.end_sec,
      confidence: conf,
    });
  }

  return {
    lines: keep,
    excludedCount: excluded,
    totalCount: lineRows.length,
    combinedText: keep.map((l) => l.text).join("\n"),
  };
}

/**
 * Replace a segment's lyrics with only the kept lines whose time window
 * intersects the segment. Returns null when the segment becomes empty so the
 * caller can mark it instrumental.
 */
export function lyricsForSegmentFromFiltered(
  startSec: number,
  endSec: number,
  filtered: FilteredLyricLine[],
): string {
  const hits = filtered.filter((l) =>
    l.start_sec != null && l.end_sec != null &&
    l.start_sec < endSec - 0.05 && l.end_sec > startSec + 0.05,
  );
  return hits.map((l) => l.text).join("\n");
}
