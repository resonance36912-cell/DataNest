# SEC-01 governance runtime acceptance handoff — 30 September 2026

## Scope

This handoff addresses the external-audit finding **SEC-01**: backend enforcement and cross-project isolation for the sovereign-governance surface.

The behavioral test now runs against an **isolated local canonical Supabase stack** reconstructed from the exact candidate migrations. Production is not mutated by the acceptance test, and Mirror-DataNest staging is not used for the multi-collaborator authorization matrix.

## Historical production ↔ staging implementation parity observation

A read-only inspection on 30 September 2026 compared `pg_get_functiondef` MD5 values for the governance and membership RPCs in:

- production: `sgqdmfgjbprsoqsmgigi` — DataNest Supository;
- staging: `qchttpcyqlqnhvahprhz` — DataNest AI Staging.

The function definitions matched exactly for all inspected RPCs:

| RPC | Definition MD5 |
| --- | --- |
| `cast_governance_vote_v1(uuid,text,text)` | `de29e478083c26c8913b89f97281f1ec` |
| `close_governance_proposal_v1(uuid,text)` | `6775aa8675f473a7868e9b7f2d0cfba4` |
| `create_governance_proposal_v1(uuid,text,text,text,text,uuid,timestamptz)` | `086ad02eb4845717c758d0ce332850b6` |
| `create_governance_protocol_draft_v1(uuid,text,text,text,text,jsonb)` | `3f6fcc2a26f447eb9e046c2944187fc4` |
| `file_governance_dispute_v1(uuid,text,uuid,text,text,text)` | `0e35aabfa34cdfbb1edf6942143184ed` |
| `get_governance_workspace_v1(uuid)` | `6ea967bbfd393f8f8bc28d2961a2919e` |
| `get_project_membership_workspace_v1(uuid)` | `3d699e266ed8797360a8a7cc455cb8f8` |
| `ratify_governance_protocol_v1(uuid,uuid)` | `608d9ac4e1e46c635dd9f0c2fc4ab67a` |
| `resolve_governance_dispute_v1(uuid,text,text,uuid)` | `7d758d7473d0c71ee2a89399312dc903` |
| `revoke_project_member_invite_v1(uuid,text)` | `84b48fac22774ed3ba8fa7729cc63082` |
| `withdraw_governance_proposal_v1(uuid,text)` | `be3bfdb1a791059e2208a5479a728fb1` |

Production grants those governance RPCs to `authenticated`; staging additionally grants `service_role` for governed test/fixture operations. The callable implementations themselves matched.

A separate read-only staging privilege check confirmed that `authenticated` has no INSERT/UPDATE/DELETE table privilege on either `project_members` or `governance_proposals`.

## Automated behavioral evidence

`tests/stress/datanest-governance-boundary-acceptance.mjs` creates isolated synthetic users and two temporary projects, then exercises:

- anonymous, viewer, operator, admin, owner and outsider identities;
- cross-project workspace and row isolation;
- role-gated protocol drafting, proposal closing and protocol ratification;
- direct project-member role-escalation denial;
- direct governance-history INSERT/UPDATE denial;
- proposer-only support producing a rejected decision because independent support is false;
- draft → proposal → proposer vote → independent vote → close → ratify;
- dispute filing → filer self-resolution denial → independent resolution;
- source decision/proposal/protocol preservation after dispute resolution;
- unchanged membership roles after the governance lifecycle.

The suite writes `certification-artifacts/datanest-governance-boundary-acceptance.json`, including the exact candidate commit, role matrix, results and cleanup outcome.

## Evidence boundary

The retained staging observation above remains useful historical implementation-parity evidence. Current SEC-01 behavioral evidence is instead generated from the exact candidate source on an isolated local canonical Supabase stack, while REL-01 separately attests the production release identity. Together these avoid writing production records or weakening Mirror's owner-only R&D boundary.

It does **not** prove resistance to a privileged database administrator, nor does it replace exact production release attestation. REL-01 remains handled separately by the live database and Edge Function release-attestation gate.


## First behavioral run finding and repair

The first exact-head behavioral run exposed a real implementation defect rather than an authorization bypass. The Governance workspace returned `member_role = "postgres"` for an authenticated project Owner because the PL/pgSQL local variable was named `current_role`; PostgreSQL interpreted the unqualified expression in the JSON result as the reserved `CURRENT_ROLE` session-role expression.

The failed run retained its evidence artifact and cleaned up both temporary projects and all five synthetic users with no cleanup errors.

The corrective migration renames the local variable to `member_role_value` and keeps the membership lookup, role gates, RLS rules and mutation authority unchanged. The correction was first exercised in the earlier dedicated staging run, where all six SEC-01 behavioral cases passed before the Mirror owner-only isolation policy became authoritative for that environment. Production remains unchanged until the corrected canonical candidate passes the full gate set.


## Environment boundary correction

Mirror-DataNest and canonical DataNest have different security envelopes:

- **Mirror-DataNest** is the single-user owner R&D/live-candidate surface. Its owner-only staging restriction is intentional.
- **DataNest-Supository/DataNest** is the multi-collaborator governed platform. SEC-01 therefore exercises anonymous, viewer, operator, admin, owner and outsider behavior only against a canonical certification environment.

The certification workflow now starts a fresh local Supabase stack, replays the candidate migrations, creates synthetic users/projects, and runs the same user-scoped RPC/Data API checks there. Service-role access is limited to fixture creation, inspection and cleanup. User-facing governance and Edge Function calls execute with the synthetic collaborators' authenticated sessions.

This removes the previous architectural conflict where canonical multi-role acceptance was incorrectly coupled to Mirror's single-owner staging policy. No temporary hosted Supabase branch is required for the default SEC-01 gate; a hosted branch remains an optional final assurance step if an external reviewer specifically requires hosted-environment behavioral evidence.
