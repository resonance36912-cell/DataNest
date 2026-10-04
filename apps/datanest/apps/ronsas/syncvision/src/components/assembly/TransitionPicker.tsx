import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ArrowRight } from "lucide-react";

export type TransitionType = "cut" | "crossfade" | "fade-black" | "wipe-left" | "wipe-right";

export interface TransitionConfig {
  type: TransitionType;
  durationSec: number;
}

const TRANSITION_OPTIONS: { value: TransitionType; label: string; icon: string }[] = [
  { value: "cut", label: "Cut", icon: "✂️" },
  { value: "crossfade", label: "Crossfade", icon: "🔄" },
  { value: "fade-black", label: "Fade to Black", icon: "⬛" },
  { value: "wipe-left", label: "Wipe Left", icon: "◀️" },
  { value: "wipe-right", label: "Wipe Right", icon: "▶️" },
];

interface TransitionPickerProps {
  transitions: TransitionConfig[];
  sceneCount: number;
  onChange: (transitions: TransitionConfig[]) => void;
  activeIndex: number | null;
}

export default function TransitionPicker({ transitions, sceneCount, onChange, activeIndex }: TransitionPickerProps) {
  const transitionCount = Math.max(0, sceneCount - 1);

  const updateTransition = (index: number, partial: Partial<TransitionConfig>) => {
    const updated = [...transitions];
    updated[index] = { ...updated[index], ...partial };
    onChange(updated);
  };

  const applyToAll = (config: TransitionConfig) => {
    onChange(Array.from({ length: transitionCount }, () => ({ ...config })));
  };

  if (transitionCount === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Add at least 2 scenes to configure transitions.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Transitions</h3>
        <button
          onClick={() => applyToAll(transitions[0] || { type: "crossfade", durationSec: 0.5 })}
          className="text-[10px] text-primary hover:underline"
        >
          Apply first to all
        </button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {Array.from({ length: transitionCount }).map((_, idx) => {
          const t = transitions[idx] || { type: "cut", durationSec: 0.5 };
          const isActive = activeIndex !== null && (idx === activeIndex || idx === activeIndex - 1);
          return (
            <div
              key={idx}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                isActive ? "border-primary/50 bg-primary/5" : "border-border/30 bg-card"
              }`}
            >
              <span className="text-[10px] text-muted-foreground w-16 shrink-0 flex items-center gap-1">
                {idx + 1} <ArrowRight className="h-2.5 w-2.5" /> {idx + 2}
              </span>
              <Select
                value={t.type}
                onValueChange={(v) => updateTransition(idx, { type: v as TransitionType })}
              >
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.icon} {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {t.type !== "cut" && (
                <div className="flex items-center gap-2 flex-1 min-w-24">
                  <Slider
                    value={[t.durationSec]}
                    min={0.3}
                    max={2}
                    step={0.1}
                    onValueChange={([v]) => updateTransition(idx, { durationSec: v })}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{t.durationSec}s</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
