import { m as motion } from "@/lib/lazy-motion";
import { LucideIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * Glass empty state — mirrors the header/tab motion language:
 * fade + rise + blur-in, ambient violet→magenta glow, and a chip-style icon.
 */
const EmptyState = ({
  icon: Icon = Sparkles,
  eyebrow,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl",
        "shadow-[0_20px_60px_-30px_hsl(var(--resonance-magenta)/0.35)] p-10 text-center",
        className,
      )}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 0%, hsl(var(--resonance-violet) / 0.12), transparent 60%), radial-gradient(50% 50% at 90% 100%, hsl(var(--resonance-magenta) / 0.12), transparent 60%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-3">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="w-14 h-14 rounded-2xl border border-primary/25 bg-gradient-to-br from-[hsl(var(--resonance-violet)/0.18)] to-[hsl(var(--resonance-magenta)/0.22)] flex items-center justify-center shadow-[0_10px_30px_-12px_hsl(var(--resonance-magenta)/0.5)]"
        >
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        </motion.div>

        {eyebrow && (
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">
            {eyebrow}
          </p>
        )}
        <h3 className="font-display font-bold text-xl">{title}</h3>
        {description && (
          <p className="text-muted-foreground text-sm max-w-md">{description}</p>
        )}
        {action && (
          <Button variant="pill" size="pill" className="mt-2" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default EmptyState;
