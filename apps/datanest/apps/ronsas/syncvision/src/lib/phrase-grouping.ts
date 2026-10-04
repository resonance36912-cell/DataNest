/**
 * Groups transcribed words into phrases based on gap threshold.
 * Used for phrase-level audio segmentation.
 */

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export interface Phrase {
  index: number;
  words: TimedWord[];
  text: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface PhraseGap {
  afterPhraseIndex: number;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface PhraseTimeline {
  phrases: Phrase[];
  gaps: PhraseGap[];
  /** Total scene duration from sceneStart to sceneEnd */
  totalDurationSec: number;
  /** Leading silence before first phrase */
  leadingSilenceSec: number;
  /** Trailing silence after last phrase */
  trailingSilenceSec: number;
}

/**
 * Group consecutive words into phrases.
 * Words separated by less than `gapThreshold` seconds are merged into one phrase.
 */
export function groupWordsIntoPhrases(
  words: TimedWord[],
  gapThreshold = 0.3
): Phrase[] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.start - b.start);
  const phrases: Phrase[] = [];
  let currentWords: TimedWord[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start - sorted[i - 1].end;
    if (gap <= gapThreshold) {
      currentWords.push(sorted[i]);
    } else {
      // Finalize current phrase
      phrases.push(buildPhrase(phrases.length, currentWords));
      currentWords = [sorted[i]];
    }
  }

  // Don't forget the last phrase
  if (currentWords.length > 0) {
    phrases.push(buildPhrase(phrases.length, currentWords));
  }

  return phrases;
}

function buildPhrase(index: number, words: TimedWord[]): Phrase {
  const startSec = words[0].start;
  const endSec = words[words.length - 1].end;
  return {
    index,
    words,
    text: words.map(w => w.text).join(" "),
    startSec,
    endSec,
    durationSec: endSec - startSec,
  };
}

/**
 * Build a complete timeline for a scene, including phrases and gaps.
 * Only includes words that fall within [sceneStart, sceneEnd).
 */
export function buildPhraseTimeline(
  allWords: TimedWord[],
  sceneStart: number,
  sceneEnd: number,
  gapThreshold = 0.3
): PhraseTimeline {
  // Filter words within scene boundaries
  const sceneWords = allWords
    .filter(w => w.end > sceneStart && w.start < sceneEnd)
    .sort((a, b) => a.start - b.start);

  const phrases = groupWordsIntoPhrases(sceneWords, gapThreshold);
  const gaps: PhraseGap[] = [];
  const totalDurationSec = sceneEnd - sceneStart;

  // Compute gaps between phrases
  for (let i = 0; i < phrases.length - 1; i++) {
    const gapStart = phrases[i].endSec;
    const gapEnd = phrases[i + 1].startSec;
    if (gapEnd - gapStart > 0.01) {
      gaps.push({
        afterPhraseIndex: i,
        startSec: gapStart,
        endSec: gapEnd,
        durationSec: gapEnd - gapStart,
      });
    }
  }

  const leadingSilenceSec = phrases.length > 0 ? Math.max(0, phrases[0].startSec - sceneStart) : totalDurationSec;
  const trailingSilenceSec = phrases.length > 0 ? Math.max(0, sceneEnd - phrases[phrases.length - 1].endSec) : 0;

  return {
    phrases,
    gaps,
    totalDurationSec,
    leadingSilenceSec,
    trailingSilenceSec,
  };
}

/**
 * Add padding around a phrase's audio segment for more natural vocal sync.
 * Adds a small buffer before/after for context.
 */
export function getPhraseAudioWindow(phrase: Phrase, padding = 0.1): { startSec: number; endSec: number } {
  return {
    startSec: Math.max(0, phrase.startSec - padding),
    endSec: phrase.endSec + padding,
  };
}
