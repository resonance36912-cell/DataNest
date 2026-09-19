import { Sparkles } from "lucide-react";
import { FREE_PROMOTION } from "@/lib/promotion";

export default function TopUpCard() {
  return (
    <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{FREE_PROMOTION.shortLabel}</div>
          <h2 className="mt-1 text-lg font-semibold">Rendering access is included</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {FREE_PROMOTION.description} Storyboard, rendering, vocal sync, and export usage are measured for costing,
            but no credit purchase or top-up is required.
          </p>
        </div>
      </div>
    </section>
  );
}
