import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import VisualAutoTunePanel from "@/components/admin/VisualAutoTunePanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Home, Copy, CopyPlus, Pencil, RotateCcw, AlertTriangle, Gauge, Save, Trash2, Check, Bookmark, Terminal, Play, Square, Download, Upload, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { SHARE_PROVIDERS } from "@/lib/shareMeta";
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_PIXEL_THRESHOLD,
  DEFAULT_TOLERANCE,
  ENGINES,
  ENGINE_MULTIPLIER,
  MAX_ALLOWED_RATIO,
  PROVIDER_TOLERANCE,
  TOLERANCE_RATIONALE,
  resolveVisualPolicy,
  type VisualOverrides,
} from "@/lib/visualThresholds";
import {
  describePreset,
  findClosestPreset,
  loadActivePresetId,
  loadPresets,
  makePreset,
  saveActivePresetId,
  savePresets,
  valuesEqual,
  type VisualPreset,
  type VisualPresetValues,
} from "@/lib/visualPresets";

import { downloadThresholdExport, parseThresholdExport } from "@/lib/visualThresholdExport";
import {
  VISUAL_LIMITS,
  auditVisualOverrides,
  describeAuditIssues,
  describeValidationIssues,
  validateVisualOverrides,
} from "@/lib/visualThresholdValidation";

import {
  VISUAL_RUN_ENGINES,
  useVisualRun,
  type VisualRunEngine,
} from "@/lib/useVisualRun";
import {
  addRunHistoryEntry,
  describeRunSummary,
  formatDurationMs,
  downloadRunHistory,
  loadRunHistory,

  parseRunSummary,
  saveRunHistory,
  type VisualRunHistoryEntry,
} from "@/lib/visualRunHistory";



/**
 * Visual threshold settings.
 *
 * Read-only view of the committed per-provider tolerances plus a sandbox for
 * `VISUAL_*` overrides: change a value here, see the resolved policy for every
 * provider × engine instantly, then copy the exact shell command to run the
 * suite locally with those overrides before committing anything.
 */

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

/** Parse a text field into a number, treating blank/invalid as "unset". */
const parse = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export default function AdminVisualThresholds() {
  const [floor, setFloor] = useState("");
  const [threshold, setThreshold] = useState("");
  const [retries, setRetries] = useState("");
  const [perProvider, setPerProvider] = useState<Record<string, string>>({});

  const overrides: VisualOverrides = useMemo(
    () => ({
      maxDiffRatioFloor: parse(floor),
      threshold: parse(threshold),
      retries: parse(retries),
      perProvider: Object.fromEntries(
        Object.entries(perProvider).map(([id, raw]) => [id, parse(raw)]),
      ),
    }),
    [floor, threshold, retries, perProvider],
  );

  const rows = useMemo(
    () =>
      SHARE_PROVIDERS.map((provider) => {
        const committed = PROVIDER_TOLERANCE[provider.id] ?? DEFAULT_TOLERANCE;
        const overridden = overrides.perProvider?.[provider.id];
        return {
          ...provider,
          committed,
          overridden,
          rationale: TOLERANCE_RATIONALE[provider.id] ?? "",
          engines: ENGINES.map((engine) => ({
            engine,
            committedPolicy: resolveVisualPolicy(provider.id, engine),
            effective: resolveVisualPolicy(provider.id, engine, overrides),
          })),
        };
      }),
    [overrides],
  );

  /** Only the overrides that actually differ from the committed defaults. */
  const envPairs = useMemo(() => {
    const pairs: string[] = [];
    if (overrides.maxDiffRatioFloor !== undefined)
      pairs.push(`VISUAL_MAX_DIFF_RATIO=${overrides.maxDiffRatioFloor}`);
    if (overrides.threshold !== undefined) pairs.push(`VISUAL_THRESHOLD=${overrides.threshold}`);
    if (overrides.retries !== undefined)
      pairs.push(`VISUAL_RETRIES=${Math.max(1, Math.round(overrides.retries))}`);
    for (const [id, value] of Object.entries(overrides.perProvider ?? {})) {
      if (value !== undefined) pairs.push(`VISUAL_TOLERANCE_${id.toUpperCase()}=${value}`);
    }
    return pairs;
  }, [overrides]);

  const command = envPairs.length
    ? `${envPairs.join(" \\\n  ")} \\\n  bun run test:cards`
    : "bun run test:cards";

  const dirty = envPairs.length > 0;

  /** Range checks on every typed VISUAL_* value. Blank fields are "unset". */
  const validation = useMemo(
    () => validateVisualOverrides({ floor, threshold, retries, perProvider }),
    [floor, threshold, retries, perProvider],
  );

  /** Download the effective provider × engine policy as shareable JSON. */
  const exportJson = () => {
    if (!validation.valid) {
      toast.error(`Fix the invalid overrides first — ${describeValidationIssues(validation)}`);
      return;
    }
    try {
      const filename = downloadThresholdExport(overrides);
      toast.success(`Exported ${filename}`);
    } catch {
      toast.error("Could not generate the export file");
    }
  };

  /** Load a previously exported JSON file and apply its VISUAL_* overrides. */
  const importInputRef = useRef<HTMLInputElement>(null);

  const importJson = async (file: File) => {
    try {
      const parsed = parseThresholdExport(await file.text());
      setFloor(parsed.floor);
      setThreshold(parsed.threshold);
      setRetries(parsed.retries);
      setPerProvider(parsed.perProvider);
      setActiveId(null);
      saveActivePresetId(null);
      const n = Object.keys(parsed.perProvider).length;
      toast.success(
        `Imported ${n} provider override${n === 1 ? "" : "s"} from ${file.name}`,
      );
      const check = validateVisualOverrides(parsed);
      if (!check.valid) {
        toast.warning(`Imported values are out of range — ${describeValidationIssues(check)}`);
      }
      if (parsed.unknownProviders.length) {
        toast.warning(`Ignored unknown providers: ${parsed.unknownProviders.join(", ")}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    }
  };

  const reset = () => {
    setFloor("");
    setThreshold("");
    setRetries("");
    setPerProvider({});
    setActiveId(null);
    saveActivePresetId(null);
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable — select and copy manually");
    }
  };

  /* ---------------- Presets (localStorage) ---------------- */

  const [presets, setPresets] = useState<VisualPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const values: VisualPresetValues = useMemo(
    () => ({ floor, threshold, retries, perProvider }),
    [floor, threshold, retries, perProvider],
  );

  // Hydrate presets and re-apply the last active one.
  useEffect(() => {
    const stored = loadPresets();
    setPresets(stored);
    const lastId = loadActivePresetId();
    const last = stored.find((p) => p.id === lastId);
    if (last) {
      setActiveId(last.id);
      setFloor(last.floor);
      setThreshold(last.threshold);
      setRetries(last.retries);
      setPerProvider(last.perProvider);
    }
  }, []);

  const activePreset = presets.find((p) => p.id === activeId) ?? null;
  const activeMatches = activePreset ? valuesEqual(activePreset, values) : false;

  const persist = (next: VisualPreset[]) => {
    setPresets(next);
    savePresets(next);
  };

  const applyPreset = (preset: VisualPreset) => {
    setFloor(preset.floor);
    setThreshold(preset.threshold);
    setRetries(preset.retries);
    setPerProvider(preset.perProvider);
    setActiveId(preset.id);
    saveActivePresetId(preset.id);
    toast.success(`Switched to “${preset.name}”`);
  };

  /** Persist a preset produced by the scheduled auto-tuner. */
  const handleAutoTuned = (
    name: string,
    tuned: VisualPresetValues,
    opts: { mode: "update" | "new"; apply: boolean },
  ) => {
    const existing = opts.mode === "update" ? presets.find((p) => p.name === name) : undefined;
    const preset: VisualPreset = existing
      ? { ...existing, ...tuned, updatedAt: new Date().toISOString() }
      : makePreset(name, tuned);
    const next = existing
      ? presets.map((p) => (p.id === preset.id ? preset : p))
      : [...presets, preset];
    persist(next);
    if (opts.apply) {
      setFloor(preset.floor);
      setThreshold(preset.threshold);
      setRetries(preset.retries);
      setPerProvider({ ...preset.perProvider });
      setActiveId(preset.id);
      saveActivePresetId(preset.id);
    }
  };


  /** Preset whose values are identical to what's currently typed. */
  const duplicateOfPresetName = useMemo(() => {
    const match = presets.find((p) => valuesEqual(p, values));
    return match ? match.name : null;
  }, [presets, values]);

  /** Coherence audit for a candidate preset name (missing / conflicting). */
  const auditFor = (candidateName: string) =>
    auditVisualOverrides(
      { floor, threshold, retries, perProvider },
      {
        name: candidateName,
        existingNames: presets.map((p) => p.name),
        duplicateOfPresetName,
      },
    );

  /** Save the currently typed overrides under `rawName`. Returns success. */
  const savePresetNamed = (rawName: string): boolean => {
    const name = rawName.trim();
    if (!validation.valid) {
      toast.error(`Fix the invalid overrides first — ${describeValidationIssues(validation)}`);
      return false;
    }
    const audit = auditFor(name);
    if (!audit.canSave) {
      toast.error(`Can't save this preset — ${describeAuditIssues(audit.blockers)}`);
      return false;
    }
    const preset = makePreset(name, values);
    persist([...presets, preset]);
    setActiveId(preset.id);
    saveActivePresetId(preset.id);
    setNewName("");
    toast.success(`Saved “${preset.name}”`);
    if (audit.warnings.length) {
      toast.warning(`Saved with warnings — ${describeAuditIssues(audit.warnings)}`);
    }
    return true;
  };

  const saveAsNew = () => {
    savePresetNamed(newName);
  };

  /* Quick "save current edits as a new preset" dialog. */
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");
  const saveDialogAudit = useMemo(
    () => auditFor(saveDialogName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveDialogName, presets, duplicateOfPresetName, floor, threshold, retries, perProvider],
  );

  /** Closest saved preset + field-level diff, shown in the save dialog. */
  const closest = useMemo(
    () => findClosestPreset(presets, values, activeId),
    [presets, values, activeId],
  );



  /** First unused "<base>", "<base> 2", … name. */
  const uniqueName = (base: string): string => {
    const taken = new Set(presets.map((p) => p.name.trim().toLowerCase()));
    if (!taken.has(base.trim().toLowerCase())) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`.trim().toLowerCase())) n += 1;
    return `${base} ${n}`;
  };

  const suggestPresetName = (): string =>
    uniqueName(activePreset ? `${activePreset.name} copy` : "Preset");

  const openSaveDialog = () => {
    setSaveDialogName(suggestPresetName());
    setSaveDialogOpen(true);
  };

  const confirmSaveDialog = () => {
    if (savePresetNamed(saveDialogName)) setSaveDialogOpen(false);
  };

  /* One-click duplicate: copy → make active → offer a rename. */
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const duplicatePreset = (preset: VisualPreset) => {
    const copy = makePreset(uniqueName(`${preset.name} copy`), preset);
    persist([...presets, copy]);
    setFloor(copy.floor);
    setThreshold(copy.threshold);
    setRetries(copy.retries);
    setPerProvider({ ...copy.perProvider });
    setActiveId(copy.id);
    saveActivePresetId(copy.id);
    setRenameId(copy.id);
    setRenameName(copy.name);
    toast.success(`Duplicated “${preset.name}” — edits now apply to the copy`);
  };

  const openRename = (preset: VisualPreset) => {
    setRenameId(preset.id);
    setRenameName(preset.name);
  };

  const confirmRename = () => {
    const target = presets.find((p) => p.id === renameId);
    if (!target) return;
    const name = renameName.trim();
    if (!name) {
      toast.error("Give the preset a name");
      return;
    }
    if (
      presets.some((p) => p.id !== target.id && p.name.trim().toLowerCase() === name.toLowerCase())
    ) {
      toast.error("A preset with that name already exists");
      return;
    }
    persist(
      presets.map((p) =>
        p.id === target.id ? { ...p, name, updatedAt: new Date().toISOString() } : p,
      ),
    );
    setRenameId(null);
    toast.success(`Renamed to “${name}”`);
  };



  const updateActive = () => {
    if (!activePreset) return;
    if (!validation.valid) {
      toast.error(`Fix the invalid overrides first — ${describeValidationIssues(validation)}`);
      return;
    }
    const updated: VisualPreset = {
      ...activePreset,
      ...values,
      perProvider: { ...perProvider },
      updatedAt: new Date().toISOString(),
    };
    persist(presets.map((p) => (p.id === updated.id ? updated : p)));
    toast.success(`Updated “${updated.name}”`);
  };

  const deletePreset = (preset: VisualPreset) => {
    persist(presets.filter((p) => p.id !== preset.id));
    if (activeId === preset.id) {
      setActiveId(null);
      saveActivePresetId(null);
    }
    toast.success(`Deleted “${preset.name}”`);
  };


  /* ---------------- Local runner ---------------- */

  const run = useVisualRun();
  const [runEngines, setRunEngines] = useState<VisualRunEngine[]>(["chromium"]);
  const [updateSnapshots, setUpdateSnapshots] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  /** Exact command issued by the dev-only Vite runner for the current inputs. */
  const devRunnerCommand = [
    ...envPairs,
    "bunx",
    "playwright",
    "test",
    "e2e/provider-card-visual.spec.ts",
    ...runEngines.map((engine) => `--project=${engine}`),
    "--reporter=list",
    ...(updateSnapshots ? ["--update-snapshots"] : []),
  ].join(" ");

  /** envPairs ("KEY=value") as a map for the runner query string. */
  const envMap = useMemo(
    () =>
      Object.fromEntries(
        envPairs.map((pair) => {
          const idx = pair.indexOf("=");
          return [pair.slice(0, idx), pair.slice(idx + 1)];
        }),
      ),
    [envPairs],
  );

  const toggleEngine = (engine: VisualRunEngine) =>
    setRunEngines((prev) => {
      const next = prev.includes(engine)
        ? prev.filter((e) => e !== engine)
        : VISUAL_RUN_ENGINES.filter((e) => e === engine || prev.includes(e));
      return next.length ? next : prev;
    });


  // Keep the streamed log pinned to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run.lines]);

  /* ---------------- Run history ---------------- */

  const [history, setHistory] = useState<VisualRunHistoryEntry[]>([]);
  const pendingRun = useRef<
    | {
        startedAt: number;
        presetName: string | null;
        engines: string[];
        updateSnapshots: boolean;
        overrideSummary: string;
      }
    | null
  >(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    setHistory(loadRunHistory());
  }, []);

  // Record an entry as soon as a run stops (finished or cancelled).
  useEffect(() => {
    if (run.running) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;

    const meta = pendingRun.current;
    pendingRun.current = null;
    if (!meta) return;

    const finishedAt = Date.now();
    const summary = parseRunSummary(run.lines.map((l) => l.line));
    const entry: VisualRunHistoryEntry = {
      id:
        globalThis.crypto?.randomUUID?.() ??
        `run-${finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date(meta.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - meta.startedAt,
      presetName: meta.presetName,
      engines: meta.engines,
      updateSnapshots: meta.updateSnapshots,
      overrideSummary: meta.overrideSummary,
      exitCode: run.exitCode,
      status: run.exitCode === null ? "cancelled" : run.exitCode === 0 ? "passed" : "failed",
      summary,
    };
    setHistory((prev) => addRunHistoryEntry(prev, entry));
  }, [run.running, run.exitCode, run.lines]);

  /**
   * Snapshot of everything a reset wipes, so an accidental reset can be undone
   * until the next reset (or a page reload).
   */
  const [resetSnapshot, setResetSnapshot] = useState<{
    values: VisualPresetValues;
    presets: VisualPreset[];
    activeId: string | null;
    newName: string;
  } | null>(null);

  const restoreReset = () => {
    if (!resetSnapshot) return;
    setFloor(resetSnapshot.values.floor);
    setThreshold(resetSnapshot.values.threshold);
    setRetries(resetSnapshot.values.retries);
    setPerProvider({ ...resetSnapshot.values.perProvider });
    setNewName(resetSnapshot.newName);
    setPresets(resetSnapshot.presets);
    savePresets(resetSnapshot.presets);
    setActiveId(resetSnapshot.activeId);
    saveActivePresetId(resetSnapshot.activeId);
    setResetSnapshot(null);
    toast.success("Reset undone — presets and overrides restored");
  };

  const restoreRef = useRef(restoreReset);
  restoreRef.current = restoreReset;


  /**
   * Full reset: wipe every saved preset plus the typed overrides so the page
   * shows exactly the committed thresholds again. Run history is kept.
   */
  const resetEverything = () => {
    setResetSnapshot({
      values: { floor, threshold, retries, perProvider: { ...perProvider } },
      presets,
      activeId,
      newName,
    });
    setFloor("");
    setThreshold("");
    setRetries("");
    setPerProvider({});
    setActiveId(null);
    saveActivePresetId(null);
    setNewName("");
    setPresets([]);
    savePresets([]);
    toast.success("Reset to committed thresholds — all saved presets cleared", {
      action: { label: "Undo", onClick: restoreRef.current },
      duration: 10000,
    });
  };


  /* Run history search / filters (view-only, not persisted). */
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "passed" | "failed" | "cancelled">(
    "all",
  );
  const [historyEngine, setHistoryEngine] = useState<string>("all");

  const historyEngineOptions = useMemo(
    () => Array.from(new Set(history.flatMap((e) => e.engines))).sort(),
    [history],
  );

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return history.filter((e) => {
      if (historyStatus !== "all" && e.status !== historyStatus) return false;
      if (historyEngine !== "all" && !e.engines.includes(historyEngine)) return false;
      if (!q) return true;
      const haystack = [
        e.presetName ?? "none",
        e.engines.join(" "),
        e.status,
        e.overrideSummary,
        describeRunSummary(e.summary),
        ...(e.summary?.failures ?? []),
        new Date(e.startedAt).toLocaleString(),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [history, historyQuery, historyStatus, historyEngine]);

  const historyFiltered = filteredHistory.length !== history.length;

  const exportHistory = (format: "json" | "csv") => {
    if (!filteredHistory.length) {
      toast.error("No runs to export yet");
      return;
    }
    try {
      const filename = downloadRunHistory(filteredHistory, format);
      toast.success(`Exported ${filename} (${filteredHistory.length} run${filteredHistory.length === 1 ? "" : "s"})`);
    } catch {
      toast.error("Could not generate the export file");
    }
  };


  const clearHistory = () => {

    setHistory([]);
    saveRunHistory([]);
    toast.success("Run history cleared");
  };

  const startRun = () => {
    if (!runEngines.length) {
      toast.error("Pick at least one engine");
      return;
    }
    pendingRun.current = {
      startedAt: Date.now(),
      presetName: activePreset ? (activeMatches ? activePreset.name : `${activePreset.name} (edited)`) : null,
      engines: [...runEngines],
      updateSnapshots,
      overrideSummary: describePreset(values),
    };
    run.start({ env: envMap, engines: runEngines, update: updateSnapshots });
  };

  return (

    <div className="min-h-screen bg-background text-foreground">
      <SEO path="/admin/visual-thresholds" title="Visual thresholds" description="Per-provider pixel-diff tolerances for the provider card visual suite." noindex />

      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-heading font-bold">
              <Gauge className="h-7 w-7 text-primary" aria-hidden />
              Visual thresholds
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              The pixel-diff tolerances the provider-card suite enforces, straight from{" "}
              <code className="text-primary">src/lib/visualThresholds.ts</code>. Try{" "}
              <code className="text-primary">VISUAL_*</code> overrides below, check the resolved
              numbers, then copy the command to run the suite locally before committing a change.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importJson(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" /> Import JSON
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={!validation.valid}>
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <AlertTriangle className="mr-2 h-4 w-4" /> Reset all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to committed thresholds?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears every typed <code>VISUAL_*</code> override and deletes all{" "}
                    {presets.length} saved preset{presets.length === 1 ? "" : "s"} from this
                    browser. The page reverts to the values committed in{" "}
                    <code>src/lib/visualThresholds.ts</code>. Run history is kept and nothing in
                    the repository changes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={resetEverything}>
                    Reset everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {resetSnapshot && (
              <Button variant="secondary" size="sm" onClick={restoreReset}>
                <Undo2 className="mr-2 h-4 w-4" /> Undo reset
              </Button>
            )}

            <Button asChild variant="outline" size="sm">
              <Link to="/admin/dashboard">
                <Home className="mr-2 h-4 w-4" /> Admin
              </Link>
            </Button>
          </div>
        </header>

        {/* Saved presets */}
        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-heading font-semibold">
                <Bookmark className="h-5 w-5 text-primary" aria-hidden /> Saved presets
              </h2>
              <p className="text-sm text-muted-foreground">
                Keep several override sets in this browser and switch between them. Stored locally
                only — nothing is committed or shared.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={openSaveDialog}
                disabled={!dirty || !validation.valid}
              >
                <Bookmark className="mr-2 h-4 w-4" /> Save edits as new preset…
              </Button>
              {activePreset && !activeMatches && (
                <Button variant="outline" size="sm" onClick={updateActive} disabled={!validation.valid}>
                  <Save className="mr-2 h-4 w-4" /> Update “{activePreset.name}”
                </Button>
              )}
            </div>
          </div>

          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save current overrides as a preset</DialogTitle>
                <DialogDescription>
                  Captures the overrides typed on this page right now
                  {activePreset && !activeMatches
                    ? ` — your edits to “${activePreset.name}” stay untouched.`
                    : "."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="preset-name">
                  Preset name
                </label>
                <Input
                  id="preset-name"
                  autoFocus
                  value={saveDialogName}
                  onChange={(e) => setSaveDialogName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmSaveDialog();
                  }}
                  placeholder="e.g. loose webkit"
                />
                <p className="text-xs text-muted-foreground">{describePreset(values)}</p>
              </div>

              {(saveDialogAudit.blockers.length > 0 || saveDialogAudit.warnings.length > 0) && (
                <ul className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  {[...saveDialogAudit.blockers, ...saveDialogAudit.warnings].map((issue) => (
                    <li
                      key={`${issue.level}-${issue.field}-${issue.message}`}
                      className={
                        issue.level === "blocker" ? "text-destructive" : "text-muted-foreground"
                      }
                    >
                      <span className="font-medium">
                        {issue.level === "blocker" ? "Blocked" : "Warning"} · {issue.label}
                      </span>
                      <span className="block">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {closest && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Compared with the closest saved preset{" "}
                    <span className="font-medium text-foreground">“{closest.preset.name}”</span>
                    {closest.diffs.length === 0
                      ? " — identical, nothing changed."
                      : ` — ${closest.diffs.length} field${closest.diffs.length === 1 ? "" : "s"} changed.`}
                  </p>
                  {closest.diffs.length > 0 && (
                    <ul className="space-y-1 font-mono text-xs">
                      {closest.diffs.map((diff) => (
                        <li key={diff.field} className="flex flex-wrap items-baseline gap-2">
                          <span className="text-muted-foreground">{diff.label}</span>
                          <span className="text-destructive line-through">
                            {diff.from === "" ? "unset" : diff.from}
                          </span>
                          <span className="text-muted-foreground" aria-hidden>
                            →
                          </span>
                          <span className="text-primary">{diff.to === "" ? "unset" : diff.to}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {diff.kind}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}



              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmSaveDialog} disabled={!saveDialogAudit.canSave}>
                  <Save className="mr-2 h-4 w-4" />{" "}
                  {saveDialogAudit.warnings.length ? "Save anyway" : "Save preset"}
                </Button>
              </DialogFooter>

            </DialogContent>
          </Dialog>


          {presets.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Apply preset</span>
                <Select
                  value={activeId ?? ""}
                  onValueChange={(id) => {
                    const preset = presets.find((p) => p.id === id);
                    if (preset) applyPreset(preset);
                  }}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Choose a saved preset…" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <span className="pb-2 text-xs text-muted-foreground">
                Switches the active thresholds instantly.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">

            <label className="space-y-2 text-sm">
              <span className="font-medium">New preset name</span>
              <Input
                className="w-64"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAsNew();
                }}
                placeholder="e.g. loose webkit"
              />
            </label>
            <Button size="sm" onClick={saveAsNew} disabled={!dirty || !validation.valid}>
              <Save className="mr-2 h-4 w-4" /> Save current overrides
            </Button>
            {!dirty && (
              <span className="pb-2 text-xs text-muted-foreground">
                Set at least one override below to save a preset.
              </span>
            )}
          </div>

          {presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No presets saved yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {presets.map((preset) => {
                const isActive = preset.id === activeId;
                return (
                  <li
                    key={preset.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                      isActive ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {isActive && <Check className="h-4 w-4 text-primary" aria-hidden />}
                        <span className="truncate">{preset.name}</span>
                        {isActive && !activeMatches && (
                          <Badge variant="outline" className="text-[10px]">
                            edited
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {describePreset(preset)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => applyPreset(preset)}
                        disabled={isActive && activeMatches}
                      >
                        Apply
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Duplicate preset ${preset.name}`}
                        title="Duplicate and edit the copy"
                        onClick={() => duplicatePreset(preset)}
                      >
                        <CopyPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename preset ${preset.name}`}
                        title="Rename"
                        onClick={() => openRename(preset)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete preset ${preset.name}`}
                        onClick={() => deletePreset(preset)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Dialog open={renameId !== null} onOpenChange={(open) => !open && setRenameId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename preset</DialogTitle>
                <DialogDescription>
                  The copy is already active — rename it, then tweak only the overrides you want to
                  change.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename();
                }}
                placeholder="Preset name"
              />
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setRenameId(null)}>
                  Keep name
                </Button>
                <Button size="sm" onClick={confirmRename} disabled={!renameName.trim()}>
                  <Save className="mr-2 h-4 w-4" /> Rename
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>


        {/* Global overrides */}

        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-heading font-semibold">Global overrides</h2>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset to committed values
              </Button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <label className="space-y-2 text-sm">
              <span className="font-medium">VISUAL_MAX_DIFF_RATIO</span>
              <Input
                inputMode="decimal"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="unset (no floor)"
                aria-invalid={Boolean(validation.byField.floor)}
              />
              {validation.byField.floor ? (
                <span className="block text-xs text-destructive">{validation.byField.floor}</span>
              ) : (
                <span className="block text-xs text-muted-foreground">
                  Minimum tolerance applied to every provider ({VISUAL_LIMITS.floor.min}–
                  {VISUAL_LIMITS.floor.max}). Raises anything stricter; never lowers.
                </span>
              )}
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">VISUAL_THRESHOLD</span>
              <Input
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={`default ${DEFAULT_PIXEL_THRESHOLD}`}
                aria-invalid={Boolean(validation.byField.threshold)}
              />
              {validation.byField.threshold ? (
                <span className="block text-xs text-destructive">
                  {validation.byField.threshold}
                </span>
              ) : (
                <span className="block text-xs text-muted-foreground">
                  Per-pixel colour sensitivity, {VISUAL_LIMITS.threshold.min}–
                  {VISUAL_LIMITS.threshold.max}. Lower is stricter.
                </span>
              )}
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">VISUAL_RETRIES</span>
              <Input
                inputMode="numeric"
                value={retries}
                onChange={(e) => setRetries(e.target.value)}
                placeholder={`default ${DEFAULT_ATTEMPTS}`}
                aria-invalid={Boolean(validation.byField.retries)}
              />
              {validation.byField.retries ? (
                <span className="block text-xs text-destructive">{validation.byField.retries}</span>
              ) : (
                <span className="block text-xs text-muted-foreground">
                  Card re-renders before a failure is reported ({VISUAL_LIMITS.retries.min}–
                  {VISUAL_LIMITS.retries.max}, whole numbers).
                </span>
              )}
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Engine multipliers:{" "}
            {ENGINES.map((e) => `${e} ${ENGINE_MULTIPLIER[e]}×`).join(" · ")} — every resolved
            tolerance is capped at {pct(MAX_ALLOWED_RATIO)}.
          </p>
        </Card>

        {/* Per-provider table */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-heading font-semibold">Per-provider tolerances</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Provider</th>
                  <th className="py-2 pr-4 font-medium">Base tolerance</th>
                  <th className="py-2 pr-4 font-medium">
                    VISUAL_TOLERANCE_&lt;PROVIDER&gt;
                  </th>
                  {ENGINES.map((engine) => (
                    <th key={engine} className="py-2 pr-4 font-medium">
                      {engine}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 align-top">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{row.label}</div>
                      <div className="mt-1 max-w-[15rem] text-xs text-muted-foreground">
                        {row.rationale}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{pct(row.committed)}</td>
                    <td className="py-3 pr-4">
                      <Input
                        className="h-8 w-28"
                        inputMode="decimal"
                        aria-label={`Tolerance override for ${row.label}`}
                        value={perProvider[row.id] ?? ""}
                        onChange={(e) =>
                          setPerProvider((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        placeholder={String(row.committed)}
                        aria-invalid={Boolean(validation.byField[row.id])}
                      />
                      {validation.byField[row.id] && (
                        <span className="mt-1 block max-w-[9rem] text-[11px] text-destructive">
                          {validation.byField[row.id]}
                        </span>
                      )}
                    </td>
                    {row.engines.map(({ engine, committedPolicy, effective }) => {
                      const changed =
                        effective.maxDiffPixelRatio !== committedPolicy.maxDiffPixelRatio;
                      return (
                        <td key={engine} className="py-3 pr-4 font-mono text-xs">
                          <span className={changed ? "text-primary" : ""}>
                            {pct(effective.maxDiffPixelRatio)}
                          </span>
                          {changed && (
                            <span className="block text-[11px] text-muted-foreground line-through">
                              {pct(committedPolicy.maxDiffPixelRatio)}
                            </span>
                          )}
                          {effective.maxDiffPixelRatio === MAX_ALLOWED_RATIO && (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              capped
                            </Badge>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Effective tolerance = max(base or override × engine multiplier, VISUAL_MAX_DIFF_RATIO),
            capped at {pct(MAX_ALLOWED_RATIO)}. Retries:{" "}
            <span className="font-mono">
              {resolveVisualPolicy("facebook", "chromium", overrides).attempts}
            </span>{" "}
            · per-pixel threshold:{" "}
            <span className="font-mono">
              {resolveVisualPolicy("facebook", "chromium", overrides).threshold}
            </span>
          </p>
        </Card>

        {/* One-click local run */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-heading font-semibold">
                <Terminal className="h-5 w-5 text-primary" aria-hidden /> Run card diffs now
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Runs the provider-card visual suite on this machine with the overrides typed above
                and streams Playwright's output here. Available while the dev server is running.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {run.running ? (
                <Button size="sm" variant="destructive" onClick={run.stop}>
                  <Square className="mr-2 h-4 w-4" /> Stop
                </Button>
              ) : (
                <Button size="sm" onClick={startRun} disabled={run.available !== true}>
                  <Play className="mr-2 h-4 w-4" /> Run with these overrides
                </Button>
              )}
              {run.lines.length > 0 && !run.running && (
                <Button size="sm" variant="ghost" onClick={run.clear}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Engines:</span>
            {VISUAL_RUN_ENGINES.map((engine) => {
              const on = runEngines.includes(engine);
              return (
                <Button
                  key={engine}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  aria-pressed={on}
                  disabled={run.running}
                  onClick={() => toggleEngine(engine)}
                >
                  {engine}
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant={updateSnapshots ? "default" : "outline"}
              aria-pressed={updateSnapshots}
              disabled={run.running}
              onClick={() => setUpdateSnapshots((v) => !v)}
            >
              --update-snapshots
            </Button>
            {run.exitCode !== null && (
              <Badge variant={run.exitCode === 0 ? "outline" : "destructive"}>
                {run.exitCode === 0 ? "passed" : `exit ${run.exitCode}`}
              </Badge>
            )}
          </div>

          {run.available === false && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              The local runner endpoint isn't reachable — it only exists in the Vite dev server. Use
              the copy-command block below instead.
            </p>
          )}

          {(run.lines.length > 0 || run.running) && (
            <pre
              ref={logRef}
              className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed"
              aria-live="polite"
            >
              {run.lines.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.channel === "stderr"
                      ? "text-destructive"
                      : entry.channel === "meta"
                        ? "text-primary"
                        : ""
                  }
                >
                  {entry.line || "\u00a0"}
                </div>
              ))}
              {run.running && <div className="text-muted-foreground">…running</div>}
            </pre>
          )}
        </Card>

        {/* Scheduled auto-tuning */}
        <Card className="p-6">
          <VisualAutoTunePanel
            history={history}
            currentValues={values}
            onTuned={handleAutoTuned}
          />
        </Card>

        {/* Run history */}

        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-heading font-semibold">
                <History className="h-5 w-5 text-primary" aria-hidden /> Run history
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                The last {history.length ? history.length : "few"} card-diff runs started from this
                page — timestamp, preset, engines and the parsed diff summary. Stored in this
                browser only.
              </p>
            </div>
            {history.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => exportHistory("json")}>
                  <Download className="mr-2 h-4 w-4" /> Export JSON
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportHistory("csv")}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={clearHistory}>
                  <Trash2 className="mr-2 h-4 w-4" /> Clear history
                </Button>
              </div>
            )}

          </div>

          {history.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Search preset, engine, overrides, failing test…"
                aria-label="Search run history"
                className="h-9 w-full max-w-xs"
              />
              <div className="flex flex-wrap items-center gap-1">
                {(["all", "passed", "failed", "cancelled"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={historyStatus === s ? "secondary" : "ghost"}
                    aria-pressed={historyStatus === s}
                    onClick={() => setHistoryStatus(s)}
                  >
                    {s === "all" ? "All outcomes" : s}
                  </Button>
                ))}
              </div>
              {historyEngineOptions.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  {["all", ...historyEngineOptions].map((eng) => (
                    <Button
                      key={eng}
                      size="sm"
                      variant={historyEngine === eng ? "secondary" : "ghost"}
                      aria-pressed={historyEngine === eng}
                      onClick={() => setHistoryEngine(eng)}
                    >
                      {eng === "all" ? "All engines" : eng}
                    </Button>
                  ))}
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                {filteredHistory.length} of {history.length} run
                {history.length === 1 ? "" : "s"}
              </span>
              {(historyFiltered || historyQuery) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setHistoryQuery("");
                    setHistoryStatus("all");
                    setHistoryEngine("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {history.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              No runs recorded yet. Start one above and it will be logged here.
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              No runs match these filters.
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredHistory.map((entry) => (

                <li key={entry.id} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge
                      variant={
                        entry.status === "passed"
                          ? "outline"
                          : entry.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {entry.status}
                    </Badge>
                    <span className="font-medium">
                      {new Date(entry.startedAt).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      · {formatDurationMs(entry.durationMs)}
                    </span>
                    <span className="text-muted-foreground">
                      · {entry.engines.join(", ")}
                    </span>
                    {entry.updateSnapshots && (
                      <Badge variant="secondary">--update-snapshots</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Preset:{" "}
                      <span className="text-foreground">{entry.presetName ?? "none"}</span>
                    </span>
                    <span>
                      Overrides: <span className="text-foreground">{entry.overrideSummary}</span>
                    </span>
                    <span>
                      Result:{" "}
                      <span className="text-foreground">{describeRunSummary(entry.summary)}</span>
                      {entry.summary.duration ? ` (${entry.summary.duration})` : ""}
                    </span>
                  </div>

                  {entry.summary.failures.length > 0 && (
                    <ul className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
                      {entry.summary.failures.map((failure) => (
                        <li key={failure} className="text-destructive">
                          {failure}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>



        {/* Runnable command */}

        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-heading font-semibold">Run it locally</h2>
              <p className="text-sm text-muted-foreground">
                Nothing here is saved — overrides only exist in these commands, so you can test
                before deciding to commit a change to{" "}
                <code className="text-primary">src/lib/visualThresholds.ts</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(devRunnerCommand, "Dev runner command")}>
                <Copy className="mr-2 h-4 w-4" /> Copy dev runner command
              </Button>
              <Button size="sm" onClick={() => copy(command, "Command")}>
                <Copy className="mr-2 h-4 w-4" /> Copy CI command
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Dev runner command · selected engines and update mode</p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
              {devRunnerCommand}
            </pre>
          </div>

          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
            {command}
          </pre>

          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              Single engine:{" "}
              <code className="text-primary">bun run test:cards:chromium</code>
            </p>
            <p>
              Re-baseline after an intentional change:{" "}
              <code className="text-primary">bun run test:cards:update</code>, or comment{" "}
              <code className="text-primary">/update-baselines</code> on the PR.
            </p>
            <p>
              Failure report: <code className="text-primary">bun run test:cards:report</code> →{" "}
              <code className="text-primary">test-results/card-diff-report.html</code>
            </p>
            <p>
              Committing a change means editing{" "}
              <code className="text-primary">PROVIDER_TOLERANCE</code> — CI ignores your local env.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
