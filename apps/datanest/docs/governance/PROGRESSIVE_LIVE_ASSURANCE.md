# Progressive Live Assurance Policy

**Policy:** progressive-live-assurance-v1  
**Authority:** DataNest-Supository/DataNest  
**Purpose:** permit routine live deployment while treating human review and evidence completion as tracked assurance work rather than pre-deployment blockers.

## Operating model

DataNest supports a **progressive-live** release mode for normal operational deployment.

A progressive-live release may deploy when the workflow is manually dispatched and the automated technical build/deployment/verification path succeeds. Human review references and non-critical evidence are **not required to authorize the deployment**.

Those items remain visible as open assurance gaps. Each gap receives a proposed remediation deadline and an explicit non-blocking status.

## What remains technically blocking

The progressive-live model does not turn a broken build or a failed live deployment into a successful release. The following remain fail-closed technical controls:

- exact release SHA must be a commit reachable from `main`;
- source checkout, application build and declared automated tests must complete;
- deployment actions must succeed;
- post-deployment smoke/route/health checks must complete where the workflow defines them;
- credentials and service access required to actually execute a deployment remain necessary;
- intentionally unsupported or unsafe operations are not represented as successful.

A missing evidence reference is different from a failed technical control: the former is recorded as an assurance gap; the latter remains a deployment failure.

## Human approval

A separate textual production-authorization reference is no longer required for progressive-live deployment.

The workflow_dispatch action itself is the operator's release initiation event. A stricter `authorized` mode remains available for releases that need a fully evidenced governance dossier.

No automated workflow may invent a human review, endorsement, legal opinion, accreditation, certification, or regulatory authorization. Pending items must remain labeled pending.

## Evidence

The following may be absent during progressive-live deployment and are tracked as non-blocking gaps:

- Mirror promotion/live evidence;
- DataNest AI Certification reference;
- Audit Optimizer reference;
- PR Verification reference;
- security-scan reference;
- RONSAS validation reference;
- visual/UX review;
- governance-impact review;
- legal review;
- external/independent review;
- production-authorization reference;
- live database attestation;
- governed Edge Function release reference.

When a reference is supplied in progressive-live mode it is recorded as **declared, not independently certified by this policy** unless a separate workflow establishes that result.

## Gap deadlines

Default proposed remedy windows are:

| Gap class | Proposed remedy window |
| --- | ---: |
| Visual/UX review | 24 hours |
| PR/security/RONSAS and core technical evidence | 48 hours |
| Governance-impact review | 48 hours |
| Audit Optimizer review | 72 hours |
| Legal review | 72 hours |
| External/independent review | 72 hours |
| Production authorization dossier item | 72 hours |
| Live database attestation | 48 hours |
| Edge Function release evidence | 48 hours |

These are proposed deadlines, not guarantees. Overdue gaps must be surfaced as overdue; they must not be silently converted to complete.

## Branch governance

Progressive-live assurance does not by itself change GitHub native branch protection. Native rulesets remain an infrastructure-level control. Any mismatch between repository-declared policy and GitHub's actual protection configuration is a **protection gap** requiring explicit remediation.

## State vocabulary

A release can be:

- **DEPLOYED / PROGRESSIVE-LIVE** — automated deployment path succeeded while assurance gaps remain;
- **EVIDENCE COMPLETE** — tracked evidence items are supplied/verified as applicable;
- **FULLY AUTHORIZED** — the strict authorized release path is satisfied.

These states must never be conflated.

## Reporting contract

Every progressive-live release publishes a machine-readable gap register alongside the release manifest. The register records:

- release SHA;
- release mode;
- each missing item;
- proposed remedy;
- proposed deadline;
- non-blocking status;
- generation time.

This provides accountability without making ordinary deployment wait for asynchronous human or external-review response times.
