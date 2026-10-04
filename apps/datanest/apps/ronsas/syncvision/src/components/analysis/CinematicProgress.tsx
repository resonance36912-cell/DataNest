import { CheckCircle2, Loader2, Circle } from "lucide-react";

export type StageState = "done" | "active" | "pending";

interface Stage {
  label: string;
  state: StageState;
}

interface Props {
  stages: Stage[];
}

/**
 * Cinematic 5-stage progress rail for the Analysis step.
 * Uses only semantic tokens — animates an ambient beat-marker row underneath.
 */
export default function CinematicProgress({ stages }: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-card via-card to-background p-4 sm:p-5">
      {/* Ambient beat markers */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end gap-[3px] px-4 opacity-40">
        {Array.from({ length: 60 }).map((_, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-primary/50"
            style={{
              height: `${8 + ((i * 37) % 32)}px`,
              animation: `pulse 1.6s ease-in-out ${(i % 8) * 0.12}s infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Analysis pipeline</h3>
          <span className="text-[10px] font-mono text-muted-foreground">
            {stages.filter((s) => s.state === "done").length}/{stages.length}
          </span>
        </div>

        <ol className="grid gap-2 sm:grid-cols-5">
          {stages.map((stage, idx) => {
            const Icon = stage.state === "done" ? CheckCircle2 : stage.state === "active" ? Loader2 : Circle;
            const iconClass =
              stage.state === "done"
                ? "text-success"
                : stage.state === "active"
                ? "text-primary animate-spin"
                : "text-muted-foreground/50";
            const cardClass =
              stage.state === "done"
                ? "border-success/30 bg-success/5"
                : stage.state === "active"
                ? "border-primary/40 bg-primary/5 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.35)]"
                : "border-border/40 bg-muted/20";

            return (
              <li key={stage.label} className={`flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all ${cardClass}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
                  <span className="text-[10px] font-mono text-muted-foreground">0{idx + 1}</span>
                </div>
                <span className={`text-xs font-medium leading-tight ${stage.state === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
