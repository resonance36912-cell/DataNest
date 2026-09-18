import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  OutboundOriginPolicyError,
  normalizeOutboundOrigin,
  parseAllowedOutboundOrigins,
  requireAllowedOutboundOrigin,
} from "../../src/lib/rop/origin-policy";

const ROOT = resolve(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("ROP outbound origin policy", () => {
  test("allows only exact normalized HTTPS origins", () => {
    expect(normalizeOutboundOrigin("https://sync.reson8.life")).toBe("https://sync.reson8.life");
    expect(normalizeOutboundOrigin("https://sync.reson8.life:443")).toBe("https://sync.reson8.life");
    expect(
      requireAllowedOutboundOrigin(
        "https://sync.reson8.life",
        "https://sync.reson8.life https://reson8.life:443",
      ),
    ).toBe("https://sync.reson8.life");
  });

  test("rejects scheme, port, and subdomain confusion", () => {
    const allowed = "https://sync.reson8.life";
    expect(() => requireAllowedOutboundOrigin("http://sync.reson8.life", allowed)).toThrow();
    expect(() => requireAllowedOutboundOrigin("https://sync.reson8.life:8443", allowed)).toThrow();
    expect(() => requireAllowedOutboundOrigin("https://evil.sync.reson8.life", allowed)).toThrow();
    expect(() =>
      requireAllowedOutboundOrigin("https://sync.reson8.life.evil.test", allowed),
    ).toThrow();
  });
  test("rejects credentials, non-origin paths, and local or literal hosts", () => {
    const cases = [
      "https://user:pass@sync.reson8.life",
      "https://sync.reson8.life/path",
      "https://sync.reson8.life?x=1",
      "https://sync.reson8.life/#fragment",
      "https://localhost",
      "https://service.local",
      "https://127.0.0.1",
      "https://10.0.0.4",
      "https://[::1]",
    ];
    for (const value of cases) expect(() => normalizeOutboundOrigin(value)).toThrow();
  });

  test("fails closed when the allowlist is not configured", () => {
    try {
      requireAllowedOutboundOrigin("https://sync.reson8.life", "");
      throw new Error("expected allowlist failure");
    } catch (error) {
      expect(error).toBeInstanceOf(OutboundOriginPolicyError);
      expect((error as OutboundOriginPolicyError).code).toBe("allowlist_unconfigured");
    }
  });

  test("normalizes allowlist entries and portable policy stays in parity", () => {
    expect([
      ...parseAllowedOutboundOrigins("https://reson8.life:443, https://sync.reson8.life"),
    ]).toEqual(["https://reson8.life", "https://sync.reson8.life"]);
    expect(read("docs/hub/functions/_shared/rop-origin-policy.ts")).toBe(
      read("src/lib/rop/origin-policy.ts"),
    );
  });
});
