import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileAudio,
  Film,
  Gauge,
  KeyRound,
  Music2,
  Play,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import logoSyncVision from "@/assets/logo-sync-vision.png";

export const Route = createFileRoute("/apps/sync_vision")({
  head: () => ({
    meta: [
      { title: "SyncVision — Direct Before You Render | Resonance Hub" },
      {
        name: "description",
        content:
          "SyncVision is the Resonance music-video production desk for audio analysis, deterministic scene planning, approval, and render-ready exports.",
      },
      {
        property: "og:title",
        content: "SyncVision — Direct Before You Render",
      },
      {
        property: "og:description",
        content:
          "Turn a song into a structured, reviewable music-video plan before committing to a final render.",
      },
    ],
  }),
  component: SyncVisionPage,
});

type Stage = "intake" | "analysis" | "storyboard" | "review" | "master";

const stages: Array<{ key: Stage; label: string; short: string }> = [
  { key: "intake", label: "Intake", short: "01" },
  { key: "analysis", label: "Analysis", short: "02" },
  { key: "storyboard", label: "Storyboard", short: "03" },
  { key: "review", label: "Review", short: "04" },
  { key: "master", label: "Master", short: "05" },
];

const scenes = [
  {
    id: "SC-01",
    time: "00:00 → 00:18",
    title: "Cold open / arrival",
    detail: "Establish location, protagonist silhouette, title motif, slow camera drift.",
    state: "approved",
  },
  {
    id: "SC-02",
    time: "00:18 → 00:36",
    title: "Verse / pursuit",
    detail: "Introduce secondary character, tighter focal length, lyric-led motion cues.",
    state: "approved",
  },
  {
    id: "SC-03",
    time: "00:36 → 00:54",
    title: "Chorus / release",
    detail: "Widen frame, increase movement, preserve character continuity and palette.",
    state: "draft",
  },
];

function SyncVisionPage() {
  const [stage, setStage] = useState<Stage>("intake");
  const [projectName, setProjectName] = useState("Untitled SyncVision project");
  const [approved, setApproved] = useState(false);
  const [selectedScene, setSelectedScene] = useState("SC-01");
  const [analyzed, setAnalyzed] = useState(false);

  const activeIndex = stages.findIndex((item) => item.key === stage);
  const goNext = () => {
    const next = stages[Math.min(activeIndex + 1, stages.length - 1)];
    setStage(next.key);
  };

  return (
    <div className="workspace-shell min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="Back to Resonance Hub">
            <img src={logoSyncVision} alt="SyncVision" className="size-9 object-contain" />
            <span className="font-display text-sm font-bold tracking-tight">SyncVision</span>
            <span className="hidden rounded-full border border-cyan/20 bg-cyan/5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-cyan sm:inline-flex">
              Resonance Hub
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="https://sync.reson8.life"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              Live app <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:py-10">
        <section className="workspace-panel relative overflow-hidden p-5 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-[radial-gradient(circle,hsl(295_90%_60%/.2),transparent_68%)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-36 left-1/3 size-96 rounded-full bg-[radial-gradient(circle,hsl(190_90%_60%/.11),transparent_68%)] blur-2xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <div>
              <div className="workspace-kicker">SyncVision / Production Desk</div>
              <h1 className="mt-3 max-w-4xl font-display text-4xl font-bold leading-[1.02] sm:text-6xl">
                Direct before you <span className="text-gradient-brand">render.</span>
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Turn a song into a structured music-video plan before expensive generation.
                SyncVision separates audio truth, scene direction, continuity, human approval, and
                final mastering.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="workspace-nav-link gap-2">
                  <span className="size-2 rounded-full bg-[var(--rs-success)] shadow-[0_0_14px_var(--rs-success)]" />
                  Live integration
                </span>
                <span className="workspace-nav-link">Local-first companion</span>
                <span className="workspace-nav-link">Approval-gated render</span>
              </div>
            </div>

            <div className="mx-auto w-full max-w-sm">
              <div className="relative aspect-square rounded-[2rem] border border-white/10 bg-black/20 p-8">
                <div className="absolute inset-5 rounded-full border border-cyan/10" />
                <div className="absolute inset-10 rounded-full border border-primary/10 animate-orbit" />
                <div className="absolute inset-0 grid place-items-center">
                  <img
                    src={logoSyncVision}
                    alt="SyncVision logo"
                    width={512}
                    height={512}
                    className="size-[62%] object-contain drop-shadow-[0_0_42px_hsl(295_90%_60%/.45)] animate-orb"
                  />
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-background/85 px-3 py-1 text-[10px] font-mono uppercase tracking-[.18em] text-cyan backdrop-blur">
                  Direct / Verify / Approve / Master
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="workspace-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <div className="workspace-kicker">01 / Work surface</div>
                <h2 className="mt-1 text-xl font-semibold">Production pipeline</h2>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                Stage {activeIndex + 1} / {stages.length}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1 border-b border-white/10 p-2">
              {stages.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStage(item.key)}
                  className={`rounded-xl px-2 py-3 text-left transition-all ${
                    stage === item.key
                      ? "border border-primary/35 bg-primary/10"
                      : "border border-transparent hover:bg-white/[.03]"
                  }`}
                >
                  <span className="block text-[10px] font-mono text-cyan">{item.short}</span>
                  <span className="mt-1 block text-xs font-semibold sm:text-sm">{item.label}</span>
                  {index < activeIndex && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--rs-success)]">
                      <Check className="size-3" /> done
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 sm:p-5">
              {stage === "intake" && (
                <div className="grid gap-4 md:grid-cols-[1fr_1.15fr]">
                  <div>
                    <label className="workspace-kicker" htmlFor="syncvision-project">
                      Project
                    </label>
                    <input
                      id="syncvision-project"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-input bg-background/50 px-3 py-3 text-sm"
                    />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        [FileAudio, "MP3 / WAV", "Normalized working audio"],
                        [Film, "MP4", "Reference video or source"],
                      ].map(([Icon, label, detail]) => (
                        <div key={label as string} className="workspace-panel-soft p-3">
                          <Icon className="size-4 text-cyan" />
                          <div className="mt-2 text-xs font-semibold">{label as string}</div>
                          <div className="mt-1 text-[10px] leading-4 text-muted-foreground">
                            {detail as string}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-dashed border-cyan/25 bg-cyan/[.025] p-6 text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-cyan/20 bg-cyan/5">
                      <Upload className="size-6 text-cyan" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold">Drop your source here</h3>
                    <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                      The intake contract keeps the original source immutable and records a content
                      hash for provenance.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStage("analysis")}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary/20"
                    >
                      Simulate ingest <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {stage === "analysis" && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{projectName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Audio intelligence is deterministic input to the scene layer.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAnalyzed(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-2 text-xs font-semibold hover:bg-primary/5"
                    >
                      <Sparkles className="size-3.5" />{" "}
                      {analyzed ? "Analysis complete" : "Run analysis"}
                    </button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      [Music2, "Lyrics", analyzed ? "Timed transcript" : "Waiting"],
                      [Gauge, "Tempo", analyzed ? "96 BPM" : "Waiting"],
                      [KeyRound, "Key", analyzed ? "A minor" : "Waiting"],
                      [Wand2, "Mood / energy", analyzed ? "Tense · 0.71" : "Waiting"],
                    ].map(([Icon, label, value]) => (
                      <div key={label as string} className="workspace-panel-soft p-4">
                        <Icon className="size-4 text-primary" />
                        <div className="mt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {label as string}
                        </div>
                        <div className="mt-1 text-sm font-semibold">{value as string}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-xl border border-white/10 bg-background/25 p-4">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-cyan">
                      Analysis contract
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>48 kHz / 24-bit working WAV</span>
                      <span>SHA-256 source provenance</span>
                      <span>No implicit render retries</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={goNext}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-xs font-bold text-white"
                  >
                    Continue to storyboard <ChevronRight className="size-3.5" />
                  </button>
                </div>
              )}

              {stage === "storyboard" && (
                <div>
                  <div className="grid gap-3">
                    {scenes.map((scene) => (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => setSelectedScene(scene.id)}
                        className={`workspace-panel-soft grid grid-cols-[72px_1fr_auto] gap-3 p-4 text-left transition-colors ${
                          selectedScene === scene.id
                            ? "border-primary/35 bg-primary/[.04]"
                            : "hover:bg-white/[.02]"
                        }`}
                      >
                        <div className="text-[10px] font-mono text-cyan">{scene.id}</div>
                        <div>
                          <div className="text-sm font-semibold">{scene.title}</div>
                          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {scene.detail}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {scene.time}
                          </div>
                          <div
                            className={`mt-2 text-[10px] font-mono uppercase tracking-wider ${
                              scene.state === "approved"
                                ? "text-[var(--rs-success)]"
                                : "text-[var(--rs-warning)]"
                            }`}
                          >
                            {scene.state}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
                    <div>
                      <div className="text-xs font-semibold">Selected scene: {selectedScene}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Scene mutations remain versioned so rejected direction can be rolled back
                        safely.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={goNext}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-xs font-bold text-white"
                    >
                      Open review <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {stage === "review" && (
                <div className="grid gap-4 md:grid-cols-[1.1fr_.9fr]">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                    <div className="aspect-video grid place-items-center bg-[radial-gradient(circle_at_50%_40%,hsl(295_90%_60%/.2),transparent_55%),linear-gradient(140deg,hsl(265_30%_6%),hsl(265_30%_10%))]">
                      <div className="grid place-items-center">
                        <div className="grid size-14 place-items-center rounded-full border border-white/15 bg-white/5">
                          <Play className="ml-0.5 size-5" />
                        </div>
                        <div className="mt-3 text-[10px] font-mono uppercase tracking-[.16em] text-cyan">
                          Preview / not final
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold">{projectName}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          3 scenes
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="workspace-panel-soft p-4">
                    <div className="workspace-kicker">Approval gate</div>
                    <h3 className="mt-2 text-base font-semibold">Human decision required</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Provider batches and final renders do not advance until the storyboard and
                      preview are explicitly approved.
                    </p>
                    <div className="mt-4 grid gap-2">
                      {[
                        "Verify timing",
                        "Preview continuity",
                        "Approve scene direction",
                        "Queue master",
                      ].map((item, index) => (
                        <div
                          key={item}
                          className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-xs"
                        >
                          <span
                            className={`grid size-5 place-items-center rounded-full border ${
                              index < 3 || approved
                                ? "border-[var(--rs-success)]/30 bg-[var(--rs-success)]/10 text-[var(--rs-success)]"
                                : "border-white/10 text-muted-foreground"
                            }`}
                          >
                            {index < 3 || approved ? <Check className="size-3" /> : index + 1}
                          </span>
                          {item}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setApproved(true);
                        setStage("master");
                      }}
                      className="mt-4 w-full rounded-xl bg-gradient-brand px-4 py-3 text-xs font-bold text-white"
                    >
                      {approved ? "Approved — open master" : "Approve storyboard"}
                    </button>
                  </div>
                </div>
              )}

              {stage === "master" && (
                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                  <div className="workspace-panel-soft p-5">
                    <div className="workspace-kicker">Master queue</div>
                    <h3 className="mt-2 text-xl font-semibold">Ready for deterministic render</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      The queued job captures an immutable scene snapshot so later edits cannot
                      alter an in-flight render.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {["Scene snapshot locked", "Approval recorded", "Source hash retained"].map(
                        (item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rs-success)]/20 bg-[var(--rs-success)]/5 px-3 py-1.5 text-[10px] font-semibold text-[var(--rs-success)]"
                          >
                            <Check className="size-3" /> {item}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="workspace-panel-soft p-5">
                    <div className="workspace-kicker">Export contract</div>
                    <div className="mt-3 grid gap-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Video</span>
                        <strong>H.264 master</strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Audio</span>
                        <strong>AAC</strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Addressing</span>
                        <strong>Revision-based</strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Queue state</span>
                        <strong className="text-[var(--rs-success)]">Approved</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStage("master")}
                      className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2.5 text-xs font-semibold hover:bg-primary/5"
                    >
                      Inspect master <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="grid gap-4 content-start">
            <div className="workspace-panel p-5">
              <div className="workspace-kicker">02 / Guardrails</div>
              <h2 className="mt-2 text-lg font-semibold">Render discipline</h2>
              <div className="mt-4 grid gap-3">
                {[
                  ["Source", "Immutable + SHA-256 provenance"],
                  ["Analysis", "Audio truth before scene direction"],
                  ["Mutations", "Versioned and rollback-safe"],
                  ["Queue", "Snapshot captured at job start"],
                  ["Approval", "Explicit human gate"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="border-b border-white/10 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {label}
                    </div>
                    <div className="mt-1 text-xs font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="workspace-panel p-5">
              <div className="workspace-kicker">03 / Companion stack</div>
              <h2 className="mt-2 text-lg font-semibold">Local-first foundations</h2>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                The OSS companion can normalize media with FFmpeg, analyze speech and music locally,
                partition scenes deterministically, and render through an explicit queue.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["FFmpeg", "faster-whisper", "librosa", "OpenTimelineIO", "Wan2.1"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="workspace-panel p-5">
              <div className="workspace-kicker">04 / Hub alignment</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Governed under the{" "}
                <span className="font-semibold text-foreground">sync_vision</span> app key and the
                Resonance Sovereign Spectrum visual system.
              </p>
              <Link
                to="/pricing"
                className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
              >
                View current promotion <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
