# Resonance Security Execution

Resonance Security Execution is the repository-owned security execution layer for DataNest.

## Purpose

It removes dependency on paid or externally licensed secret-scanning execution.

The execution profile is **not** a legal software license. It is an internal capability contract that states which security execution guarantees the canonical repository requires.

## Guarantees

- No external scanning license or license secret is required.
- No network access is required by the secret scanner.
- Node.js and Git are the only runtime prerequisites.
- Current tracked text files are scanned.
- Reachable Git history is scanned when history scanning is enabled.
- SARIF 2.1.0 evidence is produced.
- Secret values are redacted from findings and logs.
- Detection is fail-closed.
- The scanner grants no canonical mutation, merge, or production deployment authority.

## Execution profile

\`config/resonance-security-execution-v1.json\`

The profile records repository ownership, runtime prerequisites, external licensing state, reliability guarantees, and non-authority constraints.

## Scanner

\`scripts/resonance-secret-scan.mjs\`

The scanner is dependency-light and repository-owned. It uses Node.js, Git, and deterministic detectors for high-confidence credential forms plus contextual secret assignments.

## CI contract

\`.github/workflows/security-scan.yml\` runs:

1. the execution-profile verification;
2. the scanner self-test;
3. the repository-owned Resonance Secret Integrity scan;
4. SARIF artifact upload;
5. the existing project security invariants;
6. the existing dependency and Semgrep security gates.

The CI gate fails when the scanner cannot execute or produces any error-level secret finding.

## Licensing boundary

The repository does not require \`GITLEAKS_LICENSE\`, a Gitleaks account, or a paid scanner entitlement.

Resonance Security Execution removes the external licensing dependency that previously made the secret-scan gate vulnerable to third-party license availability and GitHub installation API rate-limit behavior.

## Authority boundary

This system is security validation and evidence only. It does not grant:

- canonical-main mutation authority;
- pull-request approval or merge authority;
- production deployment authorization;
- production secret handling authority.
