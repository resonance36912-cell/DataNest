import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Zap, ExternalLink, Package, Sparkles } from "lucide-react";
import SEO from "@/components/SEO";
import MobileNavMenu from "@/components/MobileNavMenu";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";
import {
  checkoutUrl,
  HUB_URL,
  HUB_PRICING_URL,
  HUB_UPDATES_URL,
} from "@/lib/entitlement";

// v3 alignment: Creative Studio is a spoke of The Resonance Hub. There is no
// monthly app subscription on this page. Users buy once-off credits and
// project packs through the Hub; official pricing lives at HUB_PRICING_URL.
const bundleCheckout = (id: string) => checkoutUrl(`creative_studio:bundle:${id}`);

type Pack = { id: string; name: string; price: number; desc: string; tag?: string };

const projectPacks: Pack[] = [
  { id: "payg-basic-poster", name: "Single Poster", price: 15, desc: "One AI poster + PNG export. Single use.", tag: "Try it" },
  { id: "payg-poster-pack", name: "Poster Pack (5)", price: 65, desc: "5 AI posters in matching style + JPG/PNG exports." },
  { id: "payg-brochure", name: "Brochure", price: 119, desc: "Multi-page AI brochure + print-ready PDF." },
  { id: "payg-social-pack", name: "Social Media Pack", price: 179, desc: "10 posts + captions + hashtags, ready to publish." },
  { id: "payg-cinematic", name: "Cinematic Video", price: 299, desc: "Full 10s MP4 cinematic export with music." },
  { id: "payg-campaign", name: "Campaign Pack", price: 549, desc: "Posters + social + video + raw assets. White-label ready.", tag: "Best value" },
];

const creditPacks: Pack[] = [
  { id: "topup-images", name: "Image Credit Pack", price: 59, desc: "25 AI poster generations. Credits never expire." },
  { id: "topup-narration", name: "Narration Credit Pack", price: 169, desc: "50 000 characters of studio-quality voiceover. Never expires." },
  { id: "topup-video", name: "Video Credit Pack", price: 249, desc: "5 × 10s Kling-powered cinematic MP4 exports. Never expires." },
];

const creditTable = [
  { action: "Poster generation (per variant)", credits: 1 },
  { action: "AI editing rewrite", credits: 2 },
  { action: "Premium poster (high-res)", credits: 3 },
  { action: "Voiceover (~1 minute)", credits: 5 },
  { action: "Background music track", credits: 5 },
  { action: "Social media pack (per platform)", credits: 5 },
  { action: "Brochure export (PDF)", credits: 10 },
  { action: "Cinematic MP4 video (10s)", credits: 30 },
];

// JSON-LD: describe once-off packs as Products with InStock offers. No
// recurring / monthly UnitPriceSpecification is emitted — the Hub is the
// source of truth for any bundle/subscription pricing.
const offerJsonLd = [...projectPacks, ...creditPacks].map((p) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: `Resonance Creative Studio — ${p.name}`,
  description: p.desc,
  offers: {
    "@type": "Offer",
    priceCurrency: "ZAR",
    price: String(p.price),
    availability: "https://schema.org/InStock",
    url: `${HUB_URL}/checkout?sku=${encodeURIComponent(`creative_studio:bundle:${p.id}`)}`,
  },
}));

const Pricing = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEO
        title="Pricing — Once-off credits & project packs · Resonance Creative Studio"
        description="Buy once-off credits or project packs through The Resonance Hub. No recurring app subscription required. ZAR pricing."
        path="/pricing"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Resonance Creative Studio",
            applicationCategory: "DesignApplication",
            operatingSystem: "Web",
            offers: offerJsonLd,
            url: "https://www.creativestudio.life/",
            isPartOf: {
              "@type": "Organization",
              name: "The Resonance Hub",
              url: HUB_URL,
            },
          },
        ]}
      />

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <img src="/logo-icon.jpg" alt="Resonance Creative Studio logo" className="h-8 w-8 object-cover rounded shrink-0" width={32} height={32} />
            <span className="font-display text-sm sm:text-base font-bold studio-gradient-text truncate">Resonance Creative Studio</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <a href={HUB_PRICING_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              Pricing <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
            <a href={HUB_UPDATES_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              Updates <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <a
              href={HUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              title="The Resonance Hub — home of every Resonance app"
            >
              Part of The Resonance Hub ↗
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="studio-gradient-bg text-primary-foreground text-xs sm:text-sm font-semibold px-3 sm:px-5 py-2 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Start free
            </Link>
            <MobileNavMenu
              links={[
                { label: "About", to: "/about" },
                { label: "Hub pricing", href: HUB_PRICING_URL, external: true },
                { label: "Hub updates", href: HUB_UPDATES_URL, external: true },
                { label: "Contact", to: "/contact" },
                { label: "Back to hub", href: HUB_URL, external: true },
              ]}
            />
          </div>
        </div>
      </nav>

      <main className="pt-28 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6">
        {/* Hero */}
        <section className="max-w-4xl mx-auto text-center mb-14">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-card/60 px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs text-muted-foreground mb-6"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            🇿🇦 ZAR pricing · Once-off packs & credits · Checkout via The Resonance Hub
          </motion.div>
          <h1 className="font-display text-[2rem] leading-[1.1] sm:text-5xl md:text-6xl font-bold mb-5 break-words">
            Pay only for what{" "}
            <span className="studio-gradient-text">you create</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Buy once-off credits or project packs through The Resonance Hub. No recurring app subscription required.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={HUB_PRICING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground font-display font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              View hub pricing
              <ExternalLink className="w-4 h-4" />
            </a>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 border border-border bg-card/60 text-foreground font-display font-semibold px-6 py-3 rounded-xl hover:bg-card transition-colors"
            >
              <Zap className="w-4 h-4" />
              Start free
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted-foreground/80 max-w-md mx-auto">
            Everyone gets a free trial to explore the studio before buying a pack.
          </p>
        </section>

        {/* Project packs — once-off */}
        <section aria-label="Project packs" className="max-w-6xl mx-auto mb-24">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-primary/80 mb-3">
              <Package className="w-3 h-3" /> Once-off · No recurring billing
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
              Project packs
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Buy a single design, video, or full campaign and keep it. Perfect for one-off projects, pitches, and pilots.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectPacks.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card/60 p-5 flex flex-col relative">
                {p.tag && (
                  <span className="absolute -top-2 left-4 studio-gradient-bg text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    {p.tag}
                  </span>
                )}
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4 flex-1">{p.desc}</p>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="font-display text-2xl font-bold">R{p.price}</span>
                    <span className="text-xs text-muted-foreground ml-1">once-off</span>
                  </div>
                  <a
                    href={bundleCheckout(p.id)}
                    target="_blank" rel="noopener noreferrer"
                    data-testid={`buy-pack-${p.id}`}
                    className="inline-flex items-center gap-1 studio-gradient-bg text-primary-foreground font-semibold text-xs px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Buy pack <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Credit packs */}
        <section aria-label="Credit packs" className="max-w-5xl mx-auto mb-24">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-primary/80 mb-3">
              <Sparkles className="w-3 h-3" /> Credits never expire
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">Credit packs</h2>
            <p className="text-muted-foreground">
              Add capacity to your account and spend credits on any studio action. Buy once, use whenever.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {creditPacks.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-card/60 p-6 flex flex-col">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold">{t.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4 flex-1">{t.desc}</p>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-display text-xl font-bold">R{t.price}</div>
                  <a
                    href={bundleCheckout(t.id)}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-block studio-gradient-bg text-primary-foreground font-semibold text-xs px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Buy credits
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Credit table */}
        <section className="max-w-3xl mx-auto mb-24">
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-3 text-center">How credits work</h2>
          <p className="text-muted-foreground text-center mb-8">
            Each pack tops up your studio credit balance. Heavy actions like full MP4 exports cost more than a poster rewrite. Your credits never expire.
          </p>
          <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] px-5 py-3 bg-card text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <span>Action</span>
              <span>Credits</span>
            </div>
            {creditTable.map((r) => (
              <div key={r.action} className="grid grid-cols-[1fr_auto] px-5 py-3 border-t border-border/60 text-sm">
                <span>{r.action}</span>
                <span className="font-semibold text-primary">{r.credits}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pilots & Enterprise → Hub */}
        <section className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-8 md:p-12 text-center">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">Ecosystem bundles, pilots & enterprise</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Schools, agencies and publishing houses get volume credit bundles, cross-app pilots and dedicated onboarding via The Resonance Hub. All ecosystem bundles are managed by the Hub — including bundles that combine Creative Studio with ePublisher, Sync Vision and YouTube Optimizer.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={HUB_PRICING_URL}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground font-display font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                View hub pricing <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={`${HUB_URL}/contact?topic=education&app=creative_studio`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-border bg-card/60 text-foreground font-display font-semibold px-6 py-3 rounded-xl hover:bg-card transition-colors"
              >
                Talk to the hub team <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground mt-12 max-w-xl mx-auto">
          Official pricing, updates, checkout, support, and ecosystem bundles are managed by{" "}
          <a href={HUB_URL} target="_blank" rel="noopener noreferrer" className="text-foreground font-semibold underline-offset-4 hover:underline">
            The Resonance Hub
          </a>{" "}
          (reson8.life).
        </p>
      </main>

      <ResonanceFooter currentApp="Creative Studio" />
    </div>
  );
};

export default Pricing;
