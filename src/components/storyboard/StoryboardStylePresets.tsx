/**
 * StoryboardStylePresets — one-click storyboard style selector.
 * Applies a pacing cadence + shot-type bundle across every scene
 * (cinematic / documentary / music video) with a preview + undo.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clapperboard, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { Scene } from "@/contexts/ProjectContext";
import {
  STORYBOARD_STYLE_PRESETS,
  buildStylePatch,
  summarizeStyle,
  type StoryboardStylePreset,
} from "@/lib/storyboard-style-presets";

interface StoryboardStylePresetsProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  /** Optional: preset also nudges the theme picker. */
  setSceneTheme?: (s: string) => void;
  setCustomTheme?: (s: string) => void;
}

const labelize = (s: string) => s.replace(/_/g, " ").toLowerCase();

export default function StoryboardStylePresets({
  scenes,
  setScenes,
  setSceneTheme,
  setCustomTheme,
}: StoryboardStylePresetsProps) {
  const [pending, setPending] = useState<StoryboardStylePreset | null>(null);
  const [applied, setApplied] = useState<string | null>(
    () => ((scenes[0] as any)?.style_preset as string) ?? null
  );

  const sceneCount = scenes.length;
  const summary = useMemo(
    () => (pending ? summarizeStyle(pending, sceneCount) : []),
    [pending, sceneCount]
  );

  const apply = (preset: StoryboardStylePreset) => {
    const snapshot = scenes;
    setScenes((prev) =>
      prev.map((s, i) => ({ ...s, ...buildStylePatch(preset, i, s as any) }) as Scene)
    );
    setSceneTheme?.(preset.theme);
    setCustomTheme?.("");
    setApplied(preset.id);
    setPending(null);
    toast.success(`${preset.label} style applied`, {
      description: `${sceneCount} scene${sceneCount === 1 ? "" : "s"} re-configured · ${preset.pacing}`,
      action: {
        label: "Undo",
        onClick: () => {
          setScenes(snapshot);
          setApplied(((snapshot[0] as any)?.style_preset as string) ?? null);
          toast.info("Style change reverted");
        },
      },
      duration: 8000,
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0 inline-flex items-center gap-1">
          <Clapperboard className="h-3.5 w-3.5" />
          Style:
        </span>
        {STORYBOARD_STYLE_PRESETS.map((p) => {
          const isActive = applied === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPending(p)}
              disabled={sceneCount === 0}
              aria-pressed={isActive}
              data-testid={`style-preset-${p.id}`}
              title={`${p.description} — ${p.pacing}`}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all inline-flex items-center gap-1 disabled:opacity-40 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
            >
              <span aria-hidden>{p.emoji}</span>
              {p.label}
            </button>
          );
        })}
      </div>
      {applied && (
        <div className="pl-1">
          <Badge
            variant="outline"
            className="gap-1 border-primary/40 bg-primary/5 text-[10px] font-medium text-primary"
          >
            Pacing: {STORYBOARD_STYLE_PRESETS.find((p) => p.id === applied)?.pacing}
          </Badge>
        </div>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden>{pending?.emoji}</span>
              Apply “{pending?.label}” style
            </DialogTitle>
            <DialogDescription>{pending?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="rounded-md border border-border/60 bg-secondary/40 p-3">
              <div className="font-medium text-foreground mb-1">Pacing</div>
              <div className="text-muted-foreground">{pending?.pacing}</div>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/40 p-3">
              <div className="font-medium text-foreground mb-1.5">
                Shot types across {sceneCount} scene{sceneCount === 1 ? "" : "s"}
              </div>
              <ul className="space-y-1 text-muted-foreground">
                {summary.map((s) => (
                  <li key={s.role} className="flex items-center justify-between gap-3">
                    <span className="capitalize">{labelize(s.role)}</span>
                    <span className="tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/40 p-3 text-muted-foreground">
              Lighting <span className="text-foreground">{labelize(pending?.lighting_direction ?? "")}</span> ·
              VFX <span className="text-foreground">{pending?.vfx_level}</span> ·
              Theme <span className="text-foreground">{pending?.theme}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scene timings and lyrics are untouched. You can undo right after applying.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => pending && apply(pending)}>
              <Undo2 className="h-3.5 w-3.5 mr-1 rotate-180" />
              Apply to all scenes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
