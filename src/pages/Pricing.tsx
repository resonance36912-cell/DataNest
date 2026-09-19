import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { HUB_URL, APP_START_URL } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION } from "@/lib/promotion";

const Pricing = () => {
  const eyebrow = FREE_PROMOTION_ACTIVE ? FREE_PROMOTION.shortLabel : "Costing in progress";

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Free Access Promotion - YouTube Optimizer"
        description={FREE_PROMOTION.description}
        path="/pricing"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Resonance YouTube Optimizer",
          applicationCategory: "BusinessApplication",
          offers: {
            "@type": "Offer",
            priceCurrency: "ZAR",
            price: "0",
            availability: "https://schema.org/InStock",
            description: "Free promotional access while operating costs are measured.",
            url: "https://youtubeoptimizer.life/",
          },
        }}
      />
      <SiteHeader active="Free Access" />
      <main className="container mx-auto px-4 sm:px-6 py-20">
        <section className="mx-auto max-w-3xl rounded-3xl border border-primary/25 bg-card/60 p-8 text-center backdrop-blur-xl sm:p-12">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-4 text-xs font-mono font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-6xl">{FREE_PROMOTION.headline}</h1>
          <p className="mt-5 text-lg text-muted-foreground">{FREE_PROMOTION.description}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            No payment, pack, credit top-up, checkout, or subscription is required. Audit, thumbnail, AI, and
            infrastructure usage remain measurable so future pricing can be based on validated cost.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="pill" size="pillLg"><a href={APP_START_URL}>Open YouTube Optimizer free</a></Button>
            <Button asChild variant="pillOutline" size="pillLg"><a href={HUB_URL}>Back to Resonance Hub</a></Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Pricing;
