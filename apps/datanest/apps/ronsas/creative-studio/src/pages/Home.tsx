import { lazy, Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Image, Video, Sparkles, Zap, ArrowRight, Share2, Megaphone, LogOut } from "lucide-react";
import SEO from "@/components/SEO";
import LazyInView from "@/components/LazyInView";
import MobileNavMenu from "@/components/MobileNavMenu";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";
import { HUB_URL, HUB_PRICING_URL, HUB_UPDATES_URL } from "@/lib/entitlement";
import { supabase } from "@/integrations/supabase/client";
import { signOutAndRedirect } from "@/lib/signOut";

// Below-the-fold sections: code-split + intersection-observer-gated so their
// framer-motion mount cost doesn't run on first paint.
const FeaturesSection = lazy(() => import("@/components/home/FeaturesSection"));
const HoloInspiredSections = lazy(() => import("@/components/home/HoloInspiredSections"));
const CtaSection = lazy(() => import("@/components/home/CtaSection"));

const Home = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    const apply = (s: unknown) => !cancelled && setIsAuthenticated(!!s);
    supabase.auth.getSession().then(({ data: { session } }) => apply(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_e, session) => apply(session),
    );
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEO
        title="Brief to Creative — AI Marketing Asset Generator"
        description="Upload a product image, paste product details, or complete a guided brief to generate posters, ads, social posts, thumbnails, podcast covers and campaign assets. A reference URL is optional."
        path="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Resonance Creator Studio",
            url: "https://resonancestudio.lovable.app/",
            description: "AI-powered creative studio for posters, brochures, advertisements, social posts, and cinematic videos. Brief-first workflow — uploads and product details drive generation, URL is optional.",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Resonance Creator Studio",
            url: "https://resonancestudio.lovable.app/",
          },
        ]}
      />
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo-icon.jpg"
              alt="Resonance Creator Studio logo"
              className="h-8 w-8 object-cover shrink-0"
              width={32}
              height={32}
              {...({ fetchpriority: "high" } as Record<string, string>)}
              decoding="async"
            />
            <span className="font-display text-sm sm:text-base font-bold studio-gradient-text truncate">
              Resonance Creator Studio
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <Link to="/logo-designer" className="hover:text-foreground transition-colors">Logo Designer</Link>
            <a
              href={HUB_PRICING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              title="Free promotion details live on The Resonance Hub"
            >
              Free access <span className="opacity-60">↗</span>
            </a>
            <a
              href={HUB_UPDATES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              Updates <span className="opacity-60">↗</span>
            </a>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <a
              href={HUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              title="The Resonance Hub — home of every Resonance tool"
            >
              Part of The Resonance Hub ↗
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                <a
                  href={HUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-white/[0.04]"
                  title="Back to The Resonance Hub"
                >
                  Back to hub ↗
                </a>
                <Link
                  to="/studio"
                  className="inline-flex items-center text-xs sm:text-sm studio-gradient-bg text-primary-foreground font-semibold px-3 sm:px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Open Studio
                </Link>
                <button
                  data-testid="home-sign-out"
                  onClick={() => signOutAndRedirect("/")}
                  aria-label="Sign out"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors p-2 sm:px-3 sm:py-1.5 rounded-md hover:bg-white/[0.04]"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>

            ) : (
              <Link
                to="/login"
                data-testid="home-sign-in"
                className="studio-gradient-bg text-primary-foreground text-xs sm:text-sm font-semibold px-3 sm:px-5 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Start free
              </Link>
            )}
            <MobileNavMenu
              links={[
                { label: "About", to: "/about" },
                { label: "Features", href: "/#features" },
                { label: "Logo Designer", to: "/logo-designer" },
                { label: "Free promotion", href: HUB_PRICING_URL, external: true },
                { label: "Hub updates", href: HUB_UPDATES_URL, external: true },
                { label: "Contact", to: "/contact" },
                { label: "Part of The Resonance Hub", href: HUB_URL, external: true },
              ]}
            />
          </div>


        </div>
      </nav>

      <main>
      {/* Hero */}
      <section className="pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6 relative">
        {/* Responsive hero backdrop — AVIF (smallest) → WebP → JPG fallback. Explicit width/height avoids CLS; preloaded in index.html for fast LCP. */}
        <picture>
          <source
            type="image/avif"
            srcSet="/hero/hero-640.avif 640w, /hero/hero-960.avif 960w, /hero/hero-1280.avif 1280w, /hero/hero-1600.avif 1600w, /hero/hero-1920.avif 1920w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/hero/hero-640.webp 640w, /hero/hero-960.webp 960w, /hero/hero-1280.webp 1280w, /hero/hero-1600.webp 1600w, /hero/hero-1920.webp 1920w"
            sizes="100vw"
          />
          <img
            src="/hero/hero-1280.jpg"
            srcSet="/hero/hero-640.jpg 640w, /hero/hero-960.jpg 960w, /hero/hero-1280.jpg 1280w, /hero/hero-1600.jpg 1600w, /hero/hero-1920.jpg 1920w"
            sizes="100vw"
            width={1920}
            height={1088}
            alt=""
            aria-hidden="true"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            decoding="async"
            className="absolute inset-0 w-full h-[680px] object-cover opacity-40 pointer-events-none -z-10 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
          />
        </picture>
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 px-4 py-1.5 text-xs text-muted-foreground mb-8"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Resonance governed · Creative expression · 🇿🇦 Built in South Africa · Free promotional access
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <motion.img
                src="/logo-icon.jpg"
                alt="Resonance Creator Studio logo"
                className="h-14 w-14 object-cover"
                width={56}
                height={56}
                {...({ fetchpriority: "high" } as Record<string, string>)}
                decoding="async"
                animate={{ scale: [0.85, 1, 0.85] }}
                transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
              />
              <span className="font-display text-sm font-bold uppercase tracking-[0.3em] studio-gradient-text glitch-flicker-loop">
                Creator Studio
              </span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="font-display text-[2.25rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 break-words"
          >
            Brief to Creative —{" "}
            <span className="studio-gradient-text">campaign-ready</span>{" "}
            in minutes.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Upload a product image, complete a guided brief, or add a reference link to turn product details into polished posters, ads, social posts and cinematic video concepts. Built in South Africa. Free promotional access. POPIA-safe.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-3 mb-12"
          >
            {[
              { icon: Image, label: "Local Poster Generation" },
              { icon: Video, label: "Cinematic Video" },
              { icon: Share2, label: "Social Media Hub" },
              { icon: Megaphone, label: "Smart Advertisements" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm text-muted-foreground">
                <item.icon className="w-4 h-4 text-primary" />
                {item.label}
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link
              to="/login"
              className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground font-display font-semibold text-base px-8 py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
            >
              <Zap className="w-5 h-5" />
              Start free
            </Link>
            <a
              href="https://www.resonanceonline.life"
              className="inline-flex items-center gap-2 border border-border bg-card/60 text-foreground font-display font-semibold text-base px-8 py-3.5 rounded-xl hover:bg-card transition-colors"
            >
              Open Resonance Publish
              <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>

          {/* Trust strip — Holo-inspired, but honest. No fake star ratings. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs uppercase tracking-[0.2em] text-muted-foreground/80"
          >
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Sovereign local preview</span>
            <span className="hidden sm:inline opacity-30">·</span>
            <span>🇿🇦 Built in South Africa</span>
            <span className="hidden sm:inline opacity-30">·</span>
            <span>POPIA-safe</span>
            <span className="hidden sm:inline opacity-30">·</span>
            <span>No payment required during promotion</span>
            <span className="hidden sm:inline opacity-30">·</span>
            <span>Part of <a href={HUB_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline hover:text-foreground">The Resonance ↗</a></span>
          </motion.div>
        </div>
      </section>

      {/* Below-the-fold: only mount when scrolled near, with a chunk-split bundle. */}
      <LazyInView minHeight={680} rootMargin="300px">
        <Suspense fallback={null}>
          <FeaturesSection />
        </Suspense>
      </LazyInView>

      <LazyInView minHeight={1400} rootMargin="300px">
        <Suspense fallback={null}>
          <HoloInspiredSections />
        </Suspense>
      </LazyInView>



      <LazyInView minHeight={360} rootMargin="300px">
        <Suspense fallback={null}>
          <CtaSection />
        </Suspense>
      </LazyInView>

      </main>

      {/* Shared cross-app footer (v3 brand pack) — keeps every Resonance spoke linked. */}
      <ResonanceFooter currentApp="Creator Studio" />
    </div>
  );
};

export default Home;
