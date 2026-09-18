# Hub Payments Integration — Resonance

The **Hub** (reson8.life) owns billing for the entire Resonance ecosystem.
Spoke apps (ePublisher, Creative Studio, Sync Vision, YouTube Optimizer,
Career Compass) do **not** run their own PayFast integration. They delegate
checkout to the Hub and read entitlement back.

## Architecture

```
┌─────────────┐     1. "Subscribe"     ┌──────────────┐
│  Spoke App  │ ─────────────────────▶ │   The Hub    │
│ (e.g. ePub) │                        │ reson8.life  │
└─────────────┘                        └──────┬───────┘
       ▲                                      │
       │  4. entitlement check                │ 2. PayFast checkout
       │  (signed JWT or REST)                ▼
       │                              ┌──────────────┐
       │                              │   PayFast    │
       │                              └──────┬───────┘
       │                                     │ 3. ITN webhook
       │                              ┌──────▼───────┐
       └───────────────────── reads ──│ subscriptions│
                                      │   table      │
                                      └──────────────┘
```

## Contracts

### 1. Checkout handoff (spoke → hub)

Spoke app links the user to:

```
https://reson8.life/checkout?app=<APP_KEY>&plan=<PLAN>&return_to=<URL>
```

| Param      | Values                                                                     |
|------------|----------------------------------------------------------------------------|
| `app`      | `epublisher` · `creative_studio` · `sync_vision` · `youtube_optimizer` · `career_compass` · `all_access` |
| `plan`     | `starter` · `creator` · `pro` · `business` · `bundle`                      |
| `return_to`| Absolute URL the Hub redirects back to after PayFast success or cancel.    |

The Hub creates the PayFast subscription, listens for the ITN webhook, writes
to `subscriptions`, and redirects the user back to `return_to`.

### 2. Entitlement check (spoke ← hub)

Two equivalent options — pick one per spoke:

**A. Signed JWT cookie (recommended for same-org subdomains)**

Hub sets a cookie `__resonance_entitlement` on `.reson8.life` containing a
signed JWT:

```json
{
  "sub": "<user_id>",
  "email": "user@example.com",
  "apps": {
    "epublisher":      { "tier": "pro",     "status": "active", "exp": 1738368000 },
    "creative_studio": { "tier": "creator", "status": "active", "exp": 1738368000 }
  },
  "iat": 1735776000,
  "iss": "reson8.life"
}
```

Spoke verifies signature with the shared public key and reads `apps[<APP_KEY>]`.

**B. REST endpoint (for cross-domain spokes)**

```
GET https://reson8.life/api/public/entitlement?app=<APP_KEY>
Authorization: Bearer <user_jwt_from_hub_auth>
→ 200 { "tier": "pro", "status": "active", "current_period_end": "..." }
→ 404 { "tier": null,  "status": "none" }
```

### 3. Single sign-on

All spokes share the Hub's Supabase project. Each spoke imports the same
`supabase-js` publishable key. A user signed in on the Hub is automatically
signed in on every spoke (or via the JWT cookie if domains differ).

## Secrets the spoke needs

Only **one** of these, depending on which entitlement option you chose:

| Secret                    | When                                      |
|---------------------------|-------------------------------------------|
| `RESONANCE_JWT_PUBLIC_KEY`| Option A — verifies the cookie signature  |
| `RESONANCE_HUB_API_URL`   | Option B — base URL of the Hub REST API   |

The spoke **does not** need PayFast credentials, ITN secrets, or write access
to the `subscriptions` table. All payment logic stays in the Hub.

## What the spoke must remove

- Any local PayFast checkout buttons or ITN routes.
- Any local `subscriptions` / `plans` tables (the Hub is the source of truth).
- Any "Upgrade" CTAs pointing at the spoke's own pricing — replace with the
  handoff URL above.

## What the spoke must add

- A `useEntitlement(appKey)` hook returning `{ tier, status, isLoading }`.
- A `<PaywallGate tier="pro">` component that gates premium features.
- An "Upgrade" button that points at
  `https://reson8.life/checkout?app=...&plan=...&return_to=...`.

See `LOVABLE_PROMPT_PAYMENTS.md` for the exact prompt to paste into each
spoke's Lovable chat.
