import type { AudioSegment } from "@/contexts/ProjectContext";

export interface TimedLyricLine {
  text: string;
  start_sec: number | null;
  end_sec: number | null;
}

/**
 * Rebuild the requested number of audio segments from persisted lyric lines.
 *
 * Proportional boundaries are important here. A fixed `ceil(lines / segments)`
 * chunk size can run out of lines early (for example, 59 lines grouped into 22
 * segments produces only 20 chunks), which makes healthy scenes look missing
 * after a page refresh.
 */
export function groupLyricLinesIntoSegments(
  lines: TimedLyricLine[],
  requestedCount: number,
): AudioSegment[] {
  if (lines.length === 0 || !Number.isFinite(requestedCount) || requestedCount < 1) return [];

  const segmentCount = Math.min(lines.length, Math.floor(requestedCount));

  return Array.from({ length: segmentCount }, (_, index) => {
    const startLine = Math.floor((index * lines.length) / segmentCount);
    const endLine = Math.floor(((index + 1) * lines.length) / segmentCount);
    const segmentLines = lines.slice(startLine, Math.max(startLine + 1, endLine));
    const startSec = segmentLines[0]?.start_sec ?? 0;
    const endSec = segmentLines.at(-1)?.end_sec ?? startSec;

    return {
      index,
      start_sec: startSec,
      end_sec: endSec,
      duration_sec: Math.max(0, endSec - startSec),
      lyrics: segmentLines.map((line) => line.text).join("\n"),
    };
  });
}
