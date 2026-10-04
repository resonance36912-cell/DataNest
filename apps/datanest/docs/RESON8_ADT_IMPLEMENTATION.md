# Reson8 ADT (App Dev Tools) — implementation baseline

Job Manifest: JOB-00010 · Reson8 ADT (App Dev Tools)
Project: Resonance DataNest
Project ID: c2aa30c1-fc82-4524-8510-021ac0fef967
Job ID: f9024133-c185-4a29-a52c-0ce7412fd1d9
External AI Session: af7c9a6d-f399-405e-8fb6-c9fd27a67410
Trace Key: DN-JOB-00010-af7c9a6df399

## Decision / recommendation

Implement Reson8 ADT as a capability adapter layer inside DataNest rather than as a new hosting/runtime authority.

The first executable slice is repository-first and provider-neutral:

1. Repository operations remain GitHub-governed.
2. CMD/PowerShell helpers provide explicit local developer commands.
3. Browser automation is an adapter target, not a credential store or autonomous authority.
4. External AI chat remains BYO-account and uses the existing tracked companion/import flow.
5. Codex-style development functions are bounded repository operations.
6. Remote desktop is represented by a governed connection descriptor and launch handoff; autonomous interactive remote control is deliberately not enabled by this baseline.

This preserves the existing DataNest authority model: GitHub is source/CI/evidence authority, Supabase is backend/auth authority, and GitHub Pages is the public delivery target.

## Smallest executable steps

| Step | Capability | Output | Gate |
|---|---|---|---|
| 1 | repository | ADT capability contract + tests | npm run check, npm test |
| 2 | command_runner | Windows developer launcher for check/build/dev | local explicit invocation |
| 3 | ai_chatbot | reuse External AI Sidebar + tracked handoff | browser test |
| 4 | browser_runtime | adapter contract for an approved browser runner | browser smoke test |
| 5 | codex_functions | bounded repository function set | unit/source tests |
| 6 | desktop_connection | governed launch descriptor only | authority/security test |
| 7 | evidence | implementation manifest + test results artifact | DataNest import |

## Capability contract

The ADT contract is defined in src/lib/reson8Adt.ts.

### Free baseline

- GitHub repository access.
- Local CMD/PowerShell developer scripts.
- User-account external AI chatbot collaboration.
- Bounded repository-oriented development functions.
- Browser automation through an approved free/local or externally provided runtime where available.

### Explicitly governed

Remote desktop must not be implemented as an unrestricted remote-control channel. ADT can prepare the target, connection metadata and launch handoff, but an interactive remote-control operation must execute through a separately governed runtime with explicit authority.

## Dependencies

- Existing GitHub repository DataNest-Supository/DataNest.
- Existing ExternalAiSidebar and datanest-ai-intake workflow.
- Existing resourceFabric and executionAuthority policy vocabulary.
- Node 22 / npm, Next.js 15 and TypeScript 5.9 from the current project.
- A browser automation runtime for actual cloud-browser execution.
- A separately governed desktop connection runtime if remote desktop is later activated.

No new database, hosting provider, or AI provider is required for the first slice.

## Owner decisions still required

1. Which browser runtime is approved for production execution (local browser, managed cloud browser, or another governed adapter).
2. Which remote-desktop protocol/provider is approved; do not commit credentials or connection secrets to Git.
3. Which Codex/development functions are allowed at A2 (prepare) versus A3 (execute).
4. Whether free-tier provider limits are acceptable for the intended workload.

## Risks / mitigations

- Credential exposure: store provider credentials outside source control; ADT stores references/descriptors, not secrets.
- Unbounded execution: keep command and desktop capabilities behind explicit execution boundaries.
- Provider lock-in: keep browser/AI adapters provider-neutral.
- Framing restrictions: do not bypass iframe or provider security; use companion/pop-out flows.
- Data leakage: external AI results remain UNCERTIFIED and are not promoted automatically into Certified Memory.
- False capability claims: mark cloud-browser and remote-desktop availability according to observed adapter state, never merely declared configuration.

## Validation / acceptance checks

### Required checks

1. npm run check passes.
2. npm test passes.
3. npm run test:browser:datanest-ai passes for the existing external AI collaboration flow.
4. The ADT capability contract test confirms all six required capabilities.
5. Desktop connection tests confirm autonomous interactive remote control is disabled by default.
6. The implementation artifact records commit/CI evidence before the Job Manifest is marked complete.

### Evidence

The minimum evidence bundle is:

- source commit SHA;
- CI workflow run/result;
- unit-test result;
- browser-test result;
- implementation manifest;
- any external adapter health/availability observation.

No acceptance claim should be made from source inspection alone.
