# Resonance Open Nova v1.2 — First Real App Cutover Framework

## Purpose

v1.2 closes the gap between **migration readiness** and **evidence-backed local cutover**. It does not claim that `reson8.life` has been migrated; it provides the machinery that must be run against the real source before such a claim is allowed.

## Governed cutover flow

`Real Source → Baseline → Rollback Checkpoint → Provider Remediation → Offline Supply Chain → Local Services → Isolated Regression → Loopback Preview → Local Cutover Certification`

Production deployment is outside this automatic flow and remains a separately approved high-impact action.

## New controller-owned evidence

Cutover evidence is stored under `runtime/cutover/<app-id>/` and protected by governance. Generated applications and coding agents cannot modify this path.

Evidence types:

- `baselines/` — source-tree fingerprints, dependency/security state, adapter and migration inventory.
- `checkpoints/` — verified local export references that can serve as rollback material.
- `regressions/` — isolated regression results executed against a disposable app copy.
- `previews/` — loopback-only preview reachability evidence.
- `certifications/` — local cutover readiness decisions with blockers.

## Cutover gates

A local cutover certification requires all critical gates to pass:

1. real managed source present;
2. current source baseline recorded;
3. dependency policy passed;
4. exact/offline dependency inventory;
5. local artifact cache complete;
6. static security scan passed;
7. SBOM/source integrity valid;
8. provider-neutral service bindings present;
9. provider adapter assessment has no blockers;
10. database migration plan has no blockers;
11. executable regression target declared;
12. verified rollback checkpoint exists;
13. isolated regression passed for the current source fingerprint;
14. loopback preview verified;
15. local service fabric healthy;
16. sovereign backend runtime healthy.

A numerical score cannot override these gates.

## Regression isolation

Regression tasks run only through the existing governed isolated runner. v1.2 copies the managed app to a disposable `apps/.cutover-scratch-*` directory and mounts that copy into the container. The managed source is fingerprinted before and after the run and must remain unchanged.

The runner remains network-denied and `--pull=never`.

## Preview verification

Open Nova does not launch migrated applications automatically. An operator starts the local preview and supplies its URL. v1.2 accepts only `http://127.0.0.1:<governed-port>` or `http://localhost:<governed-port>` and performs a direct loopback probe without following redirects.

## Production boundary

`cutover.production_cutover_allowed` is `false` in v1.2. No v1.2 endpoint deploys publicly, changes DNS, switches production traffic, or deletes the previous system.
