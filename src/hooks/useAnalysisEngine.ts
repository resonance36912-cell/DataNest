import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject, VerificationResult, AudioSegment } from "@/contexts/ProjectContext";
import { normalizeTranscript } from "@/lib/transcript-normalizer";
import { extractWaveformPeaks, refineSegmentBoundaries, type WaveformPeakData } from "@/lib/waveform-peaks";
import { snapBoundariesToPhraseEnds } from "@/lib/phrase-snap";
import { getWordText } from "@/lib/performance-classifier";

export function useAnalysisEngine() {
  const {
    file, transcription, setTranscription, verification, setVerification,
    projectId, activeTranscriptVersionId, setActiveTranscriptVersionId,
    audioSegments, setAudioSegments, segmentsReady, setSegmentsReady, audioUrl,
  } = useProject();

  const [lyrics, setLyrics] = useState("");
  const [bpm, setBpm] = useState("");
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [passStatus, setPassStatus] = useState<Record<string, string>>({});
  const [transcriptionRating, setTranscriptionRating] = useState(0);
  const [persisting, setPersisting] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [segmentWarnings, setSegmentWarnings] = useState<string[]>([]);
  const [vocalClassifications, setVocalClassifications] = useState<Record<number, "lead" | "background">>({});
  const [classifying, setClassifying] = useState(false);
  const [peakData, setPeakData] = useState<WaveformPeakData | null>(null);
  const [extractingPeaks, setExtractingPeaks] = useState(false);
  const peakExtractionDone = useRef(false);

  const buildManualVerificationFallback = useCallback((): VerificationResult | null => {
    if (!transcription) return null;
    return {
      verified_lyrics: transcription.text || "",
      bpm: Number(bpm) || 0,
      music_key: "Manual review needed",
      tempo_feel: "Manual review needed",
      mood: "Manual review needed",
      energy: "Manual review needed",
      instruments: [],
      confidence_lyrics: 0,
      confidence_bpm: 0,
      confidence_instruments: 0,
      flagged_issues: [{ word: "AI credits", issue: "Add AI credits to continue automated verification." }],
      corrections_made: ["Automated verification skipped because AI credits are exhausted."],
      pass_1: "failed",
      pass_2: "skipped",
      pass_3: "skipped",
      fallback: true,
      ai_credits_exhausted: true,
    };
  }, [bpm, transcription]);

  // ─── Auto-verify ───
  useEffect(() => {
    if (transcription && !verification && !verifying) runVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcription]);

  // ─── Auto-classify vocals after verification ───
  // Guard against re-firing when `verification` object reference changes
  // but the underlying lyrics text is identical (avoids spurious AI calls).
  const classifiedLyricsRef = useRef<string | null>(null);
  useEffect(() => {
    const lyricsText = verification?.verified_lyrics;
    if (lyricsText && lyricsText !== classifiedLyricsRef.current && !classifying) {
      classifiedLyricsRef.current = lyricsText;
      classifyVocals(lyricsText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verification?.verified_lyrics]);

  const classifyVocals = useCallback(async (lyricsText: string) => {
    setClassifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const lines = lyricsText.split("\n").filter(l => l.trim()).map((text, i) => ({ index: i, text: text.trim() }));
      if (lines.length === 0) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-vocals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lines }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error("Vocal classification failed:", err);
        toast.error("Vocal classification failed. All lines treated as lead vocals.");
        return;
      }

      const result = await response.json();
      const map: Record<number, "lead" | "background"> = {};
      for (const c of result.classifications || []) {
        map[c.index] = c.type;
      }
      setVocalClassifications(map);
      const bgCount = Object.values(map).filter(v => v === "background").length;
      if (bgCount > 0) {
        toast.success(`Detected ${bgCount} background/adlib line${bgCount !== 1 ? "s" : ""}. Lead vocals isolated for lip-sync.`);
      }
    } catch (err) {
      console.error("Vocal classification error:", err);
    } finally {
      setClassifying(false);
    }
  }, []);

  // ─── Auto-extract waveform peaks when audio is available ───
  useEffect(() => {
    if (audioUrl && !peakData && !extractingPeaks && !peakExtractionDone.current) {
      extractPeaks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, verification]);

  const extractPeaks = useCallback(async () => {
    if (!audioUrl || peakExtractionDone.current) return;
    setExtractingPeaks(true);
    peakExtractionDone.current = true;
    try {
      // Check if peaks are already persisted
      if (projectId) {
        const { data: proj } = await supabase
          .from("projects")
          .select("waveform_peaks")
          .eq("id", projectId)
          .single();
        if (proj?.waveform_peaks) {
          setPeakData(proj.waveform_peaks as unknown as WaveformPeakData);
          console.log("Loaded persisted waveform peaks");
          setExtractingPeaks(false);
          return;
        }
      }

      const data = await extractWaveformPeaks(audioUrl);
      setPeakData(data);

      // Persist to DB
      if (projectId) {
        // Only store peaks and silence_gaps to keep payload small (skip full energy_profile)
        const persistPayload = {
          duration_sec: data.duration_sec,
          sample_rate: data.sample_rate,
          energy_interval_sec: data.energy_interval_sec,
          energy_profile: data.energy_profile,
          peaks: data.peaks,
          silence_gaps: data.silence_gaps,
        };
        await supabase
          .from("projects")
          .update({ waveform_peaks: persistPayload as any })
          .eq("id", projectId);
      }

      toast.success(`Waveform analyzed: ${data.peaks.length} peaks, ${data.silence_gaps.length} silence gaps detected.`);
    } catch (err) {
      console.error("Waveform peak extraction error:", err);
    } finally {
      setExtractingPeaks(false);
    }
  }, [audioUrl, projectId]);

  // ─── Sync lyrics/bpm from verification ───
  useEffect(() => {
    if (verification) { setLyrics(verification.verified_lyrics); setBpm(String(verification.bpm)); }
    else if (transcription) setLyrics(transcription.text);
  }, [verification, transcription]);

  // ─── Auto-persist transcript version ───
  useEffect(() => {
    if (verification && transcription && projectId && !activeTranscriptVersionId && !persisting) persistTranscriptVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verification, transcription, projectId]);

  const persistTranscriptVersion = async () => {
    if (!transcription || !projectId) return;
    setPersisting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;
      const normalized = normalizeTranscript(transcription);

      const { data: version, error: versionError } = await supabase
        .from("transcript_versions")
        .insert({ project_id: projectId, user_id: userId, version_number: 1, type: "raw", status: "active", raw_payload: transcription as any, full_text: normalized.fullText })
        .select("id").single();

      if (versionError || !version) { console.error("Failed to create transcript version:", versionError); return; }

      const lineInserts = normalized.lines.map((line, idx) => ({
        transcript_version_id: version.id, project_id: projectId, user_id: userId,
        line_index: idx, text: line.text, start_sec: line.start_sec, end_sec: line.end_sec,
        duration_sec: line.end_sec != null && line.start_sec != null ? line.end_sec - line.start_sec : null,
      }));

      const { data: insertedLines, error: linesError } = await supabase.from("lyric_lines").insert(lineInserts).select("id, line_index");
      if (linesError) { console.error("Failed to insert lyric lines:", linesError); return; }

      const lineIdMap = new Map<number, string>();
      insertedLines?.forEach((l) => lineIdMap.set(l.line_index, l.id));

      const wordInserts: Array<{ lyric_line_id: string; user_id: string; ordinal_index: number; text: string; start_sec: number; end_sec: number; gap_after: number | null; confidence: number | null }> = [];
      normalized.lines.forEach((line, lineIdx) => {
        const lineId = lineIdMap.get(lineIdx);
        if (!lineId) return;
        line.words.forEach((w, wIdx) => {
          wordInserts.push({ lyric_line_id: lineId, user_id: userId, ordinal_index: wIdx, text: w.text, start_sec: w.start_sec, end_sec: w.end_sec, gap_after: w.gap_after ?? null, confidence: w.confidence ?? null });
        });
      });

      if (wordInserts.length > 0) {
        const { error: wordsError } = await supabase.from("word_tokens").insert(wordInserts);
        if (wordsError) console.error("Failed to insert word tokens:", wordsError);
      }

      setActiveTranscriptVersionId(version.id);
    } catch (err) { console.error("Transcript persistence error:", err); }
    finally { setPersisting(false); }
  };

  const segmentAudio = useCallback(async (opts?: { window?: number; gapThreshold?: number; minLen?: number; maxLen?: number; customBoundaries?: number[] }) => {
    if (!transcription || !file) return;
    const snapWindow = opts?.window ?? 2.0;
    const snapGap = opts?.gapThreshold ?? 0.3;
    const snapMin = opts?.minLen ?? 8;
    const snapMax = opts?.maxLen ?? 10;
    const customBoundaries = opts?.customBoundaries && opts.customBoundaries.length > 0 ? opts.customBoundaries : null;
    setSegmenting(true); setSegmentProgress(10);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in.");

      let totalDuration = 0;
      if (audioUrl) {
        try {
          const audio = new Audio(audioUrl);
          await new Promise<void>((resolve, reject) => {
            audio.onloadedmetadata = () => { totalDuration = audio.duration; resolve(); };
            audio.onerror = () => reject(new Error("Could not load audio"));
            setTimeout(() => resolve(), 5000);
          });
        } catch { /* fallback */ }
      }

      const words = (transcription.words || []).slice().sort((a: any, b: any) => a.start - b.start);

      // Build set of background line texts to filter words from lip-sync segments
      const lyricsLines = (verification?.verified_lyrics || transcription.text || "").split("\n").filter((l: string) => l.trim());
      const bgLineTextsLower = new Set<string>();
      lyricsLines.forEach((line: string, i: number) => {
        if (vocalClassifications[i] === "background") bgLineTextsLower.add(line.trim().toLowerCase());
      });

      let segBoundaries: Array<{ index: number; start_sec: number; end_sec: number; duration_sec: number }>;

      if (customBoundaries) {
        // User-edited boundaries from the preview — bypass server segmentation entirely.
        setSegmentProgress(40);
        setSegmentWarnings([`Using ${customBoundaries.length} manually-edited boundar${customBoundaries.length === 1 ? "y" : "ies"} from the preview.`]);
        const duration = totalDuration > 0 ? totalDuration : (peakData?.duration_sec ?? (customBoundaries[customBoundaries.length - 1] + snapMax));
        const stops = [0, ...customBoundaries.slice().sort((a, b) => a - b), duration];
        segBoundaries = [];
        for (let i = 0; i < stops.length - 1; i++) {
          const start = stops[i];
          const end = stops[i + 1];
          segBoundaries.push({ index: i, start_sec: start, end_sec: end, duration_sec: end - start });
        }
      } else {
        setSegmentProgress(30);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/segment-audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ storage_path: null, project_id: projectId || null, segment_count: totalDuration > 0 ? Math.max(1, Math.ceil(totalDuration / snapMax)) : 20, total_duration_sec: totalDuration > 0 ? totalDuration : undefined }),
        });

        if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "Segmentation failed"); }

        const result = await response.json();
        setSegmentProgress(50); setSegmentWarnings(result.warnings || []);
        segBoundaries = result.segments;

        // Enforce contiguity on raw boundaries — first segment starts at 0, last ends at track duration
        if (segBoundaries.length > 0) {
          segBoundaries[0].start_sec = 0;
          for (let i = 1; i < segBoundaries.length; i++) {
            segBoundaries[i].start_sec = segBoundaries[i - 1].end_sec;
            segBoundaries[i].duration_sec = segBoundaries[i].end_sec - segBoundaries[i].start_sec;
          }
        }

        // Refine boundaries using waveform peaks (shift ±2s to silence/low-energy)
        if (peakData && segBoundaries.length > 1) {
          const refined = refineSegmentBoundaries(segBoundaries, peakData);
          const shiftedCount = refined.filter((s, i) =>
            Math.abs(s.start_sec - segBoundaries[i].start_sec) > 0.1 ||
            Math.abs(s.end_sec - segBoundaries[i].end_sec) > 0.1
          ).length;
          segBoundaries = refined;
          if (shiftedCount > 0) {
            setSegmentWarnings(prev => [...prev, `${shiftedCount} boundary${shiftedCount !== 1 ? " boundaries" : ""} refined to align with audio energy.`]);
          }
        }

        // Phrase-aware snap: nudge boundaries to nearest natural phrase end.
        if (segBoundaries.length > 1 && words.length > 0 && snapWindow > 0) {
          const snapped = snapBoundariesToPhraseEnds(segBoundaries, words as any, {
            window: snapWindow, gapThreshold: snapGap, minLen: snapMin, maxLen: snapMax,
          });
          if (snapped.shifted > 0) {
            segBoundaries = snapped.segments;
            setSegmentWarnings(prev => [...prev, `${snapped.shifted} boundar${snapped.shifted === 1 ? "y" : "ies"} snapped to phrase end for perfect vocal sync.`]);
          }
        }
      }

      const segWordBuckets: string[][] = segBoundaries.map(() => []);

      for (const w of words) {
        const mid = ((w as any).start + (w as any).end) / 2;
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < segBoundaries.length; i++) {
          const seg = segBoundaries[i];
          if (mid >= seg.start_sec && mid < seg.end_sec) { bestIdx = i; bestDist = 0; break; }
          if (i === segBoundaries.length - 1 && mid >= seg.start_sec && mid <= seg.end_sec) { bestIdx = i; bestDist = 0; break; }
          const dist = Math.abs(mid - (seg.start_sec + seg.end_sec) / 2);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        const wordText = getWordText(w);
        if (wordText) segWordBuckets[bestIdx].push(wordText);
      }

      // Filter segment lyrics: remove words that belong to background lines
      const segments: AudioSegment[] = segBoundaries.map((seg: any, i: number) => {
        let segLyrics = segWordBuckets[i].join(" ").trim();
        // If we have classifications, filter out background content from segment lyrics
        if (bgLineTextsLower.size > 0 && segLyrics) {
          const segLyricsLower = segLyrics.toLowerCase();
          for (const bgText of bgLineTextsLower) {
            if (segLyricsLower.includes(bgText)) {
              segLyrics = segLyrics.replace(new RegExp(bgText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
            }
          }
        }
        return {
          index: seg.index, start_sec: seg.start_sec, end_sec: seg.end_sec, duration_sec: seg.duration_sec,
          lyrics: segLyrics || "(Instrumental)",
        };
      });

      // Persist the actual segmentation count. Project hydration uses this
      // value to rebuild the same number of audio segments after a refresh;
      // leaving the schema default (12) collapsed longer tracks and detached
      // their existing scene/video jobs from the intended segment numbers.
      if (projectId) {
        const { error: countError } = await supabase
          .from("projects")
          .update({ segment_count: segments.length })
          .eq("id", projectId);
        if (countError) {
          throw new Error("Audio was segmented, but the segment count could not be saved. Please try again before generating scenes.");
        }
      }

      setSegmentProgress(90); setAudioSegments(segments); setSegmentsReady(true); setSegmentProgress(100);
      toast.success(`Audio segmented into ${segments.length} clips with lyrics assigned!`);
    } catch (err: any) { console.error("Segmentation error:", err); toast.error(err.message || "Failed to segment audio."); }
    finally { setSegmenting(false); }
  }, [transcription, file, audioUrl, projectId, vocalClassifications, verification, peakData, setAudioSegments, setSegmentsReady]);

  const runVerification = useCallback(async () => {
    if (!transcription || !file) return;
    setVerifying(true);
    // Honest progress: pass_1 runs while we await the server; on success we
    // advance to complete. No fake timers that lie about server latency.
    setPassStatus({ pass_1: "running" });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to verify transcription.");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-transcription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transcription: { text: transcription.text, words: transcription.words, audio_events: transcription.audio_events, quality: transcription.quality }, file_name: file.name, project_id: projectId || undefined }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Verification failed" }));
        const message = err.error || `Verification failed (${response.status})`;
        const isCredits = response.status === 402 || /credits?\s*exhausted|add funds|insufficient credits/i.test(message);
        const e: any = new Error(isCredits ? "Add AI credits to continue" : message);
        e.code = isCredits ? "AI_CREDITS_EXHAUSTED" : `HTTP_${response.status}`;
        throw e;
      }

      const result: VerificationResult = await response.json();
      if (result?.fallback && result?.ai_credits_exhausted) {
        setVerification(result);
        setLyrics(result.verified_lyrics || transcription.text);
        setPassStatus({ pass_1: "failed", pass_2: "skipped", pass_3: "skipped" });
        toast.error("Add AI credits to continue", {
          description: "Automated verification paused. Your original transcription is preserved for manual editing.",
          duration: 10000,
          action: {
            label: "Add credits",
            onClick: () => window.open("https://lovable.dev/settings/plans", "_blank", "noopener,noreferrer"),
          },
        });
        return;
      }
      if (!result.verified_lyrics?.trim()) throw new Error("Verification produced empty lyrics");

      setVerification(result);
      setPassStatus({ pass_1: "complete", pass_2: "complete", pass_3: "complete" });
      toast.success(`Verification complete. Lyrics confidence: ${result.confidence_lyrics}%`);
    } catch (err: any) {
      console.error("Verification error:", err);
      if (err?.code === "AI_CREDITS_EXHAUSTED") {
        const fallback = buildManualVerificationFallback();
        if (fallback) {
          setVerification(fallback);
          setLyrics(fallback.verified_lyrics);
        }
        toast.error("Add AI credits to continue", {
          description: "Your workspace AI credits are exhausted. Top up to resume verification — you can still edit lyrics manually in the meantime.",
          duration: 10000,
          action: {
            label: "Add credits",
            onClick: () => window.open("https://lovable.dev/settings/plans", "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.error(err.message || "Verification failed. You can still edit manually.");
      }
      setPassStatus({ pass_1: "failed" });
      if (transcription) setLyrics(transcription.text);
    } finally { setVerifying(false); }
  }, [transcription, file, projectId, setVerification, buildManualVerificationFallback]);

  const handleLyricsSave = useCallback(async () => {
    if (!verification || lyrics === verification.verified_lyrics) { setEditingLyrics(false); return; }
    if (activeTranscriptVersionId && projectId) {
      try {
        const { data: newVersionId, error: forkError } = await supabase.rpc("fork_transcript_version", { p_project_id: projectId, p_source_version_id: activeTranscriptVersionId, p_edits: JSON.stringify([]) });
        if (forkError) { console.error("Fork failed:", forkError); toast.error("Failed to save lyrics as new version."); }
        else if (newVersionId) {
          await supabase.from("transcript_versions").update({ full_text: lyrics } as any).eq("id", newVersionId);
          setActiveTranscriptVersionId(newVersionId);
          toast.success("Lyrics saved as new transcript version.");
        }
      } catch (err) { console.error("Fork error:", err); toast.error("Failed to fork transcript version."); }
    } else { toast.success("Lyrics updated."); }
    setVerification({ ...verification, verified_lyrics: lyrics });
    setEditingLyrics(false);
  }, [verification, lyrics, activeTranscriptVersionId, projectId, setVerification, setActiveTranscriptVersionId]);

  const toggleEditLyrics = useCallback(async () => {
    if (editingLyrics) await handleLyricsSave();
    else setEditingLyrics(true);
  }, [editingLyrics, handleLyricsSave]);

  const updateClassification = useCallback((index: number, type: "lead" | "background") => {
    setVocalClassifications(prev => ({ ...prev, [index]: type }));
  }, []);

  return {
    // Data
    transcription, verification, lyrics, bpm, editingLyrics, verifying, passStatus,
    transcriptionRating, segmenting, segmentProgress, segmentWarnings,
    audioSegments, segmentsReady, activeTranscriptVersionId, projectId,
    vocalClassifications, classifying, peakData, extractingPeaks,
    // Setters
    setLyrics, setBpm, setTranscriptionRating, setPassStatus,
    setTranscription, setVerification, setAudioSegments, setSegmentsReady,
    // Actions
    runVerification, segmentAudio, toggleEditLyrics, updateClassification,
  };
}
