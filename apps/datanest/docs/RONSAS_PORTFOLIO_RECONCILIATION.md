# DataNest / Resonance Portfolio Reconciliation — Commercial Boundary & Naming

**Technical identifier:** `RONSAS` (retained for stable paths, slugs and internal references).

**Date:** 2026-10-03  
**Status:** Proposed through canonical DataNest PR; no production application has been deleted or disabled.

## Objective

Separate the DataNest operating system from market-facing business offers while preserving existing capabilities, production routes and source history.

## Target commercial architecture

### Resonance AppDev
Master brand of Resonance Sole Proprietorship.

### DataNest
Canonical governance, evidence, orchestration, AppDev control and delivery authority beneath the Resonance AppDev master brand.

### Resonance
Customer application suite governed by DataNest, commercially organized around Career, Create and Grow.

| Customer intent | Primary surface | Consolidated capabilities |
| --- | --- | --- |
| Career | Resonance Career Compass | — |
| Create | Resonance Creator Studio | Lyrics & Sync, Media Sync, Publish |
| Grow | Creator growth pathway | SongSpark acquisition utility; Resonance Creator Growth |

### Sovereign Forge
Sibling Resonance AppDev professional/B2B engineering offer. It may remain technically hosted in the RONSAS/Resonance estate without being presented as a Resonance customer family.

## Product treatment

### Resonance Career Compass — retain as independent product
Independent customer problem, acquisition path and subscription journey.

### Creative Studio — make the principal creator surface
Primary entry point for creator production. Existing publishing, lyric/synchronization and media-synchronization capabilities remain available through the workspace.

### ePublisher — consolidate commercially
Retain as an implemented capability, but present as the publishing/distribution module of Creative Studio unless separate demand evidence later justifies independent product status.

### LyricSync Studio — consolidate commercially
Retain as a specialist capability within Creative Studio for lyrics and synchronization.

### SyncVision — consolidate commercially
Retain as the media-synchronization capability within Creative Studio.

### Scene Song Spark — retain as acquisition utility
Use as a low-friction discovery/lead-generation entry into the creator funnel rather than making it a competing primary subscription destination.

### YouTube Optimizer — reposition to Creator Growth
Retain its capability and external production route while presenting it as part of the creator growth pathway rather than a separate top-level product family.

### Sovereign Forge — sibling professional/B2B business line
Keep a distinct product identity because its buyer, problem and commercial context are materially different from the Resonance creator and career journeys.

### Sovereign Backend / Resonance Shared — infrastructure only
Keep operationally. Do not place them in the primary customer product grid.

## Customer journey

```
discovery / free utility
        ↓
Resonance identity / registration
        ↓
Creative Studio
        ↓
create → sync → publish → grow
        ↓
repeat usage / paid capability
        ↓
professional expansion
```

Career Compass follows an independent career/workforce journey. Sovereign Forge follows a professional/B2B journey.

## Transition controls

1. **Do not delete existing applications as part of commercial consolidation.**
2. **Do not change production lifecycle solely because the commercial role changes.**
3. **Keep technical catalog entries for governance and evidence even when their commercial visibility becomes module, acquisition, or internal.**
4. **Centralize pricing and onboarding around the primary commercial surfaces.**
5. **Measure activation, repeat use, subscription intent, conversion and expansion before promoting a module back to independent product status.**
6. **Retirement requires separate evidence of redundancy, migration readiness, dependency closure, user-impact assessment and explicit authorization.**

## Required next implementation layers

### Public information architecture
Present Resonance AppDev first, then route visitors to Resonance, Sovereign Forge and Resonance AppDev Assurance Services by intent; DataNest explains the operating system behind those offers. Within Resonance, present Career / Create / Grow before exposing implementation modules.

### Pricing architecture
Create a family-level pricing model:
- Career Compass: independent pricing.
- Creative Studio: primary creator subscription with module/feature expansion.
- Creator Growth: integrated growth capabilities.
- Sovereign Forge: professional/B2B pricing.
- Scene Song Spark: free or low-friction acquisition tier.

No numeric price should be asserted until supported by an explicit commercial baseline and product capability evidence.

### Portfolio data layer
Reconcile the Supabase portfolio graph so that Resonance contains the catalogued applications and each application's commercial role is represented separately from technical lifecycle.

### Analytics
Standardize the funnel:
```
impression → visit → demo/use → registration → activation → first value
→ repeat use → subscription intent → subscription → expansion → referral
```

## Decision rule

The goal is not fewer capabilities. The goal is fewer customer decisions, clearer journeys, stronger cross-sell paths and a nomenclature hierarchy that matches system authority, business ownership and delivery reality.
