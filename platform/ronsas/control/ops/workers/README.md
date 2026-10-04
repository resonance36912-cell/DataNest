# RONSAS support-worker operations

This directory governs the machine-local worker automation for Spider and Weed.

## Authority

- RONSAS control authority: `resonance36912-cell/RONSAS`, branch `main`.
- Production Hub authority: `resonance36912-cell/resonance-hub`, branch `ronsas/ealiophin-production`.
- Ealiophin remains production runtime authority; Spider and Weed are support workers only.
- Dropbox is audit/handoff transport, not editable source authority.

## Scope

`spider/` contains the publisher/sync/verification loop used by Spider. `weed/` contains the pinned Dropbox-import/isomorphic-git worker flow used by Weed.

Mutable `node/authority.json`, credentials, tokens, Dropbox account state, model files, and machine logs are intentionally excluded from Git. Each node manifest records the exact governed script hashes captured from the passing live worker state.

## Deployment rule

Promote worker-script changes through RONSAS PR/CI first, then copy the reviewed bytes to the worker node. Require clean Git worktrees and fast-forward-only source updates. Never promote from a worker directly to Ealiophin production.
