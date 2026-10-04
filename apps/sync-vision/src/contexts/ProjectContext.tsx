import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resignUrlsBatch } from "@/lib/resign-urls";
import { recordPerf, STEP_LABELS } from "@/lib/perf";
import {
  type PromptFilterSettings,
  DEFAULT_PROMPT_FILTER_SETTINGS,
  normalisePromptFilterSettings,
} from "@/lib/prompt-filter";
import {
  type TrackDetails,
  type TrackDetailAdjustments,
  type TrackDetailIssues,
  DEFAULT_TRACK_DETAILS,
  normaliseTrackDetails,
  describeTrackDetailAdjustments,
} from "@/lib/track-details";
import { groupLyricLinesIntoSegments } from "@/lib/segment-rehydration";

/** Parse "M:SS" or "MM:SS" to seconds */
function parseTimeToSec(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return 0;
}

export interface TranscriptionResult {
  text: string;
  words: Array<{ text: string; start: number; end: number; confidence?: number }>;
  audio_events: Array<{ type: string; start: number; end: number }>;
  quality: {
    has_content: boolean;
    has_timestamps: boolean;
    word_count: number;
    char_count: number;
    coverage_ratio?: number;
    coverage_warning?: boolean;
    still_looped?: boolean;
    used_fallback?: boolean;
    // Phase 1 consensus fields — populated in "best" mode when the secondary
    // ASR runs alongside the primary.
    provider_agreement?: number;
    secondary_model?: string;
    secondary_word_count?: number;
    hallucination_risk?: boolean;
    hallucination_terms?: string[];
    final_status?: "good" | "rescued" | "needs_review" | "failed";
  };
}

export interface VerificationResult {
  verified_lyrics: string;
  bpm: number;
  music_key: string;
  tempo_feel: string;
  mood: string;
  energy: string;
  instruments: string[];
  confidence_lyrics: number;
  confidence_bpm: number;
  confidence_instruments: number;
  flagged_issues: Array<{ word: string; issue: string; suggestion?: string }>;
  corrections_made: string[];
  lyric_suggestions?: Array<{ span: string; suggested: string; reason: string; confidence: number }>;
  pass_1: string;
  pass_2: string;
  pass_3: string;
  fallback?: boolean;
  ai_credits_exhausted?: boolean;
  cached?: boolean;
  cache_debug?: {
    mode: string;
    model: string;
    content_hash: string;
    hit_count?: number;
    created_at?: string;
    last_used_at?: string;
    source: "hit" | "store";
  };
}

export interface CharacterConcept {
  label: string;
  name: string;
  description: string;
  outfit: string;
  vibe: string;
  visual_prompt: string;
  imageUrl?: string;
  videoUrl?: string;
  animating?: boolean;
  recalledFromGallery?: boolean;
}

export type SectionType = "intro" | "verse" | "pre-chorus" | "chorus" | "post-chorus" | "bridge" | "interlude" | "outro";

export interface AudioSegment {
  index: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  lyrics?: string;
  transcription?: TranscriptionResult | null;
}

export interface Scene {
  scene_number: number;
  section_type?: SectionType;
  section_index?: number;
  lyric_segment: string;
  time_start: string;
  time_end: string;
  mood: string;
  location: string;
  camera_style: string;
  action_description: string;
  visual_prompt: string;
  imageUrl?: string;
  generatingImage?: boolean;
  videoUrl?: string;
  videoQuality?: "preview" | "hd" | "upscaled";
  generatingVideo?: boolean;
  /** Provider request id (fal request_id) used for status/response polling. */
  videoRequestId?: string;
  /** Database render_jobs id used for DB-first status reads and cancellation. */
  videoJobId?: string;
  videoStatusUrl?: string;
  videoResponseUrl?: string;
  isAroll?: boolean;
  lipSyncVideoUrl?: string;
  lipSyncGenerating?: boolean;
  lipSyncStatusUrl?: string;
  lipSyncResponseUrl?: string;
  lipSyncJobId?: string;
  enhancedVideoUrl?: string;
  enhancing?: boolean;
  enhanceStatusUrl?: string;
  enhanceResponseUrl?: string;
  enhanceJobId?: string;
  segmentIndex?: number;
  segmentAudioPath?: string;
  segmentAudioUrl?: string;
  trackingId?: string;
  recalled?: boolean;
  genre?: string;
  demeanour?: string;
  broll_prompt?: string;
  is_broll?: boolean;
  /** Phase: shot-direction enrichment from generate-storylines. */
  emotion?: string;
  pacing?: string;
  shot_notes?: Array<{
    at_sec: number;
    until_sec?: number;
    lyric?: string;
    shot: string;
    emotion?: string;
  }>;
}

export type TranscriptLockStatus = "unlocked" | "locked" | "verified";
export type TranscriptQualityStatus = "unknown" | "good" | "needs_review" | "failed";
export type SourceOfTruth = "asr" | "verified_reference" | "visual_ocr" | "manual";

export interface AlignmentMetricsState {
  line_similarity?: number;
  coverage_ratio?: number;
  hallucinated_terms?: string[];
  missing_reference_lines?: string[];
  forbidden_phrase_hits?: string[];
  downgrade_reasons?: string[];
  confidence_pct?: number;
  status?: TranscriptQualityStatus;
}

interface ProjectContextType {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  audioUrl: string | null;
  setAudioUrl: (u: string | null) => void;
  transcription: TranscriptionResult | null;
  setTranscription: (t: TranscriptionResult | null) => void;
  verification: VerificationResult | null;
  setVerification: (v: VerificationResult | null) => void;
  currentStep: number;
  setCurrentStep: (s: number | ((prev: number) => number)) => void;
  characterConcepts: CharacterConcept[];
  setCharacterConcepts: (c: CharacterConcept[]) => void;
  selectedCharacterIndex: number | null;
  setSelectedCharacterIndex: (i: number | null) => void;
  characterConfirmed: boolean;
  setCharacterConfirmed: (c: boolean) => void;
  scenes: Scene[];
  setScenes: (s: Scene[] | ((prev: Scene[]) => Scene[])) => void;
  characterStyle: "animated" | "realistic";
  setCharacterStyle: (s: "animated" | "realistic") => void;
  isolatedVocalsUrl: string | null;
  setIsolatedVocalsUrl: (u: string | null) => void;
  activeTranscriptVersionId: string | null;
  setActiveTranscriptVersionId: (id: string | null) => void;
  loadingProject: boolean;
  audioSegments: AudioSegment[];
  setAudioSegments: (s: AudioSegment[]) => void;
  segmentsReady: boolean;
  setSegmentsReady: (b: boolean) => void;
  savedSceneIndices: number[];
  setSavedSceneIndices: (s: number[] | ((prev: number[]) => number[])) => void;
  refreshProject: () => Promise<void>;
  pendingCharacterRegen: { id: string; name: string; imageUrl: string; description?: string; vibe?: string; outfit?: string } | null;
  setPendingCharacterRegen: (c: { id: string; name: string; imageUrl: string; description?: string; vibe?: string; outfit?: string } | null) => void;
  pendingStoryboardGen: boolean;
  setPendingStoryboardGen: (b: boolean) => void;
  // VERIFIED_LYRICS_LOCK — transcript trust layer
  referenceTranscript: string | null;
  setReferenceTranscript: (s: string | null) => void;
  transcriptLockStatus: TranscriptLockStatus;
  setTranscriptLockStatus: (s: TranscriptLockStatus) => void;
  transcriptQualityStatus: TranscriptQualityStatus;
  setTranscriptQualityStatus: (s: TranscriptQualityStatus) => void;
  sourceOfTruth: SourceOfTruth;
  setSourceOfTruth: (s: SourceOfTruth) => void;
  alignmentMetrics: AlignmentMetricsState | null;
  setAlignmentMetrics: (m: AlignmentMetricsState | null) => void;
  /** Auto B-Roll plan keyed by segment index. Applied during scene generation. */
  brollPlan: Record<number, { is_broll: boolean; broll_prompt?: string; reason?: string }>;
  setBrollPlan: (p: Record<number, { is_broll: boolean; broll_prompt?: string; reason?: string }>) => void;
  /** When enabled, transcript export filters also shape the lyrics fed to
   *  scene/storyboard and character prompt generation. Persisted on projects. */
  promptFilterSettings: PromptFilterSettings;
  setPromptFilterSettings: (s: PromptFilterSettings) => Promise<void>;
  /** Free-form track metadata captured on the Upload step, threaded into
   *  storyline + scene-image prompts. Persisted on projects.track_details. */
  trackDetails: TrackDetails;
  setTrackDetails: (d: TrackDetails) => Promise<void>;
  /** Non-blocking sanitisation notes for the currently-loaded track_details
   *  (e.g. "vertical" coerced to "9:16", visual_style trimmed). Cleared
   *  when the user saves an already-normalised value. */
  trackDetailAdjustments: TrackDetailAdjustments;
  /** Server-reported rejection messages from generate-storylines /
   *  generate-scene-image when they refuse a malformed aspect_ratio or
   *  visual_style. Displayed in the storyboard editor and blocks Generate
   *  until the user fixes the Upload form. Cleared on successful invoke. */
  serverTrackDetailIssues: TrackDetailIssues;
  setServerTrackDetailIssues: (i: TrackDetailIssues) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children, initialProjectId }: { children: ReactNode; initialProjectId?: string }) {
  const { user } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioFilePathRef = useRef<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [currentStep, setCurrentStepRaw] = useState(0);
  const stepEnteredAtRef = useRef<number>(performance.now());

  // Persist current_step to DB whenever it changes (debounced via callback)
  const setCurrentStep = useCallback((s: number | ((prev: number) => number)) => {
    setCurrentStepRaw((prev) => {
      const next = typeof s === "function" ? s(prev) : s;
      if (next !== prev) {
        // Telemetry: time spent on previous step
        const elapsed = performance.now() - stepEnteredAtRef.current;
        stepEnteredAtRef.current = performance.now();
        const fromLabel = STEP_LABELS[prev];
        if (fromLabel && elapsed > 0) {
          void recordPerf({
            step: fromLabel,
            action: "step_dwell",
            duration_ms: elapsed,
            project_id: projectId ?? null,
            metadata: { from: prev, to: next },
          });
        }
        if (projectId) {
          supabase.from("projects").update({ current_step: next }).eq("id", projectId).then();
        }
      }
      return next;
    });
  }, [projectId]);
  const [characterConcepts, setCharacterConcepts] = useState<CharacterConcept[]>([]);
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null);
  const [characterConfirmed, setCharacterConfirmed] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characterStyle, setCharacterStyle] = useState<"animated" | "realistic">("realistic");
  const [isolatedVocalsUrl, setIsolatedVocalsUrl] = useState<string | null>(null);
  const [activeTranscriptVersionId, setActiveTranscriptVersionId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(!!initialProjectId);
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [segmentsReady, setSegmentsReady] = useState(false);
  const [savedSceneIndices, setSavedSceneIndices] = useState<number[]>([]);
  const [pendingCharacterRegen, setPendingCharacterRegen] = useState<{ id: string; name: string; imageUrl: string; description?: string; vibe?: string; outfit?: string } | null>(null);
  const [pendingStoryboardGen, setPendingStoryboardGen] = useState(false);
  const [referenceTranscript, setReferenceTranscript] = useState<string | null>(null);
  const [transcriptLockStatus, setTranscriptLockStatus] = useState<TranscriptLockStatus>("unlocked");
  const [transcriptQualityStatus, setTranscriptQualityStatus] = useState<TranscriptQualityStatus>("unknown");
  const [sourceOfTruth, setSourceOfTruth] = useState<SourceOfTruth>("asr");
  const [alignmentMetrics, setAlignmentMetrics] = useState<AlignmentMetricsState | null>(null);
  const [brollPlan, setBrollPlan] = useState<Record<number, { is_broll: boolean; broll_prompt?: string; reason?: string }>>({});
  const [promptFilterSettings, setPromptFilterSettingsState] = useState<PromptFilterSettings>({ ...DEFAULT_PROMPT_FILTER_SETTINGS });
  const setPromptFilterSettings = useCallback(async (next: PromptFilterSettings) => {
    setPromptFilterSettingsState(next);
    const pid = projectId;
    if (!pid) return;
    try {
      await supabase.from("projects").update({ prompt_filter_settings: next as any }).eq("id", pid);
    } catch (err) {
      console.warn("[ProjectContext] failed to persist prompt_filter_settings:", err);
    }
  }, [projectId]);
  const [trackDetails, setTrackDetailsState] = useState<TrackDetails>({ ...DEFAULT_TRACK_DETAILS });
  const [trackDetailAdjustments, setTrackDetailAdjustments] = useState<TrackDetailAdjustments>({});
  const [serverTrackDetailIssues, setServerTrackDetailIssues] = useState<TrackDetailIssues>({});
  const setTrackDetails = useCallback(async (next: TrackDetails) => {
    setTrackDetailsState(next);
    // Value coming in is already sanitised — nothing was silently rewritten.
    setTrackDetailAdjustments({});
    const pid = projectId;
    if (!pid) return;
    try {
      await supabase.from("projects").update({ track_details: next as any }).eq("id", pid);
    } catch (err) {
      console.warn("[ProjectContext] failed to persist track_details:", err);
    }
  }, [projectId]);
  const loadProject = useCallback(async (isRefresh = false) => {
    const pid = projectId || initialProjectId;
    if (!pid || !user) return;

    // Only show loading spinner on initial load, not refresh
    if (!isRefresh) setLoadingProject(true);
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("*")
        .eq("id", pid)
        .eq("user_id", user.id)
        .single();

      if (!project) { if (!isRefresh) setLoadingProject(false); return; }

      setProjectId(project.id);

      if (project.file_path) {
        audioFilePathRef.current = project.file_path;
        const { data: signedData } = await supabase.storage
          .from("media-uploads")
          .createSignedUrl(project.file_path, 3600);
        if (signedData?.signedUrl) setAudioUrl(signedData.signedUrl);
      }

      // Hydrate VERIFIED_LYRICS_LOCK state from the projects row
      const p: any = project;
      if (p.reference_transcript) setReferenceTranscript(p.reference_transcript);
      if (p.transcript_lock_status) setTranscriptLockStatus(p.transcript_lock_status as TranscriptLockStatus);
      if (p.transcript_quality_status) setTranscriptQualityStatus(p.transcript_quality_status as TranscriptQualityStatus);
      if (p.source_of_truth) setSourceOfTruth(p.source_of_truth as SourceOfTruth);
      if (p.alignment_metrics && typeof p.alignment_metrics === "object") setAlignmentMetrics(p.alignment_metrics as AlignmentMetricsState);
      setPromptFilterSettingsState(normalisePromptFilterSettings(p.prompt_filter_settings));
      setTrackDetailsState(normaliseTrackDetails(p.track_details));
      // Capture sanitisation adjustments from the *raw* persisted payload
      // so the storyboard summary can flag defaulted / coerced fields.
      const rawTd = (p.track_details ?? {}) as Record<string, unknown>;
      setTrackDetailAdjustments(describeTrackDetailAdjustments({
        aspect_ratio: rawTd.aspect_ratio,
        visual_style: rawTd.visual_style,
      }));

      const { data: activeVersion } = await supabase
        .from("transcript_versions")
        .select("id, raw_payload")
        .eq("project_id", pid)
        .in("status", ["active", "accepted"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (activeVersion) {
        setActiveTranscriptVersionId(activeVersion.id);
        // Rehydrate transcription from persisted raw_payload
        const payload = activeVersion.raw_payload as any;
        if (payload?.text && payload?.words) {
          setTranscription({
            text: payload.text,
            words: payload.words || [],
            audio_events: payload.audio_events || [],
            quality: payload.quality || { has_content: true, has_timestamps: true, word_count: 0, char_count: 0 },
          });
        }
      }

      // Rehydrate verification: prefer project fields, fall back to transcript_version raw_payload
      if (project.lyrics || project.bpm) {
        setVerification({
          verified_lyrics: project.lyrics || "",
          bpm: project.bpm || 0,
          music_key: project.music_key || "",
          tempo_feel: "",
          mood: project.mood || "",
          energy: project.energy || "",
          instruments: project.instruments || [],
          confidence_lyrics: 1, confidence_bpm: 1, confidence_instruments: 1,
          flagged_issues: [], corrections_made: [],
          pass_1: "", pass_2: "", pass_3: "",
        });
      } else if (activeVersion) {
        // Try to reconstruct verification from raw_payload verification fields
        const payload = activeVersion.raw_payload as any;
        let backfillVerification: VerificationResult | null = null;
        if (payload?.verified_lyrics || payload?.verification) {
          const v = payload.verification || payload;
          backfillVerification = {
            verified_lyrics: v.verified_lyrics || payload.text || "",
            bpm: v.bpm || 0,
            music_key: v.music_key || "",
            tempo_feel: v.tempo_feel || "",
            mood: v.mood || "",
            energy: v.energy || "",
            instruments: v.instruments || [],
            confidence_lyrics: v.confidence_lyrics || 1,
            confidence_bpm: v.confidence_bpm || 1,
            confidence_instruments: v.confidence_instruments || 1,
            flagged_issues: v.flagged_issues || [],
            corrections_made: v.corrections_made || [],
            pass_1: v.pass_1 || "", pass_2: v.pass_2 || "", pass_3: v.pass_3 || "",
          };
        } else if (payload?.text) {
          backfillVerification = {
            verified_lyrics: payload.text,
            bpm: 0, music_key: "", tempo_feel: "",
            mood: "energetic", energy: "high",
            instruments: [],
            confidence_lyrics: 1, confidence_bpm: 0, confidence_instruments: 0,
            flagged_issues: [], corrections_made: [],
            pass_1: "", pass_2: "", pass_3: "",
          };
        }
        if (backfillVerification) {
          setVerification(backfillVerification);
          // Backfill project fields so future loads use the fast path
          supabase.from("projects").update({
            lyrics: backfillVerification.verified_lyrics || null,
            mood: backfillVerification.mood || null,
            energy: backfillVerification.energy || null,
            bpm: backfillVerification.bpm || null,
            music_key: backfillVerification.music_key || null,
            instruments: backfillVerification.instruments?.length ? backfillVerification.instruments : null,
          }).eq("id", pid).then(() => {
            console.log("[ProjectContext] Backfilled project fields from transcript");
          });
        }
      }

      const { data: chars } = await supabase
        .from("characters")
        .select("*")
        .eq("project_id", pid);

      if (chars?.length) {
        const confirmed = chars.find((c) => c.confirmed);
        setCharacterConcepts(
          chars.map((c) => ({
            label: c.name || "Character",
            name: c.name || "",
            description: [c.gender, c.age_range, c.ethnicity].filter(Boolean).join(", "),
            outfit: c.outfit || "",
            vibe: c.vibe || "",
            visual_prompt: c.extra_details || "",
            imageUrl: c.reference_image_url || undefined,
          }))
        );
        if (confirmed) {
          setSelectedCharacterIndex(chars.indexOf(confirmed));
          setCharacterConfirmed(true);
        }
      }

      const { data: dbScenes } = await supabase
        .from("scenes")
        .select("*")
        .eq("project_id", pid)
        .order("scene_number", { ascending: true });

      // Check if scenes are "hollow" (no prompts/lyrics) and need enrichment from render_jobs
      const scenesAreHollow = dbScenes?.length && dbScenes.every(s => !s.visual_prompt && !s.lyric_segment);

      if (dbScenes?.length && !scenesAreHollow) {
        // Re-sign any expired storage signed URLs before setting state
        const allMediaUrls = dbScenes.flatMap((s: any) => [
          s.scene_image_url, s.video_url, s.lipsync_video_url, s.enhanced_video_url, s.segment_audio_url,
        ]);
        const resigned = await resignUrlsBatch(allMediaUrls);
        // Map back: 5 URLs per scene
        const refreshedScenes = dbScenes.map((s: any, i: number) => ({
          ...s,
          scene_image_url: resigned[i * 5] || s.scene_image_url,
          video_url: resigned[i * 5 + 1] || s.video_url,
          lipsync_video_url: resigned[i * 5 + 2] || s.lipsync_video_url,
          enhanced_video_url: resigned[i * 5 + 3] || s.enhanced_video_url,
          segment_audio_url: resigned[i * 5 + 4] || s.segment_audio_url,
        }));

        // On refresh, merge DB data with in-memory state to preserve transient fields
        setScenes(prev => {
          return refreshedScenes.map((s: any) => {
            const sc = s;
            const existing = isRefresh ? prev.find(p => p.scene_number === s.scene_number) : undefined;
            return {
              scene_number: s.scene_number,
              section_type: sc.section_type || undefined,
              section_index: sc.section_index || 1,
              lyric_segment: s.lyric_segment || "",
              time_start: s.time_start || "0:00",
              time_end: s.time_end || "0:00",
              mood: s.mood || "",
              location: s.location || "",
              camera_style: s.camera_style || "",
              action_description: s.action_description || "",
              visual_prompt: s.visual_prompt || "",
              imageUrl: sc.scene_image_url || existing?.imageUrl || undefined,
              // Restore previously-rendered media from the DB on every hydration
              // (initial load AND refresh). URLs are already resigned above, so
              // returning to the project — or coming back from another tab —
              // shouldn't wipe completed videos and force a re-render.
              videoUrl: sc.video_url || (isRefresh ? existing?.videoUrl : undefined) || undefined,
              videoQuality: sc.video_quality || (isRefresh ? existing?.videoQuality : undefined) || undefined,
              lipSyncVideoUrl: sc.lipsync_video_url || (isRefresh ? existing?.lipSyncVideoUrl : undefined) || undefined,
              enhancedVideoUrl: sc.enhanced_video_url || (isRefresh ? existing?.enhancedVideoUrl : undefined) || undefined,
              trackingId: sc.tracking_id || existing?.trackingId || undefined,
              segmentAudioUrl: sc.segment_audio_url || existing?.segmentAudioUrl || undefined,
              segmentAudioPath: sc.segment_audio_path || existing?.segmentAudioPath || undefined,
              is_broll: sc.is_broll === true,
              ...(isRefresh && existing ? {
                generatingImage: existing.generatingImage,
                generatingVideo: existing.generatingVideo,
                videoRequestId: existing.videoRequestId,
                videoJobId: existing.videoJobId,
                videoStatusUrl: existing.videoStatusUrl,
                videoResponseUrl: existing.videoResponseUrl,
                lipSyncGenerating: existing.lipSyncGenerating,
                lipSyncJobId: existing.lipSyncJobId,
                lipSyncStatusUrl: existing.lipSyncStatusUrl,
                lipSyncResponseUrl: existing.lipSyncResponseUrl,
                enhancing: existing.enhancing,
                enhanceJobId: existing.enhanceJobId,
              } : {}),
            };
          });
        });

        // Rehydrate audio segments — prefer lyric_lines (real analysis timestamps) over scene timing
        if (!segmentsReady) {
          // Try lyric_lines first for accurate timestamps
          let realSegments: AudioSegment[] | null = null;
          if (activeVersion) {
            const { data: lyricLinesForSegments } = await supabase
              .from("lyric_lines")
              .select("line_index, text, start_sec, end_sec")
              .eq("transcript_version_id", activeVersion.id)
              .order("line_index", { ascending: true })
              .limit(200);

            if (lyricLinesForSegments?.length && lyricLinesForSegments.some(l => (l.start_sec || 0) > 0 || (l.end_sec || 0) > 0)) {
              // Group lyric lines into segments matching project.segment_count
              const targetCount = project.segment_count || dbScenes.length;
              realSegments = groupLyricLinesIntoSegments(lyricLinesForSegments, targetCount);
            }
          }

          if (realSegments && realSegments.length > 0) {
            setAudioSegments(realSegments);
            setSegmentsReady(true);
            // Also update scene timestamps if they were 0:00
            const scenesNeedTimingFix = dbScenes.some(s => s.time_start === "0:00" && s.time_end === "0:00");
            if (scenesNeedTimingFix && realSegments.length >= dbScenes.length) {
              setScenes(prev => prev.map((s, i) => {
                const seg = realSegments![i];
                if (seg && s.time_start === "0:00" && s.time_end === "0:00") {
                  const ts = `${Math.floor(seg.start_sec / 60)}:${String(Math.floor(seg.start_sec % 60)).padStart(2, "0")}`;
                  const te = `${Math.floor(seg.end_sec / 60)}:${String(Math.floor(seg.end_sec % 60)).padStart(2, "0")}`;
                  return { ...s, time_start: ts, time_end: te };
                }
                return s;
              }));
            }
          } else if (dbScenes.length > 0) {
            // Fallback: rehydrate from scene timing
            const fallbackSegments: AudioSegment[] = dbScenes.map((s, i) => {
              const startSec = parseTimeToSec(s.time_start || "0:00");
              const endSec = parseTimeToSec(s.time_end || "0:00");
              return {
                index: i,
                start_sec: startSec,
                end_sec: endSec > startSec ? endSec : startSec + 10,
                duration_sec: endSec > startSec ? endSec - startSec : 10,
                lyrics: s.lyric_segment || "(Instrumental)",
              };
            });
            setAudioSegments(fallbackSegments);
            setSegmentsReady(true);
          }
        }
      } else if (!isRefresh || scenesAreHollow) {
        // Scenes table is empty or hollow — reconstruct from render_jobs
        const { data: renderJobs } = await supabase
          .from("render_jobs")
          .select("scene_number, output, input, quality, created_at")
          .eq("project_id", pid)
          .eq("user_id", user.id)
          .in("status", ["succeeded", "completed"])
          .order("created_at", { ascending: false })
          .limit(100);

        // Also fetch lyric_lines for lyrics reconstruction
        const { data: lyricLines } = await supabase
          .from("lyric_lines")
          .select("line_index, text, start_sec, end_sec")
          .eq("project_id", pid)
          .order("line_index", { ascending: true })
          .limit(200);

        if (renderJobs?.length) {
          // Build unique scene map (latest render per scene_number)
          const sceneMap = new Map<number, { videoUrl: string; quality: string; prompt: string }>();
          renderJobs.forEach((j: any) => {
            const vUrl = j.output?.video_url || j.output?.video?.url;
            if (vUrl && !sceneMap.has(j.scene_number)) {
              sceneMap.set(j.scene_number, {
                videoUrl: vUrl,
                quality: j.quality || "hd",
                prompt: j.input?.prompt || "",
              });
            }
          });

          // Extract lyric segments — handle nested quotes like Character sings: ""lyrics here""
          const extractLyrics = (prompt: string): string => {
            // Match Character sings: "..." or Character sings: ""..."" (nested quotes)
            const m1 = prompt.match(/Character sings:\s*"+"?([^"]*(?:"[^"]*)*)"+"?/);
            if (m1) {
              // Clean up: remove leading/trailing quotes and extra whitespace
              return m1[1].replace(/^"+|"+$/g, "").replace(/\s+/g, " ").trim();
            }
            // Try "transcribed lyrics: ..."
            const m2 = prompt.match(/transcribed lyrics:\s*"+"?([^"]*(?:"[^"]*)*)"+"?/);
            if (m2) return m2[1].replace(/^"+|"+$/g, "").replace(/\s+/g, " ").trim();
            return "";
          };

          // Extract visual scene description from prompt
          const extractVisual = (prompt: string): string => {
            const match = prompt.match(/VISUAL SCENE:\s*(.*?)(?:TECHNICAL:|$)/s);
            return match ? match[1].trim() : prompt.slice(0, 200);
          };

          // Distribute lyric_lines across scenes evenly if available
          const totalScenes = sceneMap.size;
          const sortedSceneNums = Array.from(sceneMap.keys()).sort((a, b) => a - b);
          const linesPerScene = lyricLines?.length ? Math.ceil(lyricLines.length / totalScenes) : 0;

          const skeletonScenes: Scene[] = sortedSceneNums.map((sceneNum, idx) => {
            const info = sceneMap.get(sceneNum)!;
            let lyricSegment = extractLyrics(info.prompt);

            // If no lyrics from prompt, use lyric_lines distribution
            if (!lyricSegment && lyricLines?.length && linesPerScene > 0) {
              const startLine = idx * linesPerScene;
              const endLine = Math.min(startLine + linesPerScene, lyricLines.length);
              lyricSegment = lyricLines.slice(startLine, endLine).map(l => l.text).join("\n");
            }

            // Preserve existing video URLs from hollow DB scenes if available
            const existingDbScene = dbScenes?.find(s => s.scene_number === sceneNum);

            return {
              scene_number: sceneNum,
              lyric_segment: lyricSegment,
              time_start: existingDbScene?.time_start || "0:00",
              time_end: existingDbScene?.time_end || "0:00",
              mood: existingDbScene?.mood || "",
              location: existingDbScene?.location || "",
              camera_style: existingDbScene?.camera_style || "",
              action_description: existingDbScene?.action_description || "",
              visual_prompt: extractVisual(info.prompt),
              // Videos are NOT auto-restored — user must manually recall per scene
              videoUrl: undefined,
              videoQuality: undefined,
            };
          });

          if (skeletonScenes.length > 0) {
            setScenes(skeletonScenes);
            // Persist reconstructed scenes
            const rows = skeletonScenes.map(s => ({
              project_id: pid,
              user_id: user.id,
              scene_number: s.scene_number,
              lyric_segment: s.lyric_segment,
              visual_prompt: s.visual_prompt,
              video_url: s.videoUrl || null,
              video_quality: s.videoQuality || null,
            }));
            await supabase.from("scenes").upsert(rows as any, { onConflict: "project_id,user_id,scene_number" });
            console.log(`[ProjectContext] Reconstructed & persisted ${skeletonScenes.length} scenes from render jobs`);
          }
        }
      }

      // Auto-advance step based on available data (only on initial load)
      if (!isRefresh) {
        let inferredStep = project.current_step || 0;
        const hasAudio = !!project.file_path;
        const hasTranscription = !!activeVersion;
        const hasCharacter = !!(chars?.length && chars.some(c => c.confirmed));
        const hasScenes = !!(dbScenes?.length && dbScenes.length > 0);
        const hasVideos = !!(dbScenes?.some(s => s.video_url));

        // Check for generated videos (generation_jobs with output) even if not written back to scenes
        let hasGeneratedVideos = hasVideos;
        if (!hasGeneratedVideos) {
          const { data: genJobs } = await supabase
            .from("generation_jobs")
            .select("id")
            .eq("project_id", pid)
            .not("output_asset_url", "is", null)
            .limit(1);
          hasGeneratedVideos = !!(genJobs?.length);
        }

        // Check for assembly configs (indicates Assembly work done)
        let hasAssemblyConfig = false;
        {
          const { data: assemblies } = await supabase
            .from("assembly_configs")
            .select("id")
            .eq("project_id", pid)
            .limit(1);
          hasAssemblyConfig = !!(assemblies?.length);
        }

        // Check for completed render jobs (indicates Export readiness)
        let hasCompletedRender = false;
        {
          const { data: renders } = await supabase
            .from("render_jobs")
            .select("id")
            .eq("project_id", pid)
            .in("status", ["completed", "succeeded"])
            .limit(1);
          hasCompletedRender = !!(renders?.length);
        }

        // Advance step to match actual progress
        if (hasCompletedRender || hasAssemblyConfig) {
          inferredStep = Math.max(inferredStep, 5); // Export
        } else if (hasGeneratedVideos) {
          inferredStep = Math.max(inferredStep, 4); // Assembly
        } else if (hasScenes && dbScenes!.some(s => s.visual_prompt)) {
          inferredStep = Math.max(inferredStep, 3); // Storyboard
        } else if (hasCharacter) {
          inferredStep = Math.max(inferredStep, 2); // Character
        } else if (hasTranscription || (project.lyrics && project.bpm)) {
          inferredStep = Math.max(inferredStep, 1); // Analysis
        } else if (hasAudio) {
          inferredStep = Math.max(inferredStep, 0); // Upload (but with audio loaded)
        }

        setCurrentStep(inferredStep);
      }
    } finally {
      if (!isRefresh) setLoadingProject(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId, projectId, user]);

  // Load existing project from DB on mount
  useEffect(() => {
    if (initialProjectId && user) loadProject(false);
  }, [initialProjectId, user, loadProject]);

  const refreshProject = useCallback(async () => {
    await loadProject(true);
  }, [loadProject]);

  // Re-sign audio URL before it expires (every 45 minutes for a 1-hour TTL)
  useEffect(() => {
    if (!audioFilePathRef.current) return;
    const timer = setInterval(async () => {
      const filePath = audioFilePathRef.current;
      if (!filePath) return;
      const { data } = await supabase.storage
        .from("media-uploads")
        .createSignedUrl(filePath, 3600);
      if (data?.signedUrl) setAudioUrl(data.signedUrl);
    }, 45 * 60 * 1000); // 45 minutes
    return () => clearInterval(timer);
  }, [projectId]);

  return (
    <ProjectContext.Provider value={{
      projectId, setProjectId,
      file, setFile, audioUrl, setAudioUrl, transcription, setTranscription, verification, setVerification,
      currentStep, setCurrentStep, characterConcepts, setCharacterConcepts,
      selectedCharacterIndex, setSelectedCharacterIndex, characterConfirmed, setCharacterConfirmed,
      scenes, setScenes, characterStyle, setCharacterStyle,
      isolatedVocalsUrl, setIsolatedVocalsUrl,
      activeTranscriptVersionId, setActiveTranscriptVersionId,
      loadingProject, refreshProject,
      audioSegments, setAudioSegments,
      segmentsReady, setSegmentsReady,
      savedSceneIndices, setSavedSceneIndices,
      pendingCharacterRegen, setPendingCharacterRegen,
      pendingStoryboardGen, setPendingStoryboardGen,
      referenceTranscript, setReferenceTranscript,
      transcriptLockStatus, setTranscriptLockStatus,
      transcriptQualityStatus, setTranscriptQualityStatus,
      sourceOfTruth, setSourceOfTruth,
      alignmentMetrics, setAlignmentMetrics,
      brollPlan, setBrollPlan,
      promptFilterSettings, setPromptFilterSettings,
      trackDetails, setTrackDetails, trackDetailAdjustments,
      serverTrackDetailIssues, setServerTrackDetailIssues,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
