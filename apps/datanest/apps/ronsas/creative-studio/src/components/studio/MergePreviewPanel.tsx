// Shows provenance (Primary / Secondary / Tertiary) for every field merged
// from multiple URL scrapes BEFORE analyze-content runs. Lets the user:
//   • pick the winning source per list field (images, colors, products, …)
//   • pick the winning source per scalar text field (brand, headline, offer, …)
//   • exclude individual items inside list fields
//   • override which source wins for the logo
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Check, X, Image as ImageIcon, RotateCcw, Columns3, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SourceBrief } from "@/lib/sourceBrief";
import SourceCompareView from "./SourceCompareView";

export type MergeSource = "primary" | "secondary" | "tertiary";
export type SourcePick = MergeSource | "all";

export interface MergeSourceEntry {
  id: MergeSource;
  url: string;
  brief: SourceBrief | null; // null = fetch failed
  error?: string;
}

export type MergeListField =
  | "images"
  | "colors"
  | "products"
  | "services"
  | "benefits"
  | "proofPoints"
  | "callsToAction";

export type MergeScalarField =
  | "brandName"
  | "heroHeadline"
  | "heroSubheadline"
  | "offer"
  | "audience"
  | "pricing"
  | "metaDescription"
  | "pageTitle";

export interface MergeOrigins {
  logo: { value: string; source: MergeSource } | null;
  images: Array<{ value: string; source: MergeSource }>;
  colors: Array<{ value: string; source: MergeSource }>;
  products: Array<{ value: string; source: MergeSource }>;
  services: Array<{ value: string; source: MergeSource }>;
  benefits: Array<{ value: string; source: MergeSource }>;
  proofPoints: Array<{ value: string; source: MergeSource }>;
  callsToAction: Array<{ value: string; source: MergeSource }>;
}

export interface MergeResolution {
  excluded: Record<MergeListField, string[]>;
  listSource: Partial<Record<MergeListField, SourcePick>>; // "all" or specific source
  scalarSource: Partial<Record<MergeScalarField, MergeSource>>; // which source wins
  logoOverride: string | null; // explicit value, or null = use default origins.logo
}

interface Props {
  sources: MergeSourceEntry[];
  origins: MergeOrigins;
  busy?: boolean;
  onContinue: (resolution: MergeResolution) => void;
  onCancel: () => void;
}

const SCALAR_FIELDS: { key: MergeScalarField; label: string }[] = [
  { key: "brandName", label: "Brand name" },
  { key: "heroHeadline", label: "Headline" },
  { key: "heroSubheadline", label: "Subheadline" },
  { key: "offer", label: "Offer" },
  { key: "audience", label: "Audience" },
  { key: "pricing", label: "Pricing" },
  { key: "pageTitle", label: "Page title" },
  { key: "metaDescription", label: "Meta description" },
];

const LIST_FIELDS: MergeListField[] = [
  "images", "colors", "products", "services", "benefits", "proofPoints", "callsToAction",
];

const sourceLabel: Record<MergeSource, string> = { primary: "P", secondary: "S", tertiary: "T" };
const pickLabel: Record<SourcePick, string> = { all: "All", primary: "P", secondary: "S", tertiary: "T" };
const sourceTone: Record<MergeSource, string> = {
  primary: "bg-primary/80 text-primary-foreground",
  secondary: "bg-accent/70 text-accent-foreground",
  tertiary: "bg-white/15 text-foreground/90",
};
const sourceDot: Record<MergeSource, string> = {
  primary: "bg-primary",
  secondary: "bg-accent",
  tertiary: "bg-white/60",
};
const sourceRing: Record<MergeSource, string> = {
  primary: "ring-primary",
  secondary: "ring-accent",
  tertiary: "ring-white/60",
};

function Pill({ source, title }: { source: MergeSource; title?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none ${sourceTone[source]}`}
      title={title || `From ${source}`}
    >
      {sourceLabel[source]}
    </span>
  );
}

function SourceToggle({
  available,
  value,
  onChange,
  includeAll = true,
}: {
  available: MergeSource[];
  value: SourcePick;
  onChange: (v: SourcePick) => void;
  includeAll?: boolean;
}) {
  const opts: SourcePick[] = includeAll ? ["all", ...available] : [...available];
  return (
    <div className="inline-flex rounded-md bg-white/[0.04] ring-1 ring-white/10 p-0.5">
      {opts.map((opt) => {
        const on = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-[3px] transition ${
              on ? "bg-primary/80 text-primary-foreground" : "text-foreground/60 hover:text-foreground/90"
            }`}
            title={opt === "all" ? "Use all sources" : `Only use ${opt}`}
          >
            {pickLabel[opt]}
          </button>
        );
      })}
    </div>
  );
}

function FieldHeader({
  label,
  count,
  total,
  available,
  pick,
  onPick,
}: {
  label: React.ReactNode;
  count: number;
  total: number;
  available: MergeSource[];
  pick: SourcePick;
  onPick: (v: SourcePick) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label} <span className="text-foreground/40">· {count}/{total}</span>
      </p>
      {available.length > 1 && <SourceToggle available={available} value={pick} onChange={onPick} />}
    </div>
  );
}

function FieldRow({
  label,
  field,
  entries,
  excluded,
  pick,
  available,
  setPick,
  toggle,
  empty,
}: {
  label: string;
  field: MergeListField;
  entries: Array<{ value: string; source: MergeSource }>;
  excluded: Set<string>;
  pick: SourcePick;
  available: MergeSource[];
  setPick: (v: SourcePick) => void;
  toggle: (field: MergeListField, value: string) => void;
  empty?: string;
}) {
  const visible = pick === "all" ? entries : entries.filter((e) => e.source === pick);
  const kept = visible.filter((e) => !excluded.has(e.value)).length;
  return (
    <div className="space-y-1">
      <FieldHeader label={label} count={kept} total={entries.length} available={available} pick={pick} onPick={setPick} />
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">{empty ?? "—"}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e, i) => {
            const hiddenBySource = pick !== "all" && e.source !== pick;
            const off = hiddenBySource || excluded.has(e.value);
            return (
              <button
                key={`${e.value}-${i}`}
                type="button"
                onClick={() => !hiddenBySource && toggle(field, e.value)}
                disabled={hiddenBySource}
                className={`group inline-flex items-center gap-1.5 rounded-full ring-1 pl-1 pr-1 py-0.5 text-[11px] transition-colors ${
                  off
                    ? "bg-transparent ring-white/10 text-foreground/40 line-through"
                    : "bg-white/[0.04] ring-white/10 text-foreground/90 hover:ring-white/25"
                } ${hiddenBySource ? "opacity-40 cursor-not-allowed" : ""}`}
                title={hiddenBySource ? `Hidden — source set to ${pick}` : off ? "Click to include" : "Click to exclude"}
              >
                <Pill source={e.source} />
                <span className="truncate max-w-[160px]">{e.value}</span>
                {!hiddenBySource && <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColorRow({
  entries,
  excluded,
  pick,
  available,
  setPick,
  toggle,
}: {
  entries: Array<{ value: string; source: MergeSource }>;
  excluded: Set<string>;
  pick: SourcePick;
  available: MergeSource[];
  setPick: (v: SourcePick) => void;
  toggle: (field: MergeListField, value: string) => void;
}) {
  const visible = pick === "all" ? entries : entries.filter((e) => e.source === pick);
  const kept = visible.filter((e) => !excluded.has(e.value)).length;
  return (
    <div className="space-y-1">
      <FieldHeader label="Colors" count={kept} total={entries.length} available={available} pick={pick} onPick={setPick} />
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">No brand colors detected</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e, i) => {
            const hiddenBySource = pick !== "all" && e.source !== pick;
            const off = hiddenBySource || excluded.has(e.value);
            return (
              <button
                key={`${e.value}-${i}`}
                type="button"
                onClick={() => !hiddenBySource && toggle("colors", e.value)}
                disabled={hiddenBySource}
                className={`group inline-flex items-center gap-1.5 rounded-full ring-1 pl-1 pr-2 py-0.5 text-[11px] transition-colors ${
                  off ? "bg-transparent ring-white/10 opacity-40" : "bg-white/[0.04] ring-white/10 hover:ring-white/25"
                } ${hiddenBySource ? "cursor-not-allowed" : ""}`}
                title={hiddenBySource ? `Hidden — source set to ${pick}` : off ? "Click to include" : "Click to exclude"}
              >
                <Pill source={e.source} />
                <span
                  className="inline-block w-3 h-3 rounded-sm ring-1 ring-white/15"
                  style={{ background: e.value }}
                />
                <span className={`font-mono text-[10px] ${off ? "line-through text-foreground/40" : "text-foreground/80"}`}>
                  {e.value}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImageRow({
  entries,
  excluded,
  pick,
  available,
  setPick,
  toggle,
}: {
  entries: Array<{ value: string; source: MergeSource }>;
  excluded: Set<string>;
  pick: SourcePick;
  available: MergeSource[];
  setPick: (v: SourcePick) => void;
  toggle: (field: MergeListField, value: string) => void;
}) {
  const visible = pick === "all" ? entries : entries.filter((e) => e.source === pick);
  const kept = visible.filter((e) => !excluded.has(e.value)).length;
  return (
    <div className="space-y-1">
      <FieldHeader
        label={<><ImageIcon className="w-3 h-3 inline-block mr-1 -mt-0.5" />Images</>}
        count={kept}
        total={entries.length}
        available={available}
        pick={pick}
        onPick={setPick}
      />
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">No images scraped</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.slice(0, 9).map((e, i) => {
            const hiddenBySource = pick !== "all" && e.source !== pick;
            const off = hiddenBySource || excluded.has(e.value);
            return (
              <button
                key={`${e.value}-${i}`}
                type="button"
                onClick={() => !hiddenBySource && toggle("images", e.value)}
                disabled={hiddenBySource}
                className={`relative w-14 h-14 rounded-md bg-black/40 ring-1 overflow-hidden transition ${
                  off ? "ring-white/10 opacity-30" : "ring-white/10 hover:ring-white/40"
                } ${hiddenBySource ? "cursor-not-allowed" : ""}`}
                title={hiddenBySource ? `Hidden — source set to ${pick}` : off ? "Click to include" : "Click to exclude"}
              >
                <img
                  src={e.value}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(ev) => {
                    (ev.currentTarget as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                <span className="absolute top-0.5 left-0.5">
                  <Pill source={e.source} />
                </span>
                {off && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <X className="w-4 h-4 text-foreground/80" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScalarPicker({
  label,
  field,
  candidates,
  pick,
  setPick,
}: {
  label: string;
  field: MergeScalarField;
  candidates: Array<{ source: MergeSource; value: string }>;
  pick: MergeSource | undefined;
  setPick: (field: MergeScalarField, source: MergeSource) => void;
}) {
  if (candidates.length === 0) return null;
  const active = pick ?? candidates[0].source;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((c) => {
          const on = c.source === active;
          return (
            <button
              key={c.source}
              type="button"
              onClick={() => setPick(field, c.source)}
              className={`inline-flex items-start gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-left ring-1 transition max-w-full ${
                on ? `${sourceRing[c.source]} ring-2` : "ring-white/10 hover:ring-white/25"
              }`}
              title={`Use ${c.source}`}
            >
              <Pill source={c.source} />
              <span className={`truncate max-w-[260px] ${on ? "text-foreground/95" : "text-foreground/70"}`}>
                {c.value}
              </span>
              {on && <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MergePreviewPanel({
  sources,
  origins,
  busy,
  onContinue,
  onCancel,
}: Props) {
  const goodSources = sources.filter((s) => s.brief);
  const failedSources = sources.filter((s) => !s.brief);

  // Per-field exclusion sets.
  const [excluded, setExcluded] = useState<Record<MergeListField, Set<string>>>({
    images: new Set(), colors: new Set(), products: new Set(), services: new Set(),
    benefits: new Set(), proofPoints: new Set(), callsToAction: new Set(),
  });
  const [listSource, setListSource] = useState<Record<MergeListField, SourcePick>>({
    images: "all", colors: "all", products: "all", services: "all",
    benefits: "all", proofPoints: "all", callsToAction: "all",
  });
  const [scalarSource, setScalarSource] = useState<Partial<Record<MergeScalarField, MergeSource>>>({});
  const [logoOverride, setLogoOverride] = useState<string | null>(null);
  const [view, setView] = useState<"merge" | "compare">("merge");

  const toggle = (field: MergeListField, value: string) => {
    setExcluded((prev) => {
      const next = new Set(prev[field]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [field]: next };
    });
  };

  const setPick = (field: MergeListField, v: SourcePick) =>
    setListSource((prev) => ({ ...prev, [field]: v }));

  const setScalarPick = (field: MergeScalarField, source: MergeSource) =>
    setScalarSource((prev) => ({ ...prev, [field]: source }));

  const resetAll = () => {
    setExcluded({
      images: new Set(), colors: new Set(), products: new Set(), services: new Set(),
      benefits: new Set(), proofPoints: new Set(), callsToAction: new Set(),
    });
    setListSource({
      images: "all", colors: "all", products: "all", services: "all",
      benefits: "all", proofPoints: "all", callsToAction: "all",
    });
    setScalarSource({});
    setLogoOverride(null);
  };

  // Bulk: force every list/scalar/logo field to a single source (where available).
  const applyAll = (source: MergeSource) => {
    setListSource((prev) => {
      const next = { ...prev };
      for (const f of LIST_FIELDS) {
        const has = origins[f].some((e) => e.source === source);
        next[f] = has ? source : "all";
      }
      return next;
    });
    setScalarSource(() => {
      const next: Partial<Record<MergeScalarField, MergeSource>> = {};
      for (const { key } of SCALAR_FIELDS) {
        const has = sources.find((s) => s.id === source)?.brief?.[key as keyof SourceBrief];
        if (typeof has === "string" && has.trim()) next[key] = source;
      }
      return next;
    });
    const logoFromSource = sources.find((s) => s.id === source)?.brief?.logo;
    if (logoFromSource) setLogoOverride(logoFromSource);
    // Reset exclusions so the bulk choice is the source of truth.
    setExcluded({
      images: new Set(), colors: new Set(), products: new Set(), services: new Set(),
      benefits: new Set(), proofPoints: new Set(), callsToAction: new Set(),
    });
  };

  // Available sources per list field (only those that contributed any entry).
  const availability = useMemo(() => {
    const out: Record<MergeListField, MergeSource[]> = {
      images: [], colors: [], products: [], services: [],
      benefits: [], proofPoints: [], callsToAction: [],
    };
    for (const f of LIST_FIELDS) {
      const set = new Set<MergeSource>();
      for (const e of origins[f]) set.add(e.source);
      out[f] = (["primary", "secondary", "tertiary"] as MergeSource[]).filter((s) => set.has(s));
    }
    return out;
  }, [origins]);

  // Scalar candidates: one per source whose brief has a non-empty value.
  const scalarCandidates = useMemo(() => {
    const out: Record<MergeScalarField, Array<{ source: MergeSource; value: string }>> = {
      brandName: [], heroHeadline: [], heroSubheadline: [], offer: [],
      audience: [], pricing: [], metaDescription: [], pageTitle: [],
    };
    for (const s of sources) {
      if (!s.brief) continue;
      for (const { key } of SCALAR_FIELDS) {
        const v = (s.brief as any)[key];
        if (typeof v === "string" && v.trim()) {
          out[key].push({ source: s.id, value: v.trim() });
        }
      }
    }
    return out;
  }, [sources]);

  // Collect all logo candidates (one per source that has one).
  const logoCandidates = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ value: string; source: MergeSource }> = [];
    for (const s of sources) {
      if (s.brief?.logo && !seen.has(s.brief.logo)) {
        seen.add(s.brief.logo);
        out.push({ value: s.brief.logo, source: s.id });
      }
    }
    return out;
  }, [sources]);

  const activeLogo = logoOverride ?? origins.logo?.value ?? null;
  const totalExcluded = Object.values(excluded).reduce((n, s) => n + s.size, 0);
  const totalListPicks = Object.values(listSource).filter((v) => v !== "all").length;
  const totalScalarPicks = Object.keys(scalarSource).length;
  const hasOverrides = totalExcluded > 0 || totalListPicks > 0 || totalScalarPicks > 0 || logoOverride !== null;

  const handleContinue = () => {
    onContinue({
      excluded: {
        images: [...excluded.images],
        colors: [...excluded.colors],
        products: [...excluded.products],
        services: [...excluded.services],
        benefits: [...excluded.benefits],
        proofPoints: [...excluded.proofPoints],
        callsToAction: [...excluded.callsToAction],
      },
      listSource,
      scalarSource,
      logoOverride,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/30 bg-background/60 backdrop-blur p-4 space-y-4 shadow-[0_0_40px_-20px_hsl(var(--primary)/0.5)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wider text-primary/80">
            {view === "merge" ? "Merge preview · resolve conflicts" : "Compare scraped sources side-by-side"}
          </p>
          <p className="text-sm font-medium text-foreground/90">
            {view === "merge"
              ? "Pick the winning source per field. Click any item to exclude it."
              : "Review what each source returned before merging."}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${sourceDot.primary}`} /> Primary</span>
          <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${sourceDot.secondary}`} /> Secondary</span>
          <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${sourceDot.tertiary}`} /> Tertiary</span>
        </div>
      </div>

      {/* View toggle: Merge vs Compare */}
      <div className="inline-flex rounded-md bg-white/[0.04] ring-1 ring-white/10 p-0.5 self-start">
        <button
          type="button"
          onClick={() => setView("merge")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-[3px] transition ${
            view === "merge" ? "bg-primary/80 text-primary-foreground" : "text-foreground/60 hover:text-foreground/90"
          }`}
        >
          <GitMerge className="w-3 h-3" /> Merge & resolve
        </button>
        <button
          type="button"
          onClick={() => setView("compare")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-[3px] transition ${
            view === "compare" ? "bg-primary/80 text-primary-foreground" : "text-foreground/60 hover:text-foreground/90"
          }`}
        >
          <Columns3 className="w-3 h-3" /> Compare side-by-side
        </button>
      </div>

      {view === "compare" && <SourceCompareView sources={sources} />}

      {view === "merge" && (<>


      {/* Bulk: choose one source to win every field */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.02] ring-1 ring-white/5 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Use one source for everything
        </span>
        {(["primary", "secondary", "tertiary"] as MergeSource[]).map((src) => {
          const entry = sources.find((s) => s.id === src);
          const disabled = !entry?.brief;
          return (
            <button
              key={src}
              type="button"
              onClick={() => applyAll(src)}
              disabled={disabled || busy}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ring-1 transition ${
                disabled
                  ? "ring-white/5 text-foreground/30 cursor-not-allowed"
                  : `ring-white/10 hover:ring-2 hover:${sourceRing[src]} text-foreground/90`
              }`}
              title={disabled ? `${src} unavailable` : `Force every field to ${src}`}
            >
              <Pill source={src} />
              <span className="capitalize">{src}</span>
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={resetAll}
          disabled={busy || !hasOverrides}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ring-1 ring-white/10 text-foreground/80 hover:ring-white/25 hover:text-foreground transition disabled:opacity-40 disabled:pointer-events-none"
          title="Restore the originally detected merge (Primary wins, others fill gaps)"
        >
          <RotateCcw className="w-3 h-3" />
          Reset to detected
        </button>
      </div>


      {/* Source rows */}
      <ul className="space-y-1 border-y border-white/5 py-2">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <Pill source={s.id} />
            <span className="text-foreground/85 truncate flex-1" title={s.url}>
              {s.url.replace(/^https?:\/\//, "")}
            </span>
            {s.brief ? (
              <span className="inline-flex items-center gap-1 text-emerald-300/90">
                <Check className="w-3 h-3" />
                {s.brief.confidenceScore}/100
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-300/90" title={s.error}>
                <X className="w-3 h-3" /> failed
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Scalar text fields */}
      {SCALAR_FIELDS.some((f) => scalarCandidates[f.key].length > 1) && (
        <div className="space-y-3 rounded-lg bg-white/[0.02] ring-1 ring-white/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-primary/70 font-medium">
            Text fields · pick winning source
          </p>
          {SCALAR_FIELDS.map((f) => (
            scalarCandidates[f.key].length > 1 ? (
              <ScalarPicker
                key={f.key}
                label={f.label}
                field={f.key}
                candidates={scalarCandidates[f.key]}
                pick={scalarSource[f.key]}
                setPick={setScalarPick}
              />
            ) : null
          ))}
        </div>
      )}

      {/* Logo chooser */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Logo {logoCandidates.length > 1 && <span className="text-foreground/40">· choose source</span>}
        </p>
        {logoCandidates.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60 italic">No logo detected</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {logoCandidates.map((c) => {
              const selected = (activeLogo ?? "") === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setLogoOverride(c.value)}
                  className={`relative flex items-center gap-2 rounded-lg bg-white/[0.04] ring-1 px-2 py-1.5 transition ${
                    selected ? `${sourceRing[c.source]} ring-2` : "ring-white/10 hover:ring-white/25"
                  }`}
                  title={`Use ${c.source} logo`}
                >
                  <Pill source={c.source} />
                  <div className="w-8 h-8 rounded bg-black/40 overflow-hidden ring-1 ring-white/10">
                    <img
                      src={c.value}
                      alt="Logo"
                      className="w-full h-full object-contain"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = "0.2")}
                    />
                  </div>
                  {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ImageRow entries={origins.images} excluded={excluded.images} pick={listSource.images} available={availability.images} setPick={(v) => setPick("images", v)} toggle={toggle} />
      <ColorRow entries={origins.colors} excluded={excluded.colors} pick={listSource.colors} available={availability.colors} setPick={(v) => setPick("colors", v)} toggle={toggle} />
      <FieldRow label="Products" field="products" entries={origins.products} excluded={excluded.products} pick={listSource.products} available={availability.products} setPick={(v) => setPick("products", v)} toggle={toggle} />
      <FieldRow label="Services" field="services" entries={origins.services} excluded={excluded.services} pick={listSource.services} available={availability.services} setPick={(v) => setPick("services", v)} toggle={toggle} />
      <FieldRow label="Benefits" field="benefits" entries={origins.benefits} excluded={excluded.benefits} pick={listSource.benefits} available={availability.benefits} setPick={(v) => setPick("benefits", v)} toggle={toggle} />
      <FieldRow label="Proof points" field="proofPoints" entries={origins.proofPoints} excluded={excluded.proofPoints} pick={listSource.proofPoints} available={availability.proofPoints} setPick={(v) => setPick("proofPoints", v)} toggle={toggle} />
      <FieldRow label="Calls to action" field="callsToAction" entries={origins.callsToAction} excluded={excluded.callsToAction} pick={listSource.callsToAction} available={availability.callsToAction} setPick={(v) => setPick("callsToAction", v)} toggle={toggle} />

      {failedSources.length > 0 && (
        <p className="text-[11px] text-amber-300/90">
          {failedSources.length} source{failedSources.length === 1 ? "" : "s"} failed to extract — only successful ones will be merged.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
        <button
          type="button"
          onClick={resetAll}
          disabled={busy || !hasOverrides}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground/90 disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
        <div className="flex items-center gap-2">
          {hasOverrides && (
            <span className="text-[11px] text-muted-foreground">
              {totalScalarPicks + totalListPicks + (logoOverride ? 1 : 0)} override{totalScalarPicks + totalListPicks + (logoOverride ? 1 : 0) === 1 ? "" : "s"}
              {totalExcluded > 0 && ` · ${totalExcluded} excluded`}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleContinue}
            disabled={busy || goodSources.length === 0}
            className="text-xs studio-gradient-bg text-primary-foreground"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>Continue with merge</>
            )}
          </Button>
        </div>
      </div>
      </>)}
    </motion.div>
  );
}
