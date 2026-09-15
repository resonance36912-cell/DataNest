import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  ROP_PERSIST_MAX_ARRAY,
  ROP_PERSIST_MAX_STRING,
  buildDeliveryPersistenceRecord,
  sanitizePersistenceMetadata,
} from "../../src/lib/rop/delivery-persistence";

const ROOT = resolve(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

function persistenceFragments(source: string): string[] {
  const fragments: string[] = [];
  const sink = /\.(?:insert|upsert|update)\s*\(/g;
  for (const match of source.matchAll(sink)) {
    const start = match.index ?? 0;
    const end = source.indexOf(");", start);
    fragments.push(source.slice(start, end < 0 ? start + 1600 : end + 2));
  }
  return fragments;
}

describe("ROP delivery persistence policy", () => {
  test("persists body summaries without raw request or response content", async () => {
    const record = await buildDeliveryPersistenceRecord({
      destinationOrigin: "https://syncvision.life",
      method: "post",
      requestBody: "request-secret-value",
      responseBody: "response-secret-value",
      statusCode: 202,
      outcome: "accepted",
      durationMs: 41.4,
    });

    expect(record.destination_origin).toBe("https://syncvision.life");
    expect(record.method).toBe("POST");
    expect(record.request.bytes).toBe(20);
    expect(record.response?.bytes).toBe(21);
    expect(record.request.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.response?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.duration_ms).toBe(41);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("request-secret-value");
    expect(serialized).not.toContain("response-secret-value");
  });

  test("redacts sensitive keys recursively and bounds retained metadata", () => {
    const sanitized = sanitizePersistenceMetadata({
      authorization: "Bearer super-secret-token",
      nested: { raw_body: "raw-secret", safe: "x".repeat(ROP_PERSIST_MAX_STRING + 50) },
      list: Array.from({ length: ROP_PERSIST_MAX_ARRAY + 5 }, (_, i) => i),
    }) as Record<string, unknown>;

    expect(sanitized.authorization).toBe("[REDACTED]");
    const nested = sanitized.nested as Record<string, unknown>;
    expect(nested.raw_body).toBe("[REDACTED]");
    expect(String(nested.safe).length).toBeGreaterThan(ROP_PERSIST_MAX_STRING);
    expect(String(nested.safe)).toContain("[TRUNCATED]");
    expect((sanitized.list as unknown[]).length).toBe(ROP_PERSIST_MAX_ARRAY);
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("raw-secret");
  });

  test("rejects malformed or unbounded delivery metadata", async () => {
    const base = {
      destinationOrigin: "https://syncvision.life",
      method: "POST",
      requestBody: "{}",
      outcome: "accepted",
    };
    await expect(
      buildDeliveryPersistenceRecord({ ...base, destinationOrigin: "http://syncvision.life" }),
    ).rejects.toThrow();
    await expect(
      buildDeliveryPersistenceRecord({
        ...base,
        destinationOrigin: "https://syncvision.life/path",
      }),
    ).rejects.toThrow();
    await expect(
      buildDeliveryPersistenceRecord({ ...base, method: "POST /evil" }),
    ).rejects.toThrow();
    await expect(buildDeliveryPersistenceRecord({ ...base, statusCode: 700 })).rejects.toThrow();
    await expect(
      buildDeliveryPersistenceRecord({ ...base, outcome: "x".repeat(65) }),
    ).rejects.toThrow();
    await expect(buildDeliveryPersistenceRecord({ ...base, durationMs: -1 })).rejects.toThrow();
  });

  test("portable and runtime persistence policies stay byte-identical", () => {
    expect(read("docs/hub/functions/_shared/rop-delivery-persistence.ts")).toBe(
      read("src/lib/rop/delivery-persistence.ts"),
    );
  });

  test("ROP database write fragments do not persist raw bodies or sensitive transport fields", () => {
    const roots = [
      resolve(ROOT, "src/lib/rop"),
      resolve(ROOT, "src/routes/api/public/rop"),
      resolve(ROOT, "docs/hub/functions"),
    ];
    const forbidden =
      /\b(?:request_body|response_body|raw_body|requestBody|responseBody|rawBody|authorization|cookie|set_cookie|headers|x-rop-signature|hmac_secret|raw_signing_key)\b\s*(?::|,|})/i;

    const violations: string[] = [];
    for (const file of roots.flatMap(walkTs)) {
      const source = readFileSync(file, "utf8");
      for (const fragment of persistenceFragments(source)) {
        if (forbidden.test(fragment)) violations.push(file.slice(ROOT.length + 1));
      }
    }
    expect(violations).toEqual([]);
  });
});
