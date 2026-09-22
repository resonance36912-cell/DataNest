import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const agent = readFileSync(
  new URL("../../ops/ealiophin/bridge-agent/bridge-agent.ps1", import.meta.url),
  "utf8",
);
const readme = readFileSync(
  new URL("../../ops/ealiophin/bridge-agent/README.md", import.meta.url),
  "utf8",
);

test("bridge agent can bootstrap from a refresh token without requiring a long-lived access token", () => {
  expect(agent).toContain("RONSAS_BRIDGE_REFRESH_TOKEN");
  expect(agent).toContain(
    "Set RONSAS_BRIDGE_ACCESS_TOKEN or bootstrap RONSAS_BRIDGE_REFRESH_TOKEN",
  );
  expect(agent).not.toContain('Get-RequiredEnv "RONSAS_BRIDGE_ACCESS_TOKEN"');
  expect(agent).toContain("/auth/v1/token?grant_type=refresh_token");
});

test("rotated bridge refresh tokens are stored with Windows DPAPI protection", () => {
  expect(agent).toContain("bridge-agent-refresh-token.xml");
  expect(agent).toContain("Import-Clixml");
  expect(agent).toContain("Export-Clixml");
  expect(agent).toContain("ConvertTo-SecureString");
  expect(agent).toContain("SecureStringToBSTR");
  expect(readme).toContain("Windows DPAPI");
});

test("bridge RPC retries exactly once after an authenticated 401 refresh", () => {
  expect(agent).toContain("for ($attempt = 1; $attempt -le 2; $attempt++)");
  expect(agent).toContain("Test-BridgeUnauthorizedError");
  expect(agent).toContain("([int]$statusProperty.Value -eq 401)");
  expect(agent).toContain("Invoke-BridgeTokenRefresh");
  expect(agent).toContain("bridge_rpc_retry_exhausted");
});

test("bridge documentation keeps connector identity non-admin and scoped", () => {
  expect(readme).toContain("dedicated Supabase Auth user");
  expect(readme).toContain("bridge_devices.connector_user_id");
  expect(readme).toContain("Do not use a personal admin session or service-role credential");
});
