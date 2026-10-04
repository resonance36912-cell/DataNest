import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import SEO from "@/components/SEO";
import MobileNavMenu from "@/components/MobileNavMenu";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";
import { HUB_URL } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION } from "@/lib/promotion";

const Pricing = () => {
  const eyebrow = FREE_PROMOTION_ACTIVE ? FREE_PROMOTION.shortLabel : "Costing in progress";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEO title="Free Access Promotion - Resonance Creative Studio" description={FREE_PROMOTION.description} path="/pricing" />
      <MobileNavMenu />
      <main className="container mx-auto px-4 sm:px-6 py-20">
        <div className="max-w-3xl mx-auto text-center rounded-3xl border border-primary/25 bg-card/60 backdrop-blur-xl p-8 sm:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono uppercase tracking-[0.22em] text-primary mb-5">
            <Sparkles className="w-3 h-3" /> {eyebrow}
          </div>
          <h1 className="text-4xl sm:text-6xl font-display font-bold tracking-tight">{FREE_PROMOTION.headline}</h1>
          <p className="mt-5 text-lg text-muted-foreground">{FREE_PROMOTION.description}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            No payment, pack, top-up, checkout, or subscription is required. Creative generations and provider usage
            remain measurable so future pricing can be based on validated cost.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/studio" className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Open Creative Studio free</Link>
            <a href={HUB_URL} className="rounded-full border border-white/15 px-6 py-3 font-semibold">Back to Resonance Hub</a>
          </div>
        </div>
      </main>
      <ResonanceFooter />
    </div>
  );
};

export default Pricing;
