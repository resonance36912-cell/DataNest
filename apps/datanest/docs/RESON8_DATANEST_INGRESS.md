# DataNest ↔ Reson8 integration

DataNest remains independently served from its current public endpoint:

- DataNest: `https://datanest-supository.github.io/DataNest/`
- Reson8 Hub: `https://reson8.life/`
- Repository: `DataNest-Supository/DataNest`
- Branch: `main`
- Backup-artifact host: Dropbox `/DataNest-AI-Backups`
- Railway dependency: none

## No DNS cutover

There is no active custom-domain or DNS cutover for DataNest.

`reson8.datanest.life` is not a required runtime, redirect, delivery, or future activation target. DataNest must not depend on DNS binding, CNAME changes, apex records, or an application-layer hostname redirect.

The live GitHub Pages project path is the canonical public delivery URL until an entirely new domain project is explicitly authorized.

## Reson8 relationship

Reson8 remains an ecosystem destination and Hub. DataNest provides visible navigation back to the Hub, but does not redirect its own public URL to Reson8.

The machine-readable DataNest contract is published at:

`https://datanest-supository.github.io/DataNest/.well-known/reson8-app.json`

That contract identifies the GitHub Pages URL as both public and operational delivery.

## Backup host

Dropbox `/DataNest-AI-Backups` remains the governed artifact-recovery host. Local PCs are not backup hosts or continuity authorities.

## Hub registry

The Reson8 Hub should keep DataNest non-billable and link directly to:

`https://datanest-supository.github.io/DataNest/`

There is no later CTA switch tied to DNS or branded-host activation.

Hub-side tracking item:

`resonance36912-cell/resonance-hub#136`
