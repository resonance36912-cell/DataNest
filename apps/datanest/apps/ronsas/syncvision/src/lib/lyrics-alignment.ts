/**
 * Lyrics alignment utilities.
 *
 * Implements the VERIFIED_LYRICS_LOCK validation layer: positive comparison
 * between a trusted reference transcript (user-pasted / OCR / verified) and
 * the candidate ASR text. The output drives the transcript_quality_status
 * badge and the downstream-generation gate.
 */

const STOP = new Set([
  "a","an","the","is","it","i","to","of","in","on","at","and","or","but","my","me",
  "you","we","he","she","that","this","be","am","are","was","were","im","ive","its",
]);

/** Lowercase content-word tokens (drops punctuation + stop words). */
export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .split(/[\s,.\-!?()"'`]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Token Jaccard similarity over content words. 0..1. */
export function jaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Hallucination lexicon — words the ASR loves to invent over music vocals. */
const RISK_LEXICON = [
  // weapons / violence
  "gun","glock","nina","machete","knife","blade","stab","shoot","shooting","kill","murder","body","bodies",
  // profanity
  "fuck","fuckin","fucking","shit","bitch","cunt","whore","slut",
  // slurs
  "nigga","nigger",
  // drugs
  "dope","crack","heroin","meth","cocaine","molly","percs","xan","xans","lean",
];

/** Specific bad-phrase hits — explicit per user's acceptance test. */
const FORBIDDEN_PHRASES = [
  "nina on my hip",
  "i get a body about it",
  "don't take my joy",
  "dont take my joy",
  "i prepared for this",
  "i said it i said it",
  "fuckin machete",
  "fucking machete",
];

export interface AlignmentMetrics {
  /** Mean per-line similarity between ASR lines and best-matching reference lines (0..1). */
  line_similarity: number;
  /** Fraction of reference content tokens present in the ASR text (0..1). */
  coverage_ratio: number;
  /** Risk-lexicon terms present in ASR but absent from reference. */
  hallucinated_terms: string[];
  /** Reference lines that have no acceptable match in the ASR text. */
  missing_reference_lines: string[];
  /** Hard-coded acceptance-test forbidden phrases that appear in ASR. */
  forbidden_phrase_hits: string[];
  /** Bucketed badge: good (≥0.88), needs_review (0.72..0.87), failed (<0.72) or downgraded. */
  status: "good" | "needs_review" | "failed";
  /** 0–100 surfaced as a confidence percentage. */
  confidence_pct: number;
  /** Why the status was downgraded, if any. */
  downgrade_reasons: string[];
}

const splitLines = (s: string) =>
  (s || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Compare an ASR candidate against a verified reference and produce a
 * positive-validation metric set + a status badge.
 */
export function computeAlignment(
  asrText: string,
  referenceText: string,
): AlignmentMetrics {
  const asrLines = splitLines(asrText);
  const refLines = splitLines(referenceText);
  const asrTokens = new Set(tokenize(asrText));
  const refTokens = tokenize(referenceText);

  // Coverage: fraction of reference tokens that appear somewhere in ASR.
  let covered = 0;
  for (const t of new Set(refTokens)) if (asrTokens.has(t)) covered++;
  const refUnique = new Set(refTokens).size;
  const coverage_ratio = refUnique === 0 ? 1 : covered / refUnique;

  // Per-line similarity: for each reference line, find the best ASR line and
  // average. Reference lines with no match (<0.4) are "missing".
  const missing_reference_lines: string[] = [];
  let simSum = 0;
  for (const r of refLines) {
    let best = 0;
    for (const a of asrLines) {
      const s = jaccard(r, a);
      if (s > best) best = s;
    }
    simSum += best;
    if (best < 0.4) missing_reference_lines.push(r);
  }
  const line_similarity = refLines.length === 0 ? 0 : simSum / refLines.length;

  // Hallucination: risk terms present in ASR but NOT in reference.
  const hallucinated_terms: string[] = [];
  const refSet = new Set(refTokens);
  for (const term of RISK_LEXICON) {
    if (asrTokens.has(term) && !refSet.has(term)) hallucinated_terms.push(term);
  }

  // Forbidden-phrase hits — exact substrings, case-insensitive.
  const asrLower = asrText.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const forbidden_phrase_hits = FORBIDDEN_PHRASES.filter((p) => asrLower.includes(p));

  // Bucket.
  let status: AlignmentMetrics["status"];
  if (line_similarity >= 0.88) status = "good";
  else if (line_similarity >= 0.72) status = "needs_review";
  else status = "failed";

  const downgrade_reasons: string[] = [];
  if (hallucinated_terms.length > 0) {
    downgrade_reasons.push(`hallucinated risk terms: ${hallucinated_terms.join(", ")}`);
    if (status === "good") status = "needs_review";
  }
  if (forbidden_phrase_hits.length > 0) {
    downgrade_reasons.push(`forbidden phrases: ${forbidden_phrase_hits.join("; ")}`);
    status = "failed";
  }
  if (missing_reference_lines.length > Math.max(2, refLines.length * 0.25)) {
    downgrade_reasons.push(`${missing_reference_lines.length} reference lines missing from ASR`);
    if (status === "good") status = "needs_review";
  }

  const confidence_pct = Math.round(line_similarity * 100);

  return {
    line_similarity: +line_similarity.toFixed(3),
    coverage_ratio: +coverage_ratio.toFixed(3),
    hallucinated_terms,
    missing_reference_lines,
    forbidden_phrase_hits,
    status,
    confidence_pct,
    downgrade_reasons,
  };
}

/** Word-timing input for line alignment. */
export interface TimedWord { text: string; start: number; end: number }

/** A locked lyric line with timing borrowed from the closest ASR words. */
export interface AlignedLine {
  line_index: number;
  text: string;
  start_sec: number;
  end_sec: number;
}

/**
 * Distribute locked reference lines across the available ASR word timeline,
 * proportional to each line's token weight. ASR provides the timing layer;
 * the locked reference owns the words.
 */
export function alignReferenceLinesToTimings(
  referenceText: string,
  words: TimedWord[],
  totalDurationSec?: number,
): AlignedLine[] {
  const lines = splitLines(referenceText);
  if (lines.length === 0) return [];

  const wordWeights = lines.map((l) => Math.max(1, tokenize(l).length || l.split(/\s+/).length));
  const totalWeight = wordWeights.reduce((a, b) => a + b, 0);

  // Determine the timeline window.
  let t0 = 0;
  let tEnd = totalDurationSec ?? 0;
  if (words && words.length > 0) {
    t0 = Math.max(0, Math.min(...words.map((w) => w.start)) || 0);
    const lastEnd = Math.max(...words.map((w) => w.end || w.start));
    tEnd = Math.max(tEnd, lastEnd);
  }
  if (!(tEnd > t0)) tEnd = t0 + Math.max(lines.length, 1) * 3; // safety

  const totalSpan = tEnd - t0;
  const out: AlignedLine[] = [];
  let cursor = t0;
  for (let i = 0; i < lines.length; i++) {
    const share = wordWeights[i] / totalWeight;
    const dur = totalSpan * share;
    const start = cursor;
    const end = i === lines.length - 1 ? tEnd : cursor + dur;
    out.push({
      line_index: i,
      text: lines[i],
      start_sec: +start.toFixed(3),
      end_sec: +end.toFixed(3),
    });
    cursor = end;
  }
  return out;
}

/** True when the project is cleared for downstream generation. */
export function canGenerateDownstream(
  lock_status: string | null | undefined,
  quality_status: string | null | undefined,
): boolean {
  return lock_status === "verified" || lock_status === "locked" || quality_status === "good";
}
