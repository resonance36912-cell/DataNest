# Resonance AiPI Core v0.1

Resonance AiPI is the governed AI API boundary for DataNest. It exposes a stable API surface to Resonance applications while keeping provider credentials and provider-specific behavior on the server side.

## v0.1 surface

- `GET /api/aipi/v1/health` — public service health metadata.
- `GET /api/aipi/v1/models` — authenticated, project-scoped allowlisted model registry.
- `POST /api/aipi/v1/ai/chat` — authenticated, project-scoped chat completion.

The public contract is documented in `openapi.yaml`.

## Security and governance

AiPI Core v0.1 is fail-closed:

1. Authenticated endpoints require `Authorization: Bearer <AiPI key>` plus `x-resonance-project`.
2. Gateway credentials are bound to explicit projects through server-side `AIPI_PROJECT_KEYS`; a key configured for one project cannot claim another project.
3. Models are restricted by `AIPI_ALLOWED_MODELS`, with `DATANEST_SHARED_AI_MODEL` as the migration-compatible fallback.
4. Provider endpoints require HTTPS, an exact configured hostname, no URL credentials, and port 443 when an explicit port is supplied.
5. Provider requests disable redirects and use a 30-second timeout.
6. Request bodies are limited to 256 KiB, individual messages to 32,000 characters, and chat histories to 100 messages.
7. Audit events include request ID, project, policy, model, outcome, and duration. They intentionally exclude prompts, message bodies, bearer tokens, and provider secrets.
8. Responses use `Cache-Control: no-store` and chat responses expose `X-AiPI-Request-Id` for evidence correlation.

The upstream adapter supports OpenAI-compatible chat-completion endpoints without tying the AiPI contract to a specific provider. Existing DataNest shared-provider environment variables remain supported as fallback configuration, allowing AiPI to sit in front of the current provider path during migration.

## Runtime configuration

Required for authenticated access:

```text
AIPI_PROJECT_KEYS=resonance-demo=<gateway-key-current>,resonance-demo=<gateway-key-next>
```

Each entry is `<project>=<key>`. Repeat a project to rotate credentials without an outage. A key may be repeated for multiple projects only when that cross-project access is deliberate.

Recommended explicit AiPI provider configuration:

```text
AIPI_ALLOWED_MODELS=<model-a,model-b>
AIPI_UPSTREAM_URL=https://ai.example.com/v1/chat/completions
AIPI_UPSTREAM_HOST=ai.example.com
AIPI_UPSTREAM_API_KEY=<server-side-provider-key>
```

If the `AIPI_UPSTREAM_*` variables are absent, the gateway can use the corresponding existing `DATANEST_SHARED_AI_*` values. Provider secrets must never use `NEXT_PUBLIC_*` variables.

## Example

```bash
curl -sS https://<datanest-host>/api/aipi/v1/ai/chat \
  -H 'Authorization: Bearer <project-scoped-aipi-key>' \
  -H 'x-resonance-project: resonance-demo' \
  -H 'content-type: application/json' \
  --data '{"model":"<allowed-model>","messages":[{"role":"user","content":"Summarize the current certified evidence."}]}'
```

## Governance lifecycle

AiPI changes follow the normal DataNest path: feature branch / Mirror validation -> automated validation and Audit Optimizer evidence -> human review -> protected `main` -> certified deployment.

Core v0.1 deliberately does not expose DataNest data-query, tool-execution, agent-execution, or audit-read endpoints yet. Those capabilities require explicit authorization contracts and persistent evidence sinks before they are safe to expose.
