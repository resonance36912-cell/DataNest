# Resonance DataNest Deployment

Resonance DataNest uses a **DataNest-managed** production model. DataNest owns product lifecycle and deployment intent, GitHub owns source control/history/CI/evidence, and Supabase owns auth/data/storage/backend services. **GitHub Pages is the current public delivery target.**

Hosting is replaceable delivery infrastructure, not system authority. The canonical branded identity is `reson8.datanest.life`; it is independent of any one delivery provider. Moving to another delivery target must not redefine product ownership, governance, source authority, backend authority, or the RONSAS product relationship.

## Required runtime variables

```env
SUPABASE_URL=https://sgqdmfgjbprsoqsmgigi.supabase.co
SUPABASE_PUBLISHABLE_KEY=<DataNest publishable key>
```

Only the Supabase publishable key belongs in browser-facing runtime configuration. Never expose a service-role key, database password, personal access token, MFA recovery material, or reusable session credential.

The runtime injects these public values into the browser at request time. This keeps delivery infrastructure replaceable without moving backend authority away from Supabase.

## Canonical production path

The current production flow is:

```text
DataNest
  governs deployment intent
      ↓
GitHub / CI
  builds, verifies and records evidence
      ↓
GitHub Pages
  current public delivery target
      ↓
Supabase
  governed backend services
```

The RONSAS integration is served by the JWT-protected Supabase Edge Function `ronsas-status@1` and probes the approved AppDev public Hub over HTTPS. DataNest does not require a loopback or machine-local RONSAS service for the web control plane. A RONSAS outage degrades only that integration surface and does not stop DataNest.

A future delivery target change does not change product ownership or governance.

## Backup and continuity authority

Dropbox `/DataNest-AI-Backups` is the governed backup-artifact host. Local PCs are not backup hosts and are not continuity authorities. Dropbox stores governed recovery packages, manifests, and release artifacts; it does not serve the production web application.

GitHub Pages is the operational public web delivery target. Railway is not required by DataNest. The canonical branded hostname is `reson8.datanest.life`; it may be activated through replaceable edge/DNS infrastructure without changing source, backend, backup, or governance authority.

## Local development and controlled testing

The following Node and Docker paths remain supported for local development and controlled test environments. They are not backup hosts, continuity authorities, or canonical production authority.

### Windows / Node.js controlled-test launcher

```powershell
$env:SUPABASE_PUBLISHABLE_KEY="<publishable key>"
.\scripts\start-production.ps1
```

Open `http://localhost:3000`.

The filename is retained for shortcut compatibility. The script itself warns that it is a legacy local/controlled-test launcher.

### Local Docker Compose

Create a local untracked `.env` file:

```env
SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Then:

```bash
docker compose up --build -d
```

Health endpoint:

```text
GET /api/health
```

### Generic container controlled-test path

Build:

```bash
docker build -t resonance-datanest .
```

Run in a controlled local or test environment:

```bash
docker run --rm -p 3000:3000 \
  -e SUPABASE_URL=https://sgqdmfgjbprsoqsmgigi.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
  resonance-datanest
```

## Replaceable delivery targets

Compatible delivery targets may be evaluated in the future through a separately governed change. Vercel and Railway are not required by the current DataNest delivery path. Using any delivery provider does not make it source, backend, product or governance authority.

For Supabase Auth passwordless links, add the final public application origin to the allowed redirect URLs in Supabase Auth before relying on magic-link sign-in.
