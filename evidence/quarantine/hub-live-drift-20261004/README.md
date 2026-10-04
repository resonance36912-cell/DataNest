# Hub live working-tree drift quarantine

Captured during canonical consolidation on 2026-10-04.

A concurrent/local sync copied the current dirty `resonance-hub` working tree into `apps/hub`. Hash comparison confirmed the canonical working copies matched the live Ealiophin Hub working tree byte-for-byte for the observed changed/untracked Hub paths.

Disposition:
- Tracked drift preserved in `tracked.patch` (SHA-256 `83B14E16E35221DDAA45240B66C8C43E474A840B7C239E81237F5B7070FA146E`).
- `_syncvision_fix_sitemap.py` preserved with SHA-256 `47226F2A0580C1ED20CD9602A573813A196F7BA1F4427E5B54EEEA9E9E23143A`.
- `github-read-cache.server.ts` preserved with SHA-256 `B94B42F6BBC5C8BDC706C7ED847ED77F3E84947142A8837660223E44112880A2`.
- Drift was not promoted to canonical runtime authority because it overlaps newer reviewed Hub governance/product work and includes provider-specific GitHub behavior.
- The full recovery line is also retained as `quarantine/hub-recovery-ealiophin-20261004`.
