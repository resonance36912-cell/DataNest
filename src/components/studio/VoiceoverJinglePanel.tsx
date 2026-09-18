import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Music, Upload, Play, Pause, Trash2, Loader2, Download, Volume2, Sparkles, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { handlePremiumGatePayload } from "@/lib/errorHandlers";

interface AudioTrack {
  id: string;
  label: string;
  type: "voiceover" | "jingle";
  url: string;
  source: "generated" | "uploaded";
  fileName?: string;
}

interface VoiceoverJinglePanelProps {
  isVisible: boolean;
  brief?: {
    headline?: string;
    subheadline?: string;
    callToAction?: string;
    brand?: string;
    tone?: string;
    keyPoints?: string[];
  } | null;
}

type AudioMode = "voiceover" | "jingle";

const VoiceoverJinglePanel = ({ isVisible, brief }: VoiceoverJinglePanelProps) => {
  const [audioMode, setAudioMode] = useState<AudioMode>("voiceover");
  const [script, setScript] = useState("");
  const [manualBrief, setManualBrief] = useState("");
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [isGeneratingJingles, setIsGeneratingJingles] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedJingleId, setSelectedJingleId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const voiceoverUploadRef = useRef<HTMLInputElement>(null);
  const jingleUploadRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const addTrack = useCallback((track: AudioTrack) => {
    setTracks((prev) => [...prev, track]);
  }, []);

  const removeTrack = (id: string) => {
    const audio = audioRefs.current[id];
    if (audio) { audio.pause(); delete audioRefs.current[id]; }
    if (playingId === id) setPlayingId(null);
    if (selectedJingleId === id) setSelectedJingleId(null);
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const togglePlay = (track: AudioTrack) => {
    if (playingId && playingId !== track.id) {
      audioRefs.current[playingId]?.pause();
    }
    let audio = audioRefs.current[track.id];
    if (!audio) {
      audio = new Audio(track.url);
      audio.onended = () => setPlayingId(null);
      audioRefs.current[track.id] = audio;
    }
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
    } else {
      audio.play().catch(() => {});
      setPlayingId(track.id);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "voiceover" | "jingle") => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("audio/")) {
        toast({ title: "Invalid file", description: "Please upload an MP3 or WAV file", variant: "destructive" });
        return;
      }
      const url = URL.createObjectURL(file);
      const newTrack: AudioTrack = {
        id: `${type}-upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: file.name.replace(/\.[^.]+$/, ""),
        type,
        url,
        source: "uploaded",
        fileName: file.name,
      };
      addTrack(newTrack);
      if (type === "jingle") setSelectedJingleId(newTrack.id);
      toast({ title: `${type === "voiceover" ? "Voiceover" : "Jingle"} uploaded`, description: file.name });
    });
    e.target.value = "";
  };

  // Build context from either the passed brief or the manual brief text
  const buildBriefContext = () => {
    // If we have a brief from URL transcription, use it
    if (brief?.headline || brief?.brand || brief?.tone) {
      return [
        brief.headline && `Headline: ${brief.headline}`,
        brief.subheadline && `Subheadline: ${brief.subheadline}`,
        brief.callToAction && `Call to action: ${brief.callToAction}`,
        brief.brand && `Brand: ${brief.brand}`,
        brief.tone && `Tone: ${brief.tone}`,
        brief.keyPoints?.length && `Key points: ${brief.keyPoints.join(", ")}`,
      ].filter(Boolean).join("\n");
    }
    // Otherwise use the manual brief
    return manualBrief.trim();
  };

  const handleAutoGenerateScript = async () => {
    setIsAutoGenerating(true);
    try {
      const context = buildBriefContext();

      const prompt = context
        ? `Write a short, professional voiceover script (30-60 seconds when spoken) for an advertisement based on this brief:\n\n${context}\n\nWrite ONLY the voiceover script text, no stage directions or notes.`
        : "Write a short, professional, generic voiceover script (30-60 seconds when spoken) for a modern brand advertisement. Make it engaging and punchy. Write ONLY the voiceover script text, no stage directions or notes.";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Request failed: ${response.status}`);
      }

      const data = await response.json();
      const generatedScript = data?.script || "";
      if (generatedScript) {
        setScript(generatedScript.trim());
        toast({ title: "Script generated!", description: "Review and edit the script, then generate the voiceover." });
      } else {
        throw new Error("No script returned");
      }
    } catch (err: any) {
      console.error("Auto-generate script error:", err);
      toast({ title: "Script generation failed", description: err.message || "Could not auto-generate script", variant: "destructive" });
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!script.trim()) {
      toast({ title: "Script required", description: "Write or paste a voiceover script first", variant: "destructive" });
      return;
    }
    setIsGeneratingVoiceover(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-voiceover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: script, voiceId: "JBFqnCBsd6RMkjVDRZzb" }),
        }
      );
      if (!response.ok) {
        const ct = response.headers.get("content-type") || "";
        if (response.status === 402 && ct.includes("application/json")) {
          const body = await response.json().catch(() => ({}));
          if (handlePremiumGatePayload(toast, body, "AI voiceover")) {
            setIsGeneratingVoiceover(false);
            return;
          }
        }
        const errText = await response.text();
        throw new Error(errText || `Request failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      addTrack({
        id: `voiceover-${Date.now()}`,
        label: script.slice(0, 40) + (script.length > 40 ? "..." : ""),
        type: "voiceover",
        url,
        source: "generated",
      });
      toast({ title: "Voiceover generated!", description: "Click play to preview" });
    } catch (err: any) {
      console.error("Voiceover generation error:", err);
      toast({ title: "Voiceover failed", description: err.message || "Could not generate voiceover", variant: "destructive" });
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const handleGenerateJingles = async () => {
    setIsGeneratingJingles(true);
    const promptBase = script.trim()
      ? `Create a short jingle/background music inspired by: ${script.slice(0, 200)}`
      : manualBrief.trim()
        ? `Create a short jingle/background music for: ${manualBrief.slice(0, 200)}`
        : "Create a short upbeat advertising jingle, catchy and professional";

    const jinglePrompts = [
      `${promptBase}. Upbeat, energetic, modern commercial feel.`,
      `${promptBase}. Smooth, cinematic, elegant brand music.`,
    ];

    try {
      const results = await Promise.allSettled(
        jinglePrompts.map(async (prompt, i) => {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-jingle`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ prompt, duration: 15 }),
            }
          );
          if (!response.ok) {
            const ct = response.headers.get("content-type") || "";
            if (response.status === 402 && ct.includes("application/json")) {
              const body = await response.json().catch(() => ({}));
              if ((body as any)?.requiresPremium) {
                throw Object.assign(new Error(body.error || "Custom jingles requires Premium"), { __premium: body });
              }
            }
            const errText = await response.text();
            throw new Error(errText || `Request failed: ${response.status}`);
          }
          const blob = await response.blob();
          return { url: URL.createObjectURL(blob), index: i };
        })
      );

      let added = 0;
      let firstId: string | null = null;
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          const id = `jingle-${Date.now()}-${i}`;
          addTrack({
            id,
            label: i === 0 ? "Jingle — Upbeat" : "Jingle — Cinematic",
            type: "jingle",
            url: result.value.url,
            source: "generated",
          });
          if (!firstId) firstId = id;
          added++;
        }
      });

      // Surface a premium-gate failure from any of the parallel results
      const premiumReject = results.find(
        (r) => r.status === "rejected" && (r.reason as any)?.__premium,
      ) as PromiseRejectedResult | undefined;
      if (added === 0 && premiumReject) {
        handlePremiumGatePayload(toast, (premiumReject.reason as any).__premium, "Custom jingles");
      } else if (added > 0) {
        if (firstId) setSelectedJingleId(firstId);
        toast({ title: `${added} jingle${added > 1 ? "s" : ""} generated!`, description: "Click to select your preferred jingle" });
      } else {
        throw new Error("Both jingle generations failed");
      }
    } catch (err: any) {
      console.error("Jingle generation error:", err);
      toast({ title: "Jingle generation failed", description: err.message || "Could not generate jingles", variant: "destructive" });
    } finally {
      setIsGeneratingJingles(false);
    }
  };

  const handleDownloadTrack = async (track: AudioTrack) => {
    try {
      const res = await fetch(track.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${track.label.replace(/[^a-zA-Z0-9-_ ]/g, "")}.mp3`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      await navigator.clipboard.writeText(track.url);
      toast({ title: "Download link copied", description: "Paste the link in a new tab to download the audio." });
    }
  };

  if (!isVisible) return null;

  const voiceovers = tracks.filter((t) => t.type === "voiceover");
  const jingles = tracks.filter((t) => t.type === "jingle");
  const hasBriefFromUrl = !!(brief?.headline || brief?.brand || brief?.tone);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="px-4 pb-4 space-y-3"
    >
      {/* Hidden file inputs */}
      <input ref={voiceoverUploadRef} type="file" accept="audio/mp3,audio/wav,audio/mpeg,audio/wave,audio/x-wav,.mp3,.wav" multiple className="hidden" onChange={(e) => handleFileUpload(e, "voiceover")} />
      <input ref={jingleUploadRef} type="file" accept="audio/mp3,audio/wav,audio/mpeg,audio/wave,audio/x-wav,.mp3,.wav" multiple className="hidden" onChange={(e) => handleFileUpload(e, "jingle")} />

      {/* Toggle: Voice-Over / Jingle */}
      <div className="flex rounded-lg border border-border bg-secondary/50 p-0.5">
        <button
          onClick={() => setAudioMode("voiceover")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            audioMode === "voiceover"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          Voice-Over
        </button>
        <button
          onClick={() => setAudioMode("jingle")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            audioMode === "jingle"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          Jingle / Music
          {selectedJingleId && (
            <span className="text-[8px] bg-primary/20 text-primary px-1 rounded">1</span>
          )}
        </button>
      </div>

      {/* ─── VOICE-OVER TAB ─── */}
      {audioMode === "voiceover" && (
        <div className="space-y-2">
          {/* Content Brief Box (manual) — shown when no URL brief exists */}
          {!hasBriefFromUrl && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Content Brief</span>
                <span className="text-[9px] text-muted-foreground">(no URL transcribed)</span>
              </div>
              <textarea
                value={manualBrief}
                onChange={(e) => setManualBrief(e.target.value)}
                placeholder="Describe your product, brand, target audience, tone, key messages… This helps AI write a better voiceover script."
                className="w-full min-h-[60px] rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-y"
                rows={3}
              />
            </div>
          )}

          {hasBriefFromUrl && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Check className="w-3 h-3 text-primary" />
              Content brief loaded from URL transcription
            </div>
          )}

          {/* Script */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Voice-Over Script</span>
              </div>
              <button
                onClick={() => voiceoverUploadRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="w-3 h-3" />
                Upload MP3/WAV
              </button>
            </div>

            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Type or paste your voiceover script here… or click 'Auto-Generate' to let AI write one."
              className="w-full min-h-[70px] rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-y"
              rows={3}
            />

            <div className="flex gap-2">
              <button
                onClick={handleAutoGenerateScript}
                disabled={isAutoGenerating}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-secondary border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAutoGenerating ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing Script…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 text-primary" /> Auto-Generate Script</>
                )}
              </button>
              <button
                onClick={handleGenerateVoiceover}
                disabled={isGeneratingVoiceover || !script.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingVoiceover ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Volume2 className="w-3.5 h-3.5" /> Generate Voice-Over</>
                )}
              </button>
            </div>
          </div>

          {/* Voiceover tracks */}
          <AnimatePresence>
            {voiceovers.map((track) => (
              <TrackRow key={track.id} track={track} playingId={playingId} onTogglePlay={togglePlay} onDownload={handleDownloadTrack} onRemove={removeTrack} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ─── JINGLE / MUSIC TAB ─── */}
      {audioMode === "jingle" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-medium text-foreground">Jingles</span>
                {selectedJingleId && (
                  <span className="text-[9px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">1 selected</span>
                )}
              </div>
              <button
                onClick={() => jingleUploadRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="w-3 h-3" />
                Upload MP3/WAV
              </button>
            </div>

            <button
              onClick={handleGenerateJingles}
              disabled={isGeneratingJingles}
              className="w-full flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingJingles ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating 2 Jingles…</>
              ) : (
                <><Music className="w-3.5 h-3.5" /> Generate 2 Jingles</>
              )}
            </button>

            {jingles.length > 0 && (
              <p className="text-[10px] text-muted-foreground">Click a jingle to select it for your video:</p>
            )}
          </div>

          {/* Jingle tracks */}
          <AnimatePresence>
            {jingles.map((track) => (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                onClick={() => setSelectedJingleId(track.id)}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors ${
                  selectedJingleId === track.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-background hover:border-muted-foreground/40"
                }`}
              >
                <button onClick={(e) => { e.stopPropagation(); togglePlay(track); }} className="shrink-0 p-1 rounded-md hover:bg-secondary text-accent transition-colors">
                  {playingId === track.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground truncate">{track.label}</p>
                  <p className="text-[9px] text-muted-foreground">{track.source === "uploaded" ? "Uploaded" : "AI Generated"}</p>
                </div>
                {selectedJingleId === track.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                <button onClick={(e) => { e.stopPropagation(); handleDownloadTrack(track); }} className="shrink-0 p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <Download className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }} className="shrink-0 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

/* ── Reusable track row for voiceovers ── */
const TrackRow = ({ track, playingId, onTogglePlay, onDownload, onRemove }: {
  track: AudioTrack;
  playingId: string | null;
  onTogglePlay: (t: AudioTrack) => void;
  onDownload: (t: AudioTrack) => void;
  onRemove: (id: string) => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
  >
    <button onClick={() => onTogglePlay(track)} className="shrink-0 p-1 rounded-md hover:bg-secondary text-primary transition-colors">
      {playingId === track.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
    </button>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-foreground truncate">{track.label}</p>
      <p className="text-[9px] text-muted-foreground">{track.source === "uploaded" ? "Uploaded" : "AI Generated"}</p>
    </div>
    <button onClick={() => onDownload(track)} className="shrink-0 p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
      <Download className="w-3 h-3" />
    </button>
    <button onClick={() => onRemove(track.id)} className="shrink-0 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
      <Trash2 className="w-3 h-3" />
    </button>
  </motion.div>
);

export default VoiceoverJinglePanel;
