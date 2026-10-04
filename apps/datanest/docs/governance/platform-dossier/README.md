# DataNest Platform Dossier

This directory holds release-review traceability for Resonance DataNest.

The machine-generated UI governance evidence file is a candidate/release manifest. It identifies the candidate SHA, approved design/spec paths, implementation-plan paths, and supplied workflow/review references. A candidate manifest is deliberately non-authoritative: missing independent security, RONSAS, legal, external-review, and production-authorization evidence remains marked as pending.

Human governance and legal review records are separate evidence. Neither an automated workflow pass nor a machine-generated manifest is production authorization by itself.

Use:
- `UI_GOVERNANCE_EVIDENCE_SCHEMA.md` for the machine-readable contract and production-chain mapping.
- `UI_GOVERNANCE_RELEASE_REVIEW.md` for the human/external review record for one exact candidate SHA.

Production remains gated by the exact-SHA Pages workflow, the complete review-reference payload, and the `github-pages` environment reviewer protection.

- `UI_GOVERNANCE_CANDIDATE_88945f1.md` records the exact-head automated certification evidence for the merged production-gate candidate and the remaining human/environment blockers.
