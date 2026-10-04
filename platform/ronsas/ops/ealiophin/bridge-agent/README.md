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
   - Bootstrap one connector credential:
     - recommended: `RONSAS_BRIDGE_REFRESH_TOKEN` for the dedicated non-admin connector user; or
     - compatibility: `RONSAS_BRIDGE_ACCESS_TOKEN`.
   - Optional: `RONSAS_BRIDGE_REFRESH_TOKEN_FILE` to override the encrypted refresh-token store path.
5. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge-agent.ps1
```

When a refresh token is available, the connector refreshes an expired access token and retries the failed RPC once. Rotated refresh tokens are persisted with Windows DPAPI using `Export-Clixml`; the default store is `%LOCALAPPDATA%\Resonance\RONSAS\bridge-agent-refresh-token.xml`. The bootstrap refresh-token environment variable is used only when that protected store does not yet exist.

Use a dedicated Supabase Auth user whose ID matches `bridge_devices.connector_user_id`. Do not use a personal admin session or service-role credential for the Windows connector.

Do not run this process elevated. Use a dedicated non-admin Windows account with NTFS access only to the configured workspaces.
