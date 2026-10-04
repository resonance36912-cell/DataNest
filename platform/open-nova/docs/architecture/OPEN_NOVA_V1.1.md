# Open Nova v1.1 Architecture — Local Deployment Evidence

v1.1 adds a machine-evidence layer without weakening the v1.0 governance model.

## Trust boundary

Application code and local models cannot assert that the host is ready. `LocalDeploymentManager` derives readiness from observable local facts: installed tools, writable sovereign directories and declared local-service ports. Evidence is optional to inspect but requires explicit confirmation to persist.

## Evidence chain

Deployment evidence is appended to `runtime/deployment/evidence.jsonl`. Each record includes `previous_sha256`; the record hash covers the complete previous-link payload. The API can validate the chain and detects modification of historical records.

## Privacy boundary

The local hostname is never returned verbatim. The preflight reports only a truncated SHA-256 identifier. Secret values are never returned.

## First-app pilot

The first-app workflow is staged and non-destructive. It produces a deterministic migration plan derived from the Suite Control Centre state and does not automatically import, rewrite, deploy or cut over an application.

## No hidden network step

Host preflight and plan generation do not install software, pull images, pull models or resolve packages over the internet. Provisioning remains a separate explicit operator decision.
