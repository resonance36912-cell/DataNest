# ePublisher YouTube STT 502 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable captionless YouTube evidence recovery in ePublisher by identifying and fixing the exact boundary causing persistent HTTP 502 responses.

**Architecture:** Keep the sovereign local STT service on Ealiophin at `127.0.0.1:7869` and preserve the existing same-origin `/open-nova-stt` proxy. First prove whether the 502 originates in the STT service's YouTube acquisition layer or in the proxy/edge path. Apply only the smallest root-cause fix, then verify direct STT, same-origin proxy, and the ePublisher extraction path.

**Tech Stack:** Windows PowerShell, GitHub Actions self-hosted Ealiophin runner, Python local STT service, yt-dlp, Vite proxy, ePublisher React/TypeScript.

**Spec:** GitHub issue #273, `ePublisher: diagnose YouTube STT HTTP 502`.

## Global Constraints

- Preserve sovereign/local-first operation.
- Do not expose secrets, cookies, tokens, or transcript content in diagnostics.
- Do not change evidence truthfulness rules: metadata-only records cannot become evidence without recovered text/captions.
- Do not alter billing/free-promotion policy.
- Diagnose root cause before changing runtime behavior.
- Add a failing test before any bugfix and verify all relevant tests after the fix.

## Review Focus

- STT process is healthy but yt-dlp acquisition returns a retryable 502.
- STT service is unavailable on port 7869 while the app remains reachable.
- Direct STT succeeds but the ePublisher same-origin proxy fails.
- Public proxy succeeds for health but transcription fails on a captionless YouTube source.
- Transient busy/502 handling must not misclassify persistent acquisition failures as usable evidence.

---

### Task 1: Capture the failing boundary

**Files:**
- Create: `.github/workflows/diagnose-epublisher-stt-20260922.yml`
- No production runtime files modified.

**Interfaces:**
- Consumes: `http://127.0.0.1:7869/health`, `http://127.0.0.1:3101/open-nova-stt/health`, `https://epublisher.reson8.life/open-nova-stt/health`, and direct `POST /transcribe-url`.
- Produces: a sanitized diagnostic comment on GitHub issue #273 identifying the first failing boundary and the STT error code/detail.

- [ ] **Step 1: Add a one-shot self-hosted diagnostic workflow**
- [ ] **Step 2: Push the workflow and wait for the Ealiophin runner**
- [ ] **Step 3: Read the sanitized issue receipt**
- [ ] **Step 4: State one root-cause hypothesis from the evidence**

### Task 2: Pin the root cause with a failing test

**Files:**
- Modify only the owning repository/file identified by Task 1.
- Test the exact persistent failure signature before changing implementation.

**Interfaces:**
- Consumes: Task 1's exact status/error payload.
- Produces: a reproducible failing test that would pass only when the root cause is fixed.

- [ ] **Step 1: Locate the existing closest working test/pattern**
- [ ] **Step 2: Add the smallest failing regression test**
- [ ] **Step 3: Run it and confirm the expected failure**
- [ ] **Step 4: Commit the test separately if repository policy permits**

### Task 3: Implement the minimal root-cause fix

**Files:**
- Modify only the component proven faulty by Tasks 1-2.

**Interfaces:**
- Consumes: failing regression test.
- Produces: corrected STT/proxy behavior without weakening source validation or evidence rules.

- [ ] **Step 1: Make one implementation change**
- [ ] **Step 2: Run the focused regression test**
- [ ] **Step 3: Run the related STT/ePublisher test suite**
- [ ] **Step 4: Review the diff for unrelated changes**

### Task 4: Verify end-to-end recovery

**Files:**
- Reuse or update the diagnostic workflow only if needed for verification.

**Interfaces:**
- Consumes: fixed runtime.
- Produces: evidence that direct STT and same-origin proxy both recover a captionless YouTube source, plus clean application status.

- [ ] **Step 1: Verify direct `7869` health and transcription**
- [ ] **Step 2: Verify `/open-nova-stt` health and transcription through ePublisher**
- [ ] **Step 3: Confirm the source is no longer excluded for infrastructure failure**
- [ ] **Step 4: Run broader regression checks and record the final status**
