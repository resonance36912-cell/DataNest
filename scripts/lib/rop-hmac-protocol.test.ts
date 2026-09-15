import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { hashSigningKey, signBody } from "../../src/lib/rop/hmac.server";

const ROOT = resolve(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("ROP HMAC protocol", () => {
  test("signatures bind timestamp, nonce, and body with the provisioned HMAC secret", () => {
    const raw = "raw-provisioning-key";
    const hmacSecret = hashSigningKey(raw);
    const ts = "1789466400";
    const nonce = "2c3d8f4ea87d4e21";
    const body = '{"event":"ok"}';

    const expected = createHmac("sha256", hmacSecret)
      .update(`${ts}.${nonce}.${body}`)
      .digest("hex");
    expect(signBody(hmacSecret, ts, nonce, body)).toBe(expected);

    const legacy = createHmac("sha256", hmacSecret)
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(expected).not.toBe(legacy);
  });

  test("runtime verifier requires canonical app-id and nonce headers", () => {
    const src = read("src/lib/rop/hmac.server.ts");
    expect(src).toContain('headers.get("x-rop-app-id")');
    expect(src).toContain('headers.get("x-rop-nonce")');
    expect(src).not.toContain('headers.get("x-rop-app")');
    expect(src).toContain('rpc("consume_rop_nonce"');
    expect(src).toContain('status: 409, error: "Replay detected"');
  });

  test("database replay guard is atomic and service-role only", () => {
    const sql = read("supabase/migrations/20260915093000_harden_rop_nonce_replay.sql");
    expect(sql).toContain("PRIMARY KEY (app_id, nonce)");
    expect(sql).toContain("ON CONFLICT (app_id, nonce) DO NOTHING");
    expect(sql).toContain("GET DIAGNOSTICS inserted_count = ROW_COUNT");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.consume_rop_nonce[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.consume_rop_nonce[\s\S]*TO service_role/);
  });

  test("portable verifier uses the stored HMAC secret and persistent nonce consumer", () => {
    const verify = read("docs/hub/functions/_shared/rop-verify.ts");
    const lookups = read("docs/hub/functions/_shared/rop-lookups.ts");
    expect(verify).toContain("app.signing_key_hash");
    expect(verify).toContain("consumeNonce(appId, nonce, ts, NONCE_TTL_SECONDS)");
    expect(verify).not.toContain("SecretLookup");
    expect(lookups).toContain('admin.rpc("consume_rop_nonce"');
    expect(lookups).not.toContain("ROP_SECRET_");
  });
});
