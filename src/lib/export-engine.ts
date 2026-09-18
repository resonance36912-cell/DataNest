/**
 * PHASE 3 — Export Engine (Hardened)
 *
 * Generates SRT, VTT, Karaoke VTT, and manifest JSON.
 * All exports use accepted transcript versions only.
 *
 * PHASE 3 additions:
 * - Karaoke export REFUSES blocked timing versions
 * - Standard subtitle includes timing quality metadata in manifest
 * - Timing quality warnings in export output
 */

import type { NormalizedLine, NormalizedWord, TimingQualitySummary } from "./transcript-normalizer";
import type { TimingStatus } from "@/types/eligibility";

/** Format seconds as SRT timestamp: HH:MM:SS,mmm */
function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Format seconds as VTT timestamp: HH:MM:SS.mmm */
function formatVttTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/**
 * Generate SRT subtitle content from normalized lines.
 */
export function generateSRT(lines: NormalizedLine[]): string {
  return lines
    .map((line, i) => {
      const idx = i + 1;
      const start = formatSrtTime(line.start_sec);
      const end = formatSrtTime(line.end_sec);
      return `${idx}\n${start} --> ${end}\n${line.text}\n`;
    })
    .join("\n");
}

/**
 * Generate WebVTT subtitle content from normalized lines.
 */
export function generateVTT(lines: NormalizedLine[]): string {
  const cues = lines
    .map((line) => {
      const start = formatVttTime(line.start_sec);
      const end = formatVttTime(line.end_sec);
      return `${start} --> ${end}\n${line.text}`;
    })
    .join("\n\n");

  return `WEBVTT\n\n${cues}\n`;
}

/**
 * Validate that a transcript is safe for karaoke export.
 * PHASE 3: Blocked timing versions are REFUSED.
 */
export function validateKaraokeExportSafety(
  words: NormalizedWord[]
): { safe: boolean; reason?: string; quality: TimingQualitySummary } {
  let verified = 0, draft = 0, blocked = 0;
  for (const w of words) {
    switch (w.timing_status) {
      case "verified": verified++; break;
      case "draft": draft++; break;
      case "blocked": blocked++; break;
    }
  }
  const total = words.length;
  const overallStatus: TimingStatus = blocked > 0 ? "blocked" : draft > 0 ? "draft" : "verified";
  const quality: TimingQualitySummary = {
    verifiedCount: verified,
    draftCount: draft,
    blockedCount: blocked,
    totalCount: total,
    overallStatus,
  };

  if (blocked > 0) {
    return {
      safe: false,
      reason: `Karaoke export blocked: ${blocked} word(s) have fallback/zero-based timing. Review in Word Timing Panel first.`,
      quality,
    };
  }

  return { safe: true, quality };
}

/**
 * Generate Karaoke-style WebVTT with word-level highlighting.
 * Uses <c.active> class for the currently-spoken word.
 *
 * PHASE 3: Refuses to generate if any word has blocked timing.
 */
export function generateKaraokeVTT(
  lines: NormalizedLine[],
  wordsByLine: Map<number, NormalizedWord[]>
): string {
  // Collect all words for safety check
  const allWords: NormalizedWord[] = [];
  for (const line of lines) {
    const lineWords = wordsByLine.get(line.line_index) ?? line.words;
    allWords.push(...lineWords);
  }

  const safety = validateKaraokeExportSafety(allWords);
  if (!safety.safe) {
    throw new Error(safety.reason || "Karaoke export blocked due to unsafe timing");
  }

  const cues: string[] = [];

  for (const line of lines) {
    const lineWords = wordsByLine.get(line.line_index) ?? line.words;
    if (!lineWords || lineWords.length === 0) continue;

    for (let wi = 0; wi < lineWords.length; wi++) {
      const word = lineWords[wi];
      const start = formatVttTime(word.start_sec);
      const end = formatVttTime(word.end_sec);

      const highlightedText = lineWords
        .map((w, idx) =>
          idx === wi ? `<c.active>${w.text}</c>` : w.text
        )
        .join(" ");

      cues.push(`${start} --> ${end}\n${highlightedText}`);
    }
  }

  return `WEBVTT\nKind: captions\n\n${cues.join("\n\n")}\n`;
}

/**
 * Generate a project manifest JSON for export.
 * PHASE 3: Includes timing quality metadata.
 */
export function generateManifest(params: {
  projectId: string;
  projectName: string;
  transcriptVersionId: string;
  versionNumber: number;
  lines: NormalizedLine[];
  metadata: {
    bpm?: number | null;
    music_key?: string | null;
    mood?: string | null;
    energy?: string | null;
    instruments?: string[] | null;
  };
  exportedAt: string;
  timingQuality?: TimingQualitySummary;
}): string {
  const manifest = {
    format_version: "1.1",
    exported_at: params.exportedAt,
    project: {
      id: params.projectId,
      name: params.projectName,
    },
    transcript: {
      version_id: params.transcriptVersionId,
      version_number: params.versionNumber,
      line_count: params.lines.length,
      word_count: params.lines.reduce((acc, l) => acc + l.words.length, 0),
      total_duration_sec: params.lines.length > 0
        ? params.lines[params.lines.length - 1].end_sec - params.lines[0].start_sec
        : 0,
    },
    timing_quality: params.timingQuality ? {
      overall_status: params.timingQuality.overallStatus,
      verified_words: params.timingQuality.verifiedCount,
      draft_words: params.timingQuality.draftCount,
      blocked_words: params.timingQuality.blockedCount,
      total_words: params.timingQuality.totalCount,
    } : null,
    analysis: {
      bpm: params.metadata.bpm ?? null,
      key: params.metadata.music_key ?? null,
      mood: params.metadata.mood ?? null,
      energy: params.metadata.energy ?? null,
      instruments: params.metadata.instruments ?? [],
    },
    lines: params.lines.map(l => ({
      index: l.line_index,
      text: l.text,
      start_sec: l.start_sec,
      end_sec: l.end_sec,
      words: l.words.map(w => ({
        text: w.text,
        start_sec: w.start_sec,
        end_sec: w.end_sec,
        confidence: w.confidence,
        timing_source: w.timing_source,
        timing_status: w.timing_status,
      })),
    })),
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * Pre-index words by line_index for O(1) lookup.
 */
export function indexWordsByLine(lines: NormalizedLine[]): Map<number, NormalizedWord[]> {
  const map = new Map<number, NormalizedWord[]>();
  for (const line of lines) {
    map.set(line.line_index, line.words);
  }
  return map;
}
