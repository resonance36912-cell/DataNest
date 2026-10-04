# Resonance DataNest Legal Review Checklist

## Authority boundary

Production legal approval is a human/legal decision. Automated tests, AI output, code review, CI status, deployment readiness, and governance metadata can support that decision but cannot make it.

A blank field or a review-required field is not approval and must never be treated as approval.

No reviewer name, signature, approval date, effective date, or approval reference is recorded here until an authorized human/legal reviewer supplies it.

## Review record

| Document ID | Draft version | Evidence required | Review owner | Decision | Effective date | Approval reference |
| --- | --- | --- | --- | --- | --- | --- |
| terms | 0.1-draft | Current product behavior, operator identity, commercial mode, consequential-action controls | Authorized human/legal reviewer | review-required | — | — |
| privacy | 0.1-draft | Verified data map, storage/auth/provider flows, POPIA roles and notices, incident procedures | Authorized human/legal reviewer | review-required | — | — |
| disclaimers | 0.1-draft | Verified AI-assisted behavior, business-projection semantics, professional-review boundaries | Authorized human/legal reviewer | review-required | — | — |
| acceptable-use | 0.1-draft | Verified access controls, misuse controls, enforcement and appeal procedures | Authorized human/legal reviewer | review-required | — | — |
| intellectual-property | 0.1-draft | Verified ownership/licensing model for inputs, outputs, code, brand assets and licensed materials | Authorized human/legal reviewer | review-required | — | — |
| governance | 0.1-draft | RSGP governance architecture, authority separation, production-review chain and evidence controls | Authorized human/legal reviewer | review-required | — | — |
| accessibility | 0.1-draft | Keyboard/focus/motion/theme evidence and completed accessibility verification | Authorized human/legal reviewer | review-required | — | — |

## Approval gate

A document may move from `draft-review-required` to `approved` only when all of the following are recorded by an authorized human/legal reviewer:

1. the reviewed document ID and exact version;
2. the evidence set reviewed;
3. the named review owner;
4. an explicit approval decision;
5. the approved effective date;
6. an immutable or otherwise traceable approval reference.

If any required field is blank, unresolved, or still review-required, the document remains a governed draft.

## Change control

Any substantive legal-copy change after approval creates a new review candidate. A code merge, build, deployment, or AI recommendation does not carry prior legal approval forward automatically.
