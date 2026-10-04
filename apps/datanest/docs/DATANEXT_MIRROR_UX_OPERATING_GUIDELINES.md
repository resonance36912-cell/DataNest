# DataNext / Mirror-DataNest UX & Operating Guidelines

**Status:** Governance guideline / implementation guidance  
**Canonical repository:** `DataNest-Supository/DataNest`  
**Mirror peer:** `DataNest-Supository/Mirror-DataNest`

## 1. Purpose

DataNext is the UX evolution of DataNest's existing command-center experience. Mirror-DataNest may adapt the same interaction language for its separate R&D and peer-production purpose.

The visual system must communicate capability and state without implying authority that does not exist.

## 2. Shared experience principles

Both surfaces should favor:

- clear first-glance orientation;
- predictable navigation and reversible actions;
- progressive disclosure instead of information overload;
- smooth, purposeful transitions;
- responsive layouts and keyboard-accessible interaction;
- reduced-motion and high-contrast fallbacks;
- visible system state, evidence state, and action state;
- consistent terminology for governance and lifecycle states.

“Futuristic” treatment should remain subordinate to legibility, task completion, accessibility, and provenance.

## 3. Canonical DataNest treatment

The canonical DataNest surface is governed and collaborative. Its UX should make the following distinctions visually explicit:

**PLEDGED → CLAIMED → EVIDENCED → INDEPENDENTLY REVIEWED → APPROVED → ADOPTED**

A visual effect, badge, animation, icon, or color must not collapse these states into a single notion of “trusted,” “verified,” “certified,” or “approved.”

Consequential actions should reveal:

- what will happen;
- what authority is being exercised;
- what evidence or prerequisite state is present;
- whether human approval is required;
- what remains reversible or unresolved.

## 4. Mirror-DataNest adaptation

Mirror-DataNest is a separate owner-controlled R&D and peer-production surface. Its DataNext adaptation may emphasize:

- experimentation and rapid iteration;
- live candidate inspection;
- isolated plugin/provider experimentation;
- production-candidate validation;
- synchronization and divergence visibility;
- selective handoff into canonical DataNest;
- release identity and live verification evidence.

Mirror UX must make the relationship to canonical DataNest explicit without suggesting that Mirror automatically transfers governance authority.

## 5. Mirror-specific state vocabulary

Where applicable, the Mirror interface should distinguish:

**MIRROR R&D → CANDIDATE → LIVE VERIFIED → HANDOFF READY → CANONICAL REVIEW → CANONICAL APPROVED → CANONICAL ADOPTED**

The exact states implemented by code should remain subordinate to the repository's actual governance model. Labels must not claim a later state merely because a candidate exists or a workflow succeeded.

## 6. Synchronization and provenance

Mirror-facing synchronization indicators should answer:

- upstream baseline/ref;
- candidate/head ref;
- synchronization timestamp;
- divergence status;
- conflicts or blocked reconciliation;
- whether a change is Mirror-only, canonical-derived, or proposed for handoff.

A green synchronization indicator means only what its underlying check establishes. It must not be presented as certification or canonical approval.

## 7. Visual and motion guidance

Use motion to communicate hierarchy, continuity, focus, loading, transition, and state change. Avoid perpetual motion that competes with content.

Preferred effects include:

- subtle scanning or ambient gradients;
- short entrance/exit transitions;
- tactile focus and hover feedback;
- progressive panel expansion;
- restrained telemetry pulses.

Never make essential information depend exclusively on animation.

## 8. Accessibility and resilience

All DataNext adaptations should support:

- keyboard navigation;
- visible focus;
- semantic controls;
- screen-reader labels for decorative telemetry;
- `prefers-reduced-motion`;
- forced-colors/high-contrast environments;
- mobile/touch interaction;
- graceful behavior when data is loading, stale, unavailable, or partially verified.

## 9. Governance boundary

The UI is an information and interaction layer. It does not independently confer:

- governance authority;
- certification or accreditation;
- regulatory status;
- legal authorization;
- production authority outside the configured surface;
- evidence validity merely through display.

The repository, evidence records, configured authorities, and applicable human approvals remain authoritative.

## 10. Review requirement

UX changes should be reviewable independently from governance changes. A visual redesign must not silently change authorization, evidence status, lifecycle state, synchronization authority, or deployment authority.
