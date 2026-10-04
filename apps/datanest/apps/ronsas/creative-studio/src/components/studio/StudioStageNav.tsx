import { Check, Loader2, Lock } from "lucide-react";
import { motion } from "framer-motion";

export type StudioStageId = "create" | "source" | "brief" | "generate" | "export";

export interface StudioStage {
  id: StudioStageId;
  label: string;
  hint: string;
  complete: boolean;
  active?: boolean;
}

interface Props {
  stages: StudioStage[];
  onStageClick?: (id: StudioStageId) => void;
}

/**
 * 5-stage stepper for the Studio: Create → Source → Brief → Generate → Save/Export.
 * Purely presentational — derives enabled/disabled state from `complete` flags:
 * a stage is clickable iff itself or every prior stage is complete (or it's the active one).
 */
export function StudioStageNav({ stages, onStageClick }: Props) {
  // Active = first incomplete stage (or any flagged active).
  const firstIncomplete = stages.findIndex((s) => !s.complete);
  const activeIdx = stages.findIndex((s) => s.active);
  const currentIdx = activeIdx >= 0 ? activeIdx : firstIncomplete >= 0 ? firstIncomplete : stages.length - 1;

  return (
    <nav
      aria-label="Studio workflow"
      className="shrink-0 border-b border-white/[0.05] bg-background/40 backdrop-blur-md px-4 sm:px-6 py-2.5"
    >
      <ol className="flex items-center gap-1 sm:gap-2 max-w-6xl mx-auto overflow-x-auto scrollbar-thin">
        {stages.map((s, i) => {
          const isCurrent = i === currentIdx;
          const prevComplete = i === 0 || stages[i - 1].complete;
          const enabled = s.complete || isCurrent || prevComplete;
          const Icon = s.complete ? Check : s.active ? Loader2 : enabled ? null : Lock;
          return (
            <li key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                disabled={!enabled || !onStageClick}
                onClick={() => enabled && onStageClick?.(s.id)}
                aria-current={isCurrent ? "step" : undefined}
                title={s.hint}
                className={`group flex items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:text-[13px] font-medium transition-all ${
                  isCurrent
                    ? "studio-gradient-bg text-primary-foreground shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.7)]"
                    : s.complete
                      ? "bg-white/[0.06] text-foreground ring-1 ring-primary/30 hover:bg-white/[0.1]"
                      : enabled
                        ? "bg-white/[0.03] text-muted-foreground ring-1 ring-white/[0.08] hover:text-foreground hover:bg-white/[0.06]"
                        : "bg-white/[0.02] text-muted-foreground/50 ring-1 ring-white/[0.05] cursor-not-allowed"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold ${
                    isCurrent
                      ? "bg-white/20"
                      : s.complete
                        ? "bg-primary/25 text-primary-foreground"
                        : "bg-white/[0.06]"
                  }`}
                  aria-hidden
                >
                  {Icon ? (
                    <Icon className={`w-3 h-3 ${s.active ? "animate-spin" : ""}`} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
              {i < stages.length - 1 && (
                <motion.span
                  aria-hidden
                  className={`h-px w-4 sm:w-6 ${stages[i].complete ? "bg-primary/50" : "bg-white/[0.08]"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default StudioStageNav;
