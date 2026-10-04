# Resonance App & Function Optimization

## Objective

Optimize the entire production application portfolio around customer outcomes, shared capabilities and measurable journeys without destabilizing production routes or authority boundaries.

### Canonical hierarchy

Resonance Sole Proprietorship → Resonance AppDev → DataNest → Resonance / Sovereign Forge / Assurance

- Resonance is the customer application suite.
- DataNest is the operating and control platform.
- RONSAS remains the stable technical identifier.
- Internal services are capabilities, not competing products.

## Portfolio operating model

| Surface | Role | Primary outcome |
|---|---|---|
| DataNest | Operating/control platform | governed delivery and trust |
| Resonance Career Compass | Career primary product | activated career user |
| Resonance Creator Studio | Create primary product | activated creator workspace |
| SongSpark | Acquisition utility | qualified creator entry |
| Lyrics & Sync | Create module | synchronized lyric output |
| Media Sync | Create module | synchronized media output |
| Resonance Publish | Create module | publish-ready output |
| Resonance Creator Growth | Grow module | measurable creator optimization |
| Sovereign Forge | Professional/B2B product | qualified professional engagement |
| Assurance Services | Professional service | readiness/evidence outcome |

## Function consolidation

The portfolio should converge on a small number of canonical shared contracts:

1. Identity — authentication, sessions, roles and account linking.
2. Entitlement — plans, access, upgrades, renewals and module access.
3. Evidence — release evidence, audit evidence, traceability and attestations.
4. Security — policy enforcement, provider sovereignty and security invariants.
5. Telemetry — product events, conversion, errors, performance and usage.
6. Content — brand, SEO, metadata and legal disclosures.
7. Storage — assets, artifacts, retention, backup and recovery.
8. AI — provider abstraction, policy, routing, cost observation and safety.

These become DataNest-owned platform contracts. Applications may implement adapters, but they should not independently redefine the business authority of these functions.

## Journey optimization

### Career

Career Compass → discovery → assessment → action plan → registration → subscription

Career Compass remains independent so it can serve a distinct intent without forcing creator users through the creator funnel.

### Create / Grow

SongSpark → Creator Studio → Lyrics & Sync → Media Sync → Publish → Creator Growth → repeat use

Creator Studio is the commercial center of the creator journey. Modules increase depth and retention rather than fragmenting identity, billing or navigation.

### Professional

Sovereign Forge → qualified intake → scope → engagement → delivery → evidence → expansion

Professional work remains distinct from consumer creator navigation.

## Application-level optimization rules

- Creator Studio: primary creator workspace; absorb the user journey, not every implementation surface.
- Lyrics & Sync: specialized creation module; reuse Creator Studio identity and entitlement.
- Media Sync: specialized media module; reuse Creator Studio identity, entitlement and storage.
- Publish: final creator workflow stage; reuse Creator Studio identity and evidence.
- Creator Growth: post-creation growth capability; feed insights back into the creator workspace.
- SongSpark: minimize friction and measure routing into Creator Studio.
- Career Compass: maintain its own customer journey and subscription intent.
- Sovereign Forge: maintain professional/B2B separation and evidence-driven delivery.
- DataNest Assurance: expose assurance as a professional service without turning governance internals into customer products.
- DataNest: remain the canonical control plane and authority layer.

## Code/function optimization sequence

### Phase 1 — contract normalization

- canonical function registry;
- identity/entitlement/evidence/telemetry contracts;
- application-to-contract ownership map;
- journey and conversion event vocabulary.

### Phase 2 — duplication reduction

- identify duplicate auth/session helpers;
- identify duplicate entitlement logic;
- identify duplicate branding/SEO metadata;
- identify duplicate error/telemetry pipelines;
- identify duplicate Supabase client and policy wrappers;
- replace duplicates with adapters to canonical contracts.

### Phase 3 — performance

- lazy-load heavy creative/media capabilities;
- keep FFmpeg and large media tooling off the initial acquisition path;
- cache stable metadata and read-mostly registry data;
- batch telemetry where safe;
- isolate expensive AI/media work behind explicit jobs or server-side functions.

### Phase 4 — conversion

- make every acquisition surface measurable;
- expose the next logical action after every successful task;
- route module completion back to Creator Studio;
- route professional evidence to Assurance/Forge;
- keep subscription prompts tied to demonstrated value rather than arbitrary navigation.

## Safety constraints

This optimization does not:

- delete applications;
- disable production surfaces;
- rename stable technical routes;
- change source authority;
- change production backend authority;
- activate proposed portfolio relationships;
- introduce a database migration merely for nomenclature or packaging.

Any technical consolidation that changes data contracts, authentication, entitlements or production behavior must be separately validated and governed.

## Canonical optimization manifest

Machine-readable source: config/resonance-optimization.manifest.json

The manifest is the portfolio optimization contract for app roles, journeys and shared function ownership.
