import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

export interface BriefVariant {
  angle:
    | "clean-premium"
    | "direct-response"
    | "educational"
    | "local-sa"
    | "luxury-minimalist"
    | "scroll-stopper";
  headline: string;
  subheadline: string;
  callToAction: string;
  palette?: string[];
  layoutNotes?: string;
}

const ANGLE_LABELS: Record<BriefVariant["angle"], { name: string; blurb: string }> = {
  "clean-premium": { name: "Clean Premium", blurb: "Calm, confident, product-as-hero." },
  "direct-response": { name: "Direct Response", blurb: "Urgent benefit, clear CTA." },
  educational: { name: "Educational", blurb: "Teach the why-it-works." },
  "local-sa": { name: "Local SA", blurb: "South African voice & pride." },
  "luxury-minimalist": { name: "Luxury Minimalist", blurb: "Refined, editorial restraint." },
  "scroll-stopper": { name: "Scroll Stopper", blurb: "Bold social-feed hook." },
};

interface Props {
  variants: BriefVariant[];
  activeAngle?: BriefVariant["angle"];
  onPick: (v: BriefVariant) => void;
}

const VariantPicker = ({ variants, activeAngle, onPick }: Props) => {
  if (!variants?.length) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.025] ring-1 ring-white/[0.06] p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="font-display text-sm font-bold text-foreground">Pick an angle</h3>
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground ml-auto">
          {variants.length} variants
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {variants.map((v) => {
          const meta = ANGLE_LABELS[v.angle] ?? { name: v.angle, blurb: "" };
          const active = activeAngle === v.angle;
          return (
            <button
              key={v.angle}
              type="button"
              onClick={() => onPick(v)}
              className={`text-left rounded-xl p-3 transition ring-1 ${
                active
                  ? "bg-primary/15 ring-primary/60"
                  : "bg-white/[0.02] ring-white/[0.06] hover:bg-white/[0.05] hover:ring-primary/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-primary">
                  {meta.name}
                </span>
                {active && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
              </div>
              <p className="mt-1.5 text-sm font-display font-bold text-foreground leading-snug line-clamp-2">
                {v.headline}
              </p>
              {v.subheadline && (
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {v.subheadline}
                </p>
              )}
              <p className="mt-1.5 text-[10.5px] text-foreground/70">
                CTA: <span className="text-primary">{v.callToAction}</span>
              </p>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
};

export default VariantPicker;
