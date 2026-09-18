import { ShieldAlert } from "lucide-react";

export interface ComplianceFlag {
  term: string;
  sentence: string;
  suggestion: string;
}

interface Props {
  flags: ComplianceFlag[];
}

const CompliancePanel = ({ flags }: Props) => {
  if (!flags?.length) return null;
  return (
    <section className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-300" />
        <h3 className="font-display text-sm font-bold text-amber-100">
          Wellness claim check ({flags.length})
        </h3>
      </div>
      <p className="text-[11px] text-amber-100/80">
        These phrases sound medical. Soften them before publishing.
      </p>
      <ul className="space-y-2 mt-1">
        {flags.slice(0, 5).map((f, i) => (
          <li key={i} className="text-xs text-amber-50/90 leading-relaxed">
            <span className="font-semibold text-amber-200">{f.term}:</span>{" "}
            <span className="text-amber-50/80">"{f.sentence}"</span>
            <div className="text-[11px] text-emerald-200/90 mt-0.5">
              Try: {f.suggestion}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default CompliancePanel;
