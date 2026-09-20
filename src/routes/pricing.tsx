import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_META } from "@/lib/pricing-meta";
import {
  FREE_PROMOTION_CTA,
  FREE_PROMOTION_LABEL,
  FREE_PROMOTION_MESSAGE,
} from "@/lib/commercial-policy";
import resonanceLockup from "@/assets/resonance-lockup.png";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Free Promotion — The Resonance Hub" },
      {
        name: "description",
        content:
          "All Resonance apps are free during the current promotion while usage and delivery costs are measured. No payment is required.",
      },
      { property: "og:title", content: "Free Promotion — The Resonance Hub" },
      { property: "og:description", content: FREE_PROMOTION_MESSAGE },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="min-h-screen text-foreground selection:bg-[hsl(295_90%_60%/0.3)]">
      <nav className="fixed top-0 w-full z-50 px-6 py-4 flex justify-between items-center backdrop-blur-xl bg-background/60 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <img
            src={resonanceLockup}
            alt="The Resonance"
            className="h-6 sm:h-7 w-auto brightness-0 invert"
          />
        </Link>
        <Link
          to="/"
          className="text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2 rounded-full border border-white/15 hover:border-white/40 transition-colors"
        >
          ← Back to Hub
        </Link>
      </nav>

      <main className="pt-28 pb-24 px-6 max-w-7xl mx-auto">
        <section className="text-center mb-14 animate-reveal">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-200 border border-emerald-400/25 rounded-full px-4 py-1.5 mb-6 bg-emerald-400/5">
            <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
            {FREE_PROMOTION_LABEL} · no payment required
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[0.95] mb-6">
            Use the Resonance ecosystem{" "}
            <span className="font-serif italic font-normal text-white/80">
              free during promotion.
            </span>
          </h1>
          <p className="text-lg text-white/70 max-w-3xl mx-auto leading-relaxed">
            {FREE_PROMOTION_MESSAGE}
          </p>
          <p className="mt-4 text-sm text-white/55 max-w-2xl mx-auto leading-relaxed">
            Commercial catalogs are retained internally for costing analysis, but checkout is
            disabled and no new subscription or pack payment is required during this promotion.
          </p>
        </section>

        <section className="mb-20">
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(APP_META).map(([appKey, meta]) => (
              <article
                key={appKey}
                id={meta.anchor}
                className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-7 flex flex-col hover:border-white/25 transition-colors scroll-mt-24"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="size-3 rounded-full"
                    style={{
                      background: `hsl(${meta.accent})`,
                      boxShadow: `0 0 20px hsl(${meta.accent} / 0.8)`,
                    }}
                  />
                  <h2 className="text-2xl font-bold tracking-tight">{meta.name}</h2>
                </div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300 mb-3">
                  Free promotional access
                </div>
                <p className="text-sm text-white/65 mb-6 flex-1">
                  Sign in and use the available product capabilities during the costing-validation
                  promotion. Usage will help establish sustainable future pricing.
                </p>
                <a
                  href={meta.visit}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center px-5 py-3 rounded-full text-xs font-bold uppercase tracking-widest bg-gradient-brand text-white shadow-[0_0_25px_-8px_hsl(295_90%_60%/0.8)]"
                >
                  {FREE_PROMOTION_CTA} →
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 mb-16">
          <article className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300 mb-2">
              Free pilot
            </div>
            <h3 className="text-xl font-bold mb-2">Career Compass</h3>
            <p className="text-sm text-white/65 mb-4">
              The current pilot remains free while usage, support, and delivery costs are measured.
            </p>
            <a
              href="https://www.career-compass.org"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold uppercase tracking-widest border border-white/15 hover:border-white/40 px-4 py-2 rounded-full inline-block"
            >
              Join pilot →
            </a>
          </article>
          <article className="rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300 mb-2">
              Free
            </div>
            <h3 className="text-xl font-bold mb-2">The Resonance Podcast</h3>
            <p className="text-sm text-white/65 mb-4">
              Episodes, clips, and community content remain free.
            </p>
            <a
              href="https://www.resonance-podcast.com"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold uppercase tracking-widest border border-white/15 hover:border-white/40 px-4 py-2 rounded-full inline-block"
            >
              Listen / Watch →
            </a>
          </article>
        </section>

        <section className="text-center pt-10 border-t border-white/10">
          <p className="text-white/60 text-sm max-w-2xl mx-auto leading-relaxed">
            No new payments are collected during the current promotion. Future pricing will be
            published only after measured costs are reviewed and approved.
          </p>
        </section>
      </main>
    </div>
  );
}
