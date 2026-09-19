import { m as motion } from "@/lib/lazy-motion";
import { Sparkles, Rocket, Star, Package, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import {
  HUB_URL,
  APP_START_URL,
  HUB_DOCS_URL,
  HUB_SUPPORT_URL,
} from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION } from "@/lib/promotion";

// Dormant packaging placeholders retained for future cost-based repricing. No purchase CTA is active.
const PACKS = [
  {
    id: "free",
    name: "Free trial",
    price: "R0",
    unit: "1 audit included",
    icon: Sparkles,
    desc: "Try the optimizer on one channel.",
    features: ["1 channel audit", "5 AI thumbnails", "Basic analytics"],
    cta: "Start free",
    href: APP_START_URL,
    external: false,
  },
  {
    id: "credits",
    name: "Credit top-up",
    price: "Pricing paused",
    unit: "included during promotion",
    icon: Rocket,
    desc: "Credit-based usage is included while promotion costing is measured.",
    features: ["Audits, thumbnails & ideas", "Never expires within pack window", "Use across sessions"],
    cta: "Open free",
    href: APP_START_URL,
    external: false,
  },
  {
    id: "project",
    name: "Project pack",
    price: "Pricing paused",
    unit: "included during promotion",
    icon: Star,
    desc: "One channel, full growth roadmap, done.",
    features: ["Deep channel audit", "100 AI thumbnails", "Growth roadmap export"],
    cta: "Open free",
    href: APP_START_URL,
    external: false,
    popular: true,
  },
  {
    id: "studio",
    name: "Studio pack",
    price: "Pricing paused",
    unit: "included during promotion",
    icon: Package,
    desc: "Agencies & multi-channel creators.",
    features: ["Multiple channel audits", "500 thumbnails", "Team collaboration"],
    cta: "Open free",
    href: APP_START_URL,
    external: false,
  },
] as const;

const Pricing = () => {
  if (FREE_PROMOTION_ACTIVE) {
    return (
      <div className="min-h-screen bg-background">
        <SEO
          title="Free Access Promotion — YouTube Optimizer"
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
              description: "Free promotional access",
            },
          }}
        />
        <SiteHeader active="Free Access" />
        <main className="container mx-auto px-4 sm:px-6 py-20">
          <section className="mx-auto max-w-3xl rounded-3xl border border-primary/25 bg-card/60 p-8 text-center backdrop-blur-xl sm:p-12">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-4 text-xs font-mono font-semibold uppercase tracking-[0.22em] text-primary">{FREE_PROMOTION.shortLabel}</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-6xl">{FREE_PROMOTION.headline}</h1>
            <p className="mt-5 text-lg text-muted-foreground">{FREE_PROMOTION.description}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Sign in so audits, thumbnail generations, and AI usage can be measured for sustainable future pricing.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild variant="pill" size="pillLg">
                <a href={APP_START_URL}>Open YouTube Optimizer free</a>
              </Button>
              <Button asChild variant="pillOutline" size="pillLg">
                <a href={HUB_URL}>Back to Resonance Hub</a>
              </Button>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pricing — YouTube Optimizer · Part of The Resonance Hub"
        description="Buy once-off credits or project packs for YouTube Optimizer through The Resonance Hub. No recurring app subscription required."
        path="/pricing"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": "https://youtubeoptimizer.life/pricing#product",
          name: "Resonance YouTube Optimizer",
          description:
            "AI-powered YouTube channel audits, titles, thumbnails and growth analytics — sold as once-off credit and project packs via The Resonance Hub.",
          brand: { "@type": "Brand", name: "The Resonance Hub", "@id": "https://reson8.life/#organization" },
          isRelatedTo: { "@id": "https://reson8.life/#organization" },
          offers: [
            {
              "@type": "Offer",
              name: "Free trial",
              priceCurrency: "ZAR",
              price: "0",
              url: "https://youtubeoptimizer.life/",
              availability: "https://schema.org/InStock",
              seller: { "@id": "https://reson8.life/#organization" },
            },
            {
              "@type": "Offer",
              name: "Credit top-up",
              priceCurrency: "ZAR",
              price: "149",
              url: "https://reson8.life/pricing#credits",
              availability: "https://schema.org/InStock",
              seller: { "@id": "https://reson8.life/#organization" },
            },
            {
              "@type": "Offer",
              name: "Project pack",
              priceCurrency: "ZAR",
              price: "599",
              url: "https://reson8.life/pricing#packs",
              availability: "https://schema.org/InStock",
              seller: { "@id": "https://reson8.life/#organization" },
            },
            {
              "@type": "Offer",
              name: "Studio pack",
              priceCurrency: "ZAR",
              price: "2999",
              url: "https://reson8.life/pricing#studio",
              availability: "https://schema.org/InStock",
              seller: { "@id": "https://reson8.life/#organization" },
            },
          ],
        }}
      />

      <SiteHeader active="Free Access" />

      <main className="relative overflow-x-clip">
        <div
          className="pointer-events-none absolute top-24 -left-20 w-[28rem] h-[28rem] rounded-full blur-[120px] opacity-40"
          style={{ background: "hsl(var(--resonance-violet) / 0.35)" }}
        />
        <div
          className="pointer-events-none absolute bottom-24 -right-20 w-[28rem] h-[28rem] rounded-full blur-[120px] opacity-30"
          style={{ background: "hsl(var(--resonance-magenta) / 0.30)" }}
        />

        <div className="container mx-auto px-4 sm:px-6 py-14 sm:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 backdrop-blur px-3 py-1.5 mx-auto mb-6"
            style={{ display: "flex", width: "fit-content" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-70 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Once-off packs · ZAR
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="text-center max-w-3xl mx-auto mb-4"
          >
            <h1 className="font-display font-bold text-4xl sm:text-5xl md:text-6xl tracking-tighter leading-[0.95] mb-4">
              Pay only for what <span className="gradient-resonance-text">resonates.</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
              Buy once-off credits or project packs through{" "}
              <a
                href={HUB_URL}
                rel="noopener"
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                The Resonance Hub
              </a>
              .{" "}
              <span className="font-serif italic text-foreground">
                No recurring app subscription required.
              </span>
            </p>
          </motion.div>

          <p className="text-center text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/60 mb-12 sm:mb-16">
            Checkout & billing on reson8.life · Part of The Resonance Hub
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 max-w-6xl mx-auto">
            {PACKS.map((tier, i) => {
              const Icon = tier.icon;
              const popular = "popular" in tier && tier.popular;
              return (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.55, ease: "easeOut" }}
                  whileHover={{ y: -6 }}
                  className={`group relative rounded-2xl border backdrop-blur-xl p-6 flex flex-col transition-all duration-300 ${
                    popular
                      ? "lg:-translate-y-4 border-primary/50 bg-card/60 shadow-[0_30px_80px_-20px_hsl(var(--resonance-magenta)/0.45)]"
                      : "border-border/40 bg-card/40 hover:border-primary/40 hover:shadow-[0_20px_60px_-20px_hsl(var(--resonance-magenta)/0.30)]"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${
                      popular ? "opacity-100" : ""
                    }`}
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(var(--resonance-violet) / 0.12), transparent 40%, hsl(var(--resonance-magenta) / 0.15))",
                    }}
                  />

                  {popular && (
                    <motion.span
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-display font-semibold tracking-wide uppercase whitespace-nowrap shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.6)]"
                    >
                      Most Popular
                    </motion.span>
                  )}

                  <div className="relative flex flex-col flex-1">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 ${
                        popular
                          ? "bg-gradient-to-br from-[hsl(var(--resonance-violet)/0.3)] to-[hsl(var(--resonance-magenta)/0.3)]"
                          : "bg-primary/10"
                      }`}
                    >
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-display font-semibold text-xl mb-1 tracking-tight">
                      {tier.name}
                    </h3>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span
                        className={`font-display font-bold text-3xl sm:text-4xl tracking-tighter ${
                          popular ? "gradient-resonance-text" : ""
                        }`}
                      >
                        {tier.price}
                      </span>
                      <span className="text-muted-foreground text-sm">{tier.unit}</span>
                    </div>
                    <p className="text-muted-foreground text-sm mb-5 font-serif italic">
                      {tier.desc}
                    </p>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent mb-5" />

                    <ul className="space-y-2.5 mb-6 flex-1">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                            <Sparkles className="h-2.5 w-2.5 text-primary" />
                          </span>
                          <span className="text-foreground/85">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      variant={popular ? "pill" : "pillOutline"}
                      size="pill"
                      className="w-full"
                    >
                      <a
                        href={tier.href}
                        rel="noopener"
                        {...(tier.external ? { target: "_blank" } : {})}
                      >
                        {tier.cta}
                        {tier.external && <ExternalLink className="h-3.5 w-3.5" />}
                      </a>
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-14 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="pill" size="pillLg">
                <a href={hubUrl("/pricing")} target="_blank" rel="noopener">
                  View hub pricing <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="pillOutline" size="pillLg">
                <a href={HUB_DOCS_URL} target="_blank" rel="noopener">
                  Hub docs <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Official pricing, checkout, updates, support, and ecosystem bundles are managed by{" "}
              <a
                href={HUB_URL}
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline underline-offset-4"
              >
                The Resonance Hub
              </a>
              .{" "}
              <a
                href={HUB_SUPPORT_URL}
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline underline-offset-4"
              >
                Contact hub support
              </a>{" "}
              for custom project scoping.
            </p>
          </motion.div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Pricing;
