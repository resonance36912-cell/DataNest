# Zero-Credit Mode v0.8 — Sovereign Adapter & Migration Engine

## Purpose

v0.8 moves Open Nova from detecting hosted-provider dependencies to preparing governed, reversible source cutovers onto the local Sovereign Service Fabric.

## Flow

`Managed App → Provider Scan → Capability Map → Schema/Auth/Storage Plan → Service Bindings → Provider-Neutral Adapters → Confirmed Source Cutover → Verification → Build/Test → Commit`

## Safety model

- External AI is not required.
- Provider-specific operations are scanned before changes are allowed.
- Ambiguous operations are blockers, never guessed translations.
- Destructive SQL is a human-approval blocker.
- Adapter generation does not rewrite source.
- Source cutover requires explicit confirmation.
- Every rewritten file is backed up beneath protected `runtime/migrations/` and hashed before/after.
- Rollback refuses to overwrite files changed after the migration.
- `.open-nova` and `open-nova-adapters` are controller-owned protected path segments.

## Initial deterministic compatibility surface

The v0.8 automatic rewrite path supports common `@supabase/supabase-js` `createClient` imports and maps a constrained database/auth/storage API subset onto the provider-neutral local gateway contract.

Unsupported or ambiguous operations such as Supabase RPC/functions/realtime, Firebase functional APIs, and direct OpenAI/Anthropic SDK calls are surfaced for remediation rather than silently altered.

## Provider-neutral local contract

The contract is defined in `governance/provider-neutral-api.yaml` and targets loopback/local service-fabric routes for:

- database queries
- authentication/session operations
- object storage
- local AI chat

The contract is intentionally implementation-neutral so local services can be replaced without requiring generated applications to be rewritten again.

## Cutover readiness

A cutover can only be marked ready when:

1. the application has local service bindings;
2. controller-owned adapters and migration evidence exist;
3. supported provider imports have been replaced;
4. no unsupported provider operations remain; and
5. no destructive schema migration is being silently introduced.

Build/test certification remains a separate governed gate using the existing isolated runner and build-cycle APIs.
