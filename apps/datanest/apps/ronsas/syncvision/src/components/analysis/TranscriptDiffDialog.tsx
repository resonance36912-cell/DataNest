import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import { Loader2, ArrowLeftRight, Clock, Play, Pause, Volume2, VolumeX, AlertTriangle, Download, FileJson, FileSpreadsheet, Repeat, Gauge, Copy, Check, Captions, FileArchive, Eye, EyeOff, TableProperties, Filter, Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadPresets, savePresets, loadLastUsedPresetId, saveLastUsedPresetId, makePresetId, presetMatches, type ExportFilterPreset } from "@/lib/transcript-export-presets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { diffWords, summarizeDiff, type DiffSegment } from "@/lib/text-diff";
import { toast } from "sonner";
import DiffWaveform from "./DiffWaveform";

interface TranscriptDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leftId: string | null;
  rightId: string | null;
  leftLabel?: string;
  rightLabel?: string;
  audioUrl?: string | null;
}

type Line = {
  id: string;
  line_index: number;
  text: string;
  start_sec: number | null;
  end_sec: number | null;
  duration_sec: number | null;
  confidence: number | null;
};

type Loaded = {
  id: string;
  version_number: number;
  text: string;
  updated_at: string;
  notes: string | null;
  project_id: string;
  project_name: string;
  lines: Line[];
};

function fmt(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2) + "s";
}

function delta(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  const d = b - a;
  if (Math.abs(d) < 0.005) return 0;
  return d;
}

const SEVERITY_THRESHOLDS = [
  { label: "negligible", maxAbs: 0.05, color: "bg-muted" },
  { label: "minor", maxAbs: 0.2, color: "bg-primary" },
  { label: "moderate", maxAbs: 0.5, color: "bg-warning" },
  { label: "major", maxAbs: Infinity, color: "bg-destructive" },
] as const;

type SeverityTier = (typeof SEVERITY_THRESHOLDS)[number]["label"];

function severityOf(d: number | null): { label: SeverityTier; abs: number } | null {
  if (d == null || d === 0) return null;
  const abs = Math.abs(d);
  const tier = SEVERITY_THRESHOLDS.find((t) => abs < t.maxAbs) ?? SEVERITY_THRESHOLDS[SEVERITY_THRESHOLDS.length - 1];
  return { label: tier.label, abs };
}

function severityBar(d: number | null) {
  const sev = severityOf(d);
  if (!sev) return { width: 0, color: "", label: "" };
  const pct = Math.min(100, Math.round((sev.abs / 0.6) * 100));
  const color = SEVERITY_THRESHOLDS.find((t) => t.label === sev.label)?.color ?? "";
  return { width: pct, color, label: sev.label };
}

export default function TranscriptDiffDialog({
  open,
  onOpenChange,
  leftId,
  rightId,
  leftLabel,
  rightLabel,
  audioUrl: audioUrlProp,
}: TranscriptDiffDialogProps) {
  const { audioUrl: ctxAudioUrl, promptFilterSettings, setPromptFilterSettings } = useProject();
  const audioUrl = audioUrlProp ?? ctxAudioUrl ?? null;
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState<Loaded | null>(null);
  const [right, setRight] = useState<Loaded | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [activeSide, setActiveSide] = useState<"older" | "newer" | null>(null);
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);
  const [abLoopEnabled, setAbLoopEnabled] = useState(false);
  const [abLoopCurrent, setAbLoopCurrent] = useState<"older" | "newer">("older");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rangeEnabled, setRangeEnabled] = useState(false);
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [previewSide, setPreviewSide] = useState<"older" | "newer">("newer");
  const [previewFormat, setPreviewFormat] = useState<"vtt" | "srt">("vtt");
  const [previewOpen, setPreviewOpen] = useState(true);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const previewActiveRef = useRef<HTMLButtonElement | null>(null);
  // Per-side global timing shift (seconds, may be negative) applied to subtitle preview + exports.
  const [olderOffset, setOlderOffset] = useState(0);
  const [newerOffset, setNewerOffset] = useState(0);
  const offsetFor = (side: "older" | "newer") => (side === "older" ? olderOffset : newerOffset);
  const [includeCueMeta, setIncludeCueMeta] = useState(false);
  const [rangePreviewOpen, setRangePreviewOpen] = useState(true);
  const [exportSide, setExportSide] = useState<"both" | "older" | "newer">("both");
  const [includeTranscriptMeta, setIncludeTranscriptMeta] = useState(false);
  const [filenamePrefix, setFilenamePrefix] = useState("transcript");
  const [nameIncludeProject, setNameIncludeProject] = useState(true);
  const [nameIncludeVersion, setNameIncludeVersion] = useState(true);
  const [nameIncludeRange, setNameIncludeRange] = useState(true);
  const [namingOpen, setNamingOpen] = useState(false);
  const [validateExports, setValidateExports] = useState(true);
  const [lastValidation, setLastValidation] = useState<{
    ok: boolean;
    label: string;
    at: number;
    checks: { name: string; expected: number; actual: number; ok: boolean }[];
  } | null>(null);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [subPreviewOpen, setSubPreviewOpen] = useState(false);
  const [subPreviewN, setSubPreviewN] = useState(5);
  const [subPreviewFormat, setSubPreviewFormat] = useState<"vtt" | "srt">("vtt");
  const [subPreviewSide, setSubPreviewSide] = useState<"older" | "newer">("newer");
  const [csvPreviewN, setCsvPreviewN] = useState(10);
  const [excludeEmptyCues, setExcludeEmptyCues] = useState(false);
  const [useMinConfidence, setUseMinConfidence] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [showCueConfidence, setShowCueConfidence] = useState(false);
  const [copiedSub, setCopiedSub] = useState(false);
  const [subPreviewSelectMode, setSubPreviewSelectMode] = useState(false);
  const [selectedCueIds, setSelectedCueIds] = useState<Set<number>>(new Set());

  // Export filter presets — persisted in localStorage so they follow the user
  // across projects and across CSV / VTT / SRT / JSON / Manifest exports.
  const [filterPresets, setFilterPresets] = useState<ExportFilterPreset[]>(() => loadPresets());
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(() => loadLastUsedPresetId());

  const applyPreset = (p: ExportFilterPreset) => {
    setExcludeEmptyCues(p.excludeEmptyCues);
    setUseMinConfidence(p.useMinConfidence);
    setMinConfidence(p.minConfidence);
    setActivePresetId(p.id);
    saveLastUsedPresetId(p.id);
    toast.success(`Applied preset "${p.name}"`);
  };
  const persistPresets = (next: ExportFilterPreset[]) => {
    setFilterPresets(next);
    savePresets(next);
  };
  const saveCurrentAsPreset = () => {
    const name = newPresetName.trim();
    if (!name) {
      toast.error("Enter a preset name");
      return;
    }
    const now = Date.now();
    const existing = filterPresets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const updated: ExportFilterPreset = {
        ...existing,
        excludeEmptyCues,
        useMinConfidence,
        minConfidence,
        updatedAt: now,
      };
      persistPresets(filterPresets.map((p) => (p.id === existing.id ? updated : p)));
      setActivePresetId(updated.id);
      saveLastUsedPresetId(updated.id);
      toast.success(`Updated preset "${name}"`);
    } else {
      const created: ExportFilterPreset = {
        id: makePresetId(),
        name,
        excludeEmptyCues,
        useMinConfidence,
        minConfidence,
        createdAt: now,
        updatedAt: now,
      };
      persistPresets([created, ...filterPresets]);
      setActivePresetId(created.id);
      saveLastUsedPresetId(created.id);
      toast.success(`Saved preset "${name}"`);
    }
    setNewPresetName("");
  };
  const deletePreset = (id: string) => {
    const target = filterPresets.find((p) => p.id === id);
    persistPresets(filterPresets.filter((p) => p.id !== id));
    if (activePresetId === id) {
      setActivePresetId(null);
      saveLastUsedPresetId(null);
    }
    if (target) toast.success(`Deleted preset "${target.name}"`);
  };
  const activePreset = filterPresets.find((p) => p.id === activePresetId) ?? null;
  const activePresetDirty =
    !!activePreset &&
    !presetMatches(activePreset, { excludeEmptyCues, useMinConfidence, minConfidence });

  // Shared export filter — applied to subtitle cues, CSV rows and the live preview
  // so the exported files match exactly what the panel shows.
  const linePassesFilters = (line: Line | null | undefined): boolean => {
    if (!line) return false;
    if (excludeEmptyCues && (line.text ?? "").trim() === "") return false;
    if (useMinConfidence) {
      if (line.confidence == null) return false;
      if (line.confidence < minConfidence) return false;
    }
    return true;
  };


  // Apply playback rate / volume to the audio element whenever they change.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    el.volume = volume;
    el.muted = muted;
  }, [playbackRate, volume, muted]);

  // Stop audio when dialog closes
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      setActiveSide(null);
      setActiveLineIdx(null);
      setAbLoopEnabled(false);
      setAbLoopCurrent("older");
    }
  }, [open]);

  // Clear cue selection when preview side or format changes
  useEffect(() => {
    setSelectedCueIds(new Set());
  }, [subPreviewSide, subPreviewFormat]);

  const playFrom = (t: number, side: "older" | "newer", lineIdx: number | null) => {
    const el = audioRef.current;
    if (!el) return;
    if (!audioUrl) {
      toast.error("No audio available for this project");
      return;
    }
    try {
      el.currentTime = Math.max(0, t);
      void el.play();
      setActiveSide(side);
      setActiveLineIdx(lineIdx);
      if (abLoopEnabled) setAbLoopCurrent(side);
    } catch (err) {
      toast.error("Playback failed", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seekTo = (t: number) => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    el.currentTime = Math.max(0, t);
    setCurrentTime(el.currentTime);
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.currentTarget;
    const t = el.currentTime;
    setCurrentTime(t);

    if (!abLoopEnabled || activeLineIdx == null || !older || !newer) return;
    const row = timingRows.find((r) => r.idx === activeLineIdx);
    if (!row) return;

    const getBounds = (side: "older" | "newer") => {
      const line = side === "older" ? row.o : row.n;
      if (!line) return null;
      const start = line.start_sec ?? 0;
      const end = line.end_sec ?? (line.duration_sec ? start + line.duration_sec : start + 3);
      return { start, end: Math.max(start + 0.2, end) };
    };

    const bounds = getBounds(abLoopCurrent);
    if (!bounds) {
      const other = abLoopCurrent === "older" ? "newer" : "older";
      const otherBounds = getBounds(other);
      if (otherBounds) {
        setAbLoopCurrent(other);
        setActiveSide(other);
        el.currentTime = otherBounds.start;
      }
      return;
    }

    if (t >= bounds.end - 0.05) {
      const other = abLoopCurrent === "older" ? "newer" : "older";
      const otherBounds = getBounds(other);
      if (otherBounds) {
        setAbLoopCurrent(other);
        setActiveSide(other);
        el.currentTime = otherBounds.start;
      } else {
        el.currentTime = bounds.start;
      }
    }
  };

  useEffect(() => {
    if (!open || !leftId || !rightId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [versions, lines, projectsRes] = await Promise.all([
          supabase
            .from("transcript_versions")
            .select("id, version_number, full_text, updated_at, notes, project_id")
            .in("id", [leftId, rightId]),
          supabase
            .from("lyric_lines")
            .select("id, transcript_version_id, line_index, text, start_sec, end_sec, duration_sec")
            .in("transcript_version_id", [leftId, rightId])
            .order("line_index", { ascending: true }),
          supabase.from("projects").select("id, name"),
        ]);
        if (versions.error) throw versions.error;
        if (lines.error) throw lines.error;
        if (projectsRes.error) throw projectsRes.error;
        if (cancelled) return;

        const projectNames = new Map<string, string>();
        for (const p of (projectsRes.data ?? []) as any[]) {
          projectNames.set(p.id, p.name ?? "");
        }

        // Fetch per-word confidence and aggregate average per lyric_line_id.
        const lineIds = (lines.data ?? []).map((l: any) => l.id);
        const confidenceByLine = new Map<string, number>();
        if (lineIds.length > 0) {
          const { data: tokens, error: tokensErr } = await supabase
            .from("word_tokens")
            .select("lyric_line_id, confidence")
            .in("lyric_line_id", lineIds);
          if (!tokensErr && tokens) {
            const sums = new Map<string, { sum: number; n: number }>();
            for (const t of tokens as any[]) {
              if (t.confidence == null) continue;
              const cur = sums.get(t.lyric_line_id) ?? { sum: 0, n: 0 };
              cur.sum += Number(t.confidence);
              cur.n += 1;
              sums.set(t.lyric_line_id, cur);
            }
            for (const [id, { sum, n }] of sums) {
              if (n > 0) confidenceByLine.set(id, sum / n);
            }
          }
        }

        const linesByVersion = new Map<string, Line[]>();
        for (const l of (lines.data ?? []) as any[]) {
          const arr = linesByVersion.get(l.transcript_version_id) ?? [];
          arr.push({
            id: l.id,
            line_index: l.line_index,
            text: l.text ?? "",
            start_sec: l.start_sec,
            end_sec: l.end_sec,
            duration_sec: l.duration_sec,
            confidence: confidenceByLine.get(l.id) ?? null,
          });
          linesByVersion.set(l.transcript_version_id, arr);
        }

        const build = (id: string): Loaded | null => {
          const v = (versions.data ?? []).find((r: any) => r.id === id) as any;
          if (!v) return null;
          return {
            id: v.id,
            version_number: v.version_number,
            text: v.full_text ?? "",
            updated_at: v.updated_at,
            notes: v.notes ?? null,
            project_id: v.project_id ?? "",
            project_name: projectNames.get(v.project_id) ?? "",
            lines: linesByVersion.get(id) ?? [],
          };
        };
        setLeft(build(leftId));
        setRight(build(rightId));
      } catch (err) {
        toast.error("Failed to load transcripts", { description: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, leftId, rightId]);

  // Order older -> newer for readability
  const [older, newer] = useMemo(() => {
    if (!left || !right) return [left, right] as const;
    return left.version_number <= right.version_number ? ([left, right] as const) : ([right, left] as const);
  }, [left, right]);

  const segs = useMemo<DiffSegment[]>(() => {
    if (!older || !newer) return [];
    return diffWords(older.text, newer.text);
  }, [older, newer]);

  const summary = useMemo(() => summarizeDiff(segs), [segs]);

  // Per-line timing pairs by line_index (best-effort alignment)
  const timingRows = useMemo(() => {
    if (!older || !newer) return [];
    const byIdx = new Map<number, { o?: Line; n?: Line }>();
    for (const l of older.lines) byIdx.set(l.line_index, { ...(byIdx.get(l.line_index) ?? {}), o: l });
    for (const l of newer.lines) byIdx.set(l.line_index, { ...(byIdx.get(l.line_index) ?? {}), n: l });
    return Array.from(byIdx.entries())
      .sort(([a], [b]) => a - b)
      .map(([idx, { o, n }]) => ({
        idx,
        o,
        n,
        dStart: delta(o?.start_sec, n?.start_sec),
        dEnd: delta(o?.end_sec, n?.end_sec),
        dDur: delta(o?.duration_sec, n?.duration_sec),
        textChanged: (o?.text ?? "") !== (n?.text ?? ""),
      }));
  }, [older, newer]);

  const timingSummary = useMemo(() => {
    let shifted = 0;
    let added = 0;
    let removed = 0;
    let textEdits = 0;
    for (const r of timingRows) {
      if (!r.o && r.n) added++;
      else if (r.o && !r.n) removed++;
      else {
        if ((r.dStart && Math.abs(r.dStart) >= 0.01) || (r.dEnd && Math.abs(r.dEnd) >= 0.01)) shifted++;
        if (r.textChanged) textEdits++;
      }
    }
    return { shifted, added, removed, textEdits };
  }, [timingRows]);

  const severityBreakdown = useMemo(() => {
    const counts: Record<SeverityTier, number> = { negligible: 0, minor: 0, moderate: 0, major: 0 };
    for (const r of timingRows) {
      const maxDelta = [r.dStart, r.dEnd, r.dDur]
        .filter((d): d is number => d != null)
        .reduce((max, d) => Math.max(max, Math.abs(d)), 0);
      if (maxDelta === 0) continue;
      const tier = (severityOf(maxDelta)?.label) ?? "major";
      counts[tier]++;
    }
    return counts;
  }, [timingRows]);

  // Auto-detect which line is currently playing on each side from currentTime.
  const findPlayingLine = (lines: Line[] | undefined, t: number) => {
    if (!lines || !playing) return null;
    for (const l of lines) {
      if (l.start_sec == null) continue;
      const end = l.end_sec ?? (l.duration_sec ? l.start_sec + l.duration_sec : l.start_sec + 3);
      if (t >= l.start_sec && t < end) return l;
    }
    return null;
  };
  const playingOlderLine = useMemo(
    () => findPlayingLine(older?.lines, currentTime),
    [older?.lines, currentTime, playing]
  );
  const playingNewerLine = useMemo(
    () => findPlayingLine(newer?.lines, currentTime),
    [newer?.lines, currentTime, playing]
  );

  // Auto-scroll the currently playing row into view within the timing table.
  useEffect(() => {
    if (!playing) return;
    const idx = playingNewerLine?.line_index ?? playingOlderLine?.line_index;
    if (idx == null) return;
    const row = document.querySelector<HTMLTableRowElement>(`tr[data-playing="true"]`);
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [playingOlderLine?.id, playingNewerLine?.id, playing]);




  // Active timestamp filter (in seconds). Returns null when the field is empty/invalid.
  const parseSec = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    // Accept "12.5", "12", "1:23", "1:23.4", "01:02:03"
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    const parts = t.split(":").map((p) => Number(p));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };

  type RangeError = { field: "start" | "end" | "range"; message: string };
  const rangeValidation = useMemo<RangeError | null>(() => {
    if (!rangeEnabled) return null;
    const startRaw = rangeStart.trim();
    const endRaw = rangeEnd.trim();
    const s = parseSec(rangeStart);
    const e = parseSec(rangeEnd);

    if (startRaw && s == null) {
      return { field: "start", message: "Invalid start time. Use seconds (12.5) or MM:SS (1:23)" };
    }
    if (endRaw && e == null) {
      return { field: "end", message: "Invalid end time. Use seconds (12.5) or MM:SS (1:23)" };
    }
    if (s != null && e != null && endRaw && startRaw && e <= s) {
      return { field: "range", message: "End time must be greater than start time" };
    }
    if (s != null && e != null && endRaw && startRaw && e === s) {
      return { field: "range", message: "Start and end time cannot be the same" };
    }
    return null;
  }, [rangeEnabled, rangeStart, rangeEnd]);

  const activeRange = useMemo(() => {
    if (!rangeEnabled) return null;
    const s = parseSec(rangeStart);
    const e = parseSec(rangeEnd);
    if (s == null && rangeStart.trim()) return null;
    if (e == null && rangeEnd.trim()) return null;
    const start = s ?? 0;
    const end = e ?? Number.POSITIVE_INFINITY;
    if (end <= start) return null;
    return { start, end };
  }, [rangeEnabled, rangeStart, rangeEnd]);
  const rowInRange = (r: typeof timingRows[number]) => {
    if (!activeRange) return true;
    // Include if EITHER side's segment overlaps the range.
    const overlaps = (s: number | null | undefined, e: number | null | undefined) => {
      if (s == null) return false;
      const end = e ?? s;
      return end >= activeRange.start && s <= activeRange.end;
    };
    return overlaps(r.o?.start_sec, r.o?.end_sec) || overlaps(r.n?.start_sec, r.n?.end_sec);
  };
  const filteredTimingRows = useMemo(
    () =>
      timingRows.filter(rowInRange).filter((r) => {
        // Match the rows the user will actually export: respect side toggle so
        // the preview, counts and CSV/JSON all line up exactly.
        const oOk = r.o ? linePassesFilters(r.o) : false;
        const nOk = r.n ? linePassesFilters(r.n) : false;
        if (exportSide === "older") return oOk;
        if (exportSide === "newer") return nOk;
        return oOk || nOk;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timingRows, activeRange, excludeEmptyCues, useMinConfidence, minConfidence, exportSide]
  );

  // Per-reason excluded breakdown: of rows in the active range and side, how
  // many were dropped by Skip-empty vs Min-conf? A row is attributed to one
  // filter when disabling that filter alone would let it pass; rows blocked
  // by both filters are counted under "both".
  const excludedBreakdown = useMemo(() => {
    const empties: typeof timingRows = [];
    const lowConf: typeof timingRows = [];
    const both: typeof timingRows = [];
    if (!excludeEmptyCues && !useMinConfidence) {
      return { empties, lowConf, both, total: 0, inRange: 0 };
    }
    const passEmptyOnly = (line: Line | null | undefined) => {
      if (!line) return false;
      if (excludeEmptyCues && (line.text ?? "").trim() === "") return false;
      return true;
    };
    const passConfOnly = (line: Line | null | undefined) => {
      if (!line) return false;
      if (useMinConfidence) {
        if (line.confidence == null) return false;
        if (line.confidence < minConfidence) return false;
      }
      return true;
    };
    const rowPasses = (r: typeof timingRows[number], pass: (l: Line | null | undefined) => boolean) => {
      const oOk = r.o ? pass(r.o) : false;
      const nOk = r.n ? pass(r.n) : false;
      if (exportSide === "older") return oOk;
      if (exportSide === "newer") return nOk;
      return oOk || nOk;
    };
    const inRangeRows = timingRows.filter(rowInRange);
    for (const r of inRangeRows) {
      const sideHasLine = rowPasses(r, (l) => !!l);
      if (!sideHasLine) continue;
      const finalPass = rowPasses(r, linePassesFilters);
      if (finalPass) continue;
      const passesIfNoEmpty = rowPasses(r, passConfOnly);
      const passesIfNoConf = rowPasses(r, passEmptyOnly);
      if (passesIfNoEmpty && !passesIfNoConf) empties.push(r);
      else if (passesIfNoConf && !passesIfNoEmpty) lowConf.push(r);
      else both.push(r);
    }
    return {
      empties,
      lowConf,
      both,
      total: empties.length + lowConf.length + both.length,
      inRange: inRangeRows.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timingRows, activeRange, excludeEmptyCues, useMinConfidence, minConfidence, exportSide]);

  const exportPayload = useMemo(() => {
    if (!older || !newer) return null;
    const lineSeverity = (r: typeof filteredTimingRows[number]) => {
      const maxDelta = [r.dStart, r.dEnd, r.dDur]
        .filter((d): d is number => d != null)
        .reduce((max, d) => Math.max(max, Math.abs(d)), 0);
      if (maxDelta === 0) return null;
      return severityOf(maxDelta)?.label ?? null;
    };
    return {
      comparison: {
        olderVersion: older.version_number,
        newerVersion: newer.version_number,
        olderUpdatedAt: older.updated_at,
        newerUpdatedAt: newer.updated_at,
        olderLabel: leftLabel ?? `v${older.version_number}`,
        newerLabel: rightLabel ?? `v${newer.version_number}`,
        rangeFilter: activeRange
          ? { startSec: activeRange.start, endSec: Number.isFinite(activeRange.end) ? activeRange.end : null }
          : null,
        timingOffsetsSec: { older: olderOffset, newer: newerOffset },
      },
      severityThresholds: SEVERITY_THRESHOLDS.map((t) => ({ tier: t.label, maxAbsSeconds: t.maxAbs === Infinity ? null : t.maxAbs })),
      wordChanges: summary,
      timingSummary,
      severityBreakdown,
      lines: filteredTimingRows.map((r) => ({
        lineIndex: r.idx,
        older: r.o ? { text: r.o.text, startSec: r.o.start_sec, endSec: r.o.end_sec, durationSec: r.o.duration_sec } : null,
        newer: r.n ? { text: r.n.text, startSec: r.n.start_sec, endSec: r.n.end_sec, durationSec: r.n.duration_sec } : null,
        deltaStart: r.dStart,
        deltaEnd: r.dEnd,
        deltaDuration: r.dDur,
        textChanged: r.textChanged,
        severity: lineSeverity(r),
      })),
    };
  }, [older, newer, summary, timingSummary, severityBreakdown, filteredTimingRows, leftLabel, rightLabel, activeRange, olderOffset, newerOffset]);


  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

  const projectSlug = useMemo(() => {
    const name = older?.project_name || newer?.project_name || "";
    return name ? slugify(name) : "";
  }, [older, newer]);

  const buildFilename = (
    purpose: "json" | "csv" | "subtitle-single" | "zip",
    opts: { side?: "older" | "newer"; kind?: "vtt" | "srt" } = {}
  ) => {
    const parts: string[] = [];
    const prefix = slugify(filenamePrefix) || "transcript";
    parts.push(prefix);
    if (nameIncludeProject && projectSlug) parts.push(projectSlug);
    if (nameIncludeVersion && older && newer) {
      if (purpose === "subtitle-single" && opts.side) {
        const v = opts.side === "older" ? older.version_number : newer.version_number;
        parts.push(`v${v}-${opts.side}`);
      } else if (purpose === "zip") {
        const label = exportSide === "both" ? "diff" : exportSide;
        parts.push(`${label}-v${older.version_number}-to-v${newer.version_number}`);
      } else if (exportSide === "both") {
        parts.push(`diff-v${older.version_number}-to-v${newer.version_number}`);
      } else {
        const v = exportSide === "older" ? older.version_number : newer.version_number;
        parts.push(`${exportSide}-v${v}`);
      }
    }
    if (nameIncludeRange && activeRange) {
      const e = Number.isFinite(activeRange.end) ? activeRange.end.toFixed(2) : "end";
      parts.push(`range-${activeRange.start.toFixed(2)}-${e}s`);
    }
    if (purpose === "zip" && opts.kind) parts.push(opts.kind);
    return parts.join("-");
  };

  const downloadJSON = () => {
    if (!exportPayload) return;
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buildFilename("json")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported comparison as JSON");
  };

  const copyJSON = async () => {
    if (!exportPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      setCopied(true);
      toast.success("Copied JSON summary to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard write failed");
    }
  };

  const buildManifest = () => {
    const projectName = older?.project_name || newer?.project_name || null;
    const range = activeRange
      ? {
          start_sec: activeRange.start,
          end_sec: Number.isFinite(activeRange.end) ? activeRange.end : null,
          start_label: fmt(activeRange.start),
          end_label: Number.isFinite(activeRange.end) ? fmt(activeRange.end) : "end",
        }
      : null;
    const builtCsv = buildCsv();
    const filenames: Record<string, string> = {
      json: `${buildFilename("json")}.json`,
      csv: `${buildFilename("csv")}.csv`,
      manifest: `${buildFilename("json")}.manifest.json`,
    };
    if (exportSide !== "newer") {
      filenames.vtt_older = `${buildFilename("subtitle-single", { side: "older" })}.vtt`;
      filenames.srt_older = `${buildFilename("subtitle-single", { side: "older" })}.srt`;
    }
    if (exportSide !== "older") {
      filenames.vtt_newer = `${buildFilename("subtitle-single", { side: "newer" })}.vtt`;
      filenames.srt_newer = `${buildFilename("subtitle-single", { side: "newer" })}.srt`;
    }
    filenames.zip_vtt = `${buildFilename("zip", { kind: "vtt" })}.zip`;
    filenames.zip_srt = `${buildFilename("zip", { kind: "srt" })}.zip`;

    return {
      schema: "lovable.transcript-diff.export-manifest",
      schema_version: 1,
      generated_at: new Date().toISOString(),
      project: {
        id: older?.project_id || newer?.project_id || null,
        title: projectName,
        slug: projectSlug || null,
      },
      versions: {
        older: older ? { id: older.id, version_number: older.version_number, updated_at: older.updated_at } : null,
        newer: newer ? { id: newer.id, version_number: newer.version_number, updated_at: newer.updated_at } : null,
      },
      export_mode: exportSide,
      range,
      offsets: { older_sec: olderOffset, newer_sec: newerOffset },
      options: {
        include_cue_meta: includeCueMeta,
        include_transcript_meta: includeTranscriptMeta,
        exclude_empty_cues: excludeEmptyCues,
        min_confidence_enabled: useMinConfidence,
        min_confidence: useMinConfidence ? minConfidence : null,
        validate_exports: validateExports,
        filter_preset: activePreset
          ? { id: activePreset.id, name: activePreset.name, dirty: activePresetDirty }
          : null,
      },
      counts: {
        preview_lines: filteredTimingRows.length,
        csv_rows: csvRowCount,
        csv_data_rows_built: builtCsv?.dataRows.length ?? 0,
        csv_meta_rows: builtCsv?.metaRows.length ?? 0,
        csv_summary_rows: builtCsv?.summaryRows.length ?? 0,
        cues_older: cuesInRange.older,
        cues_newer: cuesInRange.newer,
        excluded_total: excludedBreakdown.total,
        excluded_by_empty: excludedBreakdown.empties.length,
        excluded_by_min_confidence: excludedBreakdown.lowConf.length,
        excluded_by_both_filters: excludedBreakdown.both.length,
      },
      last_validation: lastValidation
        ? {
            label: lastValidation.label,
            ok: lastValidation.ok,
            at: new Date(lastValidation.at).toISOString(),
            checks: lastValidation.checks,
          }
        : null,
      filenames,
    };
  };

  const downloadManifest = () => {
    if (!older || !newer) return;
    const manifest = buildManifest();
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = manifest.filenames.manifest;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported manifest JSON");
  };

  const getMetaRowsForSide = (source: Loaded | null, sideLabel: string) => {
    if (!includeTranscriptMeta || !source) return [] as string[];
    return buildMetaNotes(source, sideLabel).map((n) => `# ${n}`);
  };

  // ── Export validation ────────────────────────────────────────────────
  // Counts cues/rows in the actually generated file payload so we can compare
  // against the preview counts shown to the user before download completes.
  const countCsvDataRows = (csv: string) => {
    // A data row starts with the numeric line_index column.
    let n = 0;
    for (const ln of csv.split(/\r?\n/)) {
      if (/^\d+,/.test(ln)) n++;
    }
    return n;
  };
  const countSubtitleCues = (content: string) => (content.match(/-->/g) ?? []).length;

  const runValidation = (
    label: string,
    checks: { name: string; expected: number; actual: number }[]
  ): boolean => {
    if (!validateExports) return true;
    const enriched = checks.map((c) => ({ ...c, ok: c.expected === c.actual }));
    const ok = enriched.every((c) => c.ok);
    setLastValidation({ ok, label, at: Date.now(), checks: enriched });
    if (!ok) {
      const mismatch = enriched
        .filter((c) => !c.ok)
        .map((c) => `${c.name}: expected ${c.expected}, got ${c.actual}`)
        .join(" · ");
      toast.error(`Export validation failed — ${mismatch}`);
    }
    return ok;
  };

  const buildCsv = (): {
    content: string;
    metaRows: string[];
    headerLine: string;
    dataRows: string[];
    summaryRows: string[];
  } | null => {
    if (!exportPayload) return null;
    const rows = exportPayload.lines;
    const side = exportSide;
    let headers: string[];
    if (side === "both") {
      headers = [
        "line_index",
        "older_text",
        "newer_text",
        "older_start_sec",
        "older_end_sec",
        "older_duration_sec",
        "newer_start_sec",
        "newer_end_sec",
        "newer_duration_sec",
        "delta_start",
        "delta_end",
        "delta_duration",
        "text_changed",
        "severity",
      ];
    } else {
      const label = side;
      headers = [
        "line_index",
        `${label}_text`,
        `${label}_start_sec`,
        `${label}_end_sec`,
        `${label}_duration_sec`,
        "severity",
      ];
    }
    const escape = (v: string | null | undefined) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };
    const metaRows: string[] = [];
    if (side === "both") {
      metaRows.push(...getMetaRowsForSide(older, "older"));
      metaRows.push(...getMetaRowsForSide(newer, "newer"));
    } else {
      metaRows.push(...getMetaRowsForSide(side === "older" ? older : newer, side));
    }
    const headerLine = headers.join(",");
    const dataRows: string[] = [];
    const summaryRows: string[] = [];
    if (side === "both") {
      for (const r of rows) {
        dataRows.push(
          [
            r.lineIndex,
            escape(r.older?.text),
            escape(r.newer?.text),
            r.older?.startSec ?? "",
            r.older?.endSec ?? "",
            r.older?.durationSec ?? "",
            r.newer?.startSec ?? "",
            r.newer?.endSec ?? "",
            r.newer?.durationSec ?? "",
            r.deltaStart ?? "",
            r.deltaEnd ?? "",
            r.deltaDuration ?? "",
            r.textChanged ? "yes" : "no",
            r.severity ?? "",
          ].join(",")
        );
      }
      summaryRows.push(`word_added,${exportPayload.wordChanges.added}`);
      summaryRows.push(`word_removed,${exportPayload.wordChanges.removed}`);
      summaryRows.push(`timing_shifted,${exportPayload.timingSummary.shifted}`);
      summaryRows.push(`timing_added,${exportPayload.timingSummary.added}`);
      summaryRows.push(`timing_removed,${exportPayload.timingSummary.removed}`);
      summaryRows.push(`text_edits,${exportPayload.timingSummary.textEdits}`);
      summaryRows.push("");
      summaryRows.push("severity_tier,max_abs_seconds");
      for (const t of exportPayload.severityThresholds) {
        summaryRows.push(`${t.tier},${t.maxAbsSeconds ?? ""}`);
      }
      summaryRows.push("");
      summaryRows.push("severity_breakdown,count");
      for (const [tier, count] of Object.entries(exportPayload.severityBreakdown)) {
        summaryRows.push(`${tier},${count}`);
      }
    } else {
      for (const r of rows.filter((r) => (side === "older" ? r.older : r.newer) != null)) {
        const data = side === "older" ? r.older : r.newer;
        dataRows.push(
          [
            r.lineIndex,
            escape(data?.text),
            data?.startSec ?? "",
            data?.endSec ?? "",
            data?.durationSec ?? "",
            r.severity ?? "",
          ].join(",")
        );
      }
    }
    const parts: string[] = [];
    if (metaRows.length) parts.push(...metaRows, "");
    parts.push(headerLine, ...dataRows);
    if (summaryRows.length) parts.push("", ...summaryRows);
    return { content: parts.join("\n"), metaRows, headerLine, dataRows, summaryRows };
  };

  const downloadCSV = () => {
    const built = buildCsv();
    if (!built) return;
    const side = exportSide;
    if (!runValidation(`CSV (${side})`, [
      { name: "CSV rows", expected: csvRowCount, actual: countCsvDataRows(built.content) },
    ])) return;
    const blob = new Blob([built.content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buildFilename("csv")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${side === "both" ? "comparison" : side} as CSV`);
  };


  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const buildMetaNotes = (source: Loaded | null, sideLabel: string) => {
    if (!source) return [] as string[];
    const notes: string[] = [];
    if (source.project_name) notes.push(`Track: ${source.project_name}`);
    notes.push(`Version: v${source.version_number} (${sideLabel})`);
    notes.push(`Updated: ${new Date(source.updated_at).toISOString()}`);
    if (source.notes) notes.push(`Notes: ${source.notes}`);
    return notes;
  };

  const formatTimestamp = (sec: number, kind: "vtt" | "srt") => {
    const s = Math.max(0, sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const secs = s - h * 3600 - m * 60;
    const wholeSecs = Math.floor(secs);
    const ms = Math.round((secs - wholeSecs) * 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const sep = kind === "vtt" ? "." : ",";
    return `${pad(h)}:${pad(m)}:${pad(wholeSecs)}${sep}${pad(ms, 3)}`;
  };

  const buildSubtitle = (
    side: "older" | "newer",
    kind: "vtt" | "srt"
  ): string | null => {
    const source = side === "older" ? older : newer;
    if (!source) return null;
    const offset = offsetFor(side);
    const cues = source.lines
      .filter((l) => l.start_sec != null && (l.text ?? "").trim() !== "" && linePassesFilters(l))
      .map((l) => {
        const baseStart = l.start_sec ?? 0;
        const baseEnd =
          l.end_sec ?? (l.duration_sec ? baseStart + l.duration_sec : baseStart + 2);
        const start = Math.max(0, baseStart + offset);
        const end = Math.max(start + 0.05, baseEnd + offset);
        const text = includeCueMeta
          ? `${l.text.trim()} [#L${l.line_index}·v${source.version_number}]`
          : l.text.trim();
        return { start, end, text, idx: l.line_index };
      })
      .filter((c) => !activeRange || (c.end >= activeRange.start && c.start <= activeRange.end))
      .sort((a, b) => a.start - b.start);

    if (cues.length === 0) return null;

    if (kind === "vtt") {
      const metaNotes = includeTranscriptMeta ? buildMetaNotes(source, side).map((n) => `NOTE ${n}`).join("\n") + "\n" : "";
      const offsetNote = offset !== 0 ? `NOTE Global timing shift: ${offset >= 0 ? "+" : ""}${offset.toFixed(3)}s\n` : "";
      const header = `WEBVTT\nNOTE Generated from transcript v${source.version_number} (${side})\n${metaNotes}${offsetNote}\n`;
      return (
        header +
        cues
          .map(
            (c) =>
              `${formatTimestamp(c.start, "vtt")} --> ${formatTimestamp(c.end, "vtt")}\n${c.text}`
          )
          .join("\n\n") +
        "\n"
      );
    }
    // SRT
    const metaBlock = includeTranscriptMeta
      ? buildMetaNotes(source, side).map((n) => `${n}`).join("\n") + "\n\n"
      : "";
    return (
      metaBlock +
      cues
        .map(
          (c, i) =>
            `${i + 1}\n${formatTimestamp(c.start, "srt")} --> ${formatTimestamp(c.end, "srt")}\n${c.text}`
        )
        .join("\n\n") +
      "\n"
    );
  };

  // Structured cues for the VTT/SRT preview drawer. Mirrors buildSubtitle's
  // filtering, offsets and sort, and also surfaces line-level confidence so
  // the preview matches the file 1:1 while exposing extra metadata.
  const buildSubtitlePreviewCues = (side: "older" | "newer") => {
    const source = side === "older" ? older : newer;
    if (!source) return [] as { idx: number; lineIndex: number; start: number; end: number; baseStart: number; baseEnd: number; offset: number; text: string; confidence: number | null }[];
    const offset = offsetFor(side);
    const cues = source.lines
      .filter((l) => l.start_sec != null && (l.text ?? "").trim() !== "" && linePassesFilters(l))
      .map((l) => {
        const baseStart = l.start_sec ?? 0;
        const baseEnd = l.end_sec ?? (l.duration_sec ? baseStart + l.duration_sec : baseStart + 2);
        const start = Math.max(0, baseStart + offset);
        const end = Math.max(start + 0.05, baseEnd + offset);
        const text = includeCueMeta
          ? `${l.text.trim()} [#L${l.line_index}·v${source.version_number}]`
          : l.text.trim();
        return { lineIndex: l.line_index, start, end, baseStart, baseEnd, offset, text, confidence: l.confidence ?? null };
      })
      .filter((c) => !activeRange || (c.end >= activeRange.start && c.start <= activeRange.end))
      .sort((a, b) => a.start - b.start)
      .map((c, i) => ({ idx: i + 1, ...c }));
    return cues;
  };

  // Cues for the live subtitle preview panel (mirrors buildSubtitle but returns structured data).
  const previewCues = useMemo(() => {
    const source = previewSide === "older" ? older : newer;
    if (!source) return [] as { start: number; end: number; text: string; idx: number }[];
    const offset = previewSide === "older" ? olderOffset : newerOffset;
    return source.lines
      .filter((l) => l.start_sec != null && (l.text ?? "").trim() !== "" && linePassesFilters(l))
      .map((l) => {
        const baseStart = l.start_sec ?? 0;
        const baseEnd = l.end_sec ?? (l.duration_sec ? baseStart + l.duration_sec : baseStart + 2);
        const start = Math.max(0, baseStart + offset);
        const end = Math.max(start + 0.05, baseEnd + offset);
        const text = includeCueMeta
          ? `${l.text.trim()} [#L${l.line_index}·v${source.version_number}]`
          : l.text.trim();
        return { start, end, text, idx: l.line_index };
      })
      .filter((c) => !activeRange || (c.end >= activeRange.start && c.start <= activeRange.end))
      .sort((a, b) => a.start - b.start);
  }, [previewSide, older, newer, activeRange, olderOffset, newerOffset, includeCueMeta]);

  const cuesInRange = useMemo(() => {
    if (!older || !newer) return { older: 0, newer: 0 };
    const count = (source: Loaded, offset: number) =>
      source.lines
        .filter((l) => l.start_sec != null && (l.text ?? "").trim() !== "" && linePassesFilters(l))
        .map((l) => {
          const baseStart = l.start_sec ?? 0;
          const baseEnd = l.end_sec ?? (l.duration_sec ? baseStart + l.duration_sec : baseStart + 2);
          const start = Math.max(0, baseStart + offset);
          const end = Math.max(start + 0.05, baseEnd + offset);
          return { start, end };
        })
        .filter((c) => !activeRange || (c.end >= activeRange.start && c.start <= activeRange.end)).length;
    return { older: count(older, olderOffset), newer: count(newer, newerOffset) };
  }, [older, newer, activeRange, olderOffset, newerOffset]);

  const csvRowCount = useMemo(() => {
    if (!exportPayload) return 0;
    if (exportSide === "both") return exportPayload.lines.length;
    return exportPayload.lines.filter((r) => (exportSide === "older" ? r.older : r.newer) != null).length;
  }, [exportPayload, exportSide]);

  const activePreviewIdx = useMemo(() => {
    if (previewCues.length === 0) return -1;
    // Find last cue whose start <= currentTime; prefer one that still encloses currentTime.
    let candidate = -1;
    for (let i = 0; i < previewCues.length; i++) {
      const c = previewCues[i];
      if (currentTime >= c.start && currentTime < c.end) return i;
      if (c.start <= currentTime) candidate = i;
      else break;
    }
    return candidate;
  }, [previewCues, currentTime]);

  // Auto-scroll the active cue into view
  useEffect(() => {
    if (!previewOpen) return;
    const el = previewActiveRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activePreviewIdx, previewOpen]);

  const downloadSubtitles = (kind: "vtt" | "srt") => {
    if (!older || !newer) return;
    const wantOlder = exportSide === "both" || exportSide === "older";
    const wantNewer = exportSide === "both" || exportSide === "newer";
    const olderContent = wantOlder ? buildSubtitle("older", kind) : null;
    const newerContent = wantNewer ? buildSubtitle("newer", kind) : null;
    if (!olderContent && !newerContent) {
      toast.error("No timed lines available to export");
      return;
    }
    const checks: { name: string; expected: number; actual: number }[] = [];
    if (olderContent) checks.push({ name: `older ${kind.toUpperCase()} cues`, expected: cuesInRange.older, actual: countSubtitleCues(olderContent) });
    if (newerContent) checks.push({ name: `newer ${kind.toUpperCase()} cues`, expected: cuesInRange.newer, actual: countSubtitleCues(newerContent) });
    if (!runValidation(`${kind.toUpperCase()} files`, checks)) return;
    const mime = kind === "vtt" ? "text/vtt" : "application/x-subrip";
    const ext = kind;
    let count = 0;
    if (olderContent) {
      triggerDownload(
        `${buildFilename("subtitle-single", { side: "older" })}.${ext}`,
        olderContent,
        mime
      );
      count++;
    }
    if (newerContent) {
      triggerDownload(
        `${buildFilename("subtitle-single", { side: "newer" })}.${ext}`,
        newerContent,
        mime
      );
      count++;
    }
    toast.success(`Exported ${count} ${kind.toUpperCase()} file${count > 1 ? "s" : ""}`);
  };

  const copySubtitles = async (side: "older" | "newer", kind: "vtt" | "srt") => {
    const content = buildSubtitle(side, kind);
    if (!content) {
      toast.error("No timed lines available to copy");
      return;
    }
    setSelectedCueIds(new Set());
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSub(true);
      toast.success(`Copied ${kind.toUpperCase()} to clipboard`);
      setTimeout(() => setCopiedSub(false), 1500);
    } catch {
      toast.error("Couldn’t copy to clipboard", {
        description: "Clipboard access may be blocked. Try clicking the page first, or use the Download button instead.",
      });
    }
  };

  const copySelectedSubtitles = async (side: "older" | "newer", kind: "vtt" | "srt") => {
    const allCues = buildSubtitlePreviewCues(side);
    const selected = allCues.filter((c) => selectedCueIds.has(c.idx));
    if (selected.length === 0) {
      toast.error("No cues selected");
      return;
    }
    const source = side === "older" ? older : newer;
    let content = "";
    if (kind === "vtt") {
      const metaNotes = includeTranscriptMeta && source ? buildMetaNotes(source, side).map((n) => `NOTE ${n}`).join("\n") + "\n" : "";
      const off = offsetFor(side);
      const offsetNote = off !== 0 ? `NOTE Global timing shift: ${off >= 0 ? "+" : ""}${off.toFixed(3)}s\n` : "";
      content = `WEBVTT\nNOTE Generated from transcript v${source?.version_number ?? "?"} (${side})\n${metaNotes}${offsetNote}\n` +
        selected
          .map((c) => `${formatTimestamp(c.start, "vtt")} --> ${formatTimestamp(c.end, "vtt")}\n${c.text}`)
          .join("\n\n") +
        "\n";
    } else {
      const metaBlock = includeTranscriptMeta && source ? buildMetaNotes(source, side).map((n) => `${n}`).join("\n") + "\n\n" : "";
      content = metaBlock + selected.map((c, i) => `${i + 1}\n${formatTimestamp(c.start, "srt")} --> ${formatTimestamp(c.end, "srt")}\n${c.text}`).join("\n\n") + "\n";
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSub(true);
      toast.success(`Copied ${selected.length} selected ${kind.toUpperCase()} cue${selected.length === 1 ? "" : "s"} to clipboard`);
      setTimeout(() => setCopiedSub(false), 1500);
    } catch {
      toast.error("Couldn’t copy to clipboard", {
        description: "Clipboard access may be blocked. Try clicking the page first, or use the Download button instead.",
      });
    }
  };

  const downloadZip = async (kind: "vtt" | "srt") => {
    if (!older || !newer) return;
    const wantOlder = exportSide === "both" || exportSide === "older";
    const wantNewer = exportSide === "both" || exportSide === "newer";
    const olderContent = wantOlder ? buildSubtitle("older", kind) : null;
    const newerContent = wantNewer ? buildSubtitle("newer", kind) : null;
    if (!olderContent && !newerContent) {
      toast.error("No timed lines available to export");
      return;
    }
    const zipChecks: { name: string; expected: number; actual: number }[] = [];
    if (olderContent) zipChecks.push({ name: `older ${kind.toUpperCase()} cues`, expected: cuesInRange.older, actual: countSubtitleCues(olderContent) });
    if (newerContent) zipChecks.push({ name: `newer ${kind.toUpperCase()} cues`, expected: cuesInRange.newer, actual: countSubtitleCues(newerContent) });
    if (!runValidation(`${kind.toUpperCase()} ZIP`, zipChecks)) return;
    const zip = new JSZip();
    const ext = kind;
    if (olderContent) {
      zip.file(`${buildFilename("subtitle-single", { side: "older" })}.${ext}`, olderContent);
    }
    if (newerContent) {
      zip.file(`${buildFilename("subtitle-single", { side: "newer" })}.${ext}`, newerContent);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buildFilename("zip", { kind })}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${kind.toUpperCase()} ZIP`);
  };


  const renderSide = (side: "older" | "newer") => {
    return segs.map((s, i) => {
      if (s.op === "equal") return <span key={i}>{s.text}</span>;
      if (s.op === "remove") {
        if (side === "older") {
          return <span key={i} className="bg-destructive/20 text-destructive rounded-sm px-0.5">{s.text}</span>;
        }
        return null;
      }
      if (side === "newer") {
        return <span key={i} className="bg-success/20 text-success rounded-sm px-0.5">{s.text}</span>;
      }
      return null;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Transcript diff
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading transcripts…"
              : left && right
                ? <span>Comparing <strong>v{older?.version_number}</strong> → <strong>v{newer?.version_number}</strong> · <span className="text-success">+{summary.added}</span> / <span className="text-destructive">−{summary.removed}</span> words · <span className="text-primary">{timingSummary.shifted}</span> timing shifts</span>
                : "Select two transcript versions to compare."}
          </DialogDescription>
        </DialogHeader>

        {audioUrl && (() => {
          const activeRow = activeLineIdx != null ? timingRows.find((r) => r.idx === activeLineIdx) : null;
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={togglePlay}>
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <span className="font-mono tabular-nums text-muted-foreground">{currentTime.toFixed(2)}s</span>

                {/* Playback speed */}
                <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                  {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPlaybackRate(r)}
                      className={`h-6 px-1.5 rounded text-[10px] font-mono tabular-nums transition-colors ${
                        playbackRate === r
                          ? "bg-primary/20 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                      title={`${r}× playback speed`}
                    >
                      {r}×
                    </button>
                  ))}
                </div>

                {/* Volume */}
                <div className="flex items-center gap-1.5 border-l border-border pl-2 ml-1">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      if (v > 0 && muted) setMuted(false);
                    }}
                    className="w-20 h-1 accent-primary cursor-pointer"
                    title={`Volume ${Math.round((muted ? 0 : volume) * 100)}%`}
                  />
                  <span className="font-mono tabular-nums text-[10px] text-muted-foreground w-7 text-right">
                    {Math.round((muted ? 0 : volume) * 100)}%
                  </span>
                </div>

                <Button
                  size="sm"
                  variant={abLoopEnabled ? "default" : "outline"}
                  className="h-7 gap-1 text-[10px]"
                  onClick={() => {
                    if (activeLineIdx == null) {
                      toast.info("Select a line first to enable A/B loop");
                      return;
                    }
                    setAbLoopEnabled((v) => !v);
                  }}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  {abLoopEnabled ? "A/B ON" : "A/B"}
                </Button>
                {activeSide && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    activeSide === "older" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"
                  }`}>
                    {abLoopEnabled ? `${abLoopCurrent === "older" ? "A" : "B"} · ` : ""}{activeSide} {activeLineIdx != null ? `· line ${activeLineIdx}` : ""}
                  </span>
                )}
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  preload="auto"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                  onDurationChange={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                  className="hidden"
                />
              </div>
              <DiffWaveform
                audioUrl={audioUrl}
                currentTime={currentTime}
                duration={audioDuration}
                olderSegment={activeRow?.o ? { start: activeRow.o.start_sec, end: activeRow.o.end_sec } : null}
                newerSegment={activeRow?.n ? { start: activeRow.n.start_sec, end: activeRow.n.end_sec } : null}
                onSeek={seekTo}
              />
            </div>
          );
        })()}

        {audioUrl && !loading && older && newer && (
          <div className="rounded-md border border-border bg-background/40">
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
                title={previewOpen ? "Collapse subtitle preview" : "Expand subtitle preview"}
              >
                <Captions className="h-3.5 w-3.5 text-primary" />
                Subtitle preview
                <span className="text-muted-foreground font-normal">
                  ({previewCues.length} cue{previewCues.length === 1 ? "" : "s"})
                </span>
              </button>

              <div className="ml-auto flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Side</span>
                {(["older", "newer"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPreviewSide(s)}
                    className={`h-6 px-2 rounded text-[10px] uppercase tracking-wide transition-colors ${
                      previewSide === s
                        ? s === "older"
                          ? "bg-destructive/20 text-destructive font-semibold"
                          : "bg-success/20 text-success font-semibold"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    {s === "older" ? `v${older.version_number}` : `v${newer.version_number}`} {s}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Format</span>
                {(["vtt", "srt"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPreviewFormat(f)}
                    className={`h-6 px-2 rounded text-[10px] font-mono uppercase transition-colors ${
                      previewFormat === f
                        ? "bg-primary/20 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {previewOpen && (
              <div ref={previewScrollRef} className="max-h-56 overflow-y-auto p-2 space-y-1">
                {previewCues.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No timed cues available for this side{activeRange ? " in the selected range" : ""}.
                  </div>
                )}
                {previewCues.map((c, i) => {
                  const isActive = i === activePreviewIdx;
                  const isPast = !isActive && c.end <= currentTime;
                  return (
                    <button
                      key={`${c.idx}-${i}`}
                      ref={isActive ? previewActiveRef : undefined}
                      type="button"
                      onClick={() => {
                        seekTo(c.start);
                        setActiveSide(previewSide);
                        setActiveLineIdx(c.idx);
                        const el = audioRef.current;
                        if (el && el.paused) void el.play();
                      }}
                      className={`w-full text-left rounded px-2 py-1.5 transition-colors flex gap-2 ${
                        isActive
                          ? "bg-primary/15 ring-1 ring-primary/40"
                          : isPast
                            ? "opacity-60 hover:bg-muted/40"
                            : "hover:bg-muted/40"
                      }`}
                    >
                      <span className="font-mono tabular-nums text-[10px] text-muted-foreground shrink-0 w-[180px]">
                        {formatTimestamp(c.start, previewFormat)} {previewFormat === "vtt" ? "-->" : "-->"} {formatTimestamp(c.end, previewFormat)}
                      </span>
                      <span className={`text-xs leading-snug ${isActive ? "text-foreground font-medium" : "text-foreground/80"}`}>
                        {c.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}





        {!loading && older && newer && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Timing offsets (older / newer) */}
            {([
              { side: "older" as const, label: `v${older.version_number} older`, value: olderOffset, set: setOlderOffset, tone: "destructive" },
              { side: "newer" as const, label: `v${newer.version_number} newer`, value: newerOffset, set: setNewerOffset, tone: "success" },
            ]).map(({ side, label, value, set, tone }) => {
              const active = value !== 0;
              const toneClasses = tone === "destructive"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-success/40 bg-success/5 text-success";
              return (
                <div
                  key={side}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                    active ? toneClasses : "border-border bg-background/40"
                  }`}
                  title={`Global timing shift applied to ${side} subtitle export and preview`}
                >
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-foreground">{label}</span>
                  <button
                    type="button"
                    onClick={() => set(Number((value - 0.1).toFixed(3)))}
                    className="h-6 w-6 rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    title="Shift −0.1s"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    step={0.05}
                    value={value}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      set(Number.isFinite(n) ? n : 0);
                    }}
                    className="w-16 h-6 rounded border border-border bg-background px-1.5 font-mono text-[11px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">s</span>
                  <button
                    type="button"
                    onClick={() => set(Number((value + 0.1).toFixed(3)))}
                    className="h-6 w-6 rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    title="Shift +0.1s"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const source = side === "older" ? older : newer;
                      const firstStart = source?.lines
                        .map((l) => l.start_sec)
                        .filter((s): s is number => s != null)
                        .sort((a, b) => a - b)[0];
                      if (firstStart == null) {
                        toast.info("No timed lines on this side");
                        return;
                      }
                      // Offset to align first cue with current playhead.
                      set(Number((currentTime - firstStart).toFixed(3)));
                    }}
                    className="h-6 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    title="Set start offset so the first cue lands on the current playhead"
                  >
                    align start
                  </button>
                  {active && (
                    <button
                      type="button"
                      onClick={() => set(0)}
                      className="h-6 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      title="Reset offset"
                    >
                      reset
                    </button>
                  )}
                </div>
              );
            })}
            {/* Range filter */}
            <div className="flex flex-col">
              <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                rangeEnabled && rangeValidation ? "border-destructive/60 bg-destructive/5" : rangeEnabled ? "border-primary/50 bg-primary/5" : "border-border bg-background/40"
              }`}>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rangeEnabled}
                    onChange={(e) => setRangeEnabled(e.target.checked)}
                    className="h-3 w-3 accent-primary cursor-pointer"
                  />
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">Range</span>
                </label>
                <input
                  type="text"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  onFocus={() => setRangeEnabled(true)}
                  placeholder="0:00"
                  className={`w-16 h-6 rounded border bg-background px-1.5 font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 disabled:opacity-50 ${
                    rangeEnabled && rangeValidation?.field === "start" ? "border-destructive focus:ring-destructive" : "border-border focus:ring-primary"
                  }`}
                  disabled={!rangeEnabled}
                />
                <span className="text-muted-foreground">→</span>
                <input
                  type="text"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  onFocus={() => setRangeEnabled(true)}
                  placeholder="end"
                  className={`w-16 h-6 rounded border bg-background px-1.5 font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 disabled:opacity-50 ${
                    rangeEnabled && rangeValidation?.field === "end" ? "border-destructive focus:ring-destructive" : "border-border focus:ring-primary"
                  }`}
                  disabled={!rangeEnabled}
                />
                <button
                  type="button"
                  onClick={() => {
                    const allStarts: number[] = [];
                    for (const l of older?.lines ?? []) if (l.start_sec != null) allStarts.push(l.start_sec);
                    for (const l of newer?.lines ?? []) if (l.start_sec != null) allStarts.push(l.start_sec);
                    let snap = currentTime;
                    if (allStarts.length) {
                      snap = allStarts.reduce((best, s) => (Math.abs(s - currentTime) < Math.abs(best - currentTime) ? s : best), allStarts[0]);
                    }
                    setRangeStart(snap.toFixed(2));
                    setRangeEnabled(true);
                  }}
                  className="h-6 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  title="Snap start to nearest transcript segment start"
                >
                  ← now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const allEnds: number[] = [];
                    for (const l of older?.lines ?? []) if (l.end_sec != null) allEnds.push(l.end_sec);
                    for (const l of newer?.lines ?? []) if (l.end_sec != null) allEnds.push(l.end_sec);
                    let snap = currentTime;
                    if (allEnds.length) {
                      snap = allEnds.reduce((best, e) => (Math.abs(e - currentTime) < Math.abs(best - currentTime) ? e : best), allEnds[0]);
                    }
                    setRangeEnd(snap.toFixed(2));
                    setRangeEnabled(true);
                  }}
                  className="h-6 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  title="Snap end to nearest transcript segment end"
                >
                  now →
                </button>
                {rangeEnabled && !rangeValidation && (
                  <span className="font-mono tabular-nums text-[10px] text-primary border-l border-border pl-2 ml-1">
                    {filteredTimingRows.length}/{timingRows.length} lines
                  </span>
                )}
              </div>
              {rangeEnabled && rangeValidation && (
                <div className="flex items-center gap-1 mt-1 ml-1">
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                  <span className="text-[10px] text-destructive">{rangeValidation.message}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeCueMeta}
                  onChange={(e) => setIncludeCueMeta(e.target.checked)}
                  className="h-3 w-3 accent-primary cursor-pointer"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Cue meta</span>
              </label>
              <span className="text-[10px] text-muted-foreground">[#L·v]</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTranscriptMeta}
                  onChange={(e) => setIncludeTranscriptMeta(e.target.checked)}
                  className="h-3 w-3 accent-primary cursor-pointer"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Transcript meta</span>
              </label>
              <span className="text-[10px] text-muted-foreground">track, notes</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-1 text-xs" title="Drop lines whose text is empty after trimming">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excludeEmptyCues}
                  onChange={(e) => setExcludeEmptyCues(e.target.checked)}
                  className="h-3 w-3 accent-primary cursor-pointer"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Skip empty</span>
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1 text-xs" title="Only include lines whose average word confidence meets this threshold. Lines without word-level confidence are dropped when enabled.">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useMinConfidence}
                  onChange={(e) => setUseMinConfidence(e.target.checked)}
                  className="h-3 w-3 accent-primary cursor-pointer"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Min conf</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minConfidence}
                disabled={!useMinConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="h-1 w-20 accent-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span className={cn("text-[10px] font-mono tabular-nums w-8", useMinConfidence ? "text-foreground" : "text-muted-foreground")}>
                {(minConfidence * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors",
                promptFilterSettings.enabled
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-background/40"
              )}
              title="When on, the same Skip-empty / Min-conf filters above are applied to the lyrics fed to scene and character prompt generation, so generated prompts match what you export."
            >
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={promptFilterSettings.enabled}
                  onChange={(e) => {
                    void setPromptFilterSettings({
                      enabled: e.target.checked,
                      skip_empty: excludeEmptyCues,
                      min_confidence_enabled: useMinConfidence,
                      min_confidence: minConfidence,
                    });
                  }}
                  className="h-3 w-3 accent-primary cursor-pointer"
                />
                <span className={cn("text-[10px] uppercase tracking-wide", promptFilterSettings.enabled ? "text-primary" : "text-muted-foreground")}>
                  Apply to prompts
                </span>
              </label>
              {promptFilterSettings.enabled && (
                <button
                  type="button"
                  onClick={() => void setPromptFilterSettings({
                    enabled: true,
                    skip_empty: excludeEmptyCues,
                    min_confidence_enabled: useMinConfidence,
                    min_confidence: minConfidence,
                  })}
                  className="text-[10px] font-mono text-foreground/70 hover:text-foreground underline-offset-2 hover:underline"
                  title="Snapshot the current Skip-empty / Min-conf settings to the project so scene + character generation use them."
                >
                  sync
                </button>
              )}
            </div>
            <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wide transition-colors",
                    activePreset
                      ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                      : "border-border bg-background/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                  title="Save and apply filter presets across projects and export formats"
                >
                  <Bookmark className="h-3 w-3" />
                  <span>Presets</span>
                  {activePreset && (
                    <span className="normal-case tracking-normal text-foreground/80 max-w-[120px] truncate">
                      · {activePreset.name}{activePresetDirty ? "*" : ""}
                    </span>
                  )}
                  {!activePreset && filterPresets.length > 0 && (
                    <span className="font-mono tabular-nums text-foreground/70">({filterPresets.length})</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b border-border">
                  <div className="text-xs font-semibold text-foreground">Export filter presets</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Saves Skip-empty and Min-conf. Shared across projects and CSV / VTT / SRT / JSON.
                  </div>
                </div>
                <div className="p-3 border-b border-border space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Save current as preset</div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveCurrentAsPreset();
                        }
                      }}
                      placeholder="Preset name…"
                      className="flex-1 h-7 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                      maxLength={48}
                    />
                    <Button size="sm" variant="default" onClick={saveCurrentAsPreset} className="h-7 gap-1 text-[11px] px-2">
                      <BookmarkPlus className="h-3 w-3" /> Save
                    </Button>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    empty:{excludeEmptyCues ? "on" : "off"} · conf:{useMinConfidence ? `${(minConfidence * 100).toFixed(0)}%` : "off"}
                  </div>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="p-2">
                    {filterPresets.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground text-center py-4">No saved presets yet.</div>
                    ) : (
                      <ul className="space-y-1">
                        {filterPresets.map((p) => {
                          const isActive = p.id === activePresetId;
                          return (
                            <li
                              key={p.id}
                              className={cn(
                                "flex items-center gap-2 rounded px-2 py-1.5 text-[11px] group",
                                isActive ? "bg-primary/10 border border-primary/40" : "hover:bg-muted/40 border border-transparent"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => applyPreset(p)}
                                className="flex-1 min-w-0 text-left"
                                title="Apply this preset"
                              >
                                <div className={cn("font-medium truncate", isActive ? "text-primary" : "text-foreground")}>
                                  {p.name}{isActive && activePresetDirty ? " *" : ""}
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground">
                                  empty:{p.excludeEmptyCues ? "on" : "off"} · conf:{p.useMinConfidence ? `${(p.minConfidence * 100).toFixed(0)}%` : "off"}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => deletePreset(p.id)}
                                className="opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                                title="Delete preset"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            {(excludeEmptyCues || useMinConfidence) && excludedBreakdown.total > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 transition-colors"
                    title="Click to see which cues were excluded by your filters"
                  >
                    <Filter className="h-3 w-3" />
                    <span className="font-semibold">{excludedBreakdown.total}</span> excluded
                    {excludedBreakdown.empties.length > 0 && (
                      <span className="text-muted-foreground normal-case tracking-normal">
                        · {excludedBreakdown.empties.length} empty
                      </span>
                    )}
                    {excludedBreakdown.lowConf.length > 0 && (
                      <span className="text-muted-foreground normal-case tracking-normal">
                        · {excludedBreakdown.lowConf.length} low&nbsp;conf
                      </span>
                    )}
                    {excludedBreakdown.both.length > 0 && (
                      <span className="text-muted-foreground normal-case tracking-normal">
                        · {excludedBreakdown.both.length} both
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" align="start">
                  <div className="p-3 border-b border-border">
                    <div className="text-xs font-semibold text-foreground">Excluded cues breakdown</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {excludedBreakdown.total} of {excludedBreakdown.inRange} in-range row{excludedBreakdown.inRange === 1 ? "" : "s"} removed by active filters.
                    </div>
                  </div>
                  <ScrollArea className="max-h-72">
                    <div className="p-3 space-y-3 text-[11px]">
                      {[
                        { key: "empty", label: "Skip empty", color: "text-amber-600 dark:text-amber-400", rows: excludedBreakdown.empties, hint: "Line text is blank after trimming." },
                        { key: "conf", label: `Min conf < ${(minConfidence * 100).toFixed(0)}%`, color: "text-rose-600 dark:text-rose-400", rows: excludedBreakdown.lowConf, hint: "Average word confidence below threshold (or missing)." },
                        { key: "both", label: "Blocked by both", color: "text-fuchsia-600 dark:text-fuchsia-400", rows: excludedBreakdown.both, hint: "Empty text AND below confidence threshold." },
                      ].filter((g) => g.rows.length > 0).map((g) => {
                        const samples = g.rows.slice(0, 5);
                        return (
                          <div key={g.key}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={cn("font-semibold uppercase tracking-wide", g.color)}>{g.label}</span>
                              <span className="text-muted-foreground font-mono tabular-nums">{g.rows.length}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mb-1">{g.hint}</div>
                            <ul className="space-y-1">
                              {samples.map((r) => {
                                const line = exportSide === "newer" ? (r.n ?? r.o) : exportSide === "older" ? (r.o ?? r.n) : (r.o ?? r.n);
                                const text = (line?.text ?? "").trim();
                                const start = line?.start_sec;
                                const conf = line?.confidence;
                                return (
                                  <li key={r.idx} className="flex items-start gap-2 rounded bg-muted/30 px-2 py-1">
                                    <span className="font-mono tabular-nums text-muted-foreground shrink-0">#{r.idx + 1}</span>
                                    <span className="font-mono tabular-nums text-muted-foreground shrink-0">{start != null ? `${start.toFixed(2)}s` : "—"}</span>
                                    <span className="flex-1 truncate text-foreground/80" title={text || "(empty)"}>
                                      {text ? text : <span className="italic text-muted-foreground">(empty)</span>}
                                    </span>
                                    {conf != null && (
                                      <span className="font-mono tabular-nums text-muted-foreground shrink-0">{(conf * 100).toFixed(0)}%</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {g.rows.length > samples.length && (
                              <div className="text-[10px] text-muted-foreground mt-1 italic">
                                +{g.rows.length - samples.length} more not shown
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
            {/* Export side toggle */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 px-2 py-1 text-xs">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Export</span>
              {(["both", "older", "newer"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setExportSide(s)}
                  className={`h-6 px-2 rounded text-[10px] uppercase tracking-wide transition-colors ${
                    exportSide === s
                      ? s === "older"
                        ? "bg-destructive/20 text-destructive font-semibold"
                        : s === "newer"
                          ? "bg-success/20 text-success font-semibold"
                          : "bg-primary/20 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                  title={s === "both" ? "Download both versions" : `Download only the ${s} version`}
                >
                  {s === "both" ? "Both" : s === "older" ? `v${older.version_number} older` : `v${newer.version_number} newer`}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={downloadJSON} className="gap-1.5 text-xs">
              <FileJson className="h-3.5 w-3.5" /> JSON
            </Button>
            <Button size="sm" variant="outline" onClick={copyJSON} className="gap-1.5 text-xs" title="Copy JSON summary to clipboard">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1.5 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCsvPreviewOpen(true)}
              className="gap-1.5 text-xs"
              title="Preview the first and last rows of the CSV before downloading"
              disabled={!exportPayload}
            >
              <TableProperties className="h-3.5 w-3.5" /> Preview CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Default the side to whichever the export will include.
                if (exportSide === "older") setSubPreviewSide("older");
                else if (exportSide === "newer") setSubPreviewSide("newer");
                setSubPreviewOpen(true);
              }}
              className="gap-1.5 text-xs"
              title="Preview the first and last cues exactly as they'll appear in the VTT/SRT file"
              disabled={!older && !newer}
            >
              <Captions className="h-3.5 w-3.5" /> Preview VTT/SRT
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadManifest}
              className="gap-1.5 text-xs"
              title="Download a manifest JSON describing project, range, mode, and exact cue/row counts"
              disabled={!older || !newer}
            >
              <FileJson className="h-3.5 w-3.5" /> Manifest
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadSubtitles("vtt")}
              className="gap-1.5 text-xs"
              title={exportSide === "both" ? "Download WebVTT subtitle files for both versions" : `Download WebVTT subtitle file for ${exportSide} version`}
            >
              <Download className="h-3.5 w-3.5" /> VTT{exportSide === "both" ? " (×2)" : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadSubtitles("srt")}
              className="gap-1.5 text-xs"
              title={exportSide === "both" ? "Download SRT subtitle files for both versions" : `Download SRT subtitle file for ${exportSide} version`}
            >
              <Download className="h-3.5 w-3.5" /> SRT{exportSide === "both" ? " (×2)" : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadZip("vtt")}
              className="gap-1.5 text-xs"
              title={exportSide === "both" ? "Download both VTT files in a ZIP" : `Download ${exportSide} VTT file in a ZIP`}
            >
              <FileArchive className="h-3.5 w-3.5" /> ZIP VTT
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadZip("srt")}
              className="gap-1.5 text-xs"
              title={exportSide === "both" ? "Download both SRT files in a ZIP" : `Download ${exportSide} SRT file in a ZIP`}
            >
              <FileArchive className="h-3.5 w-3.5" /> ZIP SRT
            </Button>
            <label className="flex items-center gap-1.5 cursor-pointer select-none ml-1" title="Verify generated file cue/row counts against preview before download finishes">
              <input
                type="checkbox"
                checked={validateExports}
                onChange={(e) => setValidateExports(e.target.checked)}
                className="h-3 w-3 accent-primary cursor-pointer"
              />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Validate</span>
            </label>
            {lastValidation && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-mono",
                  lastValidation.ok
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
                )}
                title={lastValidation.checks
                  .map((c) => `${c.name}: ${c.actual}/${c.expected} ${c.ok ? "OK" : "MISMATCH"}`)
                  .join("\n")}
              >
                {lastValidation.ok ? "✓" : "✗"} {lastValidation.label}
              </span>
            )}
          </div>
        )}

        {!loading && older && newer && (
          <div className="rounded-md border border-border bg-background/40">
            <button
              type="button"
              onClick={() => setNamingOpen((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors"
              title={namingOpen ? "Collapse filename options" : "Expand filename options"}
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Filename</span>
                <code className="text-[10px] font-mono text-foreground/80 truncate max-w-[420px]">
                  {buildFilename(exportSide === "both" ? "json" : "csv")}.{exportSide === "both" ? "json" : "csv"}
                </code>
              </span>
              <span className="text-[10px] text-muted-foreground">{namingOpen ? "▾" : "▸"}</span>
            </button>
            {namingOpen && (
              <div className="px-3 pb-2 pt-1 border-t border-border/60 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground w-14 shrink-0">Prefix</label>
                  <input
                    type="text"
                    value={filenamePrefix}
                    onChange={(e) => setFilenamePrefix(e.target.value)}
                    placeholder="transcript"
                    maxLength={50}
                    className="flex-1 h-7 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={nameIncludeProject}
                      onChange={(e) => setNameIncludeProject(e.target.checked)}
                      className="h-3 w-3 accent-primary cursor-pointer"
                      disabled={!projectSlug}
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Project{projectSlug ? "" : " (none)"}
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={nameIncludeVersion}
                      onChange={(e) => setNameIncludeVersion(e.target.checked)}
                      className="h-3 w-3 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Version/side</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={nameIncludeRange}
                      onChange={(e) => setNameIncludeRange(e.target.checked)}
                      className="h-3 w-3 accent-primary cursor-pointer"
                      disabled={!activeRange}
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Range{activeRange ? "" : " (off)"}
                    </span>
                  </label>
                </div>
                <div className="space-y-0.5 text-[10px] font-mono text-muted-foreground">
                  <div>JSON: <span className="text-foreground/80">{buildFilename("json")}.json</span></div>
                  <div>CSV: <span className="text-foreground/80">{buildFilename("csv")}.csv</span></div>
                  {(exportSide === "both" || exportSide === "older") && (
                    <div>VTT older: <span className="text-foreground/80">{buildFilename("subtitle-single", { side: "older" })}.vtt</span></div>
                  )}
                  {(exportSide === "both" || exportSide === "newer") && (
                    <div>VTT newer: <span className="text-foreground/80">{buildFilename("subtitle-single", { side: "newer" })}.vtt</span></div>
                  )}
                  <div>ZIP: <span className="text-foreground/80">{buildFilename("zip", { kind: "vtt" })}.zip</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && older && newer && (
          <div className="rounded-md border border-border bg-background/40">
            <button
              type="button"
              onClick={() => setRangePreviewOpen((v) => !v)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors"
              title={rangePreviewOpen ? "Collapse export preview" : "Expand export preview"}
            >
              {rangePreviewOpen ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-primary" />}
              <span className="text-foreground">Export preview</span>
              {exportSide !== "both" && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide", exportSide === "older" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
                  {exportSide} only
                </span>
              )}
              <span className="ml-auto font-mono tabular-nums text-[10px] text-muted-foreground flex items-center gap-2">
                <span>{filteredTimingRows.length} line{filteredTimingRows.length === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>{csvRowCount} CSV row{csvRowCount === 1 ? "" : "s"}</span>
                {exportSide !== "newer" && (
                  <>
                    <span>·</span>
                    <span>{cuesInRange.older} older cue{cuesInRange.older === 1 ? "" : "s"}</span>
                  </>
                )}
                {exportSide !== "older" && (
                  <>
                    <span>·</span>
                    <span>{cuesInRange.newer} newer cue{cuesInRange.newer === 1 ? "" : "s"}</span>
                  </>
                )}
                {activeRange && (
                  <span>· {fmt(activeRange.start)} → {Number.isFinite(activeRange.end) ? fmt(activeRange.end) : "end"}</span>
                )}
              </span>
            </button>
            {rangePreviewOpen && (
              <div className="max-h-40 overflow-y-auto border-t border-border">
                {filteredTimingRows.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No lines match the current range filter.
                  </div>
                ) : (
                  <table className="w-full text-[11px] font-mono">
                    <thead className="sticky top-0 bg-background/90 backdrop-blur z-10">
                      <tr className="text-muted-foreground text-[10px] uppercase tracking-wide border-b border-border/50">
                        <th className="text-left px-3 py-1 w-8">#</th>
                        {exportSide !== "newer" && <th className="text-left px-2 py-1">Older</th>}
                        {exportSide !== "older" && <th className="text-left px-2 py-1">Newer</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTimingRows.map((r) => (
                        <tr key={r.idx} className="border-t border-border/40">
                          <td className="px-3 py-1 text-muted-foreground align-top">{r.idx}</td>
                          {exportSide !== "newer" && (
                            <td className="px-2 py-1 align-top">
                              {r.o ? (
                                <div>
                                  <span className="tabular-nums text-muted-foreground">{fmt(r.o.start_sec)} → {fmt(r.o.end_sec)}</span>
                                  <span className={cn("block truncate text-foreground/80", exportSide === "older" ? "max-w-[360px]" : "max-w-[220px]")} title={r.o.text}>{r.o.text}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">—</span>
                              )}
                            </td>
                          )}
                          {exportSide !== "older" && (
                            <td className="px-2 py-1 align-top">
                              {r.n ? (
                                <div>
                                  <span className="tabular-nums text-muted-foreground">{fmt(r.n.start_sec)} → {fmt(r.n.end_sec)}</span>
                                  <span className={cn("block truncate text-foreground/80", exportSide === "newer" ? "max-w-[360px]" : "max-w-[220px]")} title={r.n.text}>
                                    {r.textChanged && r.o ? (
                                      <>
                                        <span className="bg-destructive/15 text-destructive rounded-sm px-0.5 line-through">{r.o.text}</span>{" "}
                                        <span className="bg-success/15 text-success rounded-sm px-0.5">{r.n.text}</span>
                                      </>
                                    ) : (
                                      r.n.text
                                    )}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!loading && left && right && (
          <Tabs defaultValue="text">
            <TabsList>
              <TabsTrigger value="text" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Text</TabsTrigger>
              <TabsTrigger value="timing" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Timing</TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-background/40">
                  <div className="border-b border-border px-3 py-2 text-xs font-medium flex items-center justify-between">
                    <span>{leftLabel ?? `v${older?.version_number}`} (older)</span>
                    <span className="text-muted-foreground">{older ? new Date(older.updated_at).toLocaleString() : ""}</span>
                  </div>
                  {playingOlderLine && (
                    <div className="border-b border-border bg-destructive/10 px-3 py-1.5 text-[11px] flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                      </span>
                      <span className="font-mono tabular-nums text-destructive">line {playingOlderLine.line_index}</span>
                      <span className="truncate text-foreground/90">{playingOlderLine.text}</span>
                    </div>
                  )}
                  <ScrollArea className="h-[60vh]">
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed font-mono">
                      {older?.text ? renderSide("older") : <span className="text-muted-foreground">(empty)</span>}
                    </div>
                  </ScrollArea>
                </div>
                <div className="rounded-md border border-border bg-background/40">
                  <div className="border-b border-border px-3 py-2 text-xs font-medium flex items-center justify-between">
                    <span>{rightLabel ?? `v${newer?.version_number}`} (newer)</span>
                    <span className="text-muted-foreground">{newer ? new Date(newer.updated_at).toLocaleString() : ""}</span>
                  </div>
                  {playingNewerLine && (
                    <div className="border-b border-border bg-success/10 px-3 py-1.5 text-[11px] flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                      </span>
                      <span className="font-mono tabular-nums text-success">line {playingNewerLine.line_index}</span>
                      <span className="truncate text-foreground/90">{playingNewerLine.text}</span>
                    </div>
                  )}
                  <ScrollArea className="h-[60vh]">
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed font-mono">
                      {newer?.text ? renderSide("newer") : <span className="text-muted-foreground">(empty)</span>}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>


            <TabsContent value="timing">
              <div className="rounded-md border border-border bg-background/40">
                <div className="border-b border-border px-3 py-2 text-xs flex items-center justify-between flex-wrap gap-2">
                  <span className="font-medium">Per-line timing</span>
                  <span className="text-muted-foreground">
                    <span className="text-primary">{timingSummary.shifted}</span> shifted ·{" "}
                    <span className="text-success">+{timingSummary.added}</span> added ·{" "}
                    <span className="text-destructive">−{timingSummary.removed}</span> removed ·{" "}
                    {timingSummary.textEdits} text edits
                  </span>
                </div>
                <div className="border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3 flex-wrap">
                  <span className="font-medium uppercase tracking-wide">Δ severity:</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-1 w-1 rounded-full bg-primary" /> minor (&lt;0.2s)</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-1 w-2 rounded-full bg-warning" /> moderate (&lt;0.5s)</span>
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" /> major (≥0.5s)</span>
                </div>
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-background/80 backdrop-blur">
                      <tr className="text-muted-foreground text-[10px] uppercase tracking-wide">
                        <th className="text-left px-3 py-2 w-10">#</th>
                        <th className="text-left px-2 py-2">Older start → end</th>
                        <th className="text-left px-2 py-2">Newer start → end</th>
                        <th className="text-right px-2 py-2 w-20">Δ start</th>
                        <th className="text-right px-2 py-2 w-20">Δ end</th>
                        <th className="text-right px-2 py-2 w-20">Δ dur</th>
                        <th className="text-left px-3 py-2">Text</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timingRows.map((r) => {
                        const status = !r.o ? "added" : !r.n ? "removed" : (r.dStart || r.dEnd || r.textChanged) ? "changed" : "equal";
                        const isActive = activeLineIdx === r.idx;
                        const olderPlaying = !!(playingOlderLine && r.o && playingOlderLine.id === r.o.id);
                        const newerPlaying = !!(playingNewerLine && r.n && playingNewerLine.id === r.n.id);
                        const anyPlaying = olderPlaying || newerPlaying;
                        const rowCls =
                          status === "added" ? "bg-success/5" :
                          status === "removed" ? "bg-destructive/5" :
                          status === "changed" ? "bg-primary/5" : "";
                        const activeCls = isActive ? "ring-1 ring-inset ring-primary/40 bg-primary/5" : "";
                        const playingCls = anyPlaying ? "ring-2 ring-inset ring-primary/70 bg-primary/10 animate-pulse" : "";
                        const dCls = (d: number | null) =>
                          d == null ? "text-muted-foreground" :
                          d === 0 ? "text-muted-foreground" :
                          d > 0 ? "text-warning" : "text-primary";
                        const dStr = (d: number | null) =>
                          d == null ? "—" : d === 0 ? "0.00s" : `${d > 0 ? "+" : ""}${d.toFixed(2)}s`;
                        const DeltaCell = ({ d }: { d: number | null }) => {
                          const s = severityBar(d);
                          return (
                            <div className="flex items-center justify-end gap-1.5">
                              {s.width > 0 && (
                                <div className={`h-1.5 rounded-full ${s.color}`} style={{ width: `${Math.max(4, s.width * 0.28)}px`, minWidth: 4, maxWidth: 28 }} title={`Severity: ${s.label} (${Math.abs(d ?? 0).toFixed(2)}s)`} />
                              )}
                              <span className={dCls(d)}>{dStr(d)}</span>
                            </div>
                          );
                        };
                        const onRowClick = () => {
                          if (r.n?.start_sec != null) {
                            playFrom(r.n.start_sec, "newer", r.idx);
                          } else if (r.o?.start_sec != null) {
                            playFrom(r.o.start_sec, "older", r.idx);
                          }
                        };
                        const stop = (e: React.MouseEvent) => e.stopPropagation();
                        return (
                          <tr
                            key={r.idx}
                            data-playing={anyPlaying ? "true" : undefined}
                            className={`border-t border-border/50 cursor-pointer transition-colors hover:bg-muted/30 ${rowCls} ${activeCls} ${playingCls}`}
                            onClick={onRowClick}
                          >
                            <td className="px-3 py-1.5 text-muted-foreground select-none">{r.idx}</td>
                            <td className="px-2 py-1.5" onClick={stop}>
                              {r.o ? (
                                <div
                                  className="flex items-center gap-1.5 cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (r.o!.start_sec != null) playFrom(r.o!.start_sec, "older", r.idx);
                                  }}
                                  title={audioUrl ? `Jump to older start ${fmt(r.o.start_sec)}` : ""}
                                >
                                  {audioUrl && r.o.start_sec != null && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        playFrom(r.o!.start_sec!, "older", r.idx);
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-destructive/20 text-destructive"
                                      title={`Play older from ${fmt(r.o.start_sec)}`}
                                    >
                                      <Play className="h-3 w-3" />
                                    </button>
                                  )}
                                  <span className={isActive && activeSide === "older" ? "text-destructive font-medium" : ""}>{fmt(r.o.start_sec)} → {fmt(r.o.end_sec)}</span>
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1.5" onClick={stop}>
                              {r.n ? (
                                <div
                                  className="flex items-center gap-1.5 cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (r.n!.start_sec != null) playFrom(r.n!.start_sec, "newer", r.idx);
                                  }}
                                  title={audioUrl ? `Jump to newer start ${fmt(r.n.start_sec)}` : ""}
                                >
                                  {audioUrl && r.n.start_sec != null && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        playFrom(r.n!.start_sec!, "newer", r.idx);
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-success/20 text-success"
                                      title={`Play newer from ${fmt(r.n.start_sec)}`}
                                    >
                                      <Play className="h-3 w-3" />
                                    </button>
                                  )}
                                  <span className={isActive && activeSide === "newer" ? "text-success font-medium" : ""}>{fmt(r.n.start_sec)} → {fmt(r.n.end_sec)}</span>
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right select-none"><DeltaCell d={r.dStart} /></td>
                            <td className="px-2 py-1.5 text-right select-none"><DeltaCell d={r.dEnd} /></td>
                            <td className="px-2 py-1.5 text-right select-none"><DeltaCell d={r.dDur} /></td>
                            <td className="px-3 py-1.5 truncate max-w-[280px] select-none" title={r.n?.text ?? r.o?.text ?? ""}>
                              {r.textChanged && r.o && r.n ? (
                                <span>
                                  <span className="bg-destructive/15 text-destructive rounded-sm px-0.5 line-through">{r.o.text}</span>{" "}
                                  <span className="bg-success/15 text-success rounded-sm px-0.5">{r.n.text}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{r.n?.text ?? r.o?.text ?? ""}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {timingRows.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No lines to compare.</td></tr>
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
      <Sheet open={csvPreviewOpen} onOpenChange={setCsvPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-3 overflow-hidden">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <TableProperties className="h-4 w-4 text-primary" /> CSV preview
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide", exportSide === "older" ? "bg-destructive/15 text-destructive" : exportSide === "newer" ? "bg-success/15 text-success" : "bg-secondary text-foreground")}>
                {exportSide}
              </span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              First and last {csvPreviewN} of {(() => { const b = buildCsv(); return b ? b.dataRows.length : 0; })()} data rows for the current range and export mode.
              {activeRange && (
                <> Range: <span className="font-mono">{fmt(activeRange.start)} → {Number.isFinite(activeRange.end) ? fmt(activeRange.end) : "end"}</span>.</>
              )}
            </SheetDescription>
          </SheetHeader>
          {(() => {
            const built = buildCsv();
            if (!built) {
              return <div className="text-xs text-muted-foreground py-6 text-center">No data available.</div>;
            }
            const total = built.dataRows.length;
            const n = Math.max(1, Math.min(csvPreviewN, total));
            const headerCells = built.headerLine.split(",");
            const splitRow = (row: string) => {
              // CSV splitter that respects double-quoted fields.
              const out: string[] = [];
              let cur = "";
              let inQ = false;
              for (let i = 0; i < row.length; i++) {
                const ch = row[i];
                if (ch === '"') {
                  if (inQ && row[i + 1] === '"') { cur += '"'; i++; }
                  else inQ = !inQ;
                } else if (ch === "," && !inQ) {
                  out.push(cur); cur = "";
                } else cur += ch;
              }
              out.push(cur);
              return out;
            };
            const showAll = total <= n * 2;
            const head = showAll ? built.dataRows : built.dataRows.slice(0, n);
            const tail = showAll ? [] : built.dataRows.slice(-n);
            const skipped = showAll ? 0 : total - head.length - tail.length;
            const renderRow = (row: string, label: string | number) => {
              const cells = splitRow(row);
              return (
                <tr key={label} className="border-t border-border/40 align-top">
                  <td className="px-2 py-1 text-[10px] text-muted-foreground font-mono">{label}</td>
                  {cells.map((c, i) => (
                    <td key={i} className="px-2 py-1 text-[11px] font-mono text-foreground/80 max-w-[220px] truncate" title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              );
            };
            return (
              <>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <label className="flex items-center gap-1.5">
                    <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Rows each end</span>
                    <input
                      type="number"
                      min={1}
                      max={total > 0 ? total : 100}
                      value={csvPreviewN}
                      onChange={(e) => setCsvPreviewN(Math.max(1, Math.min(total > 0 ? total : 100, Number(e.target.value) || 1)))}
                      className="h-7 w-16 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <div className="flex items-center gap-1" role="group" aria-label="Quick row counts">
                    {[5, 10, 25, 50].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCsvPreviewN(n)}
                        disabled={total > 0 && n > total}
                        className={cn(
                          "h-6 px-2 rounded text-[10px] font-mono tabular-nums transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                          csvPreviewN === n
                            ? "bg-primary/20 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCsvPreviewN(Math.max(1, total))}
                      disabled={total === 0}
                      className={cn(
                        "h-6 px-2 rounded text-[10px] uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        total > 0 && csvPreviewN >= total
                          ? "bg-primary/20 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      )}
                      title="Show every row in the preview"
                    >
                      All
                    </button>
                  </div>
                  <span className="text-muted-foreground">
                    Total: <span className="font-mono text-foreground">{total}</span> · Meta: <span className="font-mono text-foreground">{built.metaRows.length}</span> · Summary: <span className="font-mono text-foreground">{built.summaryRows.length}</span>
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto gap-1.5 text-xs" onClick={downloadCSV} disabled={!exportPayload}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
                <div className="flex-1 overflow-auto rounded border border-border">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
                      <tr className="text-muted-foreground text-[10px] uppercase tracking-wide border-b border-border">
                        <th className="text-left px-2 py-1 w-10">#</th>
                        {headerCells.map((h, i) => (
                          <th key={i} className="text-left px-2 py-1 font-mono normal-case">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {head.map((r, i) => renderRow(r, i + 1))}
                      {skipped > 0 && (
                        <tr className="border-t border-border/40 bg-muted/30">
                          <td colSpan={headerCells.length + 1} className="px-2 py-1.5 text-center text-[10px] text-muted-foreground italic">
                            … {skipped} row{skipped === 1 ? "" : "s"} hidden …
                          </td>
                        </tr>
                      )}
                      {tail.map((r, i) => renderRow(r, total - tail.length + i + 1))}
                      {total === 0 && (
                        <tr><td colSpan={headerCells.length + 1} className="px-2 py-3 text-center text-xs text-muted-foreground">No rows match.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {(built.metaRows.length > 0 || built.summaryRows.length > 0) && (
                  <details className="text-[11px] font-mono rounded border border-border bg-background/40 px-2 py-1.5">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Meta &amp; summary rows</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-foreground/70">
{[...built.metaRows, built.metaRows.length ? "" : null, ...built.summaryRows].filter((x) => x !== null).join("\n")}
                    </pre>
                  </details>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
      <Sheet open={subPreviewOpen} onOpenChange={setSubPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-3 overflow-hidden">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <Captions className="h-4 w-4 text-primary" /> {subPreviewFormat.toUpperCase()} preview
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide", subPreviewSide === "older" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
                {subPreviewSide === "older" ? `v${older?.version_number ?? "?"} older` : `v${newer?.version_number ?? "?"} newer`}
              </span>
              {(() => {
                const off = offsetFor(subPreviewSide);
                return (
                  <span
                    className={cn(
                      "text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full",
                      Math.abs(off) < 1e-6 ? "bg-muted/50 text-muted-foreground" : "bg-primary/15 text-primary"
                    )}
                    title="Offset applied to every preview timestamp before export"
                  >
                    offset {off >= 0 ? "+" : ""}{off.toFixed(3)}s
                  </span>
                );
              })()}
            </SheetTitle>
            <SheetDescription className="text-xs">
              First and last {subPreviewN} cues exactly as they'll appear in the {subPreviewFormat.toUpperCase()} file after filtering. Timestamps include the {subPreviewSide} side offset of <span className="font-mono">{(() => { const o = offsetFor(subPreviewSide); return `${o >= 0 ? "+" : ""}${o.toFixed(3)}s`; })()}</span>.
              {activeRange && (
                <> Range: <span className="font-mono">{fmt(activeRange.start)} → {Number.isFinite(activeRange.end) ? fmt(activeRange.end) : "end"}</span>.</>
              )}
            </SheetDescription>
          </SheetHeader>
          {(() => {
            const cues = buildSubtitlePreviewCues(subPreviewSide);
            const total = cues.length;
            const n = Math.max(1, Math.min(subPreviewN, total));
            const showAll = total <= n * 2;
            const head = showAll ? cues : cues.slice(0, n);
            const tail = showAll ? [] : cues.slice(-n);
            const skipped = showAll ? 0 : total - head.length - tail.length;
            const confTone = (c: number | null) => {
              if (c == null) return "text-muted-foreground";
              if (c >= 0.85) return "text-success";
              if (c >= 0.65) return "text-amber-600 dark:text-amber-400";
              return "text-destructive";
            };
            const renderCue = (c: typeof cues[number]) => (
              <div key={`${c.idx}-${c.lineIndex}`} className={cn("rounded border border-border/60 bg-background/40 p-2 font-mono text-[11px] space-y-0.5", selectedCueIds.has(c.idx) && subPreviewSelectMode ? "ring-1 ring-primary/40" : "")}>
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-2">
                    {subPreviewSelectMode && (
                      <input
                        type="checkbox"
                        checked={selectedCueIds.has(c.idx)}
                        onChange={(e) => {
                          setSelectedCueIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.idx);
                            else next.delete(c.idx);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5 accent-primary cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <span className="text-primary font-semibold">#{c.idx}</span>
                    <span className="ml-2">line {c.lineIndex}</span>
                  </span>
                  {showCueConfidence && (
                    <span className={cn("tabular-nums", confTone(c.confidence))} title={c.confidence == null ? "No per-word confidence data" : "Average word confidence"}>
                      {c.confidence == null ? "no confidence" : `${(c.confidence * 100).toFixed(0)}%`}
                    </span>
                  )}
                </div>
                {subPreviewFormat === "srt" && <div className="text-muted-foreground">{c.idx}</div>}
                <div
                  className="text-foreground/80"
                  title={`raw ${c.baseStart.toFixed(3)}s → ${c.baseEnd.toFixed(3)}s · offset ${c.offset >= 0 ? "+" : ""}${c.offset.toFixed(3)}s · side ${subPreviewSide}`}
                >
                  {formatTimestamp(c.start, subPreviewFormat)} {"-->"} {formatTimestamp(c.end, subPreviewFormat)}
                  {Math.abs(c.offset) > 1e-6 && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      (raw {c.baseStart.toFixed(3)}–{c.baseEnd.toFixed(3)}s)
                    </span>
                  )}
                </div>
                <div className="text-foreground whitespace-pre-wrap break-words">{c.text}</div>
              </div>
            );
            return (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 px-1 py-0.5">
                    {(["vtt", "srt"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setSubPreviewFormat(f)}
                        className={cn(
                          "h-6 px-2 rounded text-[10px] uppercase tracking-wide transition-colors",
                          subPreviewFormat === f ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 px-1 py-0.5">
                    {(["older", "newer"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSubPreviewSide(s)}
                        className={cn(
                          "h-6 px-2 rounded text-[10px] uppercase tracking-wide transition-colors",
                          subPreviewSide === s
                            ? s === "older" ? "bg-destructive/20 text-destructive font-semibold" : "bg-success/20 text-success font-semibold"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {s === "older" ? `v${older?.version_number ?? "?"}` : `v${newer?.version_number ?? "?"}`}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5">
                    <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Cues each end</span>
                    <input
                      type="number"
                      min={1}
                      max={total > 0 ? total : 50}
                      value={subPreviewN}
                      onChange={(e) => setSubPreviewN(Math.max(1, Math.min(total > 0 ? total : 50, Number(e.target.value) || 1)))}
                      className="h-7 w-14 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <div className="flex items-center gap-1" role="group" aria-label="Quick cue counts">
                    {[5, 10, 25, 50].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSubPreviewN(n)}
                        disabled={total > 0 && n > total}
                        className={cn(
                          "h-6 px-2 rounded text-[10px] font-mono tabular-nums transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                          subPreviewN === n
                            ? "bg-primary/20 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSubPreviewN(Math.max(1, total))}
                      disabled={total === 0}
                      className={cn(
                        "h-6 px-2 rounded text-[10px] uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        total > 0 && subPreviewN >= total
                          ? "bg-primary/20 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      )}
                      title="Show every cue in the preview"
                    >
                      All
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Display average word confidence per cue when available; label missing data explicitly">
                    <input
                      type="checkbox"
                      checked={showCueConfidence}
                      onChange={(e) => setShowCueConfidence(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border border-border accent-primary"
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Show confidence</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Enable checkboxes to select individual cues">
                    <input
                      type="checkbox"
                      checked={subPreviewSelectMode}
                      onChange={(e) => {
                        setSubPreviewSelectMode(e.target.checked);
                        if (!e.target.checked) setSelectedCueIds(new Set());
                      }}
                      className="h-3.5 w-3.5 rounded border border-border accent-primary"
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Select cues</span>
                  </label>
                  {subPreviewSelectMode && selectedCueIds.size > 0 && (
                    <span className="text-[10px] text-primary font-medium">
                      {selectedCueIds.size} selected
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Total: <span className="font-mono text-foreground">{total}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto gap-1.5 text-xs"
                    onClick={() => downloadSubtitles(subPreviewFormat)}
                    disabled={total === 0}
                  >
                    <Download className="h-3.5 w-3.5" /> Download {subPreviewFormat.toUpperCase()}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs"
                    onClick={() => copySubtitles(subPreviewSide, subPreviewFormat)}
                    disabled={total === 0}
                  >
                    {copiedSub ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSub ? "Copied" : "Copy"}
                  </Button>
                  {subPreviewSelectMode && (
                    <Button
                      size="sm"
                      variant={selectedCueIds.size > 0 ? "default" : "ghost"}
                      className="gap-1.5 text-xs"
                      onClick={() => copySelectedSubtitles(subPreviewSide, subPreviewFormat)}
                      disabled={selectedCueIds.size === 0}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy {selectedCueIds.size > 0 ? `${selectedCueIds.size}` : ""} selected
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-auto rounded border border-border p-2 space-y-2">
                  {total === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-6">
                      No cues match the current range and filters.
                    </div>
                  ) : (
                    <>
                      {head.map(renderCue)}
                      {skipped > 0 && (
                        <div className="text-center text-[10px] text-muted-foreground italic py-1">
                          … {skipped} cue{skipped === 1 ? "" : "s"} hidden …
                        </div>
                      )}
                      {tail.map(renderCue)}
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </Dialog>

  );
}
