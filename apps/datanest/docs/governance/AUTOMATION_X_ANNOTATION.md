# Automation X Annotation

Automation X is a cross-cutting provenance annotation contract for DataNest automation.

It records what automation ran, what it acted on, what effect it declared, the exact run evidence, and the authority it explicitly does not receive.

## Non-authorizing boundary

Automation X is metadata and evidence only. It does not grant canonical-main mutation authority, pull-request approval or merge authority, production deployment authorization, or production secret handling authority.

Every annotation carries productionSource=false, canonicalChange=false, merge=false, and productionDeployment=false. Any effect other than read_only requires human review unless the workflow explicitly records a bounded review exemption.

## Contract

Schema: schemas/automation-x-annotation-v1.schema.json

Emitter: scripts/emit-automation-x-annotation.mjs

Reusable action: .github/actions/automation-x-annotation/action.yml

The emitter produces a machine-readable JSON annotation, a GitHub Actions notice, and a step-summary entry when running under GitHub Actions.

## Recommended classes

| Class | Typical action | Effect | Review |
|---|---|---|---|
| analysis | observe / recommend | read_only / proposal | proposal work should be reviewed |
| validation | validate | read_only | normally no |
| evidence | observe / validate | read_only | depends on downstream use |
| enforcement | heal / mutate | proposal / bounded_mutation | yes |
| mutation | mutate | bounded_mutation | yes |
| deployment | deploy | deployment | yes |

Automation X is provenance, not authorization.
