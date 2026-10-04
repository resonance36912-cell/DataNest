# Owner Live Test Mode — AI Timeframe Proposal Model

## Purpose

DataNest AI proposes a bounded live evidence-gathering window for Owner Test Mode based on:

- task complexity;
- reporting complexity;
- which human review domains are still pending;
- coordination overhead between multiple reviewers; and
- realistic planning assumptions for human response latency.

The proposal is advisory but auditable. The Owner may accept the recommendation or explicitly override it within the hard 30-minute to 72-hour safety window.

## Planning assumptions

These are operational planning heuristics, not promises or service-level agreements:

| Review domain | Typical planning response | Planning range |
| --- | ---: | ---: |
| Governance-impact review | 12 hours | 8–24 hours |
| Legal review | 24 hours | 12–48 hours |
| External / independent review | 24 hours | 12–48 hours |

The model assumes reviewers may work in parallel. It uses the slowest pending review baseline, then adds coordination overhead when multiple review domains remain.

## Complexity contributions

Task complexity:

- routine: +2 hours
- standard: +6 hours
- complex: +12 hours
- cross-system: +18 hours

Reporting complexity:

- summary: +2 hours
- standard: +4 hours
- detailed: +8 hours
- audit-grade: +12 hours

Coordination overhead:

- +6 hours for each pending review domain beyond the first.

The raw estimate is rounded upward into one of these governed windows:

- 6h
- 12h
- 24h
- 36h
- 48h
- 60h
- 72h

No AI proposal can exceed the existing 72-hour Owner Test Mode maximum.

## Current governance case

A cross-system, audit-grade release with governance, legal, and external review all pending produces:

- human response baseline: 24h
- coordination overhead: 12h
- task complexity: 18h
- reporting complexity: 12h
- raw estimate: 66h
- governed recommendation: **72h**

## Evidence and calibration

Every Owner Test Mode release records:

- model version;
- complexity inputs;
- pending review domains;
- human response assumptions;
- raw and recommended duration;
- accepted duration;
- whether the Owner overrode the recommendation;
- the override delta.

As real review timestamps accumulate, these planning assumptions should be recalibrated from observed repository-specific response times. Until sufficient evidence exists, the defaults above remain conservative planning heuristics rather than empirical claims.


## Gate sequencing

Owner Live Test Mode intentionally separates **evidence generation** from **final governance closure**.

Before temporary live production begins, the release must have:

- an exact candidate SHA reachable from `main`;
- PR Verification evidence for the candidate;
- Security scan evidence for the candidate;
- RONSAS validation evidence for the candidate;
- an explicit Owner Test Mode authorization reference;
- an Owner actor whose GitHub identity matches the declared Owner login and has repository admin permission; and
- the exact confirmation `AUTHORIZE OWNER TEST MODE`.

The human visual/UX, governance-impact, legal, external/independent, and final production-authorization records may remain open while the bounded live test runs. Their default closure targets are measured from live-test start:

- human visual / UX review: within 24 hours;
- governance-impact review: within 48 hours;
- legal review: by the live-test expiry;
- external / independent review: by the live-test expiry;
- final production authorization: by the live-test expiry.

The final three deadlines can never extend past the accepted Owner Test Mode window, and the total live-test window can never exceed 72 hours.

If the required human evidence is not closed by expiry, the Owner Test Mode expiry workflow replaces the live site with a holding page. A normal production release can resume only after the complete human authorization record is supplied.

The fully authorized production path continues to use the protected `github-pages` environment. Owner Live Test Mode uses the dedicated `github-pages-owner-test-mode` environment so evidence can be gathered before human-review closure while retaining the Owner-only actor check, exact-SHA requirement, bounded expiry, and explicit test-mode confirmation.
