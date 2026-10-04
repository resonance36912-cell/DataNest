import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnchorType = "word-start" | "word-end" | "silence-start" | "silence-end" | "silence-mid";

export interface Anchor {
  sec: number;
  type: AnchorType;
  /** Optional human label (e.g. the word text). */
  label?: string;
}

interface AnchorListPanelProps {
  anchors: Anchor[];
  focusedSec: number | null;
  onJump: (sec: number) => void;
  /** Height in px to match the waveform card. */
  maxHeight?: number;
}

const TYPE_META: Record<AnchorType, { label: string; short: string; dot: string; group: "word" | "silence" }> = {
  "word-start":    { label: "Word start",    short: "W▶", dot: "bg-primary",         group: "word" },
  "word-end":      { label: "Word end",      short: "W◀", dot: "bg-primary/60",      group: "word" },
  "silence-start": { label: "Silence start", short: "S▶", dot: "bg-accent",          group: "silence" },
  "silence-end":   { label: "Silence end",   short: "S◀", dot: "bg-accent/60",       group: "silence" },
  "silence-mid":   { label: "Silence mid",   short: "S◆", dot: "bg-accent/80",       group: "silence" },
};

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};

export default function AnchorListPanel({ anchors, focusedSec, onJump, maxHeight = 360 }: AnchorListPanelProps) {
  const [filter, setFilter] = useState<"all" | "word" | "silence">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return anchors.filter((a) => {
      if (filter !== "all" && TYPE_META[a.type].group !== filter) return false;
      if (!q) return true;
      if (a.label && a.label.toLowerCase().includes(q)) return true;
      if (fmt(a.sec).includes(q)) return true;
      return false;
    });
  }, [anchors, filter, query]);

  const wordCount = anchors.filter((a) => TYPE_META[a.type].group === "word").length;
  const silenceCount = anchors.length - wordCount;

  return (
    <div className="glass-card p-3 flex flex-col" style={{ maxHeight }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Crosshair className="h-3.5 w-3.5 text-primary" /> Snap anchors
        </h4>
        <span className="text-[10px] text-muted-foreground font-mono">{filtered.length}/{anchors.length}</span>
      </div>

      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {[
          { key: "all" as const, label: "All", count: anchors.length },
          { key: "word" as const, label: "Words", count: wordCount },
          { key: "silence" as const, label: "Silence", count: silenceCount },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            disabled={chip.key === "silence" && silenceCount === 0}
            onClick={() => setFilter(chip.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors border",
              filter === chip.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary/70 hover:text-foreground"
            )}
          >
            {chip.label}
            <span className={cn("tabular-nums", filter === chip.key ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by word or time…"
        className="mb-2 h-7 rounded-md border border-border bg-background/40 px-2 text-[11px] outline-none focus:border-primary"
      />

      <div className="flex-1 overflow-auto -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-6">No anchors match.</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((a, i) => {
              const meta = TYPE_META[a.type];
              const isActive = focusedSec !== null && Math.abs(a.sec - focusedSec) < 0.005;
              return (
                <li key={`${a.type}-${a.sec.toFixed(3)}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onJump(a.sec)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                      isActive
                        ? "bg-primary/15 border border-primary/40 text-foreground"
                        : "border border-transparent hover:bg-secondary/40"
                    }`}
                    title={`${meta.label}${a.label ? ` — "${a.label}"` : ""} at ${fmt(a.sec)}`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-7">{meta.short}</span>
                    <span className="font-mono tabular-nums shrink-0 w-14">{fmt(a.sec)}</span>
                    {a.label && (
                      <span className="truncate text-muted-foreground italic">"{a.label}"</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
