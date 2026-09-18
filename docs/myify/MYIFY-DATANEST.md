# MYIFY · DataNest

MYIFY means **May Your Intentions Find You**. It is a governed RONSAS module that captures the accountable value of eligible unused data-package capacity before expiry.

## Core idea

A mobile or fixed-wireless data package is a carrier entitlement, not a file that can be copied into storage. DataNest therefore stores **rights, reservations, settlement evidence, and participation accounting** rather than pretending to warehouse raw gigabytes.

The MYIFY flow is:

1. A subscriber records an operator-reported data package and expiry.
2. Eligibility is recorded explicitly: rollover, carrier transfer, and/or Wi-Fi/router sharing permission.
3. A RONSAS Mirror Router is registered.
4. MYIFY recommends reservation amounts using first-expiry attention.
5. A reservation places eligible capacity into the DataNest allocation queue.
6. Settlement occurs only after eligible usage or transfer is actually verified.
7. Settled contribution earns DataNest Participation Units (DPU) in the append-only ledger.
8. Unsettled reservations can be released without earning DPU.

## DataNest Participation Units

Current pilot accounting basis:

- **1 DPU = 1024 MB of verified settled contribution.**
- Reservations earn zero DPU.
- Simulation settlements earn zero DPU and remain provisional evidence only.
- Released reservations earn zero DPU.
- DPU are an internal business-interest accounting measure.
- DPU are **not** shares, cash, cryptocurrency, a deposit, debt, or a guaranteed return.
- Any future conversion into an equity, revenue-share, token, security, or other legal financial instrument requires a separately approved governance proposal, legal terms, and applicable regulatory compliance.

## Mirror Router

The platform supports four router modes:

- simulation — usable immediately for end-to-end testing of the MYIFY workflow.
- generic — reserved for a vendor-neutral local adapter.
- openwrt — reserved for an OpenWrt adapter.
- mikrotik — reserved for a MikroTik adapter.

Only a ready Mirror Router can reserve or settle allocations. Hardware modes start offline until a local adapter is paired. Router credentials and administrative secrets must remain outside the MYIFY database and outside Git.

A future hardware adapter should report only bounded telemetry required for accounting, such as router identity/fingerprint, WAN/data-source identity, metered bytes attributed to an allocation, local timestamp/sequence, and a cryptographic receipt/hash where available.

It must not upload Wi-Fi passwords, carrier passwords, SIM PINs, router admin credentials, browsing contents, or unrelated LAN telemetry.

## Data model

### myify_datanests

One DataNest pocket per authenticated user. Holds the settled contribution total and earned DPU total.

### myify_data_packages

Tracks carrier, package label, total/remaining/reserved MB, expiry, eligibility flags, and source metadata.

### myify_router_mirrors

Tracks the declared mirror mode and readiness state. Secrets are intentionally excluded.

### myify_allocations

Tracks reserved and settled MB against a specific package and Mirror Router.

### myify_interest_ledger

Append-only reservation/settlement/release evidence. UPDATE and DELETE are blocked by a database trigger.

## Security model

- Public and authenticated database clients receive no table access.
- Authenticated TanStack server functions validate user identity and then use the server-side Supabase service client.
- Every query and mutation is scoped to the authenticated user.
- Atomic reserve/settle/release operations are implemented as restricted database RPCs.
- RLS is enabled on every MYIFY table as defense in depth.
- The service-role key is never exposed to the browser.

## Expiry logic

The UI classifies packages as urgent at 24 hours or less, soon at more than 24 and up to 72 hours, safe above 72 hours, and expired after the expiry time.

For eligible packages, urgent data recommends all available MB, soon recommends 75%, safe/non-rollover recommends 25%, and safe/rollover-eligible recommends no automatic reservation. This is a planning heuristic, not a carrier guarantee.

## South African regulatory context

The 2026 ICASA End-User and Subscriber Service Charter amendments strengthen bundle rollover, transfer, out-of-bundle consent, and first-expiry-first-use protections. MYIFY must still apply the exact terms of the subscriber's carrier, package type, and account. Carrier capability is never inferred merely from the existence of a regulation.

## Promotion gates

Before MYIFY is made a required live RONSAS module:

1. Apply the MYIFY migration to the canonical production Supabase project.
2. Refresh generated Supabase types.
3. Run unit, lint, build, security, and RONSAS topology gates.
4. Exercise package → reserve → settle → ledger end to end with a simulation router.
5. Verify authenticated isolation with at least two test identities.
6. Add a real router adapter only after its protocol, permissions, and secret storage are reviewed.
7. Promote the module registry entry from candidate / non-required only after the live route and database are healthy.
