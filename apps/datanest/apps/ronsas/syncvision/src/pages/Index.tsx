import { lazy } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Sparkles, CheckCircle2, Zap, Shield, DollarSign, LogIn, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { SeoHead } from "@/components/SeoHead";
import { useAuth } from "@/contexts/AuthContext";
import logoIcon from "@/assets/logo-sync-vision-256.webp";
import { LazySection } from "@/components/landing/LazySection";

// Below-the-fold marketing sections are code-split and mounted only as they
// approach the viewport, so the landing critical path stays small.
const WorkflowPreviewStrip = lazy(() =>
  import("@/components/landing/WorkflowPreviewStrip").then((m) => ({ default: m.WorkflowPreviewStrip })),
);
const StoryboardGallery = lazy(() =>
  import("@/components/landing/StoryboardGallery").then((m) => ({ default: m.StoryboardGallery })),
);
const InteractiveProductPreview = lazy(() =>
  import("@/components/landing/InteractiveProductPreview").then((m) => ({ default: m.InteractiveProductPreview })),
);
const PricingSection = lazy(() =>
  import("@/components/landing/PricingSection").then((m) => ({ default: m.PricingSection })),
);


const qualityPrinciples = [
  {
    icon: CheckCircle2,
    step: "Verify",
    title: "Fix the signal before it multiplies",
    desc: "Lock lyrics, timing, mood, and scene coverage before an image or video generation job starts.",
    proof: "Fewer avoidable regenerations",
  },
  {
    icon: Eye,
    step: "Preview",
    title: "Approve the direction, then render",
    desc: "Review prompts, stills, continuity, and provider estimates before committing to video generation.",
    proof: "Human approval stays in the loop",
  },
  {
    icon: Zap,
    step: "Route",
    title: "Use specialists for specialist work",
    desc: "Analysis, transcription, visual generation, lip sync, storage, and delivery use purpose-fit services.",
    proof: "Quality where it matters most",
  },
  {
    icon: Shield,
    step: "Deliver",
    title: "Master once, export cleanly",
    desc: "Normalize scenes to a 1080p/30 master, preserve sync, and upscale only when the destination needs it.",
    proof: "No unnecessary premium processing",
  },
];

const TRUST_ITEMS = [
  "Free promotional access",
  "Provider usage measured",
  "No payment required",
  "1080p native master",
  "POPIA-conscious",
];

export default function Index() {
  const { user } = useAuth();

  const primeStartFree = () => {
    try { sessionStorage.setItem("postLoginRedirect", "/project/new"); } catch { /* noop */ }
  };


  return (
    <Layout>
      <SeoHead
        title="Resonance Media Sync — Direct Your AI Music Video Before You Render"
        description="Turn one track into a verified, timed music-video treatment with consistent characters, scene previews, vocal sync, and master-ready exports."
        path="/"
        preload={[
          // Only the hero mark is above the fold; everything else loads on scroll.
          { href: logoIcon, as: "image", type: "image/webp", fetchPriority: "high" },
        ]}
      />

      <title>Resonance Media Sync — Direct Your AI Music Video Before You Render</title>
      <meta name="description" content="Verify the song, direct every scene, approve provider usage, and export a consistent music-video master without wasting generation spend." />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[150px]" />
        <div className="absolute top-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-accent/10 blur-[120px]" />

        <div className="container relative flex flex-col items-center py-24 text-center lg:py-32">
          {/* Eyebrow chip */}
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 px-4 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-xl"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
              <span className="relative h-2 w-2 rounded-full bg-accent" />
            </span>
            Resonance governed · Cinematic direction · delivery
          </div>

          {/* Logo + wordmark */}
          <div
            className="mb-6 flex items-center gap-3"
          >
            <img src={logoIcon} alt="Resonance Media Sync" width={64} height={64} decoding="async" className="h-14 w-14 rounded-2xl shadow-[0_0_40px_-5px_hsl(325_90%_65%/0.7)] sm:h-16 sm:w-16" />
            <span className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              <span className="gradient-text">Resonance Media Sync</span>
              <span className="ml-2 text-xs sm:text-sm font-mono uppercase tracking-[0.22em] text-muted-foreground">
                by The Resonance
              </span>
            </span>
          </div>

          {/* Headline */}
          <h1
            className="max-w-4xl text-4xl font-bold leading-[0.98] tracking-tight sm:text-5xl lg:text-7xl"
          >
            Direct the whole video
            {" "}<span className="gradient-text font-serif italic font-normal">before</span>{" "}
            the final render.
          </h1>

          {/* Tri-color claim */}
          <div
            className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.25em]"
          >
            <span style={{ color: "hsl(265 85% 70%)" }}>Verify</span>
            <span className="text-muted-foreground mx-2">→</span>
            <span style={{ color: "hsl(295 90% 65%)" }}>Preview</span>
            <span className="text-muted-foreground mx-2">→</span>
            <span style={{ color: "hsl(325 90% 70%)" }}>Approve</span>
            <span className="text-muted-foreground mx-2">→</span>
            <span style={{ color: "hsl(190 90% 60%)" }}>Master</span>
          </div>

          {/* App-specific description */}
          <p
            className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed"
          >
            Turn one track into a timed visual treatment with verified lyrics, consistent
            characters, scene-level direction, vocal sync, and a delivery-ready master.
          </p>


          {/* CTAs — Start Free (primary) + Explore Tools (secondary → ecosystem) */}
          <div
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              to={user ? "/project/new" : "/login"}
              onClick={user ? undefined : primeStartFree}
            >
              <Button
                size="lg"
                className="gap-2 rounded-full text-white border-0 px-8 shadow-[0_0_40px_-5px_hsl(295_90%_60%/0.8)] hover:opacity-95"
                style={{ background: "var(--gradient-brand)" }}
              >
                {user ? <Sparkles className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                {user ? "Create a new treatment" : "Build my first treatment"}
              </Button>
            </Link>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="gap-2 rounded-full border-white/15 px-8 hover:bg-white/5"
            >
              <a href="#quality-economics">
                See how quality stays controlled <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>

          {/* Trust strip */}
          <div
            className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground"
          >
            {TRUST_ITEMS.map((t, i) => (
              <span key={t} className="flex items-center gap-5">
                <span>{t}</span>
                {i < TRUST_ITEMS.length - 1 && <span className="opacity-40">·</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Compact product-surface preview — sits in the first viewport on desktop */}
      <div id="workflow" className="scroll-mt-20">
        <LazySection minHeight={360} rootMargin="400px 0px" label="Loading workflow preview">
          <WorkflowPreviewStrip />
        </LazySection>
      </div>

      <section id="quality-economics" className="scroll-mt-20 border-y border-white/5 bg-secondary/20">
        <div className="container py-16 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Quality economics
              </div>
              <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-5xl">
                Quality rises when <span className="gradient-text">waste falls.</span>
              </h2>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-card/60 p-5 text-sm leading-relaxed text-muted-foreground backdrop-blur-xl">
              Resonance Media Sync separates creative decisions from provider execution. You can correct the
              transcript, timing, character, and shot plan first. Provider estimates remain visible
              for the promotion costing study, every provider batch requires approval, and failed
              video jobs wait for you instead of retrying themselves.
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {qualityPrinciples.map((item) => (
              <article key={item.step} className="group rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-xl transition-colors hover:border-primary/30">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{item.step}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                <div className="mt-5 border-t border-white/10 pt-3 text-xs font-medium text-accent">{item.proof}</div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 rounded-xl border border-white/10 bg-background/40 px-5 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Sovereign local analysis and creative direction</span>
            <span className="inline-flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /> Local visual generation adapters; external providers denied by default</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Local transcription adapter required for track analysis</span>
            <span className="inline-flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-primary" /> Free promotional access · no payment required</span>
          </div>
        </div>
      </section>

      {/* Real storyboard gallery */}
      <LazySection minHeight={720} label="Loading storyboard gallery">
        <StoryboardGallery />
      </LazySection>

      {/* Interactive product preview — clickable end-to-end flow demo */}
      <LazySection minHeight={640} label="Loading product preview">
        <InteractiveProductPreview />
      </LazySection>

      {/* Promotion access — dedicated free-access comparison */}
      <LazySection minHeight={900} label="Loading promotion access">
        <PricingSection />
      </LazySection>


      {/* CTA */}
      <section className="border-t border-white/5">
        <div className="container py-20 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Ready to direct with intent?</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Start with the treatment. Approve the vision. Finish the scenes worth mastering.
          </p>
          <Link to={user ? "/project/new" : "/login"} onClick={user ? undefined : primeStartFree}>
            <Button
              size="lg"
              className="mt-8 gap-2 rounded-full text-white border-0 px-8 shadow-[0_0_40px_-5px_hsl(295_90%_60%/0.8)] hover:opacity-95"
              style={{ background: "var(--gradient-brand)" }}
            >
              {user ? "Create a new treatment" : "Build my first treatment"} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
