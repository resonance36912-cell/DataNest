# DataNest Production Inclusion Contract

**Contract:** production-inclusion-v1  
**Authority:** `DataNest-Supository/DataNest:main`  
**Delivery:** GitHub Pages + production Supabase services
**Authority model:** peer production surfaces

## Intent

DataNest production is inclusive by default: every approved production-capable public surface, governed external production target, and production-support component is represented in the canonical release contract. A surface cannot be silently omitted from production verification after it has been approved as production-capable.

Production inclusion does **not** grant production authority to staging, automation, or candidate branches. Mirror-DataNest is an explicit exception: its `/Mirror-DataNest/` surface is production-authoritative within its own isolated runtime and does not gain authority over `/DataNest/`.

## Inclusive public production set

- DataNest control plane — `/DataNest/`
- Mirror-DataNest production surface — `/Mirror-DataNest/` (independent peer production authority)
- Independent Regulatory Assurance & Audit Services — `/DataNest/assurance/`
- Career Compass — `/DataNest/apps/career-compass/`
- Creative Studio — `/DataNest/apps/creative-studio/`
- ePublisher — `/DataNest/apps/epublisher/`
- LyricSync Studio — `/DataNest/apps/lyricsync-studio/`
- Scene Song Spark — `/DataNest/apps/scene-song-spark/`
- Sovereign Forge — `/DataNest/apps/sovereign-forge/`
- SyncVision — `/DataNest/apps/syncvision/`
- YouTube Optimizer — governed external production target at `https://youtubeoptimizer.life/`

## Production-support components

- RONSAS Sovereign Backend
- RONSAS Shared packages
- Production Supabase database, storage, auth, and governed Edge Functions
- GitHub source, CI, release evidence, and deployment workflows
- Dropbox governed backup/recovery artifacts

## Explicitly non-production-authoritative

- DataNest AI Staging when used outside the Mirror production contract
- FREETREE
- `automation/*` branches
- `mirror-promotion/*` branches
- local workstations and local controlled-test runtimes

The canonical `/DataNest/` surface remains DataNest `main` plus its authorized production release workflow. The Mirror `/Mirror-DataNest/` surface is independently production-authoritative through Mirror `main` plus its own production release workflow. Neither surface may silently deploy or overwrite the other.

## Release enforcement

A **progressive-live** release may deploy when the workflow is manually dispatched and the automated technical deployment path succeeds. Human review and asynchronous evidence are tracked as non-blocking assurance gaps with proposed remedy deadlines.

The progressive-live release must:

1. Bind to an exact SHA reachable from `main`.
2. Carry verified database and Edge Function attestations.
3. Carry the required Mirror, certification, audit, security, RONSAS, governance, legal, and human authorization evidence.
4. Build all DataNest-hosted RONSAS Pages apps.
5. Verify every inclusive public surface after deployment.
6. Verify the governed external YouTube Optimizer target.
7. Publish a release manifest whose `productionInclusion.inclusive` value is `true`.
8. Preserve the lawful boundary of the Assurance service: independent private assurance/oversight, not statutory regulator authority or unauthorized surveillance.

## Supabase connector-attested Edge release

When the repository does not hold a Supabase Management API access token, DataNest may use the authenticated Supabase connector as a free production deployment authority. This path is not a bypass: it must deploy from an exact canonical source commit and record a machine-readable `edge-function-connector-attestation-v1` containing the live function versions, deployment digests, ACTIVE/JWT state, a non-empty connector evidence reference, and a SHA-256 source-tree fingerprint.

`sourceTreeSha256` is the SHA-256 fingerprint of the canonical Git-tracked `supabase/functions` tree, computed from sorted Git tree entries containing mode, object type, Git blob SHA, and relative path. This binds the attestation to the complete versioned source tree without copying Edge Function source into the attestation artifact.

The Pages release derives `connector:<source-sha>` from the attestation's own `sourceCommit`; it does not substitute the Pages release SHA for the actual connector deployment source commit.

The Pages release accepts the connector reference only when:
- the connector deployment source commit is an ancestor of the Pages release SHA;
- no `supabase/functions` source changes exist between the connector source commit and the Pages release SHA;
- the complete Edge source-tree fingerprint matches the Pages checkout;
- all eight governed production functions are present, ACTIVE, JWT-protected, versioned, and digest-attested; and
- the attestation carries a non-empty `connectorEvidenceRef`.

The existing GitHub-token production Edge release remains supported when `SUPABASE_ACCESS_TOKEN` is configured.
