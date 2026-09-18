import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Music, Loader2, CheckCircle2, AlertTriangle, Settings2, RotateCcw, Eye, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import WaveformPreview from "@/components/analysis/WaveformPreview";
import AnchorListPanel, { type Anchor } from "@/components/analysis/AnchorListPanel";
import { computeSegmentationPreview } from "@/lib/segmentation-preview";
import { classifyPerformance, PERFORMANCE_LEGEND, getWordText } from "@/lib/performance-classifier";
import type { WaveformPeakData } from "@/lib/waveform-peaks";
import type { AudioSegment } from "@/contexts/ProjectContext";

export interface PhraseSnapSettings {
  window: number;        // ± seconds a boundary may shift
  gapThreshold: number;  // min silence between words to count as phrase end (s)
  minLen: number;        // min segment length (s)
  maxLen: number;        // max segment length (s) — also the WAN render slot target
  snapToleranceSec: number; // magnet snap range for boundary handles (s)
  snapMode: 'words' | 'all'; // which anchors to use for magnetic snap
}

export const DEFAULT_SNAP_SETTINGS: PhraseSnapSettings = {
  window: 2.0,
  gapThreshold: 0.3,
  minLen: 8,
  maxLen: 10,
  snapToleranceSec: 0.18,
  snapMode: 'all',
};

const STORAGE_KEY = "wan.phraseSnapSettings.v1";

function loadSettings(): PhraseSnapSettings {
  if (typeof window === "undefined") return DEFAULT_SNAP_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SNAP_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      window: Number.isFinite(parsed.window) ? parsed.window : DEFAULT_SNAP_SETTINGS.window,
      gapThreshold: Number.isFinite(parsed.gapThreshold) ? parsed.gapThreshold : DEFAULT_SNAP_SETTINGS.gapThreshold,
      minLen: Number.isFinite(parsed.minLen) ? parsed.minLen : DEFAULT_SNAP_SETTINGS.minLen,
      maxLen: Number.isFinite(parsed.maxLen) ? parsed.maxLen : DEFAULT_SNAP_SETTINGS.maxLen,
      snapToleranceSec: Number.isFinite(parsed.snapToleranceSec) ? parsed.snapToleranceSec : DEFAULT_SNAP_SETTINGS.snapToleranceSec,
      snapMode: parsed.snapMode === 'words' ? 'words' : 'all',
    };
  } catch {
    return DEFAULT_SNAP_SETTINGS;
  }
}

interface SegmentationSectionProps {
  segmenting: boolean;
  segmentsReady: boolean;
  segmentProgress: number;
  segmentWarnings: string[];
  audioSegments: AudioSegment[];
  onSegment: (opts?: PhraseSnapSettings) => void;
  /** Optional waveform peak data — enables the live segmentation preview. */
  peakData?: WaveformPeakData | null;
  /** Word-level timestamps from the transcription (used for phrase-snap preview). */
  words?: Array<{ start: number; end: number; text?: string; word?: string; value?: string; token?: string }>;
  /** Track duration in seconds. Falls back to peakData.duration_sec. */
  audioDuration?: number;
}

export default function SegmentationSection({ segmenting, segmentsReady, segmentProgress, segmentWarnings, audioSegments, onSegment, peakData, words, audioDuration }: SegmentationSectionProps) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const [settings, setSettings] = useState<PhraseSnapSettings>(loadSettings);
  const [previewOpen, setPreviewOpen] = useState<boolean>(true);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  // Keep min < max coherent
  const safeSettings: PhraseSnapSettings = {
    ...settings,
    minLen: Math.min(settings.minLen, settings.maxLen),
  };

  const isDefault =
    settings.window === DEFAULT_SNAP_SETTINGS.window &&
    settings.gapThreshold === DEFAULT_SNAP_SETTINGS.gapThreshold &&
    settings.minLen === DEFAULT_SNAP_SETTINGS.minLen &&
    settings.maxLen === DEFAULT_SNAP_SETTINGS.maxLen &&
    settings.snapToleranceSec === DEFAULT_SNAP_SETTINGS.snapToleranceSec &&
    settings.snapMode === DEFAULT_SNAP_SETTINGS.snapMode;

  const effectiveDuration = audioDuration && audioDuration > 0 ? audioDuration : (peakData?.duration_sec ?? 0);
  const preview = useMemo(() => {
    if (!peakData || effectiveDuration <= 0) return null;
    return computeSegmentationPreview(effectiveDuration, words ?? [], peakData, safeSettings);
  }, [peakData, effectiveDuration, words, safeSettings]);

  // Manual boundary edits. `null` ⇒ use auto-computed; any other value overrides.
  // Edits are cleared whenever phrase-snap settings change so the user sees a
  // fresh proposal before re-editing.
  const [editedBoundaries, setEditedBoundaries] = useState<number[] | null>(null);
  const [editedSet, setEditedSet] = useState<Set<number>>(new Set());
  useEffect(() => { setEditedBoundaries(null); setEditedSet(new Set()); },
    [safeSettings.window, safeSettings.gapThreshold, safeSettings.minLen, safeSettings.maxLen]);

  const effectiveBoundaries = editedBoundaries ?? preview?.boundaries ?? [];

  // Magnet snap targets: word start/end, optionally + silence-gap edges.
  // Dragged boundaries magnetize to the nearest target; hold Alt to bypass.
  // We build a labeled `anchors` list (with type + word text) for the side panel,
  // then derive the numeric `snapTargets` set used by the waveform drag math.
  const anchors = useMemo<Anchor[]>(() => {
    const out: Anchor[] = [];
    if (words && words.length) {
      for (const w of words) {
        const label = getWordText(w) || undefined;
        if (Number.isFinite(w.start)) out.push({ sec: w.start, type: "word-start", label });
        if (Number.isFinite(w.end))   out.push({ sec: w.end,   type: "word-end",   label });
      }
    }
    if (safeSettings.snapMode === 'all' && peakData?.silence_gaps) {
      for (const g of peakData.silence_gaps) {
        out.push({ sec: g.start_sec, type: "silence-start" });
        out.push({ sec: (g.start_sec + g.end_sec) / 2, type: "silence-mid" });
        out.push({ sec: g.end_sec,   type: "silence-end" });
      }
    }
    out.sort((a, b) => a.sec - b.sec);
    return out;
  }, [words, peakData, safeSettings.snapMode]);

  const snapTargets = useMemo(() => {
    // De-duplicate within 25ms to keep the target set lean for nearest-neighbor search.
    const out: number[] = [];
    for (const a of anchors) {
      if (!out.length || a.sec - out[out.length - 1] > 0.025) out.push(a.sec);
    }
    return out;
  }, [anchors]);

  const wordAnchorCount = useMemo(
    () => anchors.filter(a => a.type === "word-start" || a.type === "word-end").length,
    [anchors]
  );
  const silenceAnchorCount = useMemo(
    () => anchors.filter(a => a.type.startsWith("silence-")).length,
    [anchors]
  );

  // Anchor the user clicked in the side panel — drives a cursor line on the waveform.
  const [focusedAnchorSec, setFocusedAnchorSec] = useState<number | null>(null);

  const effectiveSegments = useMemo(() => {
    if (!preview) return [];
    if (!editedBoundaries) return preview.segments;
    const stops = [0, ...editedBoundaries, effectiveDuration];
    return stops.slice(0, -1).map((start, i) => ({
      index: i, start_sec: start, end_sec: stops[i + 1], duration_sec: stops[i + 1] - start,
    }));
  }, [preview, editedBoundaries, effectiveDuration]);

  // Performance tags (singing / rapping / expressive) per proposed segment.
  // We assign each transcribed word to whichever segment contains its midpoint,
  // then run the same classifier the storyline generator uses server-side.
  const previewSegmentTags = useMemo(() => {
    if (!effectiveSegments.length) return [];
    const bucketWords: string[][] = effectiveSegments.map(() => []);
    for (const w of words ?? []) {
      const mid = (w.start + w.end) / 2;
      const text = getWordText(w);
      // linear scan is fine — segment counts are tiny (<60).
      for (let i = 0; i < effectiveSegments.length; i++) {
        const s = effectiveSegments[i];
        if (mid >= s.start_sec && mid < s.end_sec) {
          if (text) bucketWords[i].push(text);
          break;
        }
      }
    }
    return effectiveSegments.map((s, i) =>
      classifyPerformance(bucketWords[i].join(" "), s.duration_sec)
    );
  }, [effectiveSegments, words]);

  const readyTags = useMemo(
    () => audioSegments.map(seg => classifyPerformance(
      seg.lyrics && seg.lyrics !== "(Instrumental)" ? seg.lyrics : "",
      seg.duration_sec
    )),
    [audioSegments]
  );

  const tagCounts = useMemo(() => {
    const src = segmentsReady ? readyTags : previewSegmentTags;
    return {
      singing: src.filter(t => t.mode === "singing").length,
      rapping: src.filter(t => t.mode === "rapping").length,
      expressive: src.filter(t => t.mode === "expressive").length,
    };
  }, [previewSegmentTags, readyTags, segmentsReady]);

  // Selected segment index (driven by clicking a colored performance bar).
  // Resets when segments change so we don't highlight a stale row.
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  useEffect(() => { setSelectedSegmentIndex(null); }, [segmentsReady, audioSegments.length, effectiveSegments.length]);

  // Pick the active segment list — prefer audioSegments in ready state, but
  // fall back to effectiveSegments if the ready list is momentarily empty so
  // prev/next never silently no-op on a stale render.
  const activeSegmentList = (segmentsReady && audioSegments.length > 0)
    ? audioSegments
    : effectiveSegments;

  const handleSelectSegment = (idx: number, startSec: number) => {
    setSelectedSegmentIndex(idx);
    // Force a state change even when the new start matches the previous
    // anchor exactly (otherwise the waveform marker won't re-render).
    setFocusedAnchorSec((prev) => (prev === startSec ? startSec + 1e-6 : startSec));
  };

  const clearSelectedSegment = () => setSelectedSegmentIndex(null);

  const stepSegment = (delta: -1 | 1) => {
    if (selectedSegmentIndex == null) return;
    const total = activeSegmentList.length;
    if (total === 0) return;
    const nextIdx = (selectedSegmentIndex + delta + total) % total; // wrap
    const seg = activeSegmentList[nextIdx];
    if (seg) handleSelectSegment(nextIdx, seg.start_sec);
  };

  const handlePrevSegment = () => stepSegment(-1);
  const handleNextSegment = () => stepSegment(1);

  // Lyrics for the currently-selected preview segment (computed from word timestamps).
  const selectedPreviewLyrics = useMemo(() => {
    if (selectedSegmentIndex == null || !effectiveSegments.length) return null;
    const seg = effectiveSegments[selectedSegmentIndex];
    if (!seg) return null;
    const segWords = (words ?? []).filter(w => {
      const mid = (w.start + w.end) / 2;
      return mid >= seg.start_sec && mid < seg.end_sec;
    });
    return segWords.map(w => getWordText(w)).filter(Boolean).join(" ") || null;
  }, [selectedSegmentIndex, effectiveSegments, words]);




  const handleBoundaryChange = (idx: number, rawNewSec: number) => {
    if (!preview) return;
    const current = editedBoundaries ?? preview.boundaries.slice();
    const MIN_GAP = 0.5;
    const leftLimit = (idx === 0 ? 0 : current[idx - 1]) + MIN_GAP;
    const rightLimit = (idx === current.length - 1 ? effectiveDuration : current[idx + 1]) - MIN_GAP;
    const clamped = Math.min(Math.max(rawNewSec, leftLimit), rightLimit);
    const next = current.slice();
    next[idx] = clamped;
    setEditedBoundaries(next);
    setEditedSet(prev => { const s = new Set(prev); s.add(idx); return s; });
  };

  const resetEdits = () => { setEditedBoundaries(null); setEditedSet(new Set()); };
  const hasEdits = editedBoundaries != null && editedSet.size > 0;

  const handleCommit = () => {
    if (hasEdits && editedBoundaries) {
      onSegment({ ...safeSettings, customBoundaries: editedBoundaries } as PhraseSnapSettings & { customBoundaries: number[] });
    } else {
      onSegment(safeSettings);
    }
  };





  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" /> Audio Segmentation
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Split your track into {safeSettings.minLen}–{safeSettings.maxLen}s phrase-aligned segments for WAN video generation
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Segmentation settings" disabled={segmenting}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Phrase-snap settings</h4>
                <Button variant="ghost" size="sm" className="gap-1.5 h-7 px-2 text-xs" onClick={() => setSettings(DEFAULT_SNAP_SETTINGS)} disabled={isDefault}>
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Max segment length</Label>
                  <span className="text-xs font-mono text-muted-foreground">{safeSettings.maxLen.toFixed(1)}s</span>
                </div>
                <Slider min={5} max={10} step={0.5} value={[safeSettings.maxLen]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, maxLen: v, minLen: Math.min(s.minLen, v) }))} />
                <p className="text-[10px] text-muted-foreground">WAN 2.5 renders ≥8s segments in its 10s slot. Lower = more, shorter clips.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Min segment length</Label>
                  <span className="text-xs font-mono text-muted-foreground">{safeSettings.minLen.toFixed(1)}s</span>
                </div>
                <Slider min={3} max={safeSettings.maxLen} step={0.5} value={[safeSettings.minLen]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, minLen: Math.min(v, s.maxLen) }))} />
                <p className="text-[10px] text-muted-foreground">Hard floor — snap will refuse to shorten a segment below this.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Snap window (±)</Label>
                  <span className="text-xs font-mono text-muted-foreground">{safeSettings.window.toFixed(1)}s</span>
                </div>
                <Slider min={0} max={4} step={0.25} value={[safeSettings.window]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, window: v }))} />
                <p className="text-[10px] text-muted-foreground">How far a boundary may move to reach a phrase end. 0 disables snap.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Silence threshold</Label>
                  <span className="text-xs font-mono text-muted-foreground">{safeSettings.gapThreshold.toFixed(2)}s</span>
                </div>
                <Slider min={0.1} max={1.0} step={0.05} value={[safeSettings.gapThreshold]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, gapThreshold: v }))} />
                <p className="text-[10px] text-muted-foreground">Min gap between words that counts as a phrase end. Higher = fewer, stronger anchors.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Magnet range</Label>
                  <span className="text-xs font-mono text-muted-foreground">{safeSettings.snapToleranceSec.toFixed(2)}s</span>
                </div>
                <Slider min={0.02} max={0.5} step={0.01} value={[safeSettings.snapToleranceSec]}
                  onValueChange={([v]) => setSettings(s => ({ ...s, snapToleranceSec: v }))} />
                <p className="text-[10px] text-muted-foreground">How close a dragged boundary must be to an anchor to snap. Hold Alt to bypass.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Snap anchors</Label>
                  <span className="text-xs font-mono text-muted-foreground">{safeSettings.snapMode === 'words' ? 'Words only' : 'Words + silence'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={safeSettings.snapMode === 'words' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={() => setSettings(s => ({ ...s, snapMode: 'words' }))}
                  >
                    Words only
                  </Button>
                  <Button
                    variant={safeSettings.snapMode === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={() => setSettings(s => ({ ...s, snapMode: 'all' }))}
                  >
                    Words + silence
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Which anchors dragged boundaries magnetize to. Words-only is stricter; adding silence gaps gives more cut points.</p>
              </div>
            </PopoverContent>
          </Popover>

          <Button onClick={handleCommit} disabled={segmenting || segmentsReady} className="gap-2" variant={segmentsReady ? "outline" : "default"}>
            {segmenting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Segmenting...</>) :
             segmentsReady ? (<><CheckCircle2 className="h-4 w-4 text-success" /> {audioSegments.length} Segments Ready</>) :
             (<><Music className="h-4 w-4" /> Segment into {safeSettings.maxLen}s Clips</>)}
          </Button>
        </div>
      </div>

      {segmenting && (
        <div className="space-y-2">
          <ProcessProgressBar progress={segmentProgress} active={segmenting}
            label={segmentProgress < 30 ? "Analyzing audio duration..." : segmentProgress < 50 ? "Calculating segment boundaries..." : segmentProgress < 90 ? "Assigning lyrics to segments..." : "Finalizing..."}
            barHeight="h-2" />
        </div>
      )}

      {segmentWarnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {segmentWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
            </div>
          ))}
        </div>
      )}

      {/* Live segmentation preview — runs locally, no AI calls */}
      {preview && !segmentsReady && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-foreground">Proposed boundaries</h4>
              <span className="text-[10px] text-muted-foreground">
                {effectiveSegments.length} clips · avg {(effectiveDuration / Math.max(effectiveSegments.length, 1)).toFixed(1)}s · {preview.phraseShifted} phrase-snapped · {preview.peakShifted} peak-refined{hasEdits ? ` · ${editedSet.size} manual edit${editedSet.size === 1 ? "" : "s"}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {hasEdits && (
                <Button variant="ghost" size="sm" className="gap-1.5 h-7 px-2 text-xs" onClick={resetEdits}>
                  <RotateCcw className="h-3 w-3" /> Reset edits
                </Button>
              )}
              <Button variant="ghost" size="sm" className="gap-1.5 h-7 px-2 text-xs" onClick={() => setPreviewOpen(o => !o)}>
                {previewOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {previewOpen ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          {previewOpen && (
            <>
              <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                <WaveformPreview
                  peakData={peakData!}
                  boundaries={effectiveBoundaries}
                  onBoundaryChange={handleBoundaryChange}
                  editedIndices={editedSet}
                  snapTargets={snapTargets}
                  snapToleranceSec={safeSettings.snapToleranceSec}
                  wordAnchorCount={wordAnchorCount}
                  silenceAnchorCount={safeSettings.snapMode === 'all' ? silenceAnchorCount : 0}
                  focusedAnchorSec={focusedAnchorSec}
                  height={110}
                  segmentMarkers={effectiveSegments.map((s, i) => ({
                    index: i,
                    start_sec: s.start_sec,
                    end_sec: s.end_sec,
                    label: String(s.index + 1),
                    colorClass: previewSegmentTags[i]?.bgClass ?? "bg-primary",
                    tag: previewSegmentTags[i]?.label ?? undefined,
                  }))}
                  selectedSegmentIndex={selectedSegmentIndex}
                  onSegmentMarkerClick={handleSelectSegment}
                />

                <AnchorListPanel
                  anchors={anchors}
                  focusedSec={focusedAnchorSec}
                  onJump={setFocusedAnchorSec}
                  maxHeight={260}
                />
              </div>
              <PerformanceTimelineStrip
                segments={effectiveSegments}
                tags={previewSegmentTags}
                duration={effectiveDuration}
                counts={tagCounts}
                selectedIndex={selectedSegmentIndex}
                onSelect={handleSelectSegment}
              />
              {selectedSegmentIndex != null && effectiveSegments[selectedSegmentIndex] && previewSegmentTags[selectedSegmentIndex] && (
                <SegmentDetailsPanel
                  segment={effectiveSegments[selectedSegmentIndex]}
                  tag={previewSegmentTags[selectedSegmentIndex]}
                  lyrics={selectedPreviewLyrics}
                  onClose={clearSelectedSegment}
                  onPrev={handlePrevSegment}
                  onNext={handleNextSegment}
                  hasPrev={effectiveSegments.length > 1}
                  hasNext={effectiveSegments.length > 1}
                  total={effectiveSegments.length}
                />
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                {effectiveSegments.map((s, i) => {
                  const wanFits = s.duration_sec >= 8;
                  const tag = previewSegmentTags[i];
                  const isSelected = selectedSegmentIndex === i;
                  return (
                    <button
                      type="button"
                      key={s.index}
                      onClick={() => handleSelectSegment(i, s.start_sec)}
                      className={`text-left rounded-md border bg-secondary/20 px-2 py-1 text-[10px] transition-colors hover:bg-secondary/40 focus:outline-none ${tag?.borderClass ?? "border-border"} ${isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">#{s.index + 1}</span>
                        <span className={`font-mono ${wanFits ? "text-success" : "text-warning"}`}>{s.duration_sec.toFixed(1)}s</span>
                      </div>
                      <div className="text-muted-foreground">{fmt(s.start_sec)}–{fmt(s.end_sec)}</div>
                      {tag && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${tag.bgClass}`} />
                          <span className={`text-[9px] uppercase tracking-wide ${tag.textClass}`}>{tag.label}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>


              <p className="text-[10px] text-muted-foreground">
                Drag handles to fine-tune — boundaries magnetize to {safeSettings.snapMode === 'words' ? 'word' : 'word/silence'} anchors (hold Alt for free placement). Shift+Arrow nudges 1s. Green = clip fills WAN's 10s slot.
              </p>
            </>
          )}
        </div>
      )}



      {segmentsReady && audioSegments.length > 0 && (
        <div className="mt-4 space-y-3">
          <PerformanceTimelineStrip
            segments={audioSegments.map(s => ({ index: s.index, start_sec: s.start_sec, end_sec: s.end_sec, duration_sec: s.duration_sec }))}
            tags={readyTags}
            duration={audioSegments[audioSegments.length - 1]?.end_sec ?? effectiveDuration}
            counts={tagCounts}
            selectedIndex={selectedSegmentIndex}
            onSelect={handleSelectSegment}
          />
          {selectedSegmentIndex != null && audioSegments[selectedSegmentIndex] && readyTags[selectedSegmentIndex] && (
            <SegmentDetailsPanel
              segment={audioSegments.map(s => ({ index: s.index, start_sec: s.start_sec, end_sec: s.end_sec, duration_sec: s.duration_sec }))[selectedSegmentIndex]}
              tag={readyTags[selectedSegmentIndex]}
              lyrics={audioSegments[selectedSegmentIndex].lyrics}
              onClose={clearSelectedSegment}
              onPrev={handlePrevSegment}
              onNext={handleNextSegment}
              hasPrev={audioSegments.length > 1}
              hasNext={audioSegments.length > 1}
              total={audioSegments.length}
            />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {audioSegments.map((seg, i) => {
              const tag = readyTags[i];
              const isSelected = selectedSegmentIndex === i;
              return (
                <button
                  type="button"
                  key={seg.index}
                  onClick={() => handleSelectSegment(i, seg.start_sec)}
                  className={`text-left rounded-lg border bg-secondary/30 p-2.5 text-xs space-y-1 transition-colors hover:bg-secondary/50 focus:outline-none ${tag?.borderClass ?? "border-border"} ${isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Clip {seg.index + 1}</span>
                    <span className="text-muted-foreground">{fmt(seg.start_sec)} - {fmt(seg.end_sec)}</span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 min-h-[2rem]">{seg.lyrics || "(Instrumental)"}</p>
                  <div className="flex items-center justify-between text-[10px]">
                    {tag ? (
                      <span className={`inline-flex items-center gap-1 ${tag.textClass}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${tag.bgClass}`} />
                        <span className="uppercase tracking-wide">{tag.label}</span>
                      </span>
                    ) : <span />}
                    <span className="text-muted-foreground">{seg.duration_sec.toFixed(1)}s · {seg.lyrics && seg.lyrics !== "(Instrumental)" ? `${seg.lyrics.split(/\s+/).filter(Boolean).length}w` : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}

interface PerformanceTimelineStripProps {
  segments: Array<{ index: number; start_sec: number; end_sec: number; duration_sec: number }>;
  tags: ReturnType<typeof classifyPerformance>[];
  duration: number;
  counts: { singing: number; rapping: number; expressive: number };
  selectedIndex?: number | null;
  onSelect?: (idx: number, startSec: number) => void;
}

function PerformanceTimelineStrip({ segments, tags, duration, counts, selectedIndex = null, onSelect }: PerformanceTimelineStripProps) {
  const selectedBarRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selectedIndex == null) return;
    selectedBarRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selectedIndex]);
  if (!segments.length || duration <= 0) return null;
  const interactive = typeof onSelect === "function";
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Performance tags</span>
        <div className="flex items-center gap-3 text-[10px]">
          {PERFORMANCE_LEGEND.map((l) => (
            <span key={l.mode} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-sm ${l.bgClass}`} />
              <span className={l.textClass}>{l.label}</span>
              <span className="text-muted-foreground tabular-nums">{counts[l.mode]}</span>
            </span>
          ))}
        </div>
      </div>
      <div
        className="relative h-5 w-full rounded-sm overflow-hidden bg-secondary/40 border border-border"
        role={interactive ? "toolbar" : "img"}
        aria-label="Performance tag timeline"
      >
        {segments.map((s, i) => {
          const tag = tags[i];
          if (!tag) return null;
          const leftPct = (s.start_sec / duration) * 100;
          const widthPct = Math.max(0, ((s.end_sec - s.start_sec) / duration) * 100);
          const isSelected = selectedIndex === i;
          const baseCls = `absolute top-0 bottom-0 border-r border-background/60 transition-opacity ${tag.bgClass} ${
            isSelected ? "ring-2 ring-inset ring-foreground/70 opacity-100" : (selectedIndex == null ? "opacity-100" : "opacity-60 hover:opacity-100")
          }`;
          const tooltip = (
            <div
              className={`space-y-0.5 text-xs ${interactive ? "cursor-pointer" : ""}`}
              onClick={interactive ? () => onSelect!(i, s.start_sec) : undefined}
            >
              <div className="font-semibold">Clip {s.index + 1} · {tag.label}</div>
              <div className="text-muted-foreground">{fmtTime(s.start_sec)} – {fmtTime(s.end_sec)} ({s.duration_sec.toFixed(1)}s)</div>
              <div className="text-muted-foreground">{tag.wordCount} words · {tag.wps.toFixed(2)} wps</div>
              {interactive && <div className="text-[10px] text-muted-foreground italic">Click to select & open details</div>}
            </div>
          );
          if (interactive) {
            return (
              <Tooltip key={s.index} delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    ref={isSelected ? selectedBarRef : undefined}
                    type="button"
                    onClick={() => onSelect!(i, s.start_sec)}
                    aria-label={`Jump to clip ${s.index + 1} (${tag.label})`}
                    aria-pressed={isSelected}
                    className={`${baseCls} cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/70`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="bg-popover border border-border shadow-lg px-3 py-2">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Tooltip key={s.index} delayDuration={150}>
              <TooltipTrigger asChild>
                <div
                  className={baseCls}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="bg-popover border border-border shadow-lg px-3 py-2">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

interface SegmentDetailsPanelProps {
  segment: { index: number; start_sec: number; end_sec: number; duration_sec: number };
  tag: ReturnType<typeof classifyPerformance>;
  lyrics?: string | null;
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  total?: number;
}

function SegmentDetailsPanel({ segment, tag, lyrics, onClose, onPrev, onNext, hasPrev = true, hasNext = true, total }: SegmentDetailsPanelProps) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className={`rounded-lg border bg-secondary/30 p-3 space-y-2 text-xs ${tag.borderClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${tag.bgClass}`} />
          <span className="font-semibold">Clip {segment.index + 1}{total ? ` / ${total}` : ""}</span>
          <span className={`uppercase tracking-wide ${tag.textClass}`}>{tag.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              aria-label="Previous segment"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              aria-label="Next segment"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close details"
            >
              <span className="text-xs leading-none">✕</span>
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Start</div>
          <div className="font-mono">{fmt(segment.start_sec)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">End</div>
          <div className="font-mono">{fmt(segment.end_sec)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration</div>
          <div className="font-mono">{segment.duration_sec.toFixed(2)}s</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Density</div>
          <div className="font-mono">{tag.wordCount}w · {tag.wps.toFixed(2)} wps</div>
        </div>
      </div>
      {lyrics && lyrics !== "(Instrumental)" && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Lyrics</div>
          <p className="text-muted-foreground line-clamp-3">{lyrics}</p>
        </div>
      )}
    </div>
  );
}
