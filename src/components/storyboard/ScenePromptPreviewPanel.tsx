import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Eye, Sparkles, GitCompare, RotateCcw, Save, History, Trash2, Pencil, Check, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Scene } from "@/contexts/ProjectContext";
import { buildScenePromptPreview } from "@/lib/scene-prompt-preview";
import { diffWords, summarizeDiff } from "@/lib/text-diff";

interface ScenePromptPreviewPanelProps {
  scene: Scene;
  projectId?: string;
  characterStyle?: string;
  characterPayload?: {
    name?: string;
    description?: string;
    outfit?: string;
    vibe?: string;
    imageUrl?: string;
  } | null;
  keepCharacterConsistent?: boolean;
  defaultOpen?: boolean;
}

interface BaselineSnapshot {
  id: string;
  label?: string;
  directorDirective: string;
  finalPrompt: string;
  shotRole: string;
  isAroll: boolean;
  isBroll: boolean;
  capturedAt: number;
}

const MAX_HISTORY = 10;
const BASELINE_STORAGE_PREFIX = "syncvision:prompt-baseline:v1:";
const baselineKey = (projectId: string | undefined, sceneNumber: number) =>
  `${BASELINE_STORAGE_PREFIX}${projectId || "unscoped"}:${sceneNumber}`;

function isSnapshotShape(x: any): x is BaselineSnapshot {
  return (
    !!x &&
    typeof x.finalPrompt === "string" &&
    typeof x.directorDirective === "string" &&
    typeof x.capturedAt === "number"
  );
}

function loadHistory(key: string): BaselineSnapshot[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // New format: array of snapshots (newest first).
    if (Array.isArray(parsed)) {
      return parsed
        .filter(isSnapshotShape)
        .map((s) => ({ ...s, id: s.id || `${s.capturedAt}-${Math.random().toString(36).slice(2, 8)}` }));
    }
    // Legacy format: single snapshot — migrate to a one-entry history.
    if (isSnapshotShape(parsed)) {
      return [{ ...parsed, id: `${parsed.capturedAt}-legacy`, label: "Initial baseline" }];
    }
    return [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, history: BaselineSnapshot[]) {
  try {
    localStorage.setItem(key, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    /* quota errors are non-fatal — diff just won't survive reload */
  }
}

function newSnapshotId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type ViewMode = "current" | "diff";

export default function ScenePromptPreviewPanel({
  scene,
  projectId,
  characterStyle,
  characterPayload,
  keepCharacterConsistent,
  defaultOpen = false,
}: ScenePromptPreviewPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [view, setView] = useState<ViewMode>("current");

  const preview = useMemo(
    () =>
      buildScenePromptPreview(scene, {
        style: characterStyle,
        character: characterPayload,
        keepCharacterConsistent,
      }),
    [scene, characterStyle, characterPayload, keepCharacterConsistent],
  );

  /* ---------- baseline history (persisted per project + scene) ---------- */
  // History is a list of snapshots (newest first). Each scene tracks its own
  // history scoped by projectId + scene_number so it survives navigation and
  // reloads. The user picks which historical snapshot the diff compares
  // against via `selectedId`.
  const storageKey = useMemo(
    () => baselineKey(projectId, scene.scene_number),
    [projectId, scene.scene_number],
  );

  const [history, setHistoryState] = useState<BaselineSnapshot[]>(() => loadHistory(storageKey));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const persistHistory = (next: BaselineSnapshot[]) => {
    const trimmed = next.slice(0, MAX_HISTORY);
    setHistoryState(trimmed);
    saveHistory(storageKey, trimmed);
  };

  // Reload history when scene/project key changes (switching scenes).
  useEffect(() => {
    const loaded = loadHistory(storageKey);
    setHistoryState(loaded);
    setSelectedId(loaded[0]?.id ?? null);
    setEditingId(null);
  }, [storageKey]);

  // First-mount: seed an initial baseline if none exist so the user has
  // something to diff against immediately.
  useEffect(() => {
    if (history.length === 0) {
      const snap: BaselineSnapshot = {
        id: newSnapshotId(),
        label: "Initial baseline",
        directorDirective: preview.directorDirective,
        finalPrompt: preview.finalPrompt,
        shotRole: preview.shotRole,
        isAroll: preview.isAroll,
        isBroll: preview.isBroll,
        capturedAt: Date.now(),
      };
      persistHistory([snap]);
      setSelectedId(snap.id);
    } else if (!selectedId) {
      setSelectedId(history[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const baseline = useMemo<BaselineSnapshot | null>(
    () => history.find((h) => h.id === selectedId) ?? history[0] ?? null,
    [history, selectedId],
  );

  const saveCurrentAsSnapshot = (label?: string) => {
    const snap: BaselineSnapshot = {
      id: newSnapshotId(),
      label: label?.trim() || undefined,
      directorDirective: preview.directorDirective,
      finalPrompt: preview.finalPrompt,
      shotRole: preview.shotRole,
      isAroll: preview.isAroll,
      isBroll: preview.isBroll,
      capturedAt: Date.now(),
    };
    const next = [snap, ...history];
    persistHistory(next);
    setSelectedId(snap.id);
    toast.success("Snapshot saved to history");
  };

  const deleteSnapshot = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    persistHistory(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    toast.success("Snapshot removed");
  };

  const renameSnapshot = (id: string, label: string) => {
    const next = history.map((h) => (h.id === id ? { ...h, label: label.trim() || undefined } : h));
    persistHistory(next);
  };

  // Promote a history snapshot back to the top of the list so it becomes the
  // active baseline the live preview diffs against. Adds a fresh entry rather
  // than reordering so the original timestamp is preserved.
  const restoreSnapshot = (id: string) => {
    const src = history.find((h) => h.id === id);
    if (!src) return;
    const restored: BaselineSnapshot = {
      ...src,
      id: newSnapshotId(),
      label: src.label ? `${src.label} (restored)` : "Restored baseline",
      capturedAt: Date.now(),
    };
    const next = [restored, ...history.filter((h) => h.id !== id), src].slice(0, MAX_HISTORY);
    // Re-dedupe in case slice dropped the original; keep restored on top.
    const deduped = [restored, ...next.filter((h) => h.id !== restored.id)].slice(0, MAX_HISTORY);
    persistHistory(deduped);
    setSelectedId(restored.id);
    toast.success("Snapshot restored as current baseline");
  };




  const directiveDiff = useMemo(
    () => (baseline ? diffWords(baseline.directorDirective, preview.directorDirective) : []),
    [baseline, preview.directorDirective],
  );
  const promptDiff = useMemo(
    () => (baseline ? diffWords(baseline.finalPrompt, preview.finalPrompt) : []),
    [baseline, preview.finalPrompt],
  );
  const promptSummary = useMemo(() => summarizeDiff(promptDiff), [promptDiff]);
  const directiveSummary = useMemo(() => summarizeDiff(directiveDiff), [directiveDiff]);

  const hasChanges =
    !!baseline &&
    (baseline.finalPrompt !== preview.finalPrompt ||
      baseline.directorDirective !== preview.directorDirective);

  const roleChanged = !!baseline && baseline.shotRole !== preview.shotRole;
  const rollChanged =
    !!baseline && (baseline.isAroll !== preview.isAroll || baseline.isBroll !== preview.isBroll);

  const copy = async (text: string, label: string) => {
    const { copyWithFallback } = await import("@/lib/utils");
    const ok = copyWithFallback(text);
    if (ok) {
      toast.success(`${label} copied`);
    } else {
      toast.error("Copy blocked — clipboard access denied.\nThis usually happens when the page isn't served over HTTPS. Try switching to https:// or manually select and copy the text.", {
        duration: 6000,
      });
    }
  };

  const charCount = preview.finalPrompt.length;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <Eye className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground/90">Final Prompt Preview</span>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 shrink-0 ${
              preview.isBroll
                ? "border-amber-500/40 text-amber-500"
                : "border-primary/40 text-primary"
            }`}
          >
            {preview.isBroll ? "B-Roll" : preview.isAroll ? "A-Roll" : "Hero"}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/60 text-muted-foreground shrink-0">
            {preview.shotRole.replace(/_/g, " ")}
          </Badge>
          {hasChanges && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-500 shrink-0">
              +{promptSummary.added} / −{promptSummary.removed}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{charCount} chars</span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/40">
          {/* View toggle + baseline controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5 bg-background/60">
              <ToggleButton active={view === "current"} onClick={() => setView("current")}>
                <Eye className="h-3 w-3 mr-1" /> Current
              </ToggleButton>
              <ToggleButton active={view === "diff"} onClick={() => setView("diff")}>
                <GitCompare className="h-3 w-3 mr-1" /> Diff
                {hasChanges && (
                  <span className="ml-1 text-[9px] text-amber-500">
                    +{promptSummary.added}/−{promptSummary.removed}
                  </span>
                )}
              </ToggleButton>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setHistoryOpen((v) => !v)}
                title="Show baseline history"
              >
                <History className="h-3 w-3 mr-1" /> History
                <Badge
                  variant="outline"
                  className="ml-1 text-[9px] px-1 py-0 border-border/60 text-muted-foreground"
                >
                  {history.length}
                </Badge>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={!hasChanges}
                onClick={() => saveCurrentAsSnapshot()}
                title="Save current prompt as a new history snapshot"
              >
                <Save className="h-3 w-3 mr-1" /> Save snapshot
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={!baseline || !hasChanges}
                onClick={() => setSelectedId(history[0]?.id ?? null)}
                title="Compare against the most recent snapshot"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Latest
              </Button>
            </div>
          </div>

          {/* History list */}
          {historyOpen && (
            <div className="rounded-md border border-border/50 bg-background/50">
              <div className="px-2 py-1.5 border-b border-border/40 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Baseline history ({history.length}/{MAX_HISTORY})
                </span>
                <span className="text-[10px] text-muted-foreground">Click an entry to diff against it</span>
              </div>
              {history.length === 0 ? (
                <p className="px-2 py-2 text-[11px] text-muted-foreground italic">No snapshots yet.</p>
              ) : (
                <ul className="divide-y divide-border/40 max-h-48 overflow-auto">
                  {history.map((h, idx) => {
                    const isActive = h.id === (selectedId ?? history[0]?.id);
                    const isEditing = editingId === h.id;
                    return (
                      <li
                        key={h.id}
                        className={`px-2 py-1.5 text-[11px] flex items-center gap-2 ${
                          isActive ? "bg-primary/10" : "hover:bg-muted/40"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(h.id)}
                          className="flex-1 min-w-0 text-left flex items-center gap-2"
                        >
                          <span
                            className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] shrink-0 ${
                              isActive
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {isActive ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingLabel}
                                onChange={(e) => setEditingLabel(e.target.value)}
                                onBlur={() => {
                                  renameSnapshot(h.id, editingLabel);
                                  setEditingId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    renameSnapshot(h.id, editingLabel);
                                    setEditingId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingId(null);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-5 text-[11px] px-1 bg-background border border-border/60 rounded w-full"
                              />
                            ) : (
                              <span className="text-foreground/90">
                                {h.label || `Snapshot ${history.length - idx}`}
                              </span>
                            )}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-border/60 text-muted-foreground shrink-0"
                          >
                            {h.shotRole.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            {formatTimestamp(h.capturedAt)}
                          </span>
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            {h.finalPrompt.length}c
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copy(
                              `Director directive:\n${h.directorDirective.trim()}\n\nComposed prompt:\n${h.finalPrompt}`,
                              "Snapshot prompt"
                            );
                          }}
                          className="text-muted-foreground hover:text-primary shrink-0"
                          title="Copy director directive and composed prompt to clipboard"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            restoreSnapshot(h.id);
                          }}
                          className="text-muted-foreground hover:text-primary shrink-0"
                          title="Restore to current — promote this snapshot to the active baseline"
                        >
                          <Undo2 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(h.id);
                            setEditingLabel(h.label || "");
                          }}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title="Rename snapshot"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSnapshot(h.id);
                          }}
                          disabled={history.length <= 1}
                          className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={history.length <= 1 ? "Cannot delete the only snapshot" : "Delete snapshot"}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}


          {/* Field-level change pills (shown in diff view) */}
          {view === "diff" && baseline && hasChanges && (
            <div className="flex flex-wrap items-center gap-1.5">
              {roleChanged && (
                <ChangePill label={`Shot Role: ${baseline.shotRole.replace(/_/g, " ")} → ${preview.shotRole.replace(/_/g, " ")}`} />
              )}
              {rollChanged && (
                <ChangePill
                  label={`Roll: ${baseline.isBroll ? "B-Roll" : baseline.isAroll ? "A-Roll" : "Hero"} → ${
                    preview.isBroll ? "B-Roll" : preview.isAroll ? "A-Roll" : "Hero"
                  }`}
                />
              )}
              {directiveSummary.added + directiveSummary.removed > 0 && (
                <ChangePill
                  label={`Directive: +${directiveSummary.added} / −${directiveSummary.removed} words`}
                />
              )}
              <ChangePill label={`Prompt: +${promptSummary.added} / −${promptSummary.removed} words`} />
            </div>
          )}

          {view === "diff" && baseline && !hasChanges && (
            <p className="text-[11px] text-muted-foreground italic">
              No changes since the baseline. Adjust Scene Director fields or the prompt editor to see a diff.
            </p>
          )}

          {/* Director directive */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Director directive
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => copy(preview.directorDirective.trim(), "Directive")}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <PromptBlock
              text={preview.directorDirective.trim()}
              diff={view === "diff" && baseline ? directiveDiff : null}
              maxHeightClass="max-h-28"
            />
          </section>

          {/* Composed final prompt */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Composed prompt sent to model
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => copy(preview.finalPrompt, "Final prompt")}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <PromptBlock
              text={preview.finalPrompt}
              diff={view === "diff" && baseline ? promptDiff : null}
              maxHeightClass="max-h-56"
            />
            {!preview.isBroll && (
              <p className="text-[10px] text-muted-foreground">
                {preview.hasCharacterReference
                  ? "Sent with the character reference image attached."
                  : "No character reference image attached — text-only generation."}
              </p>
            )}
          </section>

          {view === "diff" && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
                added
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/25 border border-rose-500/50" />
                removed
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function PromptBlock({
  text,
  diff,
  maxHeightClass,
}: {
  text: string;
  diff: ReturnType<typeof diffWords> | null;
  maxHeightClass: string;
}) {
  return (
    <pre
      className={`text-[11px] leading-relaxed text-foreground/85 whitespace-pre-wrap break-words font-mono bg-background/60 border border-border/40 rounded px-2 py-1.5 ${maxHeightClass} overflow-auto`}
    >
      {diff ? (
        diff.map((seg, idx) => {
          if (seg.op === "equal") return <span key={idx}>{seg.text}</span>;
          if (seg.op === "add")
            return (
              <span
                key={idx}
                className="bg-emerald-500/20 text-emerald-300 rounded px-0.5"
              >
                {seg.text}
              </span>
            );
          return (
            <span
              key={idx}
              className="bg-rose-500/15 text-rose-300 line-through decoration-rose-400/60 rounded px-0.5"
            >
              {seg.text}
            </span>
          );
        })
      ) : (
        text
      )}
    </pre>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center text-[10px] px-2 py-1 rounded transition-colors ${
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ChangePill({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500 font-normal"
    >
      {label}
    </Badge>
  );
}
