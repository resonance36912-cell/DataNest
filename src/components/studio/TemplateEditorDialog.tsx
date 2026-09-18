import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, BookmarkPlus, Wand2, History, RotateCcw, Loader2, ChevronRight, Trash2, AlertTriangle, GitMerge, X } from "lucide-react";
import {
  diffTemplate,
  fetchSavedTemplate,
  listTemplateVersions,
  restoreTemplateVersion,
  deleteTemplateVersion,
  summarizeDiff,
  TemplateConflictError,
  type DnaTemplate,
  type DnaTemplateData,
  type FieldDiff,
  type SavedTemplate,
  type TemplateVersion,
} from "@/lib/dnaTemplates";
import { toast } from "sonner";

const linesToArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (xs: string[]) => xs.join("\n");

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}


interface TemplateEditorDialogProps {
  open: boolean;
  template: DnaTemplate | null;
  onClose: () => void;
  onApply: (data: DnaTemplateData) => void;
  onSaveAs: (name: string, data: DnaTemplateData) => Promise<void>;
  onUpdateSaved?: (
    id: string,
    name: string,
    data: DnaTemplateData,
    expectedUpdatedAt?: string,
  ) => Promise<string>;
  onRestored?: () => void;
}

const TemplateEditorDialog = ({
  open,
  template,
  onClose,
  onApply,
  onSaveAs,
  onUpdateSaved,
  onRestored,
}: TemplateEditorDialogProps) => {
  const [data, setData] = useState<DnaTemplateData | null>(null);
  const [name, setName] = useState("");
  const [valueProps, setValueProps] = useState("");
  const [wordsUse, setWordsUse] = useState("");
  const [wordsAvoid, setWordsAvoid] = useState("");
  const [busy, setBusy] = useState<"apply" | "save" | "update" | null>(null);

  // Base version we loaded from server (drives optimistic concurrency).
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);

  // Conflict state — non-null when a concurrent write was detected.
  const [conflict, setConflict] = useState<{
    theirs: SavedTemplate;
    base: { name: string; data: DnaTemplateData; updated_at: string };
  } | null>(null);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const isSavedTemplate = !!template && !template.builtIn && template.id !== "__blank__";


  useEffect(() => {
    if (!template) return;
    setData(template.data);
    setName(template.builtIn ? `${template.label} (mine)` : template.label);
    setValueProps(arrToLines(template.data.value_props));
    setWordsUse(arrToLines(template.data.voice_words_use));
    setWordsAvoid(arrToLines(template.data.voice_words_avoid));
    setShowHistory(false);
    setExpandedVersionId(null);
    setVersions([]);
    setConflict(null);
    setBaseUpdatedAt(!template.builtIn && template.id !== "__blank__" ? (template as SavedTemplate).updated_at : null);
  }, [template]);


  const loadVersions = async () => {
    if (!template || !isSavedTemplate) return;
    setVersionsLoading(true);
    try {
      const rows = await listTemplateVersions(template.id);
      setVersions(rows);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't load history");
    } finally {
      setVersionsLoading(false);
    }
  };

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && versions.length === 0) await loadVersions();
  };

  const handleRestore = async (v: TemplateVersion) => {
    if (!template || !isSavedTemplate) return;
    if (!confirm(`Restore version from ${formatTime(v.created_at)}? Your current edits will be snapshotted to history first.`)) return;
    setRestoringId(v.id);
    try {
      await restoreTemplateVersion(template.id, v);
      // Reflect the restored values in the editor immediately.
      setData(v.data);
      setName(v.name);
      setValueProps(arrToLines(v.data.value_props));
      setWordsUse(arrToLines(v.data.voice_words_use));
      setWordsAvoid(arrToLines(v.data.voice_words_avoid));
      toast.success("Version restored", { description: "Saved as the current template." });
      await loadVersions();
      onRestored?.();
    } catch (e) {
      toast.error((e as Error).message || "Restore failed");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteVersion = async (v: TemplateVersion) => {
    if (!confirm(`Delete this version from history? This can't be undone.`)) return;
    try {
      await deleteTemplateVersion(v.id);
      setVersions((prev) => prev.filter((x) => x.id !== v.id));
      toast.success("Version deleted");
    } catch (e) {
      toast.error((e as Error).message || "Delete failed");
    }
  };


  const current = useMemo<DnaTemplateData | null>(() => {
    if (!data) return null;
    return {
      ...data,
      value_props: linesToArr(valueProps),
      voice_words_use: linesToArr(wordsUse),
      voice_words_avoid: linesToArr(wordsAvoid),
    };
  }, [data, valueProps, wordsUse, wordsAvoid]);

  const handleApply = () => {
    if (!current) return;
    setBusy("apply");
    onApply(current);
    setBusy(null);
  };

  const handleSaveAs = async () => {
    if (!current) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("save");
    try {
      await onSaveAs(trimmed, current);
    } finally {
      setBusy(null);
    }
  };

  // Snapshot of what was on the server when we opened the editor — needed for
  // accurate three-way diffs in the conflict UI ("base" vs mine vs theirs).
  const baseSnapshot = useMemo(() => {
    if (!isSavedTemplate || !template) return null;
    return { name: template.label, data: template.data, updated_at: (template as SavedTemplate).updated_at };
  }, [template, isSavedTemplate]);

  const performUpdate = async (
    payloadName: string,
    payloadData: DnaTemplateData,
    expectedUpdatedAt: string | undefined,
  ) => {
    if (!template || !onUpdateSaved) return;
    setBusy("update");
    try {
      const newUpdatedAt = await onUpdateSaved(template.id, payloadName, payloadData, expectedUpdatedAt);
      setBaseUpdatedAt(newUpdatedAt);
      setConflict(null);
      if (showHistory) await loadVersions();
    } catch (e) {
      if (e instanceof TemplateConflictError) {
        // Surface conflict UI with the latest server state.
        setConflict({
          theirs: e.current,
          base: baseSnapshot ?? { name: payloadName, data: payloadData, updated_at: expectedUpdatedAt ?? "" },
        });
        toast.warning("This template was edited elsewhere", {
          description: "Choose how to resolve below.",
        });
      } else {
        toast.error((e as Error).message || "Could not update template");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleUpdate = async () => {
    if (!current || !onUpdateSaved || !template || template.builtIn) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await performUpdate(trimmed, current, baseUpdatedAt ?? undefined);
  };

  // Conflict resolution: load latest into the editor and discard local edits.
  const restoreLatest = () => {
    if (!conflict) return;
    const t = conflict.theirs;
    setData(t.data);
    setName(t.label);
    setValueProps(arrToLines(t.data.value_props));
    setWordsUse(arrToLines(t.data.voice_words_use));
    setWordsAvoid(arrToLines(t.data.voice_words_avoid));
    setBaseUpdatedAt(t.updated_at);
    setConflict(null);
    toast.success("Loaded latest version", { description: "Your local edits were discarded." });
  };

  // Per-field merge picks. Default per field is "mine".
  const [mergePicks, setMergePicks] = useState<Record<string, "mine" | "theirs">>({});

  // Reset picks every time a new conflict is surfaced.
  useEffect(() => {
    if (conflict) setMergePicks({});
  }, [conflict]);

  if (!template || !data) return null;

  const setAllPicks = (side: "mine" | "theirs", fields: string[]) => {
    const next: Record<string, "mine" | "theirs"> = {};
    for (const f of fields) next[f] = side;
    setMergePicks(next);
  };

  const applyMerge = async () => {
    if (!conflict || !current) return;
    const merged: DnaTemplateData = { ...current };
    let mergedName = name.trim() || conflict.theirs.label;
    const SCALAR_KEYS: (keyof DnaTemplateData)[] = [
      "brand_name", "website_url", "tagline", "mission",
      "voice_tone", "audience", "competitors", "extra_guidelines",
    ];
    const ARRAY_KEYS: (keyof DnaTemplateData)[] = [
      "value_props", "voice_words_use", "voice_words_avoid",
    ];
    if (mergePicks.__name__ === "theirs") mergedName = conflict.theirs.label;
    for (const k of SCALAR_KEYS) {
      if (mergePicks[k as string] === "theirs") {
        (merged as unknown as Record<string, unknown>)[k as string] = conflict.theirs.data[k];
      }
    }
    for (const k of ARRAY_KEYS) {
      if (mergePicks[k as string] === "theirs") {
        (merged as unknown as Record<string, unknown>)[k as string] = conflict.theirs.data[k];
      }
    }
    await performUpdate(mergedName, merged, conflict.theirs.updated_at);
  };



  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            Customize template
          </DialogTitle>
          <DialogDescription>
            Edit any field, then apply it to your Brand DNA or save it as your own reusable template.
          </DialogDescription>
        </DialogHeader>

        {conflict && current && (() => {
          const mineSnapshot = { name: name.trim() || conflict.theirs.label, data: current };
          const theirsSnapshot = { name: conflict.theirs.label, data: conflict.theirs.data };
          const conflictDiffs = diffTemplate(mineSnapshot, theirsSnapshot).filter((d) => d.changed);
          const fieldKeys = conflictDiffs.map((d) => d.field as string);
          const theirsCount = fieldKeys.filter((k) => mergePicks[k] === "theirs").length;
          const mineCount = fieldKeys.length - theirsCount;
          return (
            <div className="rounded-lg ring-1 ring-amber-500/40 bg-amber-500/5 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-sm text-amber-100">Conflict — this template was updated elsewhere</h3>
                  <p className="text-[11.5px] text-amber-100/70 mt-0.5">
                    {conflictDiffs.length > 0
                      ? <>Pick a side for each field below — defaults to <span className="font-medium">Mine</span> — then hit Apply once.</>
                      : "No visible field differences — likely whitespace or array order. Apply will re-save your edit."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConflict(null)}
                  className="text-amber-100/60 hover:text-amber-100"
                  title="Dismiss (does not save)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {conflictDiffs.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-amber-100/80">Quick pick:</span>
                    <button
                      type="button"
                      onClick={() => setAllPicks("mine", fieldKeys)}
                      className="px-2 py-0.5 rounded ring-1 ring-white/10 hover:ring-primary/40 text-foreground/85"
                    >
                      All mine
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllPicks("theirs", fieldKeys)}
                      className="px-2 py-0.5 rounded ring-1 ring-white/10 hover:ring-primary/40 text-foreground/85"
                    >
                      All theirs
                    </button>
                    <span className="text-muted-foreground ml-auto">
                      {mineCount} mine · {theirsCount} theirs · {fieldKeys.length} total
                    </span>
                  </div>

                  <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {conflictDiffs.map((d) => {
                      const pick = mergePicks[d.field as string] ?? "mine";
                      return (
                        <li key={d.field as string} className="rounded ring-1 ring-amber-500/20 bg-background/40 p-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] uppercase tracking-[0.14em] text-amber-100/80">{d.label}</span>
                            <div className="inline-flex rounded ring-1 ring-white/10 text-[10.5px] overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setMergePicks((p) => ({ ...p, [d.field as string]: "mine" }))}
                                className={`px-2 py-0.5 ${pick === "mine" ? "bg-primary/30 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Mine
                              </button>
                              <button
                                type="button"
                                onClick={() => setMergePicks((p) => ({ ...p, [d.field as string]: "theirs" }))}
                                className={`px-2 py-0.5 ${pick === "theirs" ? "bg-primary/30 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Theirs
                              </button>
                            </div>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-1.5 text-[10.5px]">
                            <div className={`rounded p-1.5 whitespace-pre-wrap break-words ring-1 ${pick === "mine" ? "ring-primary/50 bg-primary/10" : "ring-white/10 bg-white/[0.02]"}`}>
                              <span className="text-primary/80 mr-1">Mine:</span>
                              {d.before || <span className="text-muted-foreground italic">(empty)</span>}
                            </div>
                            <div className={`rounded p-1.5 whitespace-pre-wrap break-words ring-1 ${pick === "theirs" ? "ring-primary/50 bg-primary/10" : "ring-white/10 bg-white/[0.02]"}`}>
                              <span className="text-primary/80 mr-1">Theirs:</span>
                              {d.after || <span className="text-muted-foreground italic">(empty)</span>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <div className="flex flex-wrap gap-2 justify-end pt-1 border-t border-amber-500/15">
                <Button size="sm" variant="ghost" onClick={restoreLatest} disabled={busy !== null}>
                  Discard mine
                </Button>
                <Button size="sm" onClick={applyMerge} disabled={busy !== null} className="studio-gradient-bg">
                  {busy === "update" ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <GitMerge className="w-3 h-3 mr-1.5" />
                  )}
                  Apply
                </Button>
              </div>
            </div>
          );

        })()}

        {isSavedTemplate && (

          <div className="rounded-lg ring-1 ring-white/[0.08] bg-background/40">
            <button
              type="button"
              onClick={toggleHistory}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-medium text-foreground/85 hover:bg-white/[0.03] rounded-lg"
            >
              <span className="inline-flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-primary" />
                Version history
                {versions.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">({versions.length})</span>
                )}
              </span>
              <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showHistory ? "rotate-90" : ""}`} />
            </button>
            {showHistory && (
              <div className="px-3.5 pb-3 pt-1">
                {versionsLoading ? (
                  <div className="py-4 flex items-center justify-center text-muted-foreground text-xs gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading history…
                  </div>
                ) : versions.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-2">
                    No prior versions yet. Each time you save changes to this template, the previous version is kept here.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {versions.map((v, idx) => {
                      const nextNewer =
                        idx === 0
                          ? { name, data: { ...(data as DnaTemplateData), value_props: linesToArr(valueProps), voice_words_use: linesToArr(wordsUse), voice_words_avoid: linesToArr(wordsAvoid) } }
                          : { name: versions[idx - 1].name, data: versions[idx - 1].data };
                      const diffs: FieldDiff[] = data
                        ? diffTemplate(
                            { name: v.name, data: v.data },
                            nextNewer,
                          )
                        : [];
                      const summary = summarizeDiff(diffs);
                      const changed = diffs.filter((d) => d.changed);
                      const isOpen = expandedVersionId === v.id;
                      return (
                        <li
                          key={v.id}
                          className="rounded-md ring-1 ring-white/[0.06] bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-2 px-2.5 py-2">
                            <button
                              type="button"
                              onClick={() => setExpandedVersionId(isOpen ? null : v.id)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium text-foreground/90 truncate">{v.name}</span>
                                <span className="text-[10.5px] text-muted-foreground shrink-0">
                                  {formatTime(v.created_at)}
                                </span>
                              </div>
                              <p className="text-[10.5px] text-muted-foreground truncate">
                                {idx === 0 ? "Differs from current edit: " : "Changed before next version: "}
                                <span className={changed.length ? "text-foreground/80" : ""}>{summary}</span>
                              </p>
                            </button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={restoringId === v.id}
                              onClick={() => handleRestore(v)}
                              className="h-7 px-2 text-[11px]"
                            >
                              {restoringId === v.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Restore
                                </>
                              )}
                            </Button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVersion(v)}
                              title="Delete this version"
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {isOpen && changed.length > 0 && (
                            <div className="px-2.5 pb-2.5 pt-0 space-y-1.5 border-t border-white/[0.05]">
                              {changed.map((d) => (
                                <div key={d.field as string} className="text-[10.5px] space-y-0.5">
                                  <p className="uppercase tracking-[0.14em] text-muted-foreground">{d.label}</p>
                                  <div className="grid sm:grid-cols-2 gap-1.5">
                                    <div className="rounded bg-rose-500/10 ring-1 ring-rose-500/20 p-1.5 text-foreground/90 whitespace-pre-wrap break-words">
                                      <span className="text-rose-300/80 mr-1">−</span>
                                      {d.before || <span className="text-muted-foreground italic">(empty)</span>}
                                    </div>
                                    <div className="rounded bg-emerald-500/10 ring-1 ring-emerald-500/20 p-1.5 text-foreground/90 whitespace-pre-wrap break-words">
                                      <span className="text-emerald-300/80 mr-1">+</span>
                                      {d.after || <span className="text-muted-foreground italic">(empty)</span>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {isOpen && changed.length === 0 && (
                            <p className="px-2.5 pb-2.5 text-[10.5px] text-muted-foreground">
                              No differences against the {idx === 0 ? "current edit" : "next version"}.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 py-2">

          <div>
            <Label>Template name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My SaaS starter"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Used when you save this template for reuse — not applied to your Brand DNA.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Brand name</Label>
              <Input value={data.brand_name} onChange={(e) => setData({ ...data, brand_name: e.target.value })} />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={data.website_url} onChange={(e) => setData({ ...data, website_url: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Tagline</Label>
            <Input value={data.tagline} onChange={(e) => setData({ ...data, tagline: e.target.value })} />
          </div>

          <div>
            <Label>Mission</Label>
            <Textarea rows={2} value={data.mission} onChange={(e) => setData({ ...data, mission: e.target.value })} />
          </div>

          <div>
            <Label>Value propositions <span className="text-[10px] text-muted-foreground">one per line</span></Label>
            <Textarea rows={4} value={valueProps} onChange={(e) => setValueProps(e.target.value)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Voice / tone</Label>
              <Input value={data.voice_tone} onChange={(e) => setData({ ...data, voice_tone: e.target.value })} />
            </div>
            <div>
              <Label>Audience</Label>
              <Input value={data.audience} onChange={(e) => setData({ ...data, audience: e.target.value })} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Words to use <span className="text-[10px] text-muted-foreground">one per line</span></Label>
              <Textarea rows={3} value={wordsUse} onChange={(e) => setWordsUse(e.target.value)} />
            </div>
            <div>
              <Label>Words to avoid <span className="text-[10px] text-muted-foreground">one per line</span></Label>
              <Textarea rows={3} value={wordsAvoid} onChange={(e) => setWordsAvoid(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Competitors</Label>
            <Textarea rows={2} value={data.competitors} onChange={(e) => setData({ ...data, competitors: e.target.value })} />
          </div>

          <div>
            <Label>Extra guidelines</Label>
            <Textarea
              rows={2}
              value={data.extra_guidelines}
              onChange={(e) => setData({ ...data, extra_guidelines: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!template.builtIn && onUpdateSaved && (
            <Button variant="outline" onClick={handleUpdate} disabled={busy !== null}>
              <Save className="w-4 h-4 mr-1.5" />
              {busy === "update" ? "Updating…" : "Update saved"}
            </Button>
          )}
          <Button variant="outline" onClick={handleSaveAs} disabled={busy !== null || !name.trim()}>
            <BookmarkPlus className="w-4 h-4 mr-1.5" />
            {busy === "save" ? "Saving…" : "Save as new"}
          </Button>
          <Button onClick={handleApply} disabled={busy !== null} className="studio-gradient-bg">
            {busy === "apply" ? "Applying…" : "Apply to Brand DNA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateEditorDialog;
