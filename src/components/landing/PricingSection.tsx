import { motion } from "framer-motion";

import { Check, Minus, Sparkles, ArrowUpRight, Zap, Crown, Rocket, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUB_URL, hubCheckoutUrl } from "@/lib/entitlement";

type TierId = "trial" | "single" | "creator" | "studio";

type Tier = {
  id: TierId;
  name: string;
  icon: typeof Zap;
  tagline: string;
  price: number | null; // ZAR one-off; 0 = free
  perVideo?: string;
  hue: number;
  highlight?: boolean;
  ribbon?: string;
  features: string[];
  cta: { label: string; kind: "primary" | "outline"; href: string };
};

// One-off pricing. Rough anchors: Single ~R349, Creator (5-pack) ~R1,299 (R260/video, 26% off),
// Studio (20-pack) ~R3,999 (R200/video, 43% off). All credits never expire.
const TIERS: Tier[] = [
  {
    id: "trial",
    name: "Free Trial",
    icon: Zap,
    tagline: "Plan first. No card.",
    price: 0,
    hue: 200,
    features: [
      "1 guided project · up to 60 sec",
      "Storyboard + draft scene previews",
      "Watermarked export",
      "No paid retries without approval",
    ],
    cta: { label: "Start Free", kind: "outline", href: "/login" },
  },
  {
    id: "single",
    name: "Single Track",
    icon: Rocket,
    tagline: "Finish one release.",
    price: 349,
    perVideo: "R349 / video",
    hue: 265,
    features: [
      "1 finished music video",
      "Tracks up to 4 min",
      "1080p HD render",
      "Karaoke VTT + storyboard PDF",
      "Credits never expire",
    ],
    cta: { label: "Buy Single", kind: "outline", href: hubCheckoutUrl("sync_vision:pack_single") },
  },
  {
    id: "creator",
    name: "Creator Pack",
    icon: Crown,
    tagline: "A five-release runway.",
    price: 1299,
    perVideo: "R260 / video",
    hue: 325,
    highlight: true,
    ribbon: "Best for releases",
    features: [
      "5 finished music videos",
      "Tracks up to 8 min",
      "1080p HD + priority queue",
      "Character consistency lock",
      "Vocal-sync & lipsync clips",
      "Credits never expire",
    ],
    cta: { label: "Buy Creator Pack", kind: "primary", href: hubCheckoutUrl("sync_vision:pack_creator") },
  },
  {
    id: "studio",
    name: "Studio Pack",
    icon: Layers,
    tagline: "A campaign-ready library.",
    price: 3999,
    perVideo: "R200 / video",
    hue: 295,
    features: [
      "20 finished music videos",
      "Tracks up to 15 min",
      "4K render + top-priority queue",
      "Shared asset library",
      "Priority email support",
      "Credits never expire",
    ],
    cta: { label: "Buy Studio Pack", kind: "outline", href: hubCheckoutUrl("sync_vision:pack_studio") },
  },
];

type Row = { label: string; values: Record<TierId, string | boolean> };

const COMPARISON: { group: string; rows: Row[] }[] = [
  {
    group: "What you get",
    rows: [
      { label: "Finished videos included", values: { trial: "1 draft", single: "1", creator: "5", studio: "20" } },
      { label: "Max track length",         values: { trial: "60 sec",  single: "4 min", creator: "8 min", studio: "15 min" } },
      { label: "Scenes per project",       values: { trial: "6",       single: "24",    creator: "64",    studio: "96" } },
      { label: "Concurrent renders",       values: { trial: "1",       single: "2",     creator: "5",     studio: "5" } },
    ],
  },
  {
    group: "Output quality",
    rows: [
      { label: "Storyboard PDF",         values: { trial: true,       single: true,    creator: true,   studio: true } },
      { label: "Scene video resolution", values: { trial: "480p draft", single: "1080p HD", creator: "1080p HD", studio: "4K" } },
      { label: "Vocal-sync / lipsync",   values: { trial: false,      single: false,   creator: true,   studio: true } },
      { label: "Karaoke VTT captions",   values: { trial: false,      single: true,    creator: true,   studio: true } },
      { label: "Watermark on exports",   values: { trial: true,       single: false,   creator: false,  studio: false } },
    ],
  },
  {
    group: "Ownership & support",
    rows: [
      { label: "Credits expire",         values: { trial: "—",        single: false,   creator: false,  studio: false } },
      { label: "Shared asset library",   values: { trial: false,      single: false,   creator: true,   studio: true } },
      { label: "Support",                values: { trial: "Community", single: "Email", creator: "Priority", studio: "Priority" } },
      { label: "Invoice / PO billing",   values: { trial: false,      single: false,   creator: false,  studio: true } },
    ],
  },
];

const fmtZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="border-t border-white/5 bg-secondary/30">
      <div className="container py-14 sm:py-20">
        {/* Header */}
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-xl">
            <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" /> One-off packs · ZAR · Credits never expire
          </p>
          <h2 id="pricing-heading" className="mt-6 text-3xl font-bold sm:text-4xl">
            Choose the runway. <span className="gradient-text">Keep the control.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Start with free planning. When the direction is ready, choose a one-off pack—no recurring
            charge and no cancellation trap. Every paid provider batch asks for approval before it starts.
          </p>
        </div>


        {/* Tier cards */}
        <ul className="mt-12 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label="Available packs">
          {TIERS.map((t, i) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              aria-labelledby={`tier-${t.id}-name`}
              className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-xl ${
                t.highlight ? "border-primary/40 bg-card/80" : "border-white/10 bg-card/50"
              }`}
              style={
                t.highlight
                  ? { boxShadow: `0 0 60px -20px hsl(${t.hue} 90% 60% / 0.6)` }
                  : undefined
              }
            >
              {t.ribbon && (
                <p
                  className="absolute -top-3 left-6 rounded-full px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-white"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  {t.ribbon}
                </p>
              )}

              <div className="flex items-center gap-2">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: `hsl(${t.hue} 90% 60% / 0.15)`, color: `hsl(${t.hue} 90% 75%)` }}
                  aria-hidden="true"
                >
                  <t.icon className="h-4 w-4" />
                </span>
                <h3 id={`tier-${t.id}-name`} className="text-lg font-bold">
                  {t.name}
                </h3>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t.tagline}</p>

              <p className="mt-5 flex items-baseline gap-1">
                {t.price === 0 ? (
                  <span className="text-3xl font-bold">Free</span>
                ) : t.price == null ? (
                  <span className="text-3xl font-bold">Custom</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold">{fmtZAR(t.price)}</span>
                    <span className="text-xs text-muted-foreground">one-off</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                {t.price === 0 ? "No card required" : t.perVideo ?? "Single payment"}
              </p>

              <ul className="mt-5 space-y-2" aria-label={`${t.name} pack features`}>
                {t.features.map((f) => (
                  <li key={`${t.id}-${f}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {t.cta.href.startsWith("http") ? (
                  <Button
                    asChild
                    className={`w-full gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      t.cta.kind === "primary"
                        ? "text-white border-0 shadow-[0_0_30px_-5px_hsl(295_90%_60%/0.7)]"
                        : "border border-white/15 bg-transparent text-foreground hover:bg-white/5"
                    }`}
                    style={t.cta.kind === "primary" ? { background: "var(--gradient-brand)" } : undefined}
                  >
                    <a
                      href={t.cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t.cta.label} — ${t.name} pack (opens in a new tab)`}
                    >
                      {t.cta.label} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                ) : (
                  <Button
                    asChild
                    className={`w-full gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      t.cta.kind === "primary"
                        ? "text-white border-0 shadow-[0_0_30px_-5px_hsl(295_90%_60%/0.7)]"
                        : "border border-white/15 bg-transparent text-foreground hover:bg-white/5"
                    }`}
                    style={t.cta.kind === "primary" ? { background: "var(--gradient-brand)" } : undefined}
                  >
                    <a
                      href={t.cta.href}
                      aria-label={`${t.cta.label} — ${t.name} pack`}
                      onClick={() => {
                        try { sessionStorage.setItem("postLoginRedirect", "/project/new"); } catch { /* noop */ }
                      }}
                    >
                      {t.cta.label}
                    </a>
                  </Button>
                )}
              </div>
            </motion.li>
          ))}
        </ul>


        {/* Top-up callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-xl md:flex-row md:items-center"
          style={{ boxShadow: "0 0 60px -20px hsl(295 90% 60% / 0.35)" }}
        >
          <div className="flex items-start gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--gradient-brand)" }}
              aria-hidden="true"
            >
              <Layers className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Need more?
              </p>
              <h3 className="text-lg font-bold">Top up any time — from {fmtZAR(349)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Buy another pack whenever you run out. No subscription, no lock-in, credits never expire.
              </p>
            </div>
          </div>
          <Button
            asChild
            className="w-full justify-center gap-2 rounded-full border-0 px-6 text-white shadow-[0_0_30px_-5px_hsl(295_90%_60%/0.7)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:w-auto"
            style={{ background: "var(--gradient-brand)" }}
          >
            <a
              href={`${HUB_URL}/pricing`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="See all packs on the Resonance Hub (opens in a new tab)"
            >
              See all packs <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>

          </Button>
        </motion.div>

        {/* Comparison table */}
        <div className="mt-14">
          <div className="mb-6 text-center">
            <h3 id="pricing-comparison-heading" className="text-2xl font-bold">Compare packs &amp; features</h3>
            <p className="mt-1 text-sm text-muted-foreground">Everything each pack includes, side by side.</p>
            <p id="pricing-comparison-hint" className="mt-2 text-[11px] text-muted-foreground">
              <span className="md:hidden">Swipe the table sideways to see every pack. </span>
              <span className="sr-only">
                Scrollable table region. Focus it and use the arrow keys to scroll horizontally through all four packs.
              </span>
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl">
            <div
              className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              tabIndex={0}
              role="region"
              aria-labelledby="pricing-comparison-heading"
              aria-describedby="pricing-comparison-hint"
            >
              <table className="w-full min-w-[600px] text-left text-sm sm:min-w-[720px]">
                <caption className="sr-only">
                  Feature comparison of all Sync Vision one-off packs. Rows are features, columns are packs.
                </caption>
                <thead>
                  <tr className="border-b border-white/10 bg-background/40">
                    <th id="pricing-col-feature" scope="col" className="sticky left-0 z-20 w-[38%] min-w-[140px] bg-card px-3 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:w-auto sm:px-5">
                      Feature
                    </th>
                    {TIERS.map((t) => (
                      <th
                        key={t.id}
                        id={`pricing-col-${t.id}`}
                        scope="col"
                        className={`px-3 py-4 text-center font-semibold sm:px-5 ${
                          t.highlight ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <span className="flex flex-col items-center gap-0.5">
                          <span className="text-xs sm:text-sm">{t.name}</span>
                          <span className="font-mono text-[9px] font-normal uppercase tracking-[0.16em] text-muted-foreground sm:text-[10px] sm:tracking-[0.2em]">
                            {t.price === 0 ? "Free" : `${fmtZAR(t.price!)} one-off`}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {COMPARISON.map((group, gi) => {
                  const groupId = `pricing-group-${gi}`;
                  return (
                    <tbody key={`group-${group.group}`}>
                      <tr className="bg-background/20">
                        <th
                          id={groupId}
                          scope="colgroup"
                          colSpan={TIERS.length + 1}
                          className="sticky left-0 z-10 px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:px-5"
                        >
                          {group.group}
                        </th>
                      </tr>
                      {group.rows.map((row, ri) => {
                        const rowId = `${groupId}-row-${ri}`;
                        return (
                          <tr key={`${group.group}-${row.label}`} className="border-t border-white/5">
                            <th
                              id={rowId}
                              scope="row"
                              headers={`pricing-col-feature ${groupId}`}
                              className="sticky left-0 z-10 w-[38%] min-w-[140px] bg-card px-3 py-3 text-left text-xs font-normal text-foreground/90 sm:w-auto sm:px-5 sm:text-sm"
                            >
                              {row.label}
                            </th>
                            {TIERS.map((t) => {
                              const v = row.values[t.id];
                              return (
                                <td
                                  key={t.id}
                                  headers={`pricing-col-${t.id} ${rowId} ${groupId}`}
                                  className={`px-3 py-3 text-center text-xs sm:px-5 sm:text-sm ${t.highlight ? "bg-primary/[0.04]" : ""}`}
                                >
                                  {typeof v === "boolean" ? (
                                    <>
                                      {v ? (
                                        <Check className="mx-auto h-4 w-4 text-primary" aria-hidden="true" />
                                      ) : (
                                        <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
                                      )}
                                      <span className="sr-only">{v ? "Included" : "Not included"}</span>
                                    </>
                                  ) : (
                                    <span className={t.highlight ? "text-foreground font-medium" : "text-muted-foreground"}>{v}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>

            </div>
          </div>
        </div>

        {/* Upgrade path */}
        <ol className="mt-14 grid list-none gap-4 p-0 md:grid-cols-3" aria-label="How to upgrade">
          {[
            {
              step: "01",
              title: "Start Free",
              body: "No card, no commitment. Ship a 60-second draft to see the whole pipeline end-to-end.",
            },
            {
              step: "02",
              title: "Buy a pack when you're ready",
              body: "Pick Single, Creator or Studio on the Resonance Hub. PayFast in ZAR, credits unlock in Sync Vision instantly.",
            },
            {
              step: "03",
              title: "Top up any time",
              body: "Credits never expire. When you need more videos, buy another pack — no subscription, no auto-renewal.",
            },
          ].map((s) => (
            <li key={s.step} className="rounded-2xl border border-white/10 bg-card/50 p-5 backdrop-blur-xl">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                Step {s.step}
              </p>
              <h4 className="mt-2 text-base font-semibold">{s.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>


        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Prices in South African Rand (ZAR), VAT inclusive where applicable. One-off purchases — no subscriptions,
          no auto-renewals. Billing handled securely by PayFast on the Resonance Hub.
        </p>
      </div>
    </section>
  );
}
