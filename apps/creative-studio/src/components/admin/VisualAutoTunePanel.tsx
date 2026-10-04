import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  AUTO_TUNE_LIMITS,
  formatWait,
  isAutoTuneDue,
  loadAutoTuneConfig,
  recommendAutoTune,
  saveAutoTuneConfig,
  tunedPresetName,
  type AutoTuneConfig,
} from "@/lib/visualAutoTune";
import type { VisualPresetValues } from "@/lib/visualPresets";
import type { VisualRunHistoryEntry } from "@/lib/visualRunHistory";

interface Props {
  history: VisualRunHistoryEntry[];
  /** Overrides currently typed in the editor — the tuning starting point. */
  currentValues: VisualPresetValues;
  /** Persist a tuned preset. `mode` decides update-in-place vs create-new. */
  onTuned: (
    name: string,
    values: VisualPresetValues,
    opts: { mode: "update" | "new"; apply: boolean },
  ) => void;
}

const CHECK_INTERVAL_MS = 60_000;

/**
 * Scheduler that regenerates a `VISUAL_*` preset from recent card-diff runs.
 * Runs entirely in this browser tab while /admin/visual-thresholds is open.
 */
export default function VisualAutoTunePanel({ history, currentValues, onTuned }: Props) {
  const [config, setConfig] = useState<AutoTuneConfig>(() => loadAutoTuneConfig());
  const [tick, setTick] = useState(0);

  const update = (patch: Partial<AutoTuneConfig>) =>
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveAutoTuneConfig(next);
      return next;
    });

  const recommendation = useMemo(
    () => recommendAutoTune(history, currentValues, config.windowRuns),
    [history, currentValues, config.windowRuns],
  );

  const due = useMemo(
    () => isAutoTuneDue(config, history, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, history, tick],
  );

  const runTune = useCallback(
    (source: "scheduled" | "manual") => {
      const rec = recommendAutoTune(history, currentValues, config.windowRuns);
      const latestId = history.find((r) => r.status !== "cancelled")?.id ?? null;

      if (!rec.changed) {
        if (source === "manual") toast.info(rec.reasons[0]);
        update({ lastTunedAt: new Date().toISOString(), lastRunId: latestId });
        return;
      }

      const name = tunedPresetName(config);
      onTuned(name, rec.values, { mode: config.mode, apply: config.applyAfterSave });
      update({ lastTunedAt: new Date().toISOString(), lastRunId: latestId });
      toast.success(
        `${source === "scheduled" ? "Scheduled tune" : "Tuned"} “${name}” — ${rec.reasons.length} adjustment(s)`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, currentValues, config, onTuned],
  );

  // Heartbeat: re-evaluate "is it due" once a minute while the page is open.
  useEffect(() => {
    if (!config.enabled) return;
    const id = window.setInterval(() => setTick((t) => t + 1), CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [config.enabled]);

  useEffect(() => {
    if (!config.enabled) return;
    if (!due.due) return;
    runTune("scheduled");
  }, [config.enabled, due.due, runTune]);

  const lastTuned = config.lastTunedAt ? new Date(config.lastTunedAt) : null;

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Scheduled auto-tuning</h3>
          <Badge variant={config.enabled ? "default" : "secondary"} className="text-[10px]">
            {config.enabled ? "On" : "Off"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{due.reason}</span>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            aria-label="Enable scheduled auto-tuning"
          />
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Regenerates a preset from your recent card-diff runs — loosening providers that keep
        failing, easing over-wide tolerances back toward baseline, and adjusting retries when
        results turn flaky. Runs locally while this page is open.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs">
          <span className="font-medium">Every (minutes)</span>
          <Input
            type="number"
            min={AUTO_TUNE_LIMITS.intervalMinutes.min}
            max={AUTO_TUNE_LIMITS.intervalMinutes.max}
            value={config.intervalMinutes}
            onChange={(e) => update({ intervalMinutes: Number(e.target.value) || 60 })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Min runs required</span>
          <Input
            type="number"
            min={AUTO_TUNE_LIMITS.minRuns.min}
            max={AUTO_TUNE_LIMITS.minRuns.max}
            value={config.minRuns}
            onChange={(e) => update({ minRuns: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Runs analysed</span>
          <Input
            type="number"
            min={AUTO_TUNE_LIMITS.windowRuns.min}
            max={AUTO_TUNE_LIMITS.windowRuns.max}
            value={config.windowRuns}
            onChange={(e) => update({ windowRuns: Number(e.target.value) || 10 })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Preset name</span>
          <Input
            value={config.presetName}
            onChange={(e) => update({ presetName: e.target.value })}
            placeholder="Auto-tuned"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <Switch
            checked={config.mode === "new"}
            onCheckedChange={(v) => update({ mode: v ? "new" : "update" })}
            aria-label="Create a new preset each tune"
          />
          <span>{config.mode === "new" ? "Create a new preset each tune" : "Update one rolling preset"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={config.applyAfterSave}
            onCheckedChange={(applyAfterSave) => update({ applyAfterSave })}
            aria-label="Apply tuned preset immediately"
          />
          <span>Apply tuned preset immediately</span>
        </div>
        {lastTuned && (
          <span className="text-muted-foreground">
            Last tuned {lastTuned.toLocaleString()}
            {due.waitMs ? ` · next in ${formatWait(due.waitMs)}` : ""}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border/50 bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Next recommendation ({recommendation.runs.length} run
          {recommendation.runs.length === 1 ? "" : "s"} analysed)
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {recommendation.reasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      </div>

      <Button size="sm" variant="secondary" onClick={() => runTune("manual")}>
        <Wand2 className="mr-2 h-4 w-4" /> Tune now
      </Button>
    </section>
  );
}
