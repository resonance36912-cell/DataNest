# Native Protection Evidence

This directory records evidence related to GitHub-native BRANCH-X protection.

## Evidence contract

A protection evidence record must identify:

- repository
- observed ref(s)
- observation timestamp
- native ruleset names and enforcement state
- target patterns
- required rule types
- required status checks
- API access result
- overall result: `protected`, `protection-gap`, or `api-access-unavailable`

The evidence must distinguish an unavailable GitHub administration read from an observed absence of protection.

## Closure rule

Native protection is considered closed only when GitHub-native rulesets are observed as active and their configuration matches `config/branch-protection.tree.json`.

Repository-native BRANCH-X workflows do not substitute for host enforcement.

The scheduled native-protection audit publishes machine-readable evidence as workflow artifacts. A future confirmed activation should be recorded here through a governed pull request; do not fabricate historical evidence.

## Current policy authority

Repository: `DataNest-Supository/DataNest`

Policy: `config/branch-protection.tree.json`

Audit workflow: `.github/workflows/native-protection-audit.yml`

Tracking issue is managed by the BRANCH-X escalation monitor.
