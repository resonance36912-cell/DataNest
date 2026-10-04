# Owner Test Mode authority resilience

Owner Test Mode requires the declared owner login to equal the authenticated GitHub actor.

When the actor is also `GITHUB_REPOSITORY_OWNER`, repository ownership is sufficient owner authority and no collaborator-permission API request is required. This avoids false release failures caused only by GitHub App installation rate limiting.

For any non-owner actor, the workflow still queries the repository collaborator permission endpoint and requires `admin` permission.

This change does not bypass the protected deployment environment, exact-SHA verification, production database attestation, governed Edge Function release evidence, or the remaining production authorization gates.
