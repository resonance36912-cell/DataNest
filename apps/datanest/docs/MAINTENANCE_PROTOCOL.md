# DataNest Maintenance Protocol

DataNest repositories use scheduled maintenance to reduce branch noise and safely streamline tracked text/workflow structure.

## Autonomous maintenance

1. **Branch Cleaner** runs against live GitHub state and may delete only a non-protected branch with no open pull request and no unique commits relative to the configured base branch.
2. Unknown comparison state, unique commits, protected branches, open pull requests, or failed control-plane verification are retained.
3. Archived branches containing unique history are never pruned by the schedule.
4. **Streamliner** runs the repository workflow reviewer in safe-refinement mode. It only applies deterministic byte-safe text normalization; behavioral findings remain review-only.
5. Streamliner changes are pushed to a maintenance branch and opened as a pull request rather than written directly to canonical main.
6. Generated reports are evidence, not certification.

## Schedule

- Branch cleanup: daily.
- Safe streamlining: weekly.
- Both can be invoked manually.

## Repository coverage

The protocol applies to DataNest, Mirror-DataNest, and the FREETREE repository once FREETREE exists. FREETREE maintenance is local to FREETREE and must never create synchronization with DataNest or Mirror-DataNest.


## Specialized automation branches

`automation/knowledge-feed`, `automation/botsquad/*`, `automation/environment-feed`, `automation/enforcer`, `automation/guardian`, `automation/conductor`, `automation/suggester`, `automation/calmer`, `automation/regulator`, and `automation/visibility-utility` are protected automation state. Their owning workflows may refresh them, but generic branch cleanup must not delete them. Mirror inbox branches are separately protected inside Mirror-DataNest.


## GUARDIAN healing relationship

GUARDIAN may invoke the existing Branch Cleaner in `--git-only-safe-apply` mode and the existing Workflow Reviewer in byte-safe `--apply` mode. It does not introduce an independent destructive cleaner. Branches with unique/unknown history, open pull requests, protected status, or unresolved lineage are retained. Behavioral duplicate-code removal remains a reviewed optimization candidate rather than autonomous deletion.

CONDUCTOR may dispatch these existing safe maintenance paths only when SUGGESTER emits the matching allowlisted command and timing/dependency conditions permit it.
