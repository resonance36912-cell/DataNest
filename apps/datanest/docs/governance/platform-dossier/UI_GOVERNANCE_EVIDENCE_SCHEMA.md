# UI Governance Evidence Schema

The machine-readable UI governance evidence is written to `public/ui-governance-release.json`.

## Candidate identity

- `schemaVersion`
- `project`
- `releaseSha`
- `releaseState` — `candidate` or `authorized`
- `authorized` — false for candidate evidence; true only after the authorization verifier accepts the complete release payload
- `designSpec`
- `implementationPlans`
- `generatedAt`

## Evidence slots

The `evidence` object contains:

- `prVerification`
- `securityScan`
- `ronsasValidation`
- `visualReview`
- `governanceReview`
- `legalReview`
- `externalReview`
- `productionAuthorization`

Each slot records `status` and `reference`. Missing candidate evidence is represented as `pending` with a null reference. Authorized evidence fails closed if a required reference is empty or uses placeholder text such as `pending`, `todo`, or `tbd`.

## Production-chain coverage

The dossier ties machine evidence to the complete chain:

self-audit → automated verification → security validation → visual/UX review → governance-impact review → legal review where applicable → external/human review → production authorization → deployment → post-deployment verification → dossier/evidence update.

Machine traceability and human/governance traceability are complementary. Neither substitutes for the other.
