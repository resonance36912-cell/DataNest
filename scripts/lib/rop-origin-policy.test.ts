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
    expect(normalizeOutboundOrigin("https://syncvision.life")).toBe("https://syncvision.life");
    expect(normalizeOutboundOrigin("https://syncvision.life:443")).toBe("https://syncvision.life");
    expect(
      requireAllowedOutboundOrigin(
        "https://syncvision.life",
        "https://syncvision.life https://reson8.life:443",
      ),
    ).toBe("https://syncvision.life");
  });

  test("rejects scheme, port, and subdomain confusion", () => {
    const allowed = "https://syncvision.life";
    expect(() => requireAllowedOutboundOrigin("http://syncvision.life", allowed)).toThrow();
    expect(() => requireAllowedOutboundOrigin("https://syncvision.life:8443", allowed)).toThrow();
    expect(() => requireAllowedOutboundOrigin("https://evil.syncvision.life", allowed)).toThrow();
    expect(() =>
      requireAllowedOutboundOrigin("https://syncvision.life.evil.test", allowed),
    ).toThrow();
  });
  test("rejects credentials, non-origin paths, and local or literal hosts", () => {
    const cases = [
      "https://user:pass@syncvision.life",
      "https://syncvision.life/path",
      "https://syncvision.life?x=1",
      "https://syncvision.life/#fragment",
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
      requireAllowedOutboundOrigin("https://syncvision.life", "");
      throw new Error("expected allowlist failure");
    } catch (error) {
      expect(error).toBeInstanceOf(OutboundOriginPolicyError);
      expect((error as OutboundOriginPolicyError).code).toBe("allowlist_unconfigured");
    }
  });

  test("normalizes allowlist entries and portable policy stays in parity", () => {
    expect([
      ...parseAllowedOutboundOrigins("https://reson8.life:443, https://syncvision.life"),
    ]).toEqual(["https://reson8.life", "https://syncvision.life"]);
    expect(read("docs/hub/functions/_shared/rop-origin-policy.ts")).toBe(
      read("src/lib/rop/origin-policy.ts"),
    );
  });
});
