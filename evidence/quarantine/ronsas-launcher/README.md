# RONSAS launcher PID-0 candidate

Captured 2026-10-04 during canonical consolidation.

The canonical working tree received an uncommitted delta to `platform/ronsas/ops/ealiophin/cluster/START-RONSAS-ECOSYSTEM.ps1` that added Windows PID-0 listener resolution and post-start identity verification. The original RONSAS source checkout did not contain this delta.

Disposition:
- PowerShell syntax parse: passed.
- Patch applies cleanly to the canonical source checkpoint.
- Patch SHA-256: `6AE92A9E686849D3F710FE94BC787D8A4EB832162AAEE097CD1240FAA0850741`.
- Not promoted to canonical runtime authority pending dedicated behavior tests and human review.
- Canonical source file was restored to audited `HEAD`; original source repositories were not modified.
