# RONSAS Bridge Agent (Ealiophin v1)

This connector is the Windows-side execution boundary for the shared ChatGPT/RONSAS-agent bridge.

## Security model

- Outbound-only HTTPS to Supabase RPCs.
- The server grants a caller a device + tool + workspace.
- This connector independently maps workspace IDs to local directories.
- MCP callers never send raw shell commands. Build/test/lint/typecheck jobs map to commands stored in the local config.
- Patch application rejects path traversal and sensitive paths before `git apply --check`.
- Browser tests are limited to localhost/127.0.0.1 and `reson8.life` subdomains.
- Preview launch uses a locally configured command and never carries production credentials.

## Setup

1. Copy `bridge-agent.example.json` to `bridge-agent.json`.
2. Replace `deviceId` with the paired `bridge_devices.id`.
3. Confirm each workspace path and fixed command map.
4. Set process/user environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `RONSAS_BRIDGE_ACCESS_TOKEN`
5. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge-agent.ps1
```

The v1 connector uses an authenticated Supabase bearer token. For unattended service operation, the next hardening step is a connector-specific refresh flow or device credential exchange so an expiring human session token is not the long-term credential.

Do not run this process elevated. Use a dedicated non-admin Windows account with NTFS access only to the configured workspaces.
