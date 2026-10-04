# Branch Cleaner Operations

Branch Cleaner is a fail-closed GitHub branch hygiene tool for the DataNest repository.

## Deletion eligibility

There is no branch-age floor. A branch can be deleted immediately only when all of these are true:

- it is not `main`, protected, or matched by a protected branch pattern;
- it has no open pull request;
- GitHub comparison with `main` is known;
- it has exactly zero unique commits (`ahead_by = 0`);
- strict control-plane verification has no blockers.

Any branch with unique commits remains `review` or `keep`. Unknown compare state remains `keep`.

## Strict Supabase verification

Strict/apply mode must verify the configured Supabase application and AI staging authorities before destructive cleanup. The application authority also enforces exact Git-to-live migration history parity.

Branch Cleaner accepts either of these verification sources:

1. **Live management verification** using the encrypted GitHub Actions secret `SUPABASE_ACCESS_TOKEN`.
2. **Fresh verified evidence** from `.github/branch-cleaner/supabase-verified-snapshot.json`.

The snapshot path is fail-closed. The script rejects it when it is missing, expired, older than the configured maximum age, dated too far in the future, incomplete, mapped to the wrong project refs, unhealthy, or inconsistent with Git migration history.

The configured maximum snapshot age is controlled by `supabaseEvidenceMaxAgeMinutes` in `branch-cleaner.config.json`.

When both sources are unavailable or invalid, strict/apply remains blocked.

## Credential guidance

Supabase currently documents access-token authentication for CI management operations. When using live verification, store a least-privilege scoped token only as the encrypted GitHub Actions secret `SUPABASE_ACCESS_TOKEN`.

Use read access sufficient for the configured project status, branch status, security advisors, and migration history checks.

## Recommended operator flow

1. Refresh live Supabase evidence or configure the encrypted access-token secret.
2. Run Branch Cleaner with `apply=false`, `strict=true`.
3. Review delete candidates and all warnings.
4. Run with `apply=true`, `strict=true` only when the strict dry run is clean.
5. Preserve generated artifacts as cleanup evidence.

## Superseded branch families

Branch-family naming is only a review hint. Branch Cleaner does not treat a similar name, version suffix, date suffix, or newer timestamp as proof that work is preserved.

For multi-version families, Branch Cleaner performs a GitHub compare from the older tip to the newest sibling. It records `superseded_reachable_from_sibling` only when the older tip is the merge base and therefore an ancestor of the newer sibling.

This remains a **review** classification, not a delete classification, while the branch has commits that are still unique relative to `main`. The report includes `preserved-by=<branch>` so operators can consolidate deliberately without losing lineage.

## Merged PR history

A merged pull request can still show commits ahead of `main` when GitHub used squash or rebase history. That does not by itself mean someone committed to the branch after merge.

Branch Cleaner compares the branch-tip commit timestamp with the latest linked PR `merged_at` timestamp:

- `post_merge_unique_commits` means the branch tip was committed after the PR merged.
- `merged_pr_unique_history` means the PR merged but the current branch tip does not show post-merge activity; the unique commit SHAs remain review-only history.

Neither classification is automatically deleted while `ahead_by > 0`. This distinction improves review priority without weakening commit-lineage protection.

## Archived merged history

Merged PR source branches can preserve commit lineage that is not reachable from `main` after squash/rebase merging. Branch Cleaner supports a non-destructive archive state using lightweight Git tags.

The configured tag prefix is `branch-archive/`. For an archived branch named `feature/example`, the expected tag is:

`branch-archive/feature/example`

Branch Cleaner only reports `merged_history_archived` when the archive tag points to the **exact current branch tip SHA**, the branch has a merged PR, the branch still has history ahead of `main`, and there is no detected post-merge activity.

Archived branches use the `archived` decision. They are not delete candidates. If the branch advances, the tag no longer matches the tip and Branch Cleaner returns the branch to review.

## Divergent branch families

When an older branch and the newest sibling in the same normalized family can be compared successfully but the older tip is **not** an ancestor of the newer tip, Branch Cleaner records `divergent_family_variant`.

The report includes the newer sibling plus GitHub's compare status and ahead/behind counts. This is stronger evidence than the legacy `possible_superseded_variant` label:

- `superseded_reachable_from_sibling`: older history is provably contained by the newer sibling.
- `divergent_family_variant`: Git proves the sibling histories diverged and require deliberate content review.
- `possible_superseded_variant`: naming suggests a newer sibling but the comparison could not establish a relation.

All three remain non-destructive review states while commits are unique relative to `main`.

## Optional archived-branch pruning

Archive-aware cleanup remains disabled by default. Setting `allowArchivedPrune=true` only enables the capability; deletion still requires the explicit `--apply --prune-archived` mode (or the matching workflow input).

Before deleting an archived branch, Branch Cleaner revalidates live GitHub state immediately:

- the branch is still unprotected and is not covered by a protected pattern;
- there is still no open pull request for the branch;
- the configured archive tag still points to the exact live branch-tip SHA;
- the branch still has at least one merged pull request;
- the live branch-tip commit timestamp does not show post-merge activity.

If any check changes between audit and apply, the branch is not deleted and strict mode records the revalidation failure. Standard apply mode continues to ignore archived branches.
