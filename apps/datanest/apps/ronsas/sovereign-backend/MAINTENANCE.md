# Backend maintenance

## Change flow

1. Synchronize a clean `main`.
2. Create a focused `ronsas/*` branch.
3. Add or update tests with every behavior/schema change.
4. Run the full backend test set locally.
5. Open a pull request and require CI.
6. Build new versioned service images.
7. Apply migrations and deploy first to the isolated RONSAS staging project.
8. Run health, schema, auth, billing, recovery, and canary checks.
9. Promote to the live backend only after evidence is clean.
10. Record promoted versions in the RONSAS control repository.

## Invariants

- Never commit secret values, runtime databases, volumes, auth state, or storage objects.
- Never reuse production secrets in staging.
- Database migrations are ordered, transactional where possible, and forward-compatible.
- Protected billing/governance writes must use named gateway procedures rather than raw table writes.
- Public or spoke services may never receive the gateway procedure key.
- Destructive tests run only against isolated staging volumes.
- Maintain loopback-only service listeners unless a separately reviewed network design says otherwise.
