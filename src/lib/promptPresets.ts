// Curated AI prompt presets for each content type. Users click a chip to drop
// a battle-tested instruction template into the AI Instructions box, then tweak.
// Optimized: each preset is structured (hero / headline / sub / CTA / layout)
// so the downstream model gets unambiguous, render-ready direction.
// Voice: conscious, calm, confident. Market: South Africa (ZAR-first, POPIA-aware).

export interface PromptPreset {
  id: string;
  label: string;
  /** Short one-liner shown under the label (optional). */
  hint?: string;
  /** The actual instruction text inserted into the textarea. */
  prompt: string;
}

export interface AutoHintSource {
  sourceUrl?: string;
  brandName?: string;
  pageTitle?: string;
  heroHeadline?: string;
  offer?: string;
  products?: string[];
  services?: string[];
  audience?: string;
  benefits?: string[];
  pricing?: string;
  callsToAction?: string[];
}

// Shared rules appended to every preset. Keeps the model honest about source
// fidelity, typography, and the SA market without bloating each chip.
const RULES = [
  "Hero: the uploaded source product/image is the central, unmistakable subject â€” never duplicate, distort, or replace it.",
  "Typography: one display headline (â‰¤7 words), one supporting line (â‰¤14 words), real legible words only â€” no lorem, no gibberish, no fake logos.",
  "Layout: clear focal hierarchy, generous whitespace, brand colours from the source, no clutter, no stock-photo collage feel.",
  "Voice: conscious, calm, confident â€” no hype words ('amazing', 'revolutionary', 'game-changer').",
  "Market: South Africa â€” ZAR-first pricing, POPIA-aware, inclusive imagery.",
].join(" ");

const tail = (extra?: string) => (extra ? `${extra} ${RULES}` : RULES);

export const PROMPT_PRESETS: Record<string, PromptPreset[]> = {
  poster: [
    {
      id: "launch-announce",
      label: "Launch announcement",
      hint: "New product / service drop",
      prompt: tail(
        "Goal: announce a new launch. Headline = product name or single decisive promise. Sub = one-line benefit. CTA = 'Shop now' or 'Book a demo' as a solid button. Composition: product as oversized hero, off-centre, soft directional light, brand-colour accent shape behind it.",
      ),
    },
    {
      id: "promo-sale",
      label: "Promo / sale",
      hint: "Limited-time offer, ZAR pricing",
      prompt: tail(
        "Goal: limited-time offer. Display ZAR price or % discount as a bold badge (circle or angled tag) â€” readable from 3 metres. Headline names the deal in plain language ('20% off the Winter range'). Sub states what's included and the end date. CTA: 'Shop the sale'. Keep brand identity intact; no shouty starbursts.",
      ),
    },
    {
      id: "event",
      label: "Event invite",
      hint: "Date Â· venue Â· CTA",
      prompt: tail(
        "Goal: event invite. Headline = event name in display type. Sub = one-sentence promise of the experience. Info stack (small caps, tight leading): date Â· time Â· venue Â· RSVP link. Atmospheric hero imagery behind a darkened gradient for legibility.",
      ),
    },
    {
      id: "thought-leadership",
      label: "Thought leadership",
      hint: "Quote / insight card",
      prompt: tail(
        "Goal: editorial insight card. One quote or single sentence in refined display serif, large, centre-set. Attribution line beneath in small caps. Brand mark tucked in a corner. No CTA, no buttons â€” let the idea breathe. Background: single tone or subtle gradient, no imagery competing.",
      ),
    },
  ],
  brochure: [
    {
      id: "service-overview",
      label: "Service overview",
      hint: "Tri-fold, services + contact",
      prompt: tail(
        "Goal: tri-fold service brochure. Left panel: 3â€“5 service bullets with simple line icons + one-line descriptions. Centre: cover hero â€” product/brand photo + value proposition headline. Right: contact block (phone, email, web, socials) + soft CTA. Magazine-grade grid, consistent margins across panels.",
      ),
    },
    {
      id: "product-catalogue",
      label: "Product catalogue",
      hint: "Featured items + pricing",
      prompt: tail(
        "Goal: tri-fold catalogue. 3â€“6 featured products in a consistent grid: clean white frame, product name, one-line spec, ZAR price. Centre panel is the cover with hero shot + collection name. No mixed photography styles.",
      ),
    },
    {
      id: "company-profile",
      label: "Company profile",
      hint: "Story Â· team Â· proof",
      prompt: tail(
        "Goal: company-profile brochure. Left: founding story in two short paragraphs, pull-quote callout. Centre: mission statement set large with hero image. Right: credibility stack (client logos, awards, one short testimonial) + contact. Editorial typography, restrained colour.",
      ),
    },
  ],
  ad: [
    {
      id: "performance-ad",
      label: "Performance ad",
      hint: "Single benefit + hard CTA",
      prompt: tail(
        "Goal: performance ad for paid social. One sharp benefit headline (â‰¤6 words), one supporting line, one solid CTA button. Product as hero, brand colours, no decorative clutter. Thumb-stopping at 1:1 or 4:5.",
      ),
    },
    {
      id: "retargeting",
      label: "Retargeting",
      hint: "Reminder + incentive",
      prompt: tail(
        "Goal: retargeting ad for warm audiences. Headline acknowledges they've seen us ('Still thinking it over?'). Sub surfaces a small incentive (free shipping, R59 off, 10% off in ZAR). CTA: 'Pick up where you left off'. Calm tone, zero pressure, zero countdown timers.",
      ),
    },
    {
      id: "ugc-style",
      label: "UGC style",
      hint: "Authentic, lo-fi feel",
      prompt: tail(
        "Goal: UGC-style ad. Feels handheld, slightly imperfect, but on-brand. Caption-style headline in a sans system font, product clearly visible in a real-life context, light brand framing only. CTA as a soft sticker, not a hard button.",
      ),
    },
  ],
  video: [
    {
      id: "10s-hero-reveal",
      label: "10s hero reveal",
      hint: "Cinematic product showcase",
      prompt: tail(
        "Goal: 10-second cinematic clip. Shot 1 (0â€“4s): slow push-in on the product with soft rim light. Shot 2 (4â€“8s): subtle parallax detail â€” texture, label, or motion of liquid/fabric. Shot 3 (8â€“10s): clean end card with logo + tagline. Calm, premium pacing â€” no jump cuts, no zooms, no flashes.",
      ),
    },
    {
      id: "story-vertical",
      label: "Story / Reel (9:16)",
      hint: "Hook in 1s, CTA at end",
      prompt: tail(
        "Goal: 9:16 vertical for Stories/Reels. 0â€“1s: visual hook (motion or surprise frame) â€” no text yet. 1â€“7s: product in use with one overlay line stating the key benefit. 7â€“10s: CTA card with logo and action. Captions burnt-in for sound-off viewing.",
      ),
    },
    {
      id: "before-after",
      label: "Before / after",
      hint: "Transformation reveal",
      prompt: tail(
        "Goal: honest before/after transformation. Open on 'before' state (3s) with label. Smooth wipe or morph to 'after' (4s) with label. Close on logo + CTA (3s). No exaggeration, no fake-looking compositing â€” both states must read as the same scene.",
      ),
    },
  ],
  social: [
    {
      id: "carousel-edu",
      label: "Carousel (educational)",
      hint: "5â€“7 slides, one idea each",
      prompt: tail(
        "Goal: educational carousel, 5â€“7 slides. Slide 1 = hook question. Slides 2â€“6 = one insight each (big headline + one supporting line). Final slide = CTA + handle. Consistent grid, type scale, and brand colour across every slide; slide numbers in a corner.",
      ),
    },
    {
      id: "single-post",
      label: "Single post",
      hint: "One image, one message",
      prompt: tail(
        "Goal: single 1:1 post. One clear message, product or brand mark as hero, headline â‰¤8 words, optional one-line sub. Designed to stop the scroll through composition, not noise.",
      ),
    },
    {
      id: "quote-card",
      label: "Quote card",
      hint: "Insight + attribution",
      prompt: tail(
        "Goal: quote card. Centred display-serif quote in large type, attribution line in small caps below, brand mark in a corner. Background: single tone or quiet gradient. No CTA, no extra decoration.",
      ),
    },
  ],
};

export const getPresetsForType = (contentType: string): PromptPreset[] => {
  const key = contentType?.toLowerCase?.() ?? "";
  return PROMPT_PRESETS[key] ?? PROMPT_PRESETS.poster;
};

export const buildAutoHintPrompt = (
  source: AutoHintSource | null | undefined,
  contentType: string,
  style: string,
): string => {
  const host = source?.sourceUrl
    ? (() => {
        try {
          return new URL(source.sourceUrl!).hostname.replace(/^www\./, "");
        } catch {
          return source.sourceUrl!;
        }
      })()
    : "the source URL";
  const brand = source?.brandName || host || "[brand name]";
  const product =
    source?.products?.[0] ||
    source?.services?.[0] ||
    source?.heroHeadline ||
    source?.pageTitle ||
    "[product / offer]";
  const benefitList = source?.benefits?.slice(0, 3).filter(Boolean) ?? [];
  const benefits = benefitList.length
    ? benefitList.map((b, i) => `${i + 1}. ${b}`).join("  ")
    : "1. [benefit]  2. [benefit]  3. [benefit]";
  const cta = source?.callsToAction?.[0] || "Learn more";
  const pricing = source?.pricing ? `\nPrice / offer: ${source.pricing}` : "";
  const audience =
    source?.audience || "South African customers who value quality and trust";

  return [
    `Auto-hint from ${host}. Create a ${style} ${contentType} for ${brand}.`,
    `Product / offer: ${product}.${pricing}`,
    `Audience: ${audience}.`,
    `Key benefits â€” pick the strongest as the headline angle:  ${benefits}`,
    `CTA: ${cta}.`,
    `If extracted source is thin, infer conservatively from this brief â€” never invent prices, claims, or testimonials.`,
    RULES,
  ].join("\n");
};
