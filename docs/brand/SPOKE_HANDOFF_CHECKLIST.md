# Spoke Handoff Checklist — Point Checkout at The Resonance Hub

Use this checklist in every spoke project (ePublisher, Sync Vision, YouTube
Optimizer, Career Compass, Podcast) to swap local billing for the Hub at
**https://reson8.life** and verify entitlement wiring end-to-end.

Replace `<APP_KEY>` with one of:
`epublisher` · `creative_studio` · `sync_vision` · `youtube_optimizer` ·
`career_compass` · `podcast`

---

## 0. Prerequisites

- [ ] Spoke uses the **same shared Supabase project** as the Hub
      (`VITE_SUPABASE_URL` matches reson8.life).
- [ ] Spoke is on **Lovable Cloud** (no custom Supabase keys).
- [ ] You have the canonical SKU for this spoke from
      `docs/brand/README.md` § SKU catalog.

---

## 1. Remove local billing

- [ ] Delete any local **Pricing** page that posts to PayFast directly.
- [ ] Delete any local **PayFast ITN** edge function / webhook route.
- [ ] Remove `PAYFAST_*` secrets from the spoke's secret store.
- [ ] Drop any local `subscriptions` / `plans` / `payments` tables
      (the Hub is the single source of truth).
- [ ] Search for and remove every legacy upgrade URL pattern:
      `payfast.co.za`, `process.payfast`, `/api/payfast`, `/checkout/payfast`.

> Verify with: `node scripts/pricing-check.mjs` (in this repo) or
> `rg -n "payfast" src supabase` in the spoke.

---

## 2. Add the Hub entitlement client

Copy these two files from Creative Studio verbatim, then change `APP_KEY`:

- [ ] `src/lib/entitlement.ts` → set `APP_KEY = "<APP_KEY>"`.
- [ ] `src/components/brand/CheckoutButton.tsx` (unchanged).
- [ ] `src/components/brand/PaywallGate.tsx` → default `app="<APP_KEY>"`.

Confirm the file exports:

- `useEntitlement(app)` → `{ entitlement, isLoading, error }`
- `tierMeets(have, need)`
- `checkoutUrl(skuOrPlan, returnTo?)` building
  `https://reson8.life/checkout?sku=…&return_to=…`

---

## 3. Replace every upgrade CTA

- [ ] Replace all "Upgrade / Subscribe / Go Pro" buttons with
      `<CheckoutButton sku="<APP_KEY>:<plan>:monthly">Upgrade →</CheckoutButton>`.
- [ ] PayG / top-up CTAs use `sku="<APP_KEY>:bundle:<id>"`.
- [ ] No raw `<a href="https://reson8.life/checkout…">` — always go through
      `checkoutUrl()` so the `return_to` is captured automatically.

> Verify with: `rg -n "Subscribe|Upgrade|Go Pro" src` — every match should
> resolve to `<CheckoutButton />`.

---

## 4. Gate premium features

- [ ] Wrap each premium block in
      `<PaywallGate app="<APP_KEY>" minTier="creator" upgradeSku="<APP_KEY>:creator:monthly">`.
- [ ] Free-tier UI renders without auth; gated UI requires a Hub-issued tier.
- [ ] Confirm `tierMeets()` ordering matches the spoke's ladder
      (free → starter → creator → pro → business → all_access).

---

## 5. Single sign-on sanity check

- [ ] Sign in on **reson8.life** in one tab.
- [ ] Open the spoke in another tab → `supabase.auth.getSession()` returns
      the same `user.id`.
- [ ] Sign out on the Hub → spoke session clears on next request.

---

## 6. Verify the entitlement API end-to-end

Run this from the browser console while signed in on the spoke:

```js
const { data: { session } } = await window.supabase.auth.getSession();
const r = await fetch(
  `https://reson8.life/api/public/entitlement?app=<APP_KEY>`,
  { headers: { Authorization: `Bearer ${session.access_token}` } },
);
console.log(r.status, await r.json());
```

Expected responses:

| User state                        | Status | Body                                                         |
|-----------------------------------|--------|--------------------------------------------------------------|
| Signed out                        | 401    | `{ error: "unauthorized" }`                                  |
| Signed in, no subscription        | 200    | `{ tier: "free", status: "inactive", hasAccess: false }`     |
| Signed in, paid `<APP_KEY>` plan  | 200    | `{ tier: "creator", status: "active", hasAccess: true, source: "direct" }` |
| Signed in, All-Access bundle      | 200    | `{ tier: "all_access", status: "active", hasAccess: true, source: "bundle" }` |

- [ ] All four cases observed.

---

## 7. Verify the checkout round-trip

- [ ] Click `<CheckoutButton sku="<APP_KEY>:starter:monthly">` in the spoke.
- [ ] Confirm URL is
      `https://reson8.life/checkout?sku=<APP_KEY>%3Astarter%3Amonthly&return_to=<spoke-url>`.
- [ ] Complete a **sandbox** PayFast payment on the Hub.
- [ ] Hub redirects back to the spoke's `return_to`.
- [ ] `useEntitlement("<APP_KEY>")` now returns `hasAccess: true` within 60s
      (the hook's `staleTime`) — refresh if needed.
- [ ] Cancel on the Hub → entitlement flips to `status: "cancelled"` at
      `current_period_end`.

---

## 8. Visual + footer alignment

- [ ] Paste `docs/brand/tokens.css` into `src/styles.css` (top).
- [ ] Apply the spoke's per-app accent from `docs/brand/LOVABLE_PROMPT.md`.
- [ ] Add `<ResonanceFooter currentApp="<AppName>" />` to the root layout —
      it must include the **"Part of The Resonance ↗"** back-link to
      `https://reson8.life`.

---

## 9. Ship-readiness gate

- [ ] `node scripts/pricing-check.mjs` exits 0 (no stale R149/R299/R699).
- [ ] `node scripts/pricing-preview.mjs` shows no pending canonical fixes.
- [ ] No `payfast` references in source: `rg -n "payfast" src supabase` is empty.
- [ ] Every gated route renders correctly for free / paid / all-access users.
- [ ] Footer link to reson8.life present on every page.

When every box is ticked, the spoke is fully delegated to the Hub and safe
to publish.
