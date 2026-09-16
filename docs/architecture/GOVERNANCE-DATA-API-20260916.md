# Resonance Governance Data Model and API — 2026-09-16

Phase 13 introduces the first durable governance workspace model beneath `/governance`.
It extends RCGF rather than replacing it. Human sovereignty remains the authority boundary:
AI and service participants may review or advise, but authenticated humans create proposals
and only a human administrator can record the canonical final decision.

## Durable entities

- `governance_participants` — human, AI, and service identities with explicit role/status.
- `governance_proposals` — versioned proposal lifecycle records.
- `governance_evidence` — references, artifacts, hashes, and notes attached to proposals.
- `governance_reviews` — append-only participant recommendations and rationale.
- `governance_decisions` — one canonical final outcome per proposal.
- `governance_events` — append-only governance timeline/audit events.

Human participant rows require an `auth.users` identity. AI/service rows are explicitly
forbidden from carrying a user identity, preventing an AI label from masquerading as a human.

## API and authority boundary

Authenticated clients receive SELECT-only RLS access. Mutations are performed by authenticated
TanStack server functions that validate strict Zod contracts before invoking service-role-only
Postgres RPCs. Create, submit, evidence, review, agent registration, and final decision operations
write their governance event in the same database transaction as the state change.

Human reviews never accept a caller-supplied participant ID. The review RPC derives or creates the
human participant from the authenticated user ID. AI/service participant registration is admin-only
and accepts only `ai` or `service` kinds. Final decision recording is admin-only and uses optimistic
proposal version checking to prevent stale decisions.

## Promotion boundary

This phase creates the data/API foundation only. It does not auto-apply decisions, execute proposal
content, or grant AI participants independent decision authority. UI workflow wiring and governed AI
review execution remain later review-branch work and must use these contracts rather than bypassing them.
