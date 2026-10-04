# DataNest AI · Cloudflare Workers AI bootstrap

Status date: 2026-09-28

## Purpose

This is the preferred bootstrap route for shared DataNest generative inference when no private GPU endpoint is available. It does not make Cloudflare part of DataNest identity, memory, source authority, or continuity authority.

## Selected model

`@cf/nvidia/nemotron-3-120b-a12b`

The model is used through Cloudflare Workers AI's OpenAI-compatible Chat Completions endpoint. Model selection is operational and replaceable.

## DataNest configuration

The DataNest AI Edge Function expects:

```env
DATANEST_SHARED_AI_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1/chat/completions
DATANEST_SHARED_AI_HOST=api.cloudflare.com
DATANEST_SHARED_AI_MODEL=@cf/nvidia/nemotron-3-120b-a12b
DATANEST_SHARED_AI_SECRET=<server-side API token>
DATANEST_SHARED_AI_LABEL=DataNest Open AI · Nemotron 3 Super
```

The token must never be committed to GitHub or written to Dropbox evidence in plaintext.

## Current production readiness

- Shared-provider resolver: deployed
- Provider host allowlist: `api.cloudflare.com` active
- Project AI budget: permits `openai_compatible` and wildcard model IDs
- Founder Baseline/certified memory: independent of provider
- Provider account ID: intentionally not stored in repository
- Provider secret: intentionally not stored in repository

## Activation boundary

A valid Cloudflare account ID and a scoped Workers AI API token are required before generative inference can be activated. Until both exist, DataNest remains operational and uses its governed embedded fallback.

## Portability

The same DataNest variables can later point to another OpenAI-compatible endpoint. No migration of certified memory is required.
