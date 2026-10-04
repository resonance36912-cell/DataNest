# DataNest Developer Account Coordination Protocol

> **Purpose:** provide a repository-native handoff, checkpoint, chat-lineage, synchronization, and continuation protocol for work performed across multiple ChatGPT/Codex accounts, branches, and development environments.

## 1. Read This Before Starting a Job

Every account/session working on DataNest MUST:

1. Identify the repository, branch, environment, and current HEAD SHA.
2. Read the latest applicable checkpoint in this document and any linked work artifacts.
3. Check for an active `DN:HANDOFF`, `DN:BLOCK`, `DN:FREEZE`, or `DN:CODEX-CONTINUE` state before modifying code.
4. Synchronize from the exact referenced SHA when a handoff requires synchronization.
5. Never treat a chat summary, branch name, or moving `main` reference as a substitute for an exact commit SHA.
6. Record a new checkpoint before stopping, handing off, or changing workstreams.
7. Keep technical verification separate from promotion authorization.

This protocol coordinates accounts; it does not grant production authority.

## 2. Authority Model

- `DataNest-Supository/DataNest` is the canonical production/source-of-truth repository.
- `DataNest-Supository/Mirror-DataNest` is the R&D / production-parity candidate environment.
- Mirror work may be duplicated, synchronized, verified, and prepared for promotion, but Mirror does not acquire canonical production authority.
- Promotion into canonical production remains subject to repository controls, verification, governance, and required human authorization.
- Account identity never overrides repository permissions or production controls.

## 3. Mandatory Work Identity

Use this minimum identity on every handoff:

```
[DN:WORK]
project=RESONANCE-DATANEST
repo=<owner/repo>
branch=<branch>
sha=<exact-sha>
environment=<local|staging|production>
workstream=<name>
account_role=<DN-ORIGIN|DN-MIRROR|DN-CANONICAL|DN-REVIEW|DN-PROMOTION|DN-ATTEST|DN-DOVETAIL>
```

## 4. Coordination Tags

### Handoff
```
[DN:HANDOFF]
source=<repo/branch@sha>
target=<repo/branch>
checkpoint=<checkpoint-id>
action=DUPLICATE|SYNC|DOVETAIL|VERIFY|PROMOTE
next_action=<exact-next-action>
```

### Synchronization
```
[DN:SYNC]
source=<repo/branch@sha>
target=<repo/branch>
strategy=<fast-forward|cherry-pick|merge|manual>
verify_sha=true
```

### Duplicate Without Authority Transfer
```
[DN:DUPLICATE]
source=<repo/branch@sha>
target=<repo/branch>
preserve_source=true
promotion_authority=unchanged
```

### Dovetail Development
```
[DN:DOVETAIL]
baseline=<repo/branch@sha>
continue_from=<checkpoint-id>
preserve=<invariants>
next_action=<exact-next-action>
```

### Verification
```
[DN:VERIFY]
subject=<repo/branch@sha>
environment=<environment>
tests=<status>
evidence=<identifier-or-link>
result=PASS|FAIL|PARTIAL|NOT_RUN
```

### Promotion
```
[DN:PROMOTE]
candidate=<repo/branch@sha>
target=<repo/branch>
verification=<checkpoint/evidence-id>
authorization=REQUIRED|GRANTED|NOT_GRANTED
```

### Blocking / Freeze
```
[DN:BLOCK]
reason=<reason>
resume_condition=<condition>
owner=<account-role>
```

```
[DN:FREEZE]
baseline=<repo/branch@sha>
reason=<reason>
do_not_modify=true
```

## 5. Checkpoints

A checkpoint is the authoritative resume point for interrupted or handed-off work.

```
[DN:CHECKPOINT]
checkpoint_id=<unique-id>
timestamp=<UTC>
repo=<owner/repo>
branch=<branch>
sha=<exact-sha>
environment=<environment>
state=<state>
completed=<completed work>
in_progress=<interrupted work, if any>
pending=<remaining work>
next_action=<first action for successor>
blockers=<none|...>
evidence=<evidence identifiers>
parent_checkpoint=<id|none>
chat_lineage=<chat-link-id>
```

### Last Safe Point

When work may have stopped mid-operation:

```
[DN:RESUME]
checkpoint=<checkpoint-id>
last_safe_point=<last definitely completed operation>
currently_doing=<operation at interruption>
resume_action=<first safe action>
working_sha=<sha>
uncommitted_work=<yes|no|unknown>
```

Successors MUST NOT assume an interrupted operation completed.

## 6. Chat Lineage

Chats are linked logically through repository-visible checkpoint records.

```
[DN:CHAT-LINK]
chat_link_id=<unique-id>
origin_chat=<label-or-platform-reference>
parent_chat=<label-or-platform-reference>
current_chat=<label-or-platform-reference>
workstream=<name>
checkpoint=<checkpoint-id>
repo=<owner/repo>
branch=<branch>
sha=<sha>
```

Do not put passwords, access tokens, private keys, or other secrets into chat-lineage records.

A chat link is context metadata. The checkpoint and Git SHA are the reproducible state.

## 7. Codex / Credit Exhaustion Continuation

If an account/session reaches a credit, context, or execution limit, write:

```
[DN:CODEX-CONTINUE]
trigger=CREDITS_EXHAUSTED|CONTEXT_EXHAUSTED|SESSION_ENDED|OTHER
resume_from=<checkpoint-id>
repo=<owner/repo>
branch=<branch>
sha=<exact-sha>
environment=<environment>
completed=<completed work>
pending=<remaining work>
next_action=<first action>
preserve=<invariants>
verify_before_continue=true
promotion_authority=<unchanged>
```

The next account/session MUST:

1. Locate the checkpoint.
2. Confirm repository, branch, and SHA.
3. Review linked chat/work context when available.
4. Inspect current repository state.
5. Verify that the checkpoint is still valid.
6. Resume from `next_action`.
7. Avoid repeating completed work.
8. Create a successor checkpoint when stopping again.

**Important:** these tags provide deterministic continuation instructions. They do not themselves cause ChatGPT or Codex to automatically launch another account/session when credits are exhausted. Any automatic triggering must be implemented through an external orchestration system with appropriate credentials and permissions.

## 8. State Snapshot

For high-value handoffs, include:

```
[DN:STATE-SNAPSHOT]
repo=<owner/repo>
branch=<branch>
sha=<sha>
dirty=<true|false>
environment=<environment>
last_commit=<commit-summary>
active_task=<task>
completed=<...>
pending=<...>
blockers=<...>
dependencies=<...>
tests=<status>
evidence=<...>
checkpoint=<checkpoint-id>
```

## 9. Recommended Multi-Account Lifecycle

```
ORIGIN
  ↓
CHECKPOINT
  ↓
HANDOFF
  ↓
DUPLICATE
  ↓
SYNC EXACT SHA
  ↓
DOVETAIL
  ↓
VERIFY
  ↓
CHECKPOINT
  ↓
REVIEW
  ↓
PROMOTE
  ↓
ATTEST
  ↓
FINAL CHECKPOINT
```

Never collapse `DUPLICATE` into `PROMOTE`.

## 10. Canonical Example

```
[DN:HANDOFF]
source=Mirror-DataNest/main@<candidate-sha>
target=DataNest/coordination-review
checkpoint=CP-MIRROR-<id>
action=DUPLICATE→SYNC→DOVETAIL→VERIFY
next_action=Review candidate against canonical baseline.

[DN:CHECKPOINT]
checkpoint_id=CP-MIRROR-<id>
repo=DataNest-Supository/Mirror-DataNest
branch=main
sha=<candidate-sha>
environment=staging
state=VERIFICATION_READY
completed=Mirror implementation and deployment preparation
in_progress=none
pending=Verification and promotion assessment
next_action=Run verification against exact SHA.
blockers=none
parent_checkpoint=<prior-id>
chat_lineage=CHAT-LINK-<id>

[DN:CODEX-CONTINUE]
trigger=CREDITS_EXHAUSTED
resume_from=CP-MIRROR-<id>
repo=DataNest-Supository/Mirror-DataNest
branch=main
sha=<candidate-sha>
environment=staging
next_action=Run verification against exact SHA.
verify_before_continue=true
promotion_authority=unchanged
```

## 11. Developer Workspace Convention

Repositories may maintain a `.datanest/` coordination area for machine-readable or supporting artifacts. Suggested structure:

```
.datanest/
  coordination/
    checkpoints/
    handoffs/
    state/
    chat-lineage/
```

The root `DEVELOPER_COORDINATION.md` remains the human-readable entry point.

## 12. Safety Rules

- Never copy secrets between accounts through this protocol.
- Never infer production authorization from a successful test.
- Never promote solely because another account requested promotion.
- Never overwrite a newer checkpoint with an older chat state.
- Prefer immutable SHAs over branch names.
- Preserve environment boundaries.
- When uncertain, stop at the last verified checkpoint and request review.
