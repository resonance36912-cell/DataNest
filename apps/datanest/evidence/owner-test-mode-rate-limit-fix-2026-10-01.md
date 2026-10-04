# Owner Test Mode rate-limit repair evidence

Observed Pages run: `36916167743`.

The declared owner login and GitHub actor both resolved to `DataNest-Supository`, but the collaborator permission API call failed with HTTP 403 because the GitHub App installation rate limit was exceeded.

The repair makes repository-owner authorization independent of that API call while preserving the collaborator-admin API check for non-owner actors.

No application, Supabase function, database, or public-route source is changed by this repair.
