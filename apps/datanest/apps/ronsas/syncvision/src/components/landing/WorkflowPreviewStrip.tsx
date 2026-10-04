import { motion } from "framer-motion";
import { Upload, AudioLines, Film, Captions } from "lucide-react";

/**
 * Compact, product-surface preview strip that shows the four core outputs
 * Sync Vision delivers. Sits directly under the hero CTAs so the first
 * viewport carries brand + promise + concrete product. No marketing cards,
 * just tiny UI vignettes for each step.
 */

const STEPS = [
  {
    n: "01",
    label: "Upload Track",
    icon: Upload,
    accent: "hsl(265 85% 70%)",
  },
  {
    n: "02",
    label: "Beat + Lyric Map",
    icon: AudioLines,
    accent: "hsl(295 90% 65%)",
  },
  {
    n: "03",
    label: "Scene Boards",
    icon: Film,
    accent: "hsl(325 90% 70%)",
  },
  {
    n: "04",
    label: "Captioned Export",
    icon: Captions,
    accent: "hsl(190 90% 60%)",
  },
] as const;

/** Deterministic pseudo-random for the audio bars — stable across renders. */
const barHeights = Array.from({ length: 22 }, (_, i) =>
  30 + Math.round(50 * Math.abs(Math.sin(i * 1.7)))
);

function UploadVignette() {
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-center gap-2 rounded-md border border-dashed border-white/15 bg-white/[0.02] px-3 py-2">
        <div className="h-6 w-6 rounded bg-primary/15 grid place-items-center">
          <Upload className="h-3 w-3 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[10px] text-foreground/85">neon_rain_master.wav</div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, hsl(265 85% 70%), hsl(325 90% 70%))" }}
              initial={{ width: "0%" }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>WAV · 44.1kHz</span>
        <span className="text-accent">Ready</span>
      </div>
    </div>
  );
}

function BeatMapVignette() {
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex h-10 items-end gap-[3px]">
        {barHeights.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-sm"
            style={{
              background:
                i % 4 === 0
                  ? "hsl(325 90% 65%)"
                  : "hsl(295 90% 55% / 0.55)",
            }}
            initial={{ height: 4 }}
            whileInView={{ height: h * 0.4 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.02, duration: 0.4 }}
          />
        ))}
      </div>
      <div className="space-y-1 font-mono text-[9px] text-muted-foreground">
        <div className="flex justify-between">
          <span className="text-foreground/70">0:12</span>
          <span className="truncate pl-2 text-right">"neon streets alive tonight"</span>
        </div>
        <div className="flex justify-between opacity-60">
          <span>0:28</span>
          <span className="truncate pl-2 text-right">"chasing shadows in the rain"</span>
        </div>
      </div>
    </div>
  );
}

function SceneBoardsVignette() {
  const frames = [
    "linear-gradient(135deg, hsl(325 90% 55% / 0.6), hsl(265 85% 45% / 0.6))",
    "linear-gradient(135deg, hsl(190 90% 55% / 0.55), hsl(295 90% 45% / 0.55))",
    "linear-gradient(135deg, hsl(295 90% 55% / 0.6), hsl(325 90% 45% / 0.5))",
  ];
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        {frames.map((bg, i) => (
          <motion.div
            key={i}
            className="relative aspect-video overflow-hidden rounded-md border border-white/10"
            style={{ background: bg }}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            <span className="absolute left-1 top-1 rounded bg-black/50 px-1 py-[1px] font-mono text-[8px] text-white/80">
              S0{i + 1}
            </span>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>12 scenes</span>
        <span className="text-primary">Consistent character</span>
      </div>
    </div>
  );
}

function ExportVignette() {
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="space-y-1.5">
        <div className="flex h-2 overflow-hidden rounded-full border border-white/10">
          <span className="w-[22%] bg-[hsl(265_85%_60%)]" />
          <span className="w-[18%] bg-[hsl(295_90%_60%)]" />
          <span className="w-[26%] bg-[hsl(325_90%_65%)]" />
          <span className="w-[16%] bg-[hsl(190_90%_60%)]" />
          <span className="w-[18%] bg-[hsl(265_85%_60%)]" />
        </div>
        <div className="flex justify-between font-mono text-[8px] text-muted-foreground">
          <span>0:00</span>
          <span>1:04</span>
          <span>2:08</span>
          <span>3:12</span>
        </div>
      </div>
      <div className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5">
        <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-accent">Caption · VTT</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-foreground/85">
          "we light up when the city sleeps"
        </div>
      </div>
    </div>
  );
}

const VIGNETTES = [UploadVignette, BeatMapVignette, SceneBoardsVignette, ExportVignette];

export function WorkflowPreviewStrip() {
  return (
    <section aria-label="Product workflow preview" className="relative">
      <div className="container -mt-4 pb-10 sm:pb-14">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => {
            const Vignette = VIGNETTES[i];
            const Icon = step.icon;
            return (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                whileHover={{ y: -3 }}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-white/10 bg-card/60 p-4 backdrop-blur-xl transition-colors hover:border-white/20"
                style={{
                  boxShadow: `0 0 40px -20px ${step.accent}`,
                }}
              >
                {/* accent hairline */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[1px] opacity-60"
                  style={{ background: `linear-gradient(90deg, transparent, ${step.accent}, transparent)` }}
                />

                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 place-items-center rounded-md"
                      style={{ background: `${step.accent.replace(")", " / 0.15)")}`, color: step.accent }}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground/90">
                      {step.label}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                    {step.n}
                  </span>
                </header>

                <div className="min-h-[92px] flex-1">
                  <Vignette />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
