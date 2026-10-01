# BRANCH-X Control Matrix

| Control | Policy source | Runtime enforcement | Automated verification | Evidence / tracking | Host dependency |
|---|---|---|---|---|---|
| Canonical refs: `main`, `release/**` | `config/branch-protection.tree.json` | `.github/workflows/branch-protection-tree.yml` | BRANCH-X contract tests | `evidence/native-protection/` + tracking issue | GitHub native ruleset |
| PR + 1 approval | policy canonical class | BRANCH-X preflight | Ruleset contract test | Native audit artifact | GitHub native ruleset |
| Stale-review dismissal | policy canonical class | BRANCH-X preflight | Ruleset contract test | Native audit artifact | GitHub native ruleset |
| Conversation resolution | policy canonical class | BRANCH-X preflight | Ruleset contract test | Native audit artifact | GitHub native ruleset |
| Linear history | policy canonical class | BRANCH-X preflight | Ruleset contract test | Native audit artifact | GitHub native ruleset |
| No force-push / deletion | policy canonical + destructive operations | Canonical-write watchdog + BRANCH-X preflight | Watchdog unit test | Incident issues + audit artifact | GitHub native ruleset |
| Required status checks | policy canonical class | BRANCH-X preflight | Ruleset contract test | Native audit artifact | GitHub native ruleset |
| Protected automation branches | policy protected_automation | BRANCH-X preflight | Ruleset contract test | Native audit artifact | GitHub native ruleset |
| Canonical-write provenance | invariant: direct push forbidden | `.github/workflows/canonical-write-watchdog.yml` | `tests/unit/canonical-write-watchdog.test.mjs` | Open anomaly incidents | GitHub native protection for prevention |
| Native protection observation | enforcement model | `.github/workflows/native-protection-audit.yml` | Native audit evaluation | 90-day workflow artifact | GitHub administration read |
| Ownership governance | `.github/CODEOWNERS` + `docs/governance/OWNERSHIP.md` | CODEOWNERS review routing | GitHub pull-request mechanics | Ownership registry | GitHub account identity |
| Resonance Certification Standard | `docs/certification/RESONANCE_CERTIFICATION_STANDARD.md` | External-audit + certification database gates | Certification service contract tests + governed SQL functions | Certificate credential + audit events | Authorized human issuance decision |
| Policy-change evidence | invariant + destructive-operation contract | PR review | BRANCH-X policy validation | Governed PR history | GitHub native review enforcement |

## Current closure condition

BRANCH-X is **not host-closed** until GitHub reports the expected native rulesets active and matching the policy. Repository-native controls remain the fail-closed verification layer.

Current tracking: `DataNest-Supository/DataNest#373`.
