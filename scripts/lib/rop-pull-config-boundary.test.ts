import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const runtimeRoute = join(root, "src/routes/api/public/hub-control/pull-config.ts");
const portableFunction = join(root, "docs/hub/functions/rop-pull-config/index.ts");
const routeTree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
const review = readFileSync(join(root, "docs/architecture/ROP-PULL-CONFIG-REVIEW-20260916.md"), "utf8");

describe("ROP pull-config admission boundary", () => {
  test("legacy runtime route remains absent", () => {
    expect(existsSync(runtimeRoute)).toBe(false);
    expect(routeTree).not.toContain("/api/public/hub-control/pull-config");
  });

  test("portable pull-config implementation remains absent", () => {
    expect(existsSync(portableFunction)).toBe(false);
  });

  test("review keeps pull authority separate from outbound control authority", () => {
    expect(review).toContain("Pull authority is read-only and independent");
    expect(review).toContain("must not imply outbound push, probe, signing, delivery, or execution authority");
    expect(review).toContain("No arbitrary outbound fetch");
  });

  test("future contract must be strict, bounded, and signed", () => {
    expect(review).toContain("Reject unknown request fields");
    expect(review).toContain("Strict versioned response schema");
    expect(review).toContain("Bound total payload size and collection counts");
    expect(review).toContain("timestamp.nonce.raw_body");
  });

  test("future config cannot carry privilege-bearing material or duplicate broadcasts", () => {
    expect(review).toContain("No privilege-bearing material");
    expect(review).toContain("Do not multiplex broadcast suggestions into config");
    expect(review).toContain("Persistence follows Gate 3");
  });
});
