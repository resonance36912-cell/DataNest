import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Music, Wand2, Film, Download, Play, Pause, CheckCircle2, Sparkles, Mic,
} from "lucide-react";

type StepId = "upload" | "analyze" | "character" | "storyboard" | "export";

const STEPS: { id: StepId; icon: typeof Upload; label: string; sub: string }[] = [
  { id: "upload",     icon: Upload,   label: "Upload",     sub: "Track in" },
  { id: "analyze",    icon: Music,    label: "Analyze",    sub: "Beat + lyrics" },
  { id: "character",  icon: Wand2,    label: "Character",  sub: "Consistent look" },
  { id: "storyboard", icon: Film,     label: "Storyboard", sub: "Beat-matched frames" },
  { id: "export",     icon: Download, label: "Export",     sub: "Boards + captions" },
];

const LYRICS = [
  { t: 0.4,  text: "City lights are calling out my name" },
  { t: 1.2,  text: "Neon rivers flow beneath the rain" },
  { t: 2.0,  text: "We move like shadows, chasing every frame" },
  { t: 2.8,  text: "Tonight the skyline learns our name" },
];

// Deterministic pseudo-random bars so SSR/CSR match
const BARS = Array.from({ length: 56 }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  return 0.25 + (seed - Math.floor(seed)) * 0.75;
});

const FRAMES = [
  { hue: 265, label: "S01 · Intro",   note: "Wide skyline, slow push-in" },
  { hue: 295, label: "S02 · Verse",   note: "Rain-soaked alley, neon" },
  { hue: 320, label: "S03 · Pre",     note: "Close-up, rim light" },
  { hue: 340, label: "S04 · Chorus",  note: "Rooftop, arms wide" },
];

export function InteractiveProductPreview() {
  const previewRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<StepId>("upload");
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);
  const [inViewport, setInViewport] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimate = inViewport && pageVisible && !reduceMotion;

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    const node = previewRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInViewport(true);
      return () => document.removeEventListener("visibilitychange", updateVisibility);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { rootMargin: "100px 0px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  // Auto-advance until the user interacts
  useEffect(() => {
    if (!playing || !shouldAnimate) return;
    const id = window.setInterval(() => {
      setActive((cur) => {
        const idx = STEPS.findIndex((s) => s.id === cur);
        return STEPS[(idx + 1) % STEPS.length].id;
      });
    }, 3800);
    return () => window.clearInterval(id);
  }, [playing, shouldAnimate]);

  // Waveform / lyric progress tick
  useEffect(() => {
    if (!shouldAnimate) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % 100), 200);
    return () => window.clearInterval(id);
  }, [shouldAnimate]);

  const progress = useMemo(() => tick / 100, [tick]);

  const handlePick = (id: StepId) => {
    setPlaying(false);
    setActive(id);
  };

  return (
    <section ref={previewRef} className="border-t border-white/5 bg-gradient-to-b from-secondary/20 to-background">
      <div className="container py-20">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-xl">
            <Sparkles className="h-3 w-3 text-accent" /> Try the flow
          </div>
          <h2 className="mt-4 text-3xl font-bold sm:text-4xl">See a track become a storyboard</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Click any step to jump ahead. This is the same pipeline you'll use on your own track.
          </p>
        </div>

        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-card/40 backdrop-blur-xl">
          {/* Stepper */}
          <div className="flex items-stretch border-b border-white/10 bg-background/40">
            {STEPS.map((s, i) => {
              const isActive = s.id === active;
              return (
                <button
                  key={s.id}
                  onClick={() => handlePick(s.id)}
                  className={`group relative flex flex-1 items-center gap-3 px-3 py-4 text-left transition-colors sm:px-5 ${
                    isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all ${
                      isActive
                        ? "bg-primary/20 text-primary shadow-[0_0_20px_-5px_hsl(295_90%_60%/0.7)]"
                        : "bg-white/5 text-muted-foreground"
                    }`}
                  >
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 hidden sm:block">
                    <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      0{i + 1}
                    </div>
                    <div className={`truncate text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </div>
                  </div>
                  {isActive && (
                    <motion.div
                      layoutId="preview-underline"
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                      style={{ background: "var(--gradient-brand)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="relative min-h-[360px] p-6 sm:p-10">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-background/60 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-xl hover:text-foreground"
              >
                {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {playing ? "Auto" : "Paused"}
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                {active === "upload" && <UploadPanel />}
                {active === "analyze" && <AnalyzePanel progress={progress} />}
                {active === "character" && <CharacterPanel />}
                {active === "storyboard" && <StoryboardPanel />}
                {active === "export" && <ExportPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Panels ---------- */

function UploadPanel() {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Step 01</div>
        <h3 className="mt-2 text-2xl font-bold">Drop a track. We handle the rest.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          MP3, WAV or MP4 up to 30MB. Sync Vision reads the audio directly — no re-encoding,
          no lossy pre-processing.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {["Lossless waveform capture", "Auto BPM + key detection", "Storage-first signed URLs"].map((t) => (
            <li key={t} className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-dashed border-white/15 bg-background/40 p-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"
          >
            <Upload className="h-6 w-6" />
          </motion.div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Drop file
          </div>
          <div className="mt-1 text-sm font-semibold">midnight-skyline.wav</div>
          <div className="mt-1 text-[11px] text-muted-foreground">02:41 · 44.1 kHz · stereo · 27.3 MB</div>
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.6, ease: "easeOut" }}
              className="h-full"
              style={{ background: "var(--gradient-brand)" }}
            />
          </div>
          <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Uploaded</div>
        </div>
      </div>
    </div>
  );
}

function AnalyzePanel({ progress }: { progress: number }) {
  const currentLyric = Math.floor(progress * LYRICS.length) % LYRICS.length;
  return (
    <div className="grid gap-8 lg:grid-cols-5 lg:items-center">
      <div className="lg:col-span-2">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Step 02</div>
        <h3 className="mt-2 text-2xl font-bold">Beat, key and lyrics — verified.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Multi-pass transcription with confidence scoring, plus BPM and downbeats aligned to the
          waveform. This is the source of truth every downstream step uses.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { k: "BPM",   v: "112" },
            { k: "Key",   v: "F# min" },
            { k: "Bars",  v: "64" },
          ].map((c) => (
            <div key={c.k} className="rounded-lg border border-white/10 bg-background/40 p-3 text-center">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{c.k}</div>
              <div className="mt-1 text-lg font-bold gradient-text">{c.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-3">
        {/* Waveform */}
        <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
          <div className="flex items-end gap-[3px] h-24">
            {BARS.map((v, i) => {
              const played = i / BARS.length <= progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-colors"
                  style={{
                    height: `${v * 100}%`,
                    background: played
                      ? "linear-gradient(180deg, hsl(325 90% 70%), hsl(265 85% 65%))"
                      : "hsl(0 0% 100% / 0.08)",
                  }}
                />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <span>00:{String(Math.floor(progress * 161)).padStart(2, "0")}</span>
            <span className="flex items-center gap-1 text-primary"><Mic className="h-3 w-3" /> Lead vocal isolated</span>
            <span>02:41</span>
          </div>
        </div>

        {/* Lyric ticker */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-background/40 p-4">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Live transcript
          </div>
          <div className="space-y-1.5">
            {LYRICS.map((l, i) => (
              <div
                key={`${i}-${l.text}`}
                className={`text-sm transition-all ${
                  i === currentLyric ? "text-foreground font-semibold" : "text-muted-foreground/60"
                }`}
              >
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">
                  00:{String(Math.floor(l.t * 10)).padStart(2, "0")}
                </span>
                {l.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CharacterPanel() {
  const attrs = [
    { k: "Wardrobe", v: "Charcoal trench, silver chain" },
    { k: "Lighting", v: "Neon rim, teal + magenta" },
    { k: "Mood",     v: "Contemplative, resolute" },
    { k: "Seed",     v: "sv-7f3a91" },
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Step 03</div>
        <h3 className="mt-2 text-2xl font-bold">One character. Every scene.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Lock a look with a reference image or prompt. Sync Vision anchors that character across
          every generated scene so wardrobe, lighting and identity stay consistent.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          {attrs.map((a) => (
            <div key={a.k} className="rounded-lg border border-white/10 bg-background/40 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{a.k}</dt>
              <dd className="mt-1 text-sm font-semibold">{a.v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative">
        <div
          className="aspect-[4/5] w-full max-w-sm mx-auto overflow-hidden rounded-3xl border border-white/10"
          style={{
            background:
              "radial-gradient(120% 80% at 30% 20%, hsl(295 90% 55% / 0.5), transparent 60%)," +
              "radial-gradient(100% 80% at 70% 80%, hsl(265 85% 55% / 0.6), transparent 55%)," +
              "linear-gradient(180deg, hsl(240 30% 8%), hsl(280 40% 6%))",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="flex h-full items-end p-5"
          >
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-white/90 backdrop-blur">
                <CheckCircle2 className="h-3 w-3 text-primary" /> Locked
              </div>
              <div className="mt-2 font-display text-2xl font-bold text-white">Nova</div>
              <div className="text-xs text-white/70">Lead character · reference-locked</div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function StoryboardPanel() {
  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-2">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Step 04</div>
          <h3 className="mt-2 text-2xl font-bold">Beat-matched scene frames.</h3>
          <p className="mt-3 text-sm text-muted-foreground">
            Every frame is tied to a downbeat and a lyric window. Rearrange, regenerate a single
            scene, or lock frames as references — the timing stays honest.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["112 BPM", "16 scenes", "Character locked", "Karaoke aligned"].map((t) => (
              <span key={t} className="rounded-full border border-white/10 bg-background/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="lg:col-span-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FRAMES.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35 }}
              className="overflow-hidden rounded-xl border border-white/10"
            >
              <div
                className="aspect-video"
                style={{
                  background:
                    `radial-gradient(120% 80% at 30% 20%, hsl(${f.hue} 90% 60% / 0.55), transparent 60%),` +
                    `radial-gradient(100% 80% at 70% 80%, hsl(${(f.hue + 40) % 360} 85% 55% / 0.55), transparent 55%),` +
                    "linear-gradient(180deg, hsl(240 30% 8%), hsl(280 40% 6%))",
                }}
              />
              <div className="bg-background/60 px-2.5 py-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{f.label}</div>
                <div className="mt-0.5 text-[11px] text-foreground/90 truncate">{f.note}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportPanel() {
  const files = [
    { name: "storyboard-boards.pdf", size: "4.2 MB",  tag: "PDF" },
    { name: "scene-videos.zip",      size: "128 MB",  tag: "MP4 × 16" },
    { name: "karaoke.vtt",           size: "12 KB",   tag: "Captions" },
    { name: "prompts.json",          size: "38 KB",   tag: "Prompts" },
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Step 05</div>
        <h3 className="mt-2 text-2xl font-bold">Export-ready boards.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Ship the whole package: rendered scenes, storyboard PDF, karaoke VTT, and every prompt
          used to generate them — versioned and hash-verified.
        </p>
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-background/40 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Render complete</div>
            <div className="text-[11px] text-muted-foreground">16 scenes · 2 min 41 sec · SHA-256 verified</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {files.map((f, i) => (
          <motion.div
            key={f.name}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-background/40 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
                <Download className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">{f.name}</div>
                <div className="text-[11px] text-muted-foreground">{f.size}</div>
              </div>
            </div>
            <span className="rounded-full border border-white/10 bg-background/60 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              {f.tag}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
