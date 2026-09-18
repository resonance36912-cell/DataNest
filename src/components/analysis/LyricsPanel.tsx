import { Mic, Edit3, Flag, CheckCircle2, AlertTriangle, ChevronDown, Volume2, VolumeX, Loader2, ArrowUpDown, Check, X, Plus, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { VerificationResult } from "@/contexts/ProjectContext";

interface LyricsPanelProps {
  lyrics: string;
  editingLyrics: boolean;
  verifying: boolean;
  verification: VerificationResult | null;
  onLyricsChange: (v: string) => void;
  onToggleEdit: () => void;
  vocalClassifications?: Record<number, "lead" | "background">;
  classifying?: boolean;
  onClassificationChange?: (index: number, type: "lead" | "background") => void;
}

function getConfidenceBadge(score: number) {
  if (score >= 90)
    return <Badge className="bg-success/10 text-success border-success/20"><CheckCircle2 className="h-3 w-3 mr-1" />{score}%</Badge>;
  if (score >= 70)
    return <Badge className="bg-warning/10 text-warning border-warning/20"><AlertTriangle className="h-3 w-3 mr-1" />{score}%</Badge>;
  return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{score}%</Badge>;
}

/** Color tokens for editable lyric containers, keyed off confidence score (0-100). */
function lyricsConfidenceClasses(score: number | null | undefined) {
  if (score == null) return { container: "", border: "", hint: null as null | { tone: "warn" | "danger"; text: string } };
  if (score >= 90) return { container: "ring-1 ring-success/20", border: "border-l-2 border-success/40", hint: null };
  if (score >= 70) return { container: "ring-1 ring-warning/30 bg-warning/5", border: "border-l-2 border-warning/60", hint: { tone: "warn" as const, text: `Borderline lyrics confidence (${score}%) — review lines flagged below.` } };
  return { container: "ring-2 ring-destructive/40 bg-destructive/5", border: "border-l-2 border-destructive/70", hint: { tone: "danger" as const, text: `Low lyrics confidence (${score}%) — please verify and edit before continuing.` } };
}

export { getConfidenceBadge };

/** Inline editor for a single lyric line */
function InlineLineEditor({ text, index, onSave, onCancel, autoFocus }: {
  text: string; index: number; onSave: (index: number, newText: string) => void;
  onCancel: () => void; autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onSave(index, draft.trim()); }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex items-center gap-1.5 group">
      <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0 tabular-nums">{index + 1}</span>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 text-xs font-mono bg-background border-primary/40 focus-visible:ring-primary/30 flex-1"
      />
      <Button variant="ghost" size="icon" className="h-6 w-6 text-success hover:text-success shrink-0" onClick={() => onSave(index, draft.trim())}>
        <Check className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={onCancel}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function LyricsPanel({ lyrics, editingLyrics, verifying, verification, onLyricsChange, onToggleEdit, vocalClassifications = {}, classifying = false, onClassificationChange }: LyricsPanelProps) {
  const [bgOpen, setBgOpen] = useState(false);
  const [showLineToggles, setShowLineToggles] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());

  const suggestions = useMemo(
    () => (verification?.lyric_suggestions ?? []).filter(s => s && s.span && s.suggested && s.span !== s.suggested),
    [verification?.lyric_suggestions]
  );

  const applySuggestion = useCallback((idx: number) => {
    const s = suggestions[idx];
    if (!s) return;
    // Case-insensitive replace of first occurrence, preserving original casing position.
    const i = lyrics.toLowerCase().indexOf(s.span.toLowerCase());
    if (i < 0) {
      setDismissedSuggestions(prev => { const n = new Set(prev); n.add(idx); return n; });
      return;
    }
    const next = lyrics.slice(0, i) + s.suggested + lyrics.slice(i + s.span.length);
    onLyricsChange(next);
    setAcceptedSuggestions(prev => { const n = new Set(prev); n.add(idx); return n; });
  }, [suggestions, lyrics, onLyricsChange]);

  const dismissSuggestion = useCallback((idx: number) => {
    setDismissedSuggestions(prev => { const n = new Set(prev); n.add(idx); return n; });
  }, []);

  const acceptAllHighConfidence = useCallback(() => {
    let working = lyrics;
    const newlyAccepted = new Set(acceptedSuggestions);
    suggestions.forEach((s, idx) => {
      if (acceptedSuggestions.has(idx) || dismissedSuggestions.has(idx)) return;
      if (s.confidence < 0.85) return;
      const i = working.toLowerCase().indexOf(s.span.toLowerCase());
      if (i < 0) return;
      working = working.slice(0, i) + s.suggested + working.slice(i + s.span.length);
      newlyAccepted.add(idx);
    });
    if (working !== lyrics) {
      onLyricsChange(working);
      setAcceptedSuggestions(newlyAccepted);
    }
  }, [suggestions, lyrics, onLyricsChange, acceptedSuggestions, dismissedSuggestions]);

  // Memoize the line split & lead/background partition — this used to run on
  // every parent render (BPM keystrokes, pass-status updates, etc.).
  const { lines, leadLines, bgLines, hasClassifications } = useMemo(() => {
    const allLines = lyrics.split("\n").filter(l => l.trim());
    const hasCls = Object.keys(vocalClassifications).length > 0;
    const lead: { text: string; originalIndex: number }[] = [];
    const bg: { text: string; originalIndex: number }[] = [];
    if (hasCls) {
      allLines.forEach((line, i) => {
        if (vocalClassifications[i] === "background") bg.push({ text: line, originalIndex: i });
        else lead.push({ text: line, originalIndex: i });
      });
    }
    return { lines: allLines, leadLines: lead, bgLines: bg, hasClassifications: hasCls };
  }, [lyrics, vocalClassifications]);

  const toggleLine = (originalIndex: number) => {
    if (!onClassificationChange) return;
    const current = vocalClassifications[originalIndex] || "lead";
    onClassificationChange(originalIndex, current === "lead" ? "background" : "lead");
  };

  const handleLineSave = useCallback((index: number, newText: string) => {
    const allLines = lyrics.split("\n").filter(l => l.trim());
    if (newText) {
      allLines[index] = newText;
    } else {
      allLines.splice(index, 1);
    }
    onLyricsChange(allLines.join("\n"));
    setEditingLineIndex(null);
  }, [lyrics, onLyricsChange]);

  const handleDeleteLine = useCallback((index: number) => {
    const allLines = lyrics.split("\n").filter(l => l.trim());
    allLines.splice(index, 1);
    onLyricsChange(allLines.join("\n"));
    setEditingLineIndex(null);
  }, [lyrics, onLyricsChange]);

  const handleAddLine = useCallback((afterIndex: number) => {
    const allLines = lyrics.split("\n").filter(l => l.trim());
    allLines.splice(afterIndex + 1, 0, "New line");
    onLyricsChange(allLines.join("\n"));
    setEditingLineIndex(afterIndex + 1);
  }, [lyrics, onLyricsChange]);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Lyrics</h3>
          {verification && getConfidenceBadge(verification.confidence_lyrics)}
          {classifying && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Classifying vocals...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasClassifications && !editingLyrics && (
            <Button variant="ghost" size="sm" onClick={() => setShowLineToggles(!showLineToggles)} className="gap-1 text-muted-foreground hover:text-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" /> {showLineToggles ? "Done" : "Reclassify"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setEditingLineIndex(null); onToggleEdit(); }} className="gap-1 text-muted-foreground hover:text-foreground">
            <Edit3 className="h-3.5 w-3.5" /> {editingLyrics ? "Done" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Lead vocals indicator */}
      {hasClassifications && !editingLyrics && (
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="gap-1 text-xs bg-success/5 text-success border-success/20">
            <Volume2 className="h-3 w-3" /> Lead Vocals — {leadLines.length} lines
          </Badge>
          {showLineToggles && (
            <span className="text-[10px] text-muted-foreground">Click a line to toggle lead ↔ background</span>
          )}
        </div>
      )}

      {/* Confidence hint surfaced above the editable container so it's visible
          regardless of which mode (edit / toggle / read-only) is active. */}
      {(() => {
        const lyrConf = lyricsConfidenceClasses(verification?.confidence_lyrics);
        return (
          <>
            {lyrConf.hint && (
              <div className={`mb-2 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] ${
                lyrConf.hint.tone === "danger"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-warning/30 bg-warning/5 text-warning"
              }`}>
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{lyrConf.hint.text}</span>
              </div>
            )}
            {editingLyrics ? (
              /* Inline per-line editing mode */
              <div className={`rounded-lg bg-secondary/50 p-3 max-h-[350px] overflow-y-auto space-y-1 ${lyrConf.container} ${lyrConf.border}`}>
                {editingLyrics && lines.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-xs text-muted-foreground mb-2">No lyrics yet</p>
                    <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => { onLyricsChange("New line"); setEditingLineIndex(0); }}>
                      <Plus className="h-3 w-3" /> Add first line
                    </Button>
                  </div>
                )}
                {lines.map((line, i) => (
                  editingLineIndex === i ? (
                    <InlineLineEditor
                      key={`edit-${i}`}
                      text={line}
                      index={i}
                      onSave={handleLineSave}
                      onCancel={() => setEditingLineIndex(null)}
                      autoFocus
                    />
                  ) : (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 group cursor-pointer rounded-md px-1 py-1 hover:bg-card/60 transition-colors"
                      onClick={() => setEditingLineIndex(i)}
                    >
                      <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0 tabular-nums">{i + 1}</span>
                      <span className="flex-1 font-mono text-xs text-secondary-foreground truncate">{line}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary shrink-0" onClick={(e) => { e.stopPropagation(); setEditingLineIndex(i); }}>
                          <Edit3 className="h-2.5 w-2.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary shrink-0" onClick={(e) => { e.stopPropagation(); handleAddLine(i); }}>
                          <Plus className="h-2.5 w-2.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteLine(i); }}>
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  )
                ))}
                {lines.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground gap-1 mt-1" onClick={() => handleAddLine(lines.length - 1)}>
                    <Plus className="h-3 w-3" /> Add line
                  </Button>
                )}
              </div>
            ) : showLineToggles && hasClassifications ? (
              /* Per-line toggle view */
              <div className={`rounded-lg bg-secondary/50 p-3 max-h-[300px] overflow-y-auto space-y-1 ${lyrConf.container} ${lyrConf.border}`}>
                {lines.map((line, i) => {
                  const isBg = vocalClassifications[i] === "background";
                  return (
                    <button
                      key={i}
                      onClick={() => toggleLine(i)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                        isBg
                          ? "bg-muted/40 text-muted-foreground italic hover:bg-muted/60"
                          : "bg-card/50 text-secondary-foreground hover:bg-card/80"
                      }`}
                    >
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        isBg ? "bg-muted text-muted-foreground" : "bg-success/20 text-success"
                      }`}>
                        {isBg ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate font-mono text-xs">{line}</span>
                      <Badge variant="outline" className={`text-[9px] px-1.5 shrink-0 ${
                        isBg ? "text-muted-foreground border-border" : "text-success border-success/20"
                      }`}>
                        {isBg ? "BG" : "Lead"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            ) : (
              <pre className={`whitespace-pre-wrap rounded-lg bg-secondary/50 p-4 text-sm text-secondary-foreground max-h-[300px] overflow-y-auto ${lyrConf.container} ${lyrConf.border}`}>
                {verifying ? <span className="text-muted-foreground italic">Verifying lyrics...</span> : (hasClassifications ? leadLines.map(l => l.text).join("\n") : lyrics) || "No lyrics detected"}
              </pre>
            )}
          </>
        );
      })()}

      {/* Background / Adlib collapsible section */}
      {hasClassifications && bgLines.length > 0 && !editingLyrics && !showLineToggles && (
        <Collapsible open={bgOpen} onOpenChange={setBgOpen} className="mt-4">
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${bgOpen ? "rotate-0" : "-rotate-90"}`} />
            <Badge variant="outline" className="gap-1 text-xs bg-muted/50 text-muted-foreground border-border">
              <VolumeX className="h-3 w-3" /> Background & Adlibs — {bgLines.length} line{bgLines.length !== 1 ? "s" : ""}
            </Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">
              Excluded from lip-sync · Kept in full audio track
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/30 border border-border/50 p-4 text-sm text-muted-foreground max-h-[200px] overflow-y-auto italic">
              {bgLines.map(l => l.text).join("\n")}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Suggested corrections
              <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                {suggestions.filter((_, i) => !acceptedSuggestions.has(i) && !dismissedSuggestions.has(i)).length} pending
              </Badge>
            </div>
            {suggestions.some((s, i) => s.confidence >= 0.85 && !acceptedSuggestions.has(i) && !dismissedSuggestions.has(i)) && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:text-primary gap-1" onClick={acceptAllHighConfidence}>
                <Check className="h-3 w-3" /> Accept all ≥85%
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Proposals only — your original transcript is preserved until you accept a change.
          </p>
          {suggestions.map((s, idx) => {
            const accepted = acceptedSuggestions.has(idx);
            const dismissed = dismissedSuggestions.has(idx);
            if (dismissed) return null;
            const confPct = Math.round(s.confidence * 100);
            const confTone = confPct >= 85 ? "text-success border-success/30 bg-success/5"
              : confPct >= 70 ? "text-warning border-warning/30 bg-warning/5"
              : "text-muted-foreground border-border bg-muted/30";
            return (
              <div key={idx} className={`rounded-lg border px-3 py-2 text-xs ${accepted ? "bg-success/5 border-success/20" : "bg-card/40 border-border/60"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono line-through text-destructive/80">"{s.span}"</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono font-medium text-success">"{s.suggested}"</span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ml-auto ${confTone}`}>
                    {confPct}%
                  </Badge>
                </div>
                {s.reason && (
                  <p className="mt-1 text-[10px] text-muted-foreground italic">{s.reason}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  {accepted ? (
                    <Badge variant="outline" className="text-[10px] gap-1 text-success border-success/30 bg-success/5">
                      <CheckCircle2 className="h-3 w-3" /> Applied
                    </Badge>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-success/30 text-success hover:bg-success/10" onClick={() => applySuggestion(idx)}>
                        <Check className="h-3 w-3" /> Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-destructive" onClick={() => dismissSuggestion(idx)}>
                        <X className="h-3 w-3" /> Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verification && verification.flagged_issues.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <Flag className="h-3.5 w-3.5" /> Flagged Issues
          </div>
          {verification.flagged_issues.map((issue, idx) => (
            <div key={idx} className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2 text-xs">
              <span className="font-medium text-warning">"{issue.word}"</span>
              <span className="text-muted-foreground"> — {issue.issue}</span>
              {issue.suggestion && <span className="text-foreground"> → {issue.suggestion}</span>}
            </div>
          ))}
        </div>
      )}

      {verification && verification.corrections_made.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-1">
            <CheckCircle2 className="h-3 w-3 inline mr-1 text-success" />
            {verification.corrections_made.length} correction{verification.corrections_made.length !== 1 ? "s" : ""} applied
          </p>
        </div>
      )}
    </div>
  );
}
