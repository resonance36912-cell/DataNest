/**
 * PHASE 2+3 — Defensive Transcript Normalizer
 *
 * Production-grade normalizer that:
 * - handles rawPayload.words
 * - falls back to segment words
 * - falls back to segment-level timed units
 * - rejects undefined payloads
 * - repairs invalid timing (end > start)
 * - computes duration, gap_after
 * - filters empty words
 * - preserves ordinal_index
 * - groups words into lyric lines
 * - PHASE 3: tracks timing_source and timing_status per word
 */

import type { TimingSource, TimingStatus } from "@/types/eligibility";

export interface NormalizedWord {
  ordinal_index: number;
  text: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  gap_after: number;
  confidence: number;
  /** How this word's timing was derived */
  timing_source: TimingSource;
  /** Whether this timing is safe for lip-sync/karaoke */
  timing_status: TimingStatus;
}

export interface NormalizedLine {
  line_index: number;
  text: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  words: NormalizedWord[];
}

export interface NormalizedTranscript {
  words: NormalizedWord[];
  lines: NormalizedLine[];
  fullText: string;
  rawPayload: unknown;
  /** Summary of timing quality across the transcript */
  timingQuality: TimingQualitySummary;
}

export interface TimingQualitySummary {
  verifiedCount: number;
  draftCount: number;
  blockedCount: number;
  totalCount: number;
  overallStatus: TimingStatus;
}

interface RawWord {
  text?: string;
  word?: string;
  start?: number;
  end?: number;
  start_sec?: number;
  end_sec?: number;
  confidence?: number;
}

interface RawSegment {
  text?: string;
  start?: number;
  end?: number;
  words?: RawWord[];
}

/**
 * Derive timing_source and timing_status from how a word was created.
 */
function deriveTimingMeta(
  source: TimingSource,
  confidence: number
): { timing_source: TimingSource; timing_status: TimingStatus } {
  let timing_status: TimingStatus;

  switch (source) {
    case "native":
      timing_status = confidence >= 0.7 ? "verified" : "draft";
      break;
    case "distributed":
      timing_status = "draft";
      break;
    case "repaired":
      timing_status = "draft";
      break;
    case "fallback":
      timing_status = "blocked";
      break;
    default:
      timing_status = "blocked";
  }

  return { timing_source: source, timing_status };
}

/**
 * Main entry point. Accepts any raw transcription payload and returns
 * a fully normalized, validated result or throws.
 */
export function normalizeTranscript(rawPayload: unknown): NormalizedTranscript {
  if (rawPayload === undefined || rawPayload === null) {
    throw new Error("NORMALIZER_REJECT: payload is undefined or null");
  }

  const payload = rawPayload as Record<string, unknown>;
  let rawWords: NormalizedWord[] = [];

  // Strategy 1: rawPayload.words (top-level word array) — NATIVE timing
  if (Array.isArray(payload.words) && payload.words.length > 0) {
    rawWords = extractWords(payload.words, "native");
  }

  // Strategy 2: segment-level words — NATIVE timing (from segment context)
  if (rawWords.length === 0 && Array.isArray(payload.segments)) {
    const segments = payload.segments as RawSegment[];
    for (const seg of segments) {
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        rawWords.push(...extractWords(seg.words, "native"));
      }
    }
  }

  // Strategy 3: segment-level timed units — DISTRIBUTED timing (lower quality)
  if (rawWords.length === 0 && Array.isArray(payload.segments)) {
    const segments = payload.segments as RawSegment[];
    for (const seg of segments) {
      if (seg.text && typeof seg.start === "number" && typeof seg.end === "number") {
        const segWords = seg.text.trim().split(/\s+/).filter(Boolean);
        if (segWords.length === 0) continue;

        const segDuration = Math.max(seg.end - seg.start, 0.01);
        const wordDur = segDuration / segWords.length;

        for (let i = 0; i < segWords.length; i++) {
          const startSec = seg.start + i * wordDur;
          const endSec = seg.start + (i + 1) * wordDur;
          const meta = deriveTimingMeta("distributed", 0.5);
          rawWords.push({
            ordinal_index: rawWords.length,
            text: segWords[i],
            start_sec: startSec,
            end_sec: endSec,
            duration_sec: endSec - startSec,
            gap_after: 0,
            confidence: 0.5,
            ...meta,
          });
        }
      }
    }
  }

  // Strategy 4: top-level text fallback — FALLBACK timing (BLOCKED)
  if (rawWords.length === 0 && typeof payload.text === "string" && payload.text.trim().length > 0) {
    const words = payload.text.trim().split(/\s+/).filter(Boolean);
    const meta = deriveTimingMeta("fallback", 0.1);
    for (let i = 0; i < words.length; i++) {
      rawWords.push({
        ordinal_index: i,
        text: words[i],
        start_sec: 0,
        end_sec: 0,
        duration_sec: 0,
        gap_after: 0,
        confidence: 0.1,
        ...meta,
      });
    }
  }

  if (rawWords.length === 0) {
    throw new Error("NORMALIZER_REJECT: no words could be extracted from payload");
  }

  // Filter empty words
  rawWords = rawWords.filter(w => w.text.trim().length > 0);

  // Re-index ordinal
  rawWords.forEach((w, i) => { w.ordinal_index = i; });

  // Repair timing: ensure end > start — mark as REPAIRED
  for (const w of rawWords) {
    if (w.end_sec <= w.start_sec) {
      w.end_sec = w.start_sec + 0.1;
      // Only upgrade to repaired if was native (don't downgrade from blocked)
      if (w.timing_source === "native") {
        const meta = deriveTimingMeta("repaired", w.confidence);
        w.timing_source = meta.timing_source;
        w.timing_status = meta.timing_status;
      }
    }
    w.duration_sec = w.end_sec - w.start_sec;
  }

  // Compute gap_after
  for (let i = 0; i < rawWords.length - 1; i++) {
    rawWords[i].gap_after = Math.max(0, rawWords[i + 1].start_sec - rawWords[i].end_sec);
  }
  if (rawWords.length > 0) {
    rawWords[rawWords.length - 1].gap_after = 0;
  }

  // Group into lines
  const lines = groupWordsIntoLines(rawWords);
  const fullText = lines.map(l => l.text).join("\n");

  // Compute timing quality summary
  const timingQuality = computeTimingQuality(rawWords);

  return { words: rawWords, lines, fullText, rawPayload, timingQuality };
}

function extractWords(raw: unknown[], source: TimingSource): NormalizedWord[] {
  const words: NormalizedWord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const w = item as RawWord;
    const text = (w.text ?? w.word ?? "").toString().trim();
    if (!text) continue;

    const start = w.start_sec ?? w.start ?? 0;
    const end = w.end_sec ?? w.end ?? start;
    const confidence = w.confidence ?? 1.0;
    const meta = deriveTimingMeta(source, confidence);

    words.push({
      ordinal_index: words.length,
      text,
      start_sec: start,
      end_sec: end,
      duration_sec: Math.max(0, end - start),
      gap_after: 0,
      confidence,
      ...meta,
    });
  }
  return words;
}

function computeTimingQuality(words: NormalizedWord[]): TimingQualitySummary {
  let verified = 0, draft = 0, blocked = 0;
  for (const w of words) {
    switch (w.timing_status) {
      case "verified": verified++; break;
      case "draft": draft++; break;
      case "blocked": blocked++; break;
    }
  }
  const total = words.length;
  let overallStatus: TimingStatus;
  if (blocked > 0) overallStatus = "blocked";
  else if (draft > 0) overallStatus = "draft";
  else overallStatus = "verified";

  return { verifiedCount: verified, draftCount: draft, blockedCount: blocked, totalCount: total, overallStatus };
}

/**
 * Groups words into lyric lines using silence gaps.
 */
const LINE_GAP_THRESHOLD = 0.8;
const MAX_WORDS_PER_LINE = 12;

function groupWordsIntoLines(words: NormalizedWord[]): NormalizedLine[] {
  if (words.length === 0) return [];

  const lines: NormalizedLine[] = [];
  let currentLineWords: NormalizedWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const prevWord = words[i - 1];
    const shouldSplit =
      prevWord.gap_after >= LINE_GAP_THRESHOLD ||
      currentLineWords.length >= MAX_WORDS_PER_LINE ||
      /[.!?]$/.test(prevWord.text);

    if (shouldSplit) {
      lines.push(buildLine(lines.length, currentLineWords));
      currentLineWords = [words[i]];
    } else {
      currentLineWords.push(words[i]);
    }
  }

  if (currentLineWords.length > 0) {
    lines.push(buildLine(lines.length, currentLineWords));
  }

  return lines;
}

function buildLine(lineIndex: number, words: NormalizedWord[]): NormalizedLine {
  const startSec = words[0].start_sec;
  const endSec = words[words.length - 1].end_sec;
  return {
    line_index: lineIndex,
    text: words.map(w => w.text).join(" "),
    start_sec: startSec,
    end_sec: endSec,
    duration_sec: endSec - startSec,
    words,
  };
}
