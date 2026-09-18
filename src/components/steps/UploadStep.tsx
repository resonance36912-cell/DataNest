import { useState, useRef, useEffect } from "react";
import { Upload, FileAudio, FileVideo, X, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useProject } from "@/contexts/ProjectContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SaveProgressButton from "@/components/SaveProgressButton";
import ReportCrashDialog from "@/components/ReportCrashDialog";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import { useSmoothedProgressDetailed } from "@/hooks/useSmoothedProgress";
import { ProgressSourceHint } from "@/components/ui/progress-source-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StepProps {
  onNext: () => void;
  onPrev: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const ACCEPTED = [".mp3", ".wav", ".mp4", ".m4a"];

type TranscribeMode = "fast" | "accurate" | "best";

const VISUAL_STYLES = ["Cinematic", "Neon-noir", "Documentary", "Anime", "Retro VHS", "Surreal", "Minimal"];
const MOODS = ["Energetic", "Moody", "Uplifting", "Melancholic", "Dreamy", "Aggressive", "Romantic"];
type AspectRatio = "16:9" | "9:16" | "1:1";

export default function UploadStep({ onNext }: StepProps) {
  const { file, setFile, setTranscription, setAudioUrl, projectId, setProjectId } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // Default to "best" so every new track gets the highest transcription quality automatically.
  const [transcribeMode, setTranscribeMode] = useState<TranscribeMode>("best");
  const [progress, setProgress] = useState(0);
  // Track details captured on the way in — song title flows into project name,
  // the rest is threaded to downstream steps via ProjectContext-adjacent state.
  const [songTitle, setSongTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [visualStyle, setVisualStyle] = useState<string>("Cinematic");
  const [trackMood, setTrackMood] = useState<string>("Energetic");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [pastedLyrics, setPastedLyrics] = useState("");
  // Smoothed display value — feeds the same simulated+real strategy as
  // per-scene video generation so the bar never teleports between waypoints.
  const { value: displayedProgress, source: progressSource, lastRealAt: progressLastRealAt } = useSmoothedProgressDetailed({
    active: analyzing && progress < 100,
    real: progress,
    forceComplete: progress >= 100,
    // Upload+transcribe is shorter than video gen, so use a faster baseline
    // (~45s) and a slightly lower simulated ceiling.
    tau: 45,
    ceiling: 92,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Project creation dialog state
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

  // Auto-show project creation dialog when landing without a project
  useEffect(() => {
    if (!projectId && user && !showProjectDialog) {
      setShowProjectDialog(true);
    }
  }, [projectId, user]);

  const validateFile = (f: File): boolean => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      toast.error("Unsupported file type. Please upload MP3, WAV, or MP4.");
      return false;
    }
    if (f.size > 200 * 1024 * 1024) {
      toast.error("File too large. Maximum 200MB.");
      return false;
    }
    return true;
  };

  const handleFile = (f: File) => {
    console.log("[UploadStep] handleFile()", { name: f.name, size: f.size, type: f.type, projectId });
    if (!validateFile(f)) {
      console.warn("[UploadStep] handleFile() rejected by validateFile");
      return;
    }

    // If no project exists yet, prompt user to create one first
    if (!projectId) {
      console.log("[UploadStep] handleFile() no projectId → opening project dialog");
      // Prefer the user-entered song title; fall back to filename.
      const nameFromFile = f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      setProjectName((songTitle.trim() || nameFromFile));
      setPendingFile(f);
      setShowProjectDialog(true);
      return;
    }

    // Project already exists — attach file directly
    attachFile(f);
  };

  const attachFile = (f: File) => {
    console.log("[UploadStep] attachFile() begin", { name: f.name, size: f.size, type: f.type });
    try {
      setFile(f);
      const objectUrl = URL.createObjectURL(f);
      console.log("[UploadStep] attachFile() created objectURL", objectUrl.slice(0, 80));
      setAudioUrl(objectUrl);
      setTranscription(null);
      console.log("[UploadStep] attachFile() done — file attached to project state");
    } catch (err) {
      console.error("[UploadStep] attachFile() THREW", err);
      toast.error("Failed to attach file — see console for details");
    }
  };

  // Surface any uncaught runtime errors or rejections that happen during this
  // step so the user can capture them when reporting "page crashed".
  useEffect(() => {
    const onErr = (e: ErrorEvent) => console.error("[UploadStep][window.error]", e.message, e.error);
    const onRej = (e: PromiseRejectionEvent) => console.error("[UploadStep][unhandledrejection]", e.reason);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  const handleCreateProject = async () => {
    if (!user) return;
    const name = projectName.trim();
    if (!name) {
      toast.error("Please enter a project name.");
      return;
    }

    setCreatingProject(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name,
          user_id: user.id,
          status: "draft" as const,
          current_step: 0,
          // Persist mood + pasted lyrics on their dedicated columns so
          // ProjectContext hydration + verification bootstrap pick them up.
          mood: trackMood || null,
          lyrics: pastedLyrics.trim() ? pastedLyrics.trim() : null,
          // The rest of the Track Details form lives on its own jsonb so it
          // never collides with `prompt_filter_settings`.
          track_details: {
            song_title: songTitle.trim(),
            artist_name: artistName.trim(),
            visual_style: visualStyle,
            mood: trackMood,
            aspect_ratio: aspectRatio,
            pasted_lyrics: pastedLyrics,
          } as any,
        })
        .select("id")
        .single();

      if (error) throw error;

      setProjectId(data.id);
      setShowProjectDialog(false);

      // Navigate to the new project URL so it persists on refresh
      navigate(`/project/${data.id}`, { replace: true });

      if (pendingFile) {
        attachFile(pendingFile);
        setPendingFile(null);
      }
      toast.success(`Project "${name}" created!`);
    } catch (err: any) {
      toast.error("Failed to create project: " + (err.message || "Unknown error"));
    } finally {
      setCreatingProject(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleAnalyze = async () => {
    if (!file) {
      console.warn("[UploadStep] handleAnalyze() called with no file");
      return;
    }

    const traceId = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const t0 = performance.now();
    const mark = (label: string, extra?: Record<string, unknown>) =>
      console.log(`[UploadStep][${traceId}] +${Math.round(performance.now() - t0)}ms ${label}`, extra ?? "");

    mark("handleAnalyze:start", { name: file.name, size: file.size, type: file.type, projectId });
    setAnalyzing(true);
    setProgress(10);

    try {
      mark("auth:getSession:start");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in to analyze tracks.");

      const userId = session.user.id;
      mark("auth:getSession:ok", { userId });

      // Hash the file (SHA-256) so the edge function can short-circuit on a
      // cache hit. Computed in-browser via SubtleCrypto — no extra round trip.
      let fileHash: string | undefined;
      try {
        const buf = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buf);
        fileHash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        mark("hash:sha256:ok", { hash: fileHash.slice(0, 12) });
      } catch (e) {
        console.warn(`[UploadStep][${traceId}] hash failed (non-fatal)`, e);
      }

      // Step 1: Upload to Supabase Storage
      setProgress(15);
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
      const storagePath = `${userId}/${projectId || "temp"}/${Date.now()}.${ext}`;
      mark("storage:upload:start", { storagePath, sizeMB: +(file.size / 1024 / 1024).toFixed(2) });

      const uploadT0 = performance.now();
      const { error: uploadError } = await supabase.storage
        .from("media-uploads")
        .upload(storagePath, file, { upsert: true });
      if (uploadError) {
        console.error(`[UploadStep][${traceId}] storage:upload:ERROR`, uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      mark("storage:upload:ok", { uploadMs: Math.round(performance.now() - uploadT0) });
      setProgress(30);


      if (projectId) {
        mark("db:projects:update:start");
        const { error: updErr } = await supabase
          .from("projects")
          .update({ file_path: storagePath, file_type: ext })
          .eq("id", projectId)
          .eq("user_id", userId);
        if (updErr) console.warn(`[UploadStep][${traceId}] db:projects:update:warn`, updErr);
        else mark("db:projects:update:ok");
      }

      // Step 2: Transcribe locally on Ealiophin. No hosted AI provider is used.
      const transcribeUrl = "http://127.0.0.1:7864/transcribe";
      mark("transcribe:fetch:start", { url: transcribeUrl, mode: transcribeMode });
      const fetchT0 = performance.now();
      const response = await fetch(transcribeUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": file.name.replace(/[^\x20-\x7E]/g, "_"),
          "X-Mode": transcribeMode,
        },
        body: file,
      });
      mark("transcribe:fetch:headers", {
        status: response.status,
        ok: response.ok,
        fetchMs: Math.round(performance.now() - fetchT0),
      });
      setProgress(60);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[UploadStep][${traceId}] transcribe:fetch:ERROR_BODY`, errText.slice(0, 500));
        let parsed: any = null;
        try { parsed = JSON.parse(errText); } catch { /* not JSON */ }
        throw new Error(parsed?.error || `Transcription failed (${response.status})`);
      }

      mark("transcribe:json:parse:start");
      const transcription = await response.json();
      mark("transcribe:json:parse:ok", {
        hasText: !!transcription?.text,
        textLen: transcription?.text?.length ?? 0,
        words: transcription?.words?.length ?? 0,
        wordCount: transcription?.quality?.word_count,
      });

      if (!transcription.text?.trim()) {
        throw new Error("Transcription returned empty text. Please ensure the file contains speech/lyrics.");
      }
      if (transcription.quality?.word_count < 3) {
        throw new Error("Too few words detected. Please check the audio quality.");
      }

      setProgress(80);
      mark("state:setTranscription:start");
      // Preserve ALL quality fields from the edge function (final_status,
      // hallucination_risk, coverage_ratio, provider_agreement, etc.) so the
      // Verified Lyrics Lock signal chain reaches AnalysisStep + storyboard
      // gates. Previously these were stripped here, silently disabling
      // every downstream quality check.
      const edgeQuality = transcription.quality ?? {};
      const normalized = {
        text: transcription.text,
        words: Array.isArray(transcription.words) ? transcription.words : [],
        audio_events: Array.isArray(transcription.audio_events) ? transcription.audio_events : [],
        quality: {
          ...edgeQuality,
          has_content: edgeQuality.has_content ?? !!transcription.text?.trim(),
          has_timestamps: edgeQuality.has_timestamps ?? ((transcription.words?.length ?? 0) > 0),
          word_count: edgeQuality.word_count ?? transcription.words?.length ?? 0,
          char_count: edgeQuality.char_count ?? transcription.text?.length ?? 0,
        },
      };
      setTranscription(normalized);
      mark("state:setTranscription:done");
      setProgress(100);

      const wc = transcription.quality?.word_count ?? transcription.words?.length ?? 0;
      toast.success(
        transcription.cached
          ? `Reused cached transcription: ${wc} words (instant)`
          : `Transcription complete: ${wc} words detected`
      );


      mark("schedule:onNext (500ms)");
      setTimeout(() => {
        mark("invoke:onNext()");
        try { onNext(); } catch (navErr) {
          console.error(`[UploadStep][${traceId}] onNext THREW`, navErr);
        }
      }, 500);
    } catch (err: any) {
      console.error(`[UploadStep][${traceId}] handleAnalyze:FAILED`, err);
      toast.error(err.message || "Failed to analyze track. Please try again.");
    } finally {
      mark("handleAnalyze:finally");
      setAnalyzing(false);
    }
  };

  const isAudio = file?.name.match(/\.(mp3|wav)$/i);

  return (
    <div className="glass-card p-4 sm:p-8">
      <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Upload Your Track</h2>
      <p className="text-sm text-muted-foreground mb-4 sm:mb-6">
        Drop an MP3, WAV, or M4A. We'll map beats, lyrics, sections, and visual pacing.
      </p>

      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-3 sm:gap-4 rounded-xl border-2 border-dashed p-8 sm:p-16 cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 hover:bg-secondary/50"
          }`}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-7 w-7" />
          </div>
          <div className="text-center">
            <p className="font-medium">Drop an MP3, WAV, or M4A</p>
            <p className="mt-1 text-sm text-muted-foreground">Or click to browse — up to 200MB</p>
          </div>
          <input ref={inputRef} type="file" accept=".mp3,.wav,.mp4,.m4a" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-secondary/30 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {isAudio ? <FileAudio className="h-6 w-6" /> : <FileVideo className="h-6 w-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
            <button onClick={() => { setFile(null); setTranscription(null); }} className="text-muted-foreground hover:text-foreground" disabled={analyzing}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {analyzing && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-end">
                <ProgressSourceHint source={progressSource} lastRealAt={progressLastRealAt} />
              </div>
              <ProcessProgressBar
                progress={displayedProgress}
                active={analyzing}
                label={progress < 20 ? "Preparing..." : progress < 35 ? "Uploading to storage..." : progress < 70 ? "Transcribing locally..." : progress < 100 ? "Processing..." : "Complete!"}
              />
            </div>
          )}
        </div>
      )}

      {/* Track details — captured on the way in, visible once a file is attached */}
      {file && !analyzing && (
        <div className="mt-6 rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">Track details</p>
            <p className="text-[11px] text-muted-foreground">
              A little context sharpens the treatment. All fields are optional but recommended.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Song title</span>
              <Input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="e.g. Neon Rain" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Artist name</span>
              <Input value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="e.g. Aurelia" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visual style</span>
              <select
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {VISUAL_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mood</span>
              <select
                value={trackMood}
                onChange={(e) => setTrackMood(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {MOODS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2 space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aspect ratio</span>
              <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                {(["16:9", "9:16", "1:1"] as AspectRatio[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAspectRatio(r)}
                    aria-pressed={aspectRatio === r}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      aspectRatio === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <label className="sm:col-span-2 space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Paste lyrics (optional)</span>
              <textarea
                value={pastedLyrics}
                onChange={(e) => setPastedLyrics(e.target.value)}
                placeholder="Paste lyrics for better caption timing"
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
        </div>
      )}

      {/* Step 2: Choose transcription quality before transcribing */}
      {file && !analyzing && (
        <div className={`mt-6 rounded-lg border p-4 transition-colors ${transcribeMode ? "border-border/50 bg-card/40" : "border-primary/50 bg-primary/5"}`}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Step 2 · Choose transcription quality</p>
              <p className="text-[11px] text-muted-foreground">Pick a model before we transcribe. This decides accuracy, timing precision, and wall-clock time.</p>
            </div>
            {!transcribeMode && <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">Required</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTranscribeMode("fast")}
              className={`text-left rounded-md border p-2.5 transition-colors ${
                transcribeMode === "fast"
                  ? "border-cyan-500/60 bg-cyan-500/10"
                  : "border-border/40 bg-muted/10 hover:border-border"
              }`}
              aria-pressed={transcribeMode === "fast"}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">Fast</span>
                <span className="text-[10px] text-muted-foreground">~5–15s</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Local Whisper small · greedy decode for fastest GPU pass.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTranscribeMode("accurate")}
              className={`text-left rounded-md border p-2.5 transition-colors ${
                transcribeMode === "accurate"
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : "border-border/40 bg-muted/10 hover:border-border"
              }`}
              aria-pressed={transcribeMode === "accurate"}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">High accuracy</span>
                <span className="text-[10px] text-muted-foreground">~30–60s</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Local Whisper small · 3-beam decode for stronger text fidelity.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTranscribeMode("best")}
              className={`text-left rounded-md border p-2.5 transition-colors ${
                transcribeMode === "best"
                  ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                  : "border-border/40 bg-muted/10 hover:border-border"
              }`}
              aria-pressed={transcribeMode === "best"}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">Studio (best)</span>
                <span className="text-[10px] text-muted-foreground">~60–120s</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Local Whisper small · 5-beam decode with word timestamps for the highest local quality.
              </p>
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SaveProgressButton stepIndex={0} />
          <ReportCrashDialog
            context={{ step: "upload", projectId, fileName: file?.name, fileSize: file?.size }}
          />
        </div>
        <Button onClick={handleAnalyze} disabled={!file || analyzing || !transcribeMode} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          title={transcribeMode ? `Uploads your audio/video, transcribes (${transcribeMode} mode), and extracts lyrics with timestamps.` : "Pick a transcription quality above first."}
        >
          {analyzing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
          ) : (
            <>{transcribeMode ? "Analyze Track" : "Select quality to continue"} <ArrowRight className="h-4 w-4" /></>
          )}
        </Button>
      </div>

      {/* Project Creation Dialog */}
      <Dialog open={showProjectDialog} onOpenChange={(open) => {
        if (!open) {
          // Allow closing — navigate back if no project created yet
          setPendingFile(null);
          setProjectName("");
          setShowProjectDialog(false);
          if (!projectId) {
            navigate("/dashboard");
          }
          return;
        }
        setShowProjectDialog(open);
      }}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => { if (!projectId) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Give your project a name to get started. You'll upload your track next.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g. Summer Vibes Music Video"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              autoFocus
            />
          </div>
          <DialogFooter>
            {projectId && (
              <Button variant="outline" onClick={() => { setShowProjectDialog(false); setPendingFile(null); }}>
                Cancel
              </Button>
            )}
            <Button onClick={handleCreateProject} disabled={creatingProject || !projectName.trim()}>
              {creatingProject ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
