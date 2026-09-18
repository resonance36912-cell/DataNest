📋 Paste into Creative Studio chat:

> Apply the Resonance pricing audit (2026-05-28). In `src/pages/Pricing.tsx`, replace the `TIERS` array with:
>
> ```tsx
> const TIERS = [
>   { id: "free", name: "Free", price: "R0", period: "forever", credits: 15 },
>   { id: "starter", name: "Starter", price: "R39", period: "/month", credits: 80 },
>   { id: "creator", name: "Creator", price: "R119", period: "/month", credits: 300 },
>   { id: "pro", name: "Pro", price: "R349", period: "/month", credits: 900 },
>   { id: "business", name: "Business", price: "R899", period: "/month", credits: 2500 },
> ];
> ```
>
> Each paid tier's CTA links to the Hub:
> ```tsx
> href={`https://reson8.life/checkout?sku=creative_studio:${tier.id}:monthly&return_to=${encodeURIComponent(window.location.origin + "/studio")}`}
> ```
>
> Keep the existing glass-card visuals, ZAR notice, and "Part of The Resonance ↗" footer.
> Margin floor: 70%. Reference SKU: `creative_studio:creator:monthly`.

---

📋 Paste into ePublisher chat:

> Apply the Resonance pricing audit (2026-05-28). In `src/pages/Pricing.tsx`, replace the `TIERS` array with:
>
> ```tsx
> const TIERS = [
>   { id: "free", name: "Free", price: "R0", period: "forever", credits: 10, desc: "Sample the platform — text + browser preview" },
>   { id: "starter", name: "Starter", price: "R49", period: "/month", credits: 60, desc: "Solo authors writing short books" },
>   { id: "author", name: "Author", price: "R149", period: "/month", credits: 220, desc: "Active authors — full EPUB + PDF + cover" },
>   { id: "studio", name: "Studio", price: "R399", period: "/month", credits: 700, desc: "Multi-book studios with audio narration" },
>   { id: "publisher", name: "Publisher", price: "R999", period: "/month", credits: 2000, desc: "Imprints, catalogs, SLAs" },
> ];
> ```
>
> Each paid tier's CTA links to the Hub:
> ```tsx
> href={`https://reson8.life/checkout?sku=epublisher:${tier.id}:monthly&return_to=${encodeURIComponent(window.location.origin + "/studio")}`}
> ```
>
> Keep the existing glass-card visuals, ZAR notice, and "Part of The Resonance ↗" footer.
> Margin floor: 65%. Reference SKU: `epublisher:creator:monthly`.

---

📋 Paste into SyncVision chat:

> Apply the Resonance pricing audit (2026-05-28). In `src/pages/Pricing.tsx`, replace the `TIERS` array with:
>
> ```tsx
> const TIERS = [
>   { id: "free", name: "Free", price: "R0", period: "forever", credits: 5, desc: "Try transcription on short clips" },
>   { id: "starter", name: "Starter", price: "R59", period: "/month", credits: 45, desc: "Podcasters and solo creators" },
>   { id: "creator", name: "Creator", price: "R169", period: "/month", credits: 180, desc: "Weekly video producers" },
>   { id: "studio", name: "Studio", price: "R449", period: "/month", credits: 600, desc: "Agencies and post-production teams" },
> ];
> ```
>
> Each paid tier's CTA links to the Hub:
> ```tsx
> href={`https://reson8.life/checkout?sku=syncvision:${tier.id}:monthly&return_to=${encodeURIComponent(window.location.origin + "/studio")}`}
> ```
>
> Keep the existing glass-card visuals, ZAR notice, and "Part of The Resonance ↗" footer.
> Margin floor: 65%. Reference SKU: `syncvision:creator:monthly`.

---

📋 Paste into YouTube Optimizer chat:

> Apply the Resonance pricing audit (2026-05-28). In `src/pages/Pricing.tsx`, replace the `TIERS` array with:
>
> ```tsx
> const TIERS = [
>   { id: "free", name: "Free", price: "R0", period: "forever", credits: 10, desc: "Audit a single video" },
>   { id: "creator", name: "Creator", price: "R79", period: "/month", credits: 100, desc: "Solo channels growing past 1k subs" },
>   { id: "pro", name: "Pro", price: "R219", period: "/month", credits: 350, desc: "Multi-channel creators and editors" },
>   { id: "agency", name: "Agency", price: "R599", period: "/month", credits: 1200, desc: "Networks, MCNs, bulk audits, SLAs" },
> ];
> ```
>
> Each paid tier's CTA links to the Hub:
> ```tsx
> href={`https://reson8.life/checkout?sku=youtube_optimizer:${tier.id}:monthly&return_to=${encodeURIComponent(window.location.origin + "/studio")}`}
> ```
>
> Keep the existing glass-card visuals, ZAR notice, and "Part of The Resonance ↗" footer.
> Margin floor: 70%. Reference SKU: `youtube_optimizer:creator:monthly`.
