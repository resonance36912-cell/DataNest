import { motion } from "framer-motion";
import { Upload, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Props {
  compact?: boolean;
  onTrySample: () => void;
  seedingSample?: boolean;
  creditsLabel?: string;
}

/**
 * Cinematic "production desk" hero for the first-run dashboard.
 * Uses semantic tokens only — dark cinematic gradient, waveform silhouette,
 * two CTAs, and a compact credits chip.
 */
export default function ProductionDeskHero({ compact, onTrySample, seedingSample, creditsLabel }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-background ${
        compact ? "p-4 sm:p-5" : "p-6 sm:p-10"
      }`}
    >
      {/* Ambient waveform silhouette */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-around gap-1 px-4 opacity-30">
        {Array.from({ length: 48 }).map((_, i) => {
          const h = 20 + Math.round((Math.sin(i * 0.7) + 1) * 30 + (i % 5) * 4);
          return (
            <span
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-primary/60 to-accent/40"
              style={{ height: `${Math.min(h, 96)}px` }}
            />
          );
        })}
      </div>

      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Production Desk
          </div>
          <h1 className={`font-bold leading-tight tracking-tight ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            Turn a track into a music video treatment.
          </h1>
          {!compact && (
            <p className="mt-2 text-sm text-muted-foreground">
              Upload a song. We map beats, lyrics, sections, and visual pacing — then compose a scene-by-scene storyboard you can direct.
            </p>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Link to="/project/new">
              <Button size={compact ? "sm" : "default"} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Upload className="h-4 w-4" /> Upload Track
              </Button>
            </Link>
            <Button
              size={compact ? "sm" : "default"}
              variant="outline"
              onClick={onTrySample}
              disabled={seedingSample}
              className="gap-2 border-primary/40 text-foreground hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              {seedingSample ? "Loading sample…" : "Try Sample Project"}
            </Button>
          </div>
          {creditsLabel && (
            <Link
              to="/credits"
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:self-end"
              title="View credits"
            >
              <Wallet className="h-3 w-3 text-primary" />
              {creditsLabel}
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );
}
