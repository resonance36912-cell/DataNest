# DataNest Product Hierarchy and Managed Execution Design

Date: 2026-09-26
Status: Approved design baseline
Scope: Resonance DataNest, RONSAS, shared applications, and migration away from independent/self-hosted production execution

## 1. Design authority

Resonance DataNest is the parent platform and control plane.

RONSAS is a governed product within DataNest. It is not the parent infrastructure layer and must not be presented as the authority over DataNest, DataNest AI, shared governance, or other governed products.

Canonical hierarchy:

```text
Resonance DataNest
├─ DataNest AI
├─ UNIFI
├─ TranScheduler
├─ Governance / Audit / Certification / Learning
├─ Products
│  ├─ RONSAS
│  └─ future governed products
└─ Registered applications / capabilities
   ├─ ePublisher
   ├─ Creative Studio
   ├─ Sync Vision
   ├─ YouTube Optimizer
   ├─ SovereignForge
   ├─ LyricSync Studio
   ├─ Scene Song Spark
   ├─ Resonance AppDev / Reson8 ADT
   └─ future registered applications
```

## 2. Intent

Move products and application workloads away from independently managed or self-hosted production execution and into DataNest-managed execution, deployment, governance, evidence, and lifecycle control.

The migration must preserve the current separation of authorities:

- DataNest: operational and governance authority.
- GitHub: source control, history, CI, and evidence.
- Supabase: auth, database, storage, and backend functions.
- Public hosting: replaceable delivery infrastructure, not system authority.
- RONSAS: governed product managed through DataNest.

## 3. UI model

### AI & I view

The AI & I hero must communicate DataNest as the center of intelligence and orchestration.

The current visual pattern that places RONSAS at the center of the application constellation must be changed because it implies RONSAS owns or governs the surrounding applications.

The center node must be one of:

- `DataNest AI` when the visual is specifically about intelligence and learning; or
- `Resonance DataNest` when the visual represents the whole platform.

RONSAS must appear as a governed product node connected to the DataNest core.

### Products view

The Products view is the canonical product hierarchy:

```text
DataNest
└─ Products
   └─ RONSAS
```

RONSAS product detail must continue to carry its own architecture, controls, evidence, roadmap, risks, and promotion history.

### Navigation

Navigation labels and page copy must avoid language that suggests RONSAS is the parent platform.

Preferred terms:

- "DataNest-managed"
- "governed product"
- "registered application"
- "shared DataNest service"
- "product runtime"

Avoid:

- "RONSAS/DataNest control plane"
- "RONSAS parent system"
- "RONSAS-managed DataNest"
- wording that makes shared DataNest capabilities appear subordinate to RONSAS

## 4. Managed execution model

DataNest owns the product lifecycle state and execution intent.

Each governed product or application should resolve through a DataNest-managed lifecycle:

```text
Intake
→ Staging
→ Verification
→ Audit
→ Certification
→ Promotion
→ Managed runtime
→ Evidence / telemetry / learning
```

RONSAS participates in this lifecycle as a product.

Independent Node/Docker execution may remain available for:

- local development;
- recovery;
- controlled test environments;
- offline continuity.

It must no longer be described or treated as a canonical production authority.

## 5. Hosting model

The current GitHub Pages + Supabase production path may remain during this migration because it already separates source/data authorities from the public delivery layer.

DataNest should treat hosting as a replaceable deployment target.

A future hosting change must not require redefining product ownership or governance.

The target state is:

```text
DataNest
  governs deployment intent
      ↓
GitHub / CI
  builds and verifies
      ↓
Deployment target
  serves product
      ↓
Supabase
  supplies governed backend services
```

The deployment target can change without changing the hierarchy.

## 6. Product registry model

Each product registered in DataNest should have one canonical product identity containing:

- product ID and display name;
- status;
- owner;
- applications/capabilities;
- runtime type;
- deployment targets;
- linked repositories;
- Supabase/backend dependencies;
- controls;
- risks;
- roadmap;
- evidence;
- promotion branch/state;
- certification status.

RONSAS is the first governed product currently visible in this product registry model.

## 7. Application relationship model

Applications can be:

1. product-owned;
2. shared DataNest capabilities; or
3. independent governed applications registered with DataNest.

The UI and data model must not assume every application visible in the AI & I constellation belongs to RONSAS.

Where ownership is known, the relationship should be explicit.

## 8. DataNest AI relationship

DataNest AI is a platform capability, not a RONSAS capability.

It may learn from approved product inputs, governed human inputs, AI companion outputs, audit evidence, and certified branches according to existing DataNest learning controls.

Product-specific knowledge should remain attributable to the product and source branch that produced it.

## 9. Migration phases

### Phase 1 — Correct authority and UI language

- Replace RONSAS-as-core presentation in AI & I.
- Make DataNest/DataNest AI the core visual authority.
- Keep RONSAS under Products.
- Remove ambiguous "RONSAS/DataNest" parent terminology.

### Phase 2 — Production-path governance

- Mark standalone Node/Docker as local, recovery, or test-only.
- Make DataNest-managed promotion the documented production route.
- Add guards so production promotion requires governed product identity and evidence.

### Phase 3 — Product execution registry

- Connect RONSAS runtime/deployment metadata to its DataNest product record.
- Register application-to-product relationships.
- Surface deployment target, evidence, certification, and current release from the product record.

### Phase 4 — Generalize for future products

- Ensure product lifecycle, runtime, deployment, and evidence models do not contain RONSAS-specific assumptions.
- Support additional governed products without restructuring the platform.

## 10. Acceptance criteria

The change is complete when:

1. DataNest is visually and structurally the parent platform everywhere.
2. RONSAS appears only as a governed product, never as DataNest's parent or core.
3. DataNest AI is represented as a shared DataNest capability.
4. The AI & I hero no longer places RONSAS at the center of the shared application constellation.
5. The Products view remains the canonical place for RONSAS product detail.
6. Production documentation describes DataNest-managed promotion as canonical.
7. Standalone Node/Docker is clearly local/recovery/test-only.
8. GitHub remains source/CI/history authority.
9. Supabase remains backend/auth/data authority.
10. Hosting remains replaceable infrastructure.
11. Existing free-promotion / billing-off product state is preserved.
12. No unrelated product hierarchy or billing changes are introduced.

## 11. Non-goals

This design does not:

- replace Supabase;
- require Vercel;
- remove GitHub Pages immediately;
- remove local development;
- merge RONSAS into DataNest;
- make RONSAS the owner of shared DataNest applications or services;
- alter billing policy;
- redesign unrelated product features.

## 12. Implementation boundary

Implementation should focus on the smallest set of changes required to enforce the hierarchy:

- AI & I visual/data model;
- Products/product registry relationship model;
- deployment language and guards;
- runtime/deployment metadata ownership;
- tests that prevent regression to RONSAS-as-parent terminology or presentation.

Unrelated refactoring should be excluded.
