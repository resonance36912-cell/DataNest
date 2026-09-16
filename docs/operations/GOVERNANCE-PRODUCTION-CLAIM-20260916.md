# Governance production claim ? 2026-09-16

This record captures the verified production publication of the authenticated Resonance Governance Workspace. It records evidence only; it does not redefine repository authority or imply that unrelated RONSAS engineering gates are complete.

## Authorities

- RONSAS control `main` at stabilization verification: `1402b3a277e491d6cc25a9032abe338a649d9af6`
- Production Hub branch `ronsas/ealiophin-production`: `919338f2b7bd937ed72954aeadfe532b260487e4`
- Production URL: `https://reson8.life/governance/workspace`
- Production database project ref: `qitzhxncffcszbpsddpm`

## Database promotion

The production Supabase project was restored from its paused state and reported `ACTIVE_HEALTHY`. The migration ledger was reviewed before application. Exactly these reviewed migrations were pending and were applied successfully:

- `20260915093000_harden_rop_nonce_replay.sql`
- `20260916090000_governance_workspace_core.sql`
- `20260916114000_harden_governance_client_grants.sql`

Post-application read-only catalog checks confirmed:

- all six governance tables have RLS enabled;
- `authenticated` has `SELECT` only on governance tables;
- `anon` has no governance-table privileges;
- the six governance mutation RPCs are executable by `service_role`, not by client roles;
- each governance table has only the intended authenticated `SELECT` policy.

## Hub promotion

The production route is the Ealiophin sovereign stack, not the dormant Cloudflare Worker release path:

`Cloudflare named tunnel -> Caddy -> 127.0.0.1:4173 -> ronsas-hub-canonical`

The exact production-Hub commit `919338f2b7bd937ed72954aeadfe532b260487e4` was validated in an isolated worktree. `prebuild`, the repository test suite, TypeScript, and `build:local` all exited `0`.

The validated `.output-local` bundle contained 334 files with deterministic tree SHA-256:

`761c19bc87155387090c5be32643fbe483d0a0113cef818f95c5bedd7cbddce4`

The previous live bundle was preserved at:

`%USERPROFILE%\Resonance\OpenNova\runtime\production-edge\backups\hub-output-pre-919338f-20260916-153911`

The promoted Hub restarted under the RONSAS supervisor as PID `32176` at verification time. Caddy and one RONSAS Cloudflare named-tunnel process were present.

## Public verification

After promotion:

- local `/governance/workspace`: HTTP `200`;
- public `/governance/workspace`: HTTP `200`;
- both responses referenced the newly built governance workspace asset;
- both responses contained the `Governance Workspace` application marker;
- public response path reported Cloudflare with `via: 1.1 Caddy`;
- production route/sitemap smoke suite: `13/13` passed.

The RONSAS sovereignty guard also completed successfully after release. An unauthenticated initial HTML request exposed no proposal, review, or decision data markers; the workspace is client-rendered, so this HTML observation is not used as the sole authentication proof. Authentication and mutation authority remain enforced by the tested server boundaries and the verified production database grants/RLS described above.

## Sovereign backend stabilization

Post-release verification found that the stateful sovereign backend was healthy but the running gateway container still used the older `resonance-service-gateway:0.9` image. The compose runtime already required `resonance-service-gateway:0.10`, and the validated local `0.10` image was present. Only the stateless gateway container was recreated; Postgres, auth, storage, and their volumes were left untouched.

After recreation, the live gateway reported version `0.10.0`, all nine governance procedures were allowlisted, and the production Hub's own `callSovereignGovernanceProcedure` helper successfully returned empty proposal and participant collections through the keyed loopback gateway. Backend health reported Postgres, auth, storage, and gateway reachable with `network_scope=loopback_only`. The public workspace remained HTTP `200`, the sovereignty guard remained green, and the public route/sitemap smoke suite remained `13/13`.

Gateway image evidence at verification time:

`localhost/resonance-service-gateway:0.10`

Image ID:

`44a58cf94869b313f4cf553b2f349efa21de5a295cce51b142ea4c81533613ef`

A second non-secret stabilization receipt was written at:

`%USERPROFILE%\Resonance\OpenNova\runtime\production-edge\RONSAS-GOVERNANCE-PRODUCTION-STABILIZATION-20260916.json`

Receipt SHA-256:

`ee5e4e8fa891299fe7f0180fcaa452b7d78d3cd285fb871b8908b946425c7dac`

## Local receipt

A non-secret machine-local production receipt was written at:

`%USERPROFILE%\Resonance\OpenNova\runtime\production-edge\RONSAS-GOVERNANCE-PRODUCTION-CLAIM-20260916.json`

Receipt SHA-256:

`58dd13e1f14e5f7bc15067b9ec0f50b0cb19e1ed0ea353f1081f0cdb8f2bfd1e`

## Claim boundary

The defensible claim is limited to the Governance Workspace production publication and its verified database/application boundaries. This record does not claim completion of unrelated pending RONSAS engineering gates, does not claim a Cloudflare Worker deployment, and does not authorize destructive recovery or history rewriting.
