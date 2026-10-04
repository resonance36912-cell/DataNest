// Side-by-side comparison of Primary / Secondary / Tertiary scraped briefs.
// Read-only view; conflict resolution happens in MergePreviewPanel's "Merge" tab.
import { Check, X } from "lucide-react";
import type { SourceBrief } from "@/lib/sourceBrief";
import type { MergeSource, MergeSourceEntry } from "./MergePreviewPanel";

interface Props {
  sources: MergeSourceEntry[];
}

const sourceLabel: Record<MergeSource, string> = {
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
};
const sourceTone: Record<MergeSource, string> = {
  primary: "bg-primary/80 text-primary-foreground",
  secondary: "bg-accent/70 text-accent-foreground",
  tertiary: "bg-white/15 text-foreground/90",
};

const SCALAR_ROWS: Array<{ key: keyof SourceBrief; label: string }> = [
  { key: "brandName", label: "Brand name" },
  { key: "pageTitle", label: "Page title" },
  { key: "metaDescription", label: "Meta description" },
  { key: "heroHeadline", label: "Headline" },
  { key: "heroSubheadline", label: "Subheadline" },
  { key: "offer", label: "Offer" },
  { key: "audience", label: "Audience" },
  { key: "pricing", label: "Pricing" },
];

const LIST_ROWS: Array<{ key: keyof SourceBrief; label: string }> = [
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "benefits", label: "Benefits" },
  { key: "proofPoints", label: "Proof points" },
  { key: "callsToAction", label: "CTAs" },
  { key: "colors", label: "Colors" },
];

function ScalarCell({ value }: { value: string }) {
  if (!value?.trim()) {
    return <span className="text-[11px] text-muted-foreground/40 italic">—</span>;
  }
  return <p className="text-[11.5px] text-foreground/90 leading-snug whitespace-pre-wrap break-words">{value}</p>;
}

function ListCell({ values, isColor }: { values: string[]; isColor?: boolean }) {
  if (!values?.length) return <span className="text-[11px] text-muted-foreground/40 italic">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {values.slice(0, 12).map((v, i) => (
        <li
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] ring-1 ring-white/10 px-1.5 py-0.5 text-[10.5px] text-foreground/85 max-w-full"
        >
          {isColor && (
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm ring-1 ring-white/15"
              style={{ background: v }}
            />
          )}
          <span className="truncate max-w-[150px]" title={v}>{v}</span>
        </li>
      ))}
      {values.length > 12 && (
        <li className="text-[10px] text-muted-foreground/60 self-center">+{values.length - 12}</li>
      )}
    </ul>
  );
}

function ImagesCell({ images, logo }: { images: string[]; logo: string }) {
  const all = [...(logo ? [logo] : []), ...(images ?? [])].slice(0, 6);
  if (!all.length) return <span className="text-[11px] text-muted-foreground/40 italic">—</span>;
  return (
    <div className="grid grid-cols-3 gap-1">
      {all.map((src, i) => (
        <div
          key={`${src}-${i}`}
          className="relative aspect-square rounded bg-black/40 ring-1 ring-white/10 overflow-hidden"
          title={src}
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = "0.2")}
          />
          {i === 0 && logo && (
            <span className="absolute top-0.5 left-0.5 text-[8px] font-bold bg-primary/80 text-primary-foreground px-1 rounded">
              LOGO
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SourceCompareView({ sources }: Props) {
  const ordered = (["primary", "secondary", "tertiary"] as MergeSource[])
    .map((id) => sources.find((s) => s.id === id))
    .filter(Boolean) as MergeSourceEntry[];

  if (!ordered.length) {
    return (
      <p className="text-sm text-muted-foreground italic px-2 py-6 text-center">
        No sources to compare yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div
        className="grid gap-2 min-w-[720px]"
        style={{ gridTemplateColumns: `120px repeat(${ordered.length}, minmax(220px, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {ordered.map((s) => (
          <div
            key={s.id}
            className="rounded-md ring-1 ring-white/10 bg-white/[0.03] p-2 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${sourceTone[s.id]}`}>
                {sourceLabel[s.id]}
              </span>
              {s.brief ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/90">
                  <Check className="w-2.5 h-2.5" />
                  {s.brief.confidenceScore}/100
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-rose-300/90" title={s.error}>
                  <X className="w-2.5 h-2.5" /> failed
                </span>
              )}
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="block text-[10.5px] text-primary/80 hover:text-primary truncate"
              title={s.url}
            >
              {s.url.replace(/^https?:\/\//, "")}
            </a>
          </div>
        ))}

        {/* Scalar rows */}
        {SCALAR_ROWS.map((row) => (
          <FieldRow key={String(row.key)} label={row.label}>
            {ordered.map((s) => (
              <div key={s.id} className="rounded-md ring-1 ring-white/5 bg-white/[0.02] p-2">
                <ScalarCell value={(s.brief?.[row.key] as string) ?? ""} />
              </div>
            ))}
          </FieldRow>
        ))}

        {/* List rows */}
        {LIST_ROWS.map((row) => (
          <FieldRow key={String(row.key)} label={row.label}>
            {ordered.map((s) => (
              <div key={s.id} className="rounded-md ring-1 ring-white/5 bg-white/[0.02] p-2">
                <ListCell
                  values={(s.brief?.[row.key] as string[]) ?? []}
                  isColor={row.key === "colors"}
                />
              </div>
            ))}
          </FieldRow>
        ))}

        {/* Images + logo */}
        <FieldRow label="Logo + Images">
          {ordered.map((s) => (
            <div key={s.id} className="rounded-md ring-1 ring-white/5 bg-white/[0.02] p-2">
              <ImagesCell images={s.brief?.images ?? []} logo={s.brief?.logo ?? ""} />
            </div>
          ))}
        </FieldRow>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pt-2 pr-2 text-right">
        {label}
      </div>
      {children}
    </>
  );
}
