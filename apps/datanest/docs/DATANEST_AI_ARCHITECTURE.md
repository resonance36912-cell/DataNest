# DataNest AI Architecture

## Authority

DataNest is the durable intelligence authority. Its identity and organizational knowledge must not depend on a specific model, workstation, inference host, or backup provider.

## Critical path

1. DataNest web application
2. Supabase authentication and governed project data
3. Certified DataNest memory and learning/certification pipeline
4. DataNest AI Edge Function and policy controls
5. An approved OpenAI-compatible inference endpoint when generative inference is required

If no external inference endpoint is available, DataNest remains operational and fails safely to its existing embedded capabilities.

## Optional infrastructure

### Ealiophin

Ealiophin is an optional sovereign compute node. It may provide local inference, media processing, private workloads, development services, or failover capacity. It is never required for DataNest availability.

### Dropbox

Dropbox is a backup and evidence mirror. It may represent snapshots produced by Ealiophin or other nodes, but it does not become source authority, runtime authority, or an inference dependency.

## Portability rule

The shared AI configuration is endpoint-based rather than machine-based. A compatible inference endpoint can move between Ealiophin, another local node, a private GPU server, or approved hosted infrastructure without changing DataNest memory or user identity.

## Learning rule

User interactions are provisional. Cross-user knowledge becomes reusable only after the governed DataNest validation and certification process promotes it into certified memory.


## Bootstrap inference profile

As of 2026-09-28, the preferred zero-dedicated-GPU bootstrap route is Cloudflare Workers AI through its OpenAI-compatible Chat Completions API.

- Bootstrap model: `@cf/nvidia/nemotron-3-120b-a12b`
- Provider host: `api.cloudflare.com`
- Provider type inside DataNest: `openai_compatible`
- DataNest identity and certified memory remain independent of this provider and model.
- The provider may be replaced when a stronger, cheaper, more private, or more sovereign approved endpoint is available.
- No Cloudflare account identifier or credential is committed to source control.
- High-sensitivity and local-only workloads should remain on an appropriately approved private/local route rather than being assumed safe for hosted inference.

The production provider-domain allowlist includes `api.cloudflare.com`; activation still requires a valid account-specific endpoint and server-side credential.

## Collective Memory and Verified Memory

DataNest separates collective learning from trusted operational memory.

- **Collective Knowledge Pool** is the governed discovery layer formed from eligible human, AI companion, and document evidence. Trends and learning candidates may emerge here, but collective repetition alone is not authority.
- **Verified/Certified Memory** is the operational trust layer. Only knowledge that passes the required evidence, validation, stress, authority, and promotion gates becomes reusable project memory.
- **ILM-1** consumes Certified Memory; it does not treat raw collective evidence as authoritative memory.

Certified Memory retrieval uses the `verified-memory-ranked-v1` strategy. The runtime ranks applicable active memory using task relevance, certification confidence, applicability specificity, and verification freshness instead of relying only on promotion recency.

Certified Memory may declare applicability for product scopes, purposes, jurisdictions, and visibility classes, plus validity and review dates. Existing memories with no applicability metadata remain project-wide for backwards compatibility.

Before a newly certified candidate is promoted, DataNest compares it with active Certified Memory in the same category. Near-duplicates are held back to prevent memory pollution, while deterministic contradiction hints require explicit Owner supersession. Supersession creates a durable memory relationship rather than deleting history.



### Product-specific Verified Memory projections

Certified Memory remains one governed project knowledge base, but products consume it through versioned retrieval projections rather than receiving an undifferentiated copy.

The default projections are:

- `datanest_ai`: project-wide governed baseline, up to 24 selected memories.
- `development_command`: Certified Memory baseline plus separate Development Command working memory; minimum confidence 0.50.
- `legal_eagle`: matter-scoped retrieval, minimum confidence 0.70, maximum 16 selected memories, and jurisdiction context is mandatory.

Projection profiles can allow or exclude categories, set minimum confidence, cap selected items, require jurisdiction, and decide whether unscoped project memory remains eligible. Owner/Admin changes create a new projection version and supersede the prior active version; they do not rewrite Certified Memory.

The runtime records the projection key and version in Verified Memory usage receipts. This keeps the distinction explicit: **Certified Memory is the governed source of truth; a projection is a product-specific view of that truth.** Deployment keeps a safe fallback to the prior ranked-memory path if the projection-aware RPC has not yet reached an environment.

### Memory Usage Receipts

Every new governed AI execution records a Verified Memory usage receipt for the selected context. The receipt stores the retrieval strategy, task scope, aggregate active/applicable/selected/review-due counts, selected Certified Memory IDs, trace identity, and a SHA-256 hash of the retrieval query. It deliberately does not store the raw prompt or private reasoning.

These receipts let Intelligence Fabric answer which governed memory objects influenced a request without exposing chain-of-thought. Receipt creation is service-only and idempotent per project trace. Project members can inspect the receipt evidence through the existing Intelligence Fabric workspace.


## Memory, learning and language standards

The [memory and language control baseline](MEMORY_LEARNING_LANGUAGE_STANDARDS.md) maps ISO and open standards to implementation evidence, required controls, multilingual evaluation gates and outstanding gaps. All three reasoning modes include the shared `memory-language-v1` policy. This is partial standards alignment, not assessed ISO conformity or demonstrated multilingual learning parity.

### Verified Memory review lifecycle

Certification establishes that a memory passed the governed evidence and authority gates at a point in time; it does not assert that the knowledge is timeless. Active Certified Memory therefore receives a category-based review schedule. Security, authorization, destructive, and legal knowledge use shorter default horizons than architecture, governance, workflow, and general knowledge.

When `review_after` is reached, the memory remains historically **CERTIFIED** but becomes **REVIEW DUE**. Ranked retrieval applies a review factor so overdue memory is less likely to dominate newer, equally relevant verified knowledge. It is not silently deleted or relabeled as uncertified.

Owner and Admin reviewers can reaffirm review-due memory after human review. Reaffirmation updates `last_verified_at`, schedules the next review, and writes an append-only `certified_memory_reviews` audit record. Only an Owner can retire an active Certified Memory object. Retirement removes it from active retrieval without deleting its provenance or prior review history.

## Verified Memory outcome evidence

Verified Memory usage can generate governed outcome evidence without creating a self-reinforcing truth loop.

- Outcome evidence must reference an exact Certified Memory usage receipt and a memory that was actually selected by that receipt.
- Supported, neutral, and unknown outcomes are audit evidence only. They do not raise confidence, change certification class, or refresh verification dates automatically.
- Challenged or contradicted outcomes may accelerate the memory's governed review date, but they do not silently decertify, rewrite, or retire the memory.
- Owner/Admin actors may record outcome evidence through the certification gateway. Reaffirmation, retirement, supersession, and certification remain separate governed actions.
- Outcome evidence remains append-only so reviewers can see how operational experience accumulated around a memory over time.

This preserves the separation between **use**, **observed outcome**, **review**, and **authority**: successful use is not proof of truth, while adverse evidence is strong enough to trigger scrutiny.
