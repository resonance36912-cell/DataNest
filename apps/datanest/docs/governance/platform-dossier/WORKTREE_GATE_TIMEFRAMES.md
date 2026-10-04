# DataNest AI Worktree Gate Timeframes

## Policy

Every active workflow gate in `.github/workflows` uses one shared DataNest AI timeframe model.

The model separates two fundamentally different concepts:

1. **Machine execution ETA** — how long an automated validation/enforcement/evidence job is expected to take.
2. **Human follow-up or evidence window** — a realistic planning window for review, triage, reporting, approval, or operational response when human action is needed.

This prevents a 20–30 minute automated check from being misrepresented as a 24-hour gate.

## Human-response planning assumptions

| Domain | Typical | Planning range |
| --- | ---: | ---: |
| Owner/operator | 4h | 1–12h |
| Engineering/code review | 8h | 4–24h |
| Security review/triage | 12h | 8–24h |
| Visual/UX review | 8h | 4–24h |
| Governance-impact review | 12h | 8–24h |
| Legal review | 24h | 12–48h |
| External/independent review | 24h | 12–48h |
| Operations/deployment review | 8h | 4–24h |

These are planning heuristics, not SLAs or guarantees. They must be recalibrated from observed DataNest run durations and actual reviewer-response timestamps as evidence accumulates.

## Complexity inputs

Task complexity adds planning effort:

- routine: +2h
- standard: +6h
- complex: +12h
- cross-system: +18h

Reporting complexity:

- summary: +2h
- standard: +4h
- detailed: +8h
- audit-grade: +12h

For multiple human domains, +6h coordination overhead is added for each domain beyond the first.

Changed-file scope can escalate task complexity:

- 0–3 files: profile baseline
- 4–10 files: at least standard
- 11–30 files: at least complex
- 31+ files: cross-system

## Gate classes

**Manual mutation gates** use the human window as the primary planning window and permit a bounded Owner override:

- Branch Cleaner
- DataNest File Worker Deploy
- Pages Production

Owner override range remains **0.5–72 hours**, is never treated as approval, and records the delta from the AI recommendation.

**Automated gates** run immediately and publish a machine ETA plus a separate human follow-up window only if intervention/review is needed:

- CI
- PR Verification
- Security Scan
- RONSAS Application Validation
- DataNest AI Certification
- Edge Function Validation
- Migration Replay Validation
- UI Test Mode
- Owner Test Mode Expiry
- Workflow Reviewer & Code Cleaner

## Evidence

Every workflow run emits a `worktree-gate-timeframe-<gate>-<run>` artifact and a GitHub step-summary entry containing:

- gate identity and class;
- measured changed-file scope;
- task/reporting complexity;
- machine ETA;
- human response assumptions;
- coordination, task and reporting contributions;
- human follow-up recommendation;
- manual accepted window and Owner override delta when applicable;
- model/schema version;
- generation timestamp and calibration disclaimer.

The timeframe system does **not** waive an approval, convert a failed check into a pass, or grant AI authority to merge/deploy/ratify. It only proposes and records realistic operational timing.
