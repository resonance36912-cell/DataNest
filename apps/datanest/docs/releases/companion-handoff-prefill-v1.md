# Resonance DataNest — companion-handoff-prefill-v1

Baseline: reload-latest-v1 at 592149b0898f6703b28e9fa33e73bd0799cae3fd.

This release makes the external ChatGPT companion launch **send-ready** while preserving DataNest project traceability.

## ChatGPT companion behavior

- DataNest creates the tracked external-AI session first.
- The launch RPC returns a server-generated trace key such as `DN-JOB-00009-…`.
- The handoff prompt contains:
  - Resonance DataNest project name and project ID;
  - human-readable Job Manifest code;
  - database Job ID;
  - DataNest external-AI session ID;
  - trace key;
  - provider;
  - current Job Manifest context, acceptance criteria, R&D update, and suggestion queue.
- ChatGPT is opened with the handoff in its `prompt` URL parameter so the composer is populated and the stakeholder only needs to review and click **Send**.
- The same full prompt is copied to the clipboard as a fallback because ChatGPT's URL-prefill behavior is not a documented stable integration contract.
- DataNest shows Job, Job ID, trace key, and session ID in the companion panel.
- The prompt asks the external AI to preserve the trace key in the first response line.
- Session launch still creates no contribution points; imported output remains reported/unscored pending independent review.

## Server-side trace

`external_ai_sessions.context_snapshot` records `trace_key` and `prompt_delivery`. Companion ChatGPT launches use `prompt_delivery=url_prefill`.
