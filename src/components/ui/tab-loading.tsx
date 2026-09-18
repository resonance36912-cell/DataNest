import { m as motion } from "@/lib/lazy-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TabLoadingProps {
  label?: string;
  rows?: number;
  className?: string;
}

/**
 * Glass-depth loading state for dashboard tabs. Uses the same blur-in motion
 * as the tab content wrapper so the transition into skeletons feels continuous
 * with the tab switch animation.
 */
const TabLoading = ({ label = "Analyzing channel…", rows = 3, className }: TabLoadingProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40 bg-card/30 backdrop-blur-xl p-6 space-y-5",
        "shadow-[0_20px_60px_-30px_hsl(var(--resonance-magenta)/0.35)]",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Ambient inner glow — matches TabsList treatment */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-60"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--resonance-violet) / 0.06), transparent 40%, hsl(var(--resonance-magenta) / 0.08))",
        }}
      />

      <div className="relative z-10 flex items-center gap-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-gradient-to-br from-[hsl(var(--resonance-violet))] to-[hsl(var(--resonance-magenta))]"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/80">
          {label}
        </p>
      </div>

      <div className="relative z-10 grid gap-3">
        <Skeleton className="h-6 w-2/5" />
        <Skeleton className="h-4 w-3/5" />
        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="space-y-2 pt-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default TabLoading;
