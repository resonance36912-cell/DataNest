import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { APP_META } from "@/lib/pricing-meta";
import {
  FREE_PROMOTION_CTA,
  FREE_PROMOTION_LABEL,
  FREE_PROMOTION_MESSAGE,
} from "@/lib/commercial-policy";
import resonanceLockup from "@/assets/resonance-lockup.png";

const SearchSchema = z.object({
  app: z.string().optional(),
  plan: z.string().optional(),
  sku: z.string().optional(),
  pack: z.string().optional(),
  cycle: z.literal("monthly").optional(),
  return_to: z.string().url().optional(),
});

type Search = z.infer<typeof SearchSchema>;

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Free Promotion — The Resonance Hub" },
      {
        name: "description",
        content:
          "Checkout is disabled while all Resonance apps are free during the current promotion.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): Search => SearchSchema.parse(raw),
  component: CheckoutPage,
});

function CheckoutPage() {
  const search = Route.useSearch();
  const requestedApp = search.app ? APP_META[search.app] : undefined;

  return (
    <div className="min-h-screen text-foreground">
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

      <main className="pt-28 pb-24 px-6 max-w-2xl mx-auto">
        <div className="rounded-3xl border border-emerald-400/25 bg-card/70 backdrop-blur-xl p-8 md:p-10">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-300 mb-3">
            {FREE_PROMOTION_LABEL} · checkout disabled
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-5">
            No payment is required right now.
          </h1>
          <p className="text-white/70 leading-relaxed mb-5">{FREE_PROMOTION_MESSAGE}</p>
          <p className="text-sm text-white/55 leading-relaxed mb-8">
            Existing commercial catalog data is being retained for costing analysis and future
            pricing design, but new PayFast launches are disabled during this promotional period.
          </p>

          {requestedApp ? (
            <a
              href={requestedApp.visit}
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gradient-brand text-white text-xs font-bold uppercase tracking-widest"
            >
              {FREE_PROMOTION_CTA} →
            </a>
          ) : (
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gradient-brand text-white text-xs font-bold uppercase tracking-widest"
            >
              View free apps →
            </Link>
          )}

          <div className="mt-6">
            <Link
              to="/pricing"
              className="text-xs text-white/60 hover:text-white underline underline-offset-4"
            >
              See promotional access details
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
