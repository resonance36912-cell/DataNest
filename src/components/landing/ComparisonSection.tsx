import { motion } from "framer-motion";
import { Check, Minus, Sparkles, Zap } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

type Row = {
  label: string;
  sv: string;
  svStrong: boolean;
  sondo: string;
  sondoStrong: boolean;
};

const ROWS: Row[] = [
  {
    label: "Core workflow",
    sv: "Guided 6-step pipeline with per-scene review gates",
    svStrong: true,
    sondo: "One-click, track-level generation built for speed",
    sondoStrong: true,
  },
  {
    label: "Character control",
    sv: "Deep builder with gallery recall and scene-to-scene consistency",
    svStrong: true,
    sondo: "Not detailed publicly; appears stock or implicit",
    sondoStrong: false,
  },
  {
    label: "Audio analysis",
    sv: "Transcription, BPM, mood, word-level timing, vocal classification",
    svStrong: true,
    sondo: "Rhythm-aware editing with beat-matched cuts",
    sondoStrong: true,
  },
  {
    label: "Scene granularity",
    sv: "Scene-by-scene storyboard with shot roles and camera direction",
    svStrong: true,
    sondo: "Full-track video with highlight clipping",
    sondoStrong: false,
  },
  {
    label: "Timeline / assembly",
    sv: "Drag-and-drop timeline with transitions, audio FX, karaoke sync",
    svStrong: true,
    sondo: "Automatic vertical edits; limited manual timeline detail",
    sondoStrong: false,
  },
  {
    label: "Output & export",
    sv: "Storyboard JSON, specs, SRT/VTT, merged MP4",
    svStrong: true,
    sondo: "Ready-to-publish vertical clips for social platforms",
    sondoStrong: true,
  },
  {
    label: "Best fit for",
    sv: "Musicians, studios, agencies planning full music videos",
    svStrong: true,
    sondo: "Solo creators shipping Shorts, Reels, and TikToks",
    sondoStrong: true,
  },
];

function PlatformCard({
  name,
  icon: Icon,
  accent,
  rows,
  getDesc,
  getStrong,
}: {
  name: string;
  icon: typeof Sparkles;
  accent: string;
  rows: Row[];
  getDesc: (r: Row) => string;
  getStrong: (r: Row) => boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      custom={0}
      className="rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-xl"
    >
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: `hsl(${accent} 90% 60% / 0.15)`, color: `hsl(${accent} 90% 70%)` }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Platform
          </div>
          <div className="text-lg font-bold">{name}</div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {rows.map((row) => {
          const strong = getStrong(row);
          return (
            <div key={row.label + name} className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {strong ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Minus className="h-4 w-4 text-muted-foreground/60" />
                )}
              </div>
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {row.label}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">
                  {getDesc(row)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export function ComparisonSection() {
  return (
    <section className="border-t border-white/5">
      <div className="container py-20">
        {/* Header */}
        <div className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-xl"
          >
            <Sparkles className="h-3 w-3 text-accent" />
            At a glance
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-bold sm:text-4xl"
          >
            Sync Vision vs Other Platforms
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-3 max-w-2xl text-muted-foreground"
          >
            A neutral look at two approaches to AI-powered music video creation.
          </motion.p>
        </div>

        {/* Cards */}
        <div className="grid gap-6 lg:grid-cols-2">
          <PlatformCard
            name="Sync Vision"
            icon={Sparkles}
            accent="265"
            rows={ROWS}
            getDesc={(r) => r.sv}
            getStrong={(r) => r.svStrong}
          />
          <PlatformCard
            name="Other Platforms"
            icon={Zap}
            accent="190"
            rows={ROWS}
            getDesc={(r) => r.sondo}
            getStrong={(r) => r.sondoStrong}
          />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-center text-xs text-muted-foreground"
        >
          Based on publicly listed capabilities as of July 2026.
        </motion.p>
      </div>
    </section>
  );
}
