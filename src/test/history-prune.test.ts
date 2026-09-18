import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS CI helper, no type declarations
import { pruneHistory, parseLedger, renderLedger } from "../../scripts/lib/history-prune.mjs";

type Entry = { id: string; created_at: string; conclusion?: string; run_attempt?: number };

const at = (min: number, id: number, conclusion = "failure") => ({
  id,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0) - min * 60_000).toISOString(),
  conclusion,
  run_attempt: 1,
  html_url: `https://x/${id}`,
  head_sha: "abcdef1234",
});
const NOW = Date.UTC(2026, 0, 1, 0, 0);

describe("pruneHistory", () => {
  it("caps to the latest limit, newest first, regardless of input order", () => {
    const { kept, overLimitCount } = pruneHistory({
      incoming: [at(30, 3), at(10, 1), at(20, 2)],
      limit: 2,
      now: NOW,
    });
    expect(kept.map((e: Entry) => e.id)).toEqual(["1", "2"]);
    expect(overLimitCount).toBe(1);
  });

  it("is deterministic across repeated runs (no accumulation)", () => {
    const first = pruneHistory({ incoming: [at(10, 1), at(20, 2)], limit: 5, now: NOW });
    const second = pruneHistory({ stored: first.kept, incoming: [at(10, 1), at(20, 2)], limit: 5, now: NOW });
    expect(second.kept).toEqual(first.kept);
  });

  it("merges stored + incoming and dedupes by run id", () => {
    const { kept } = pruneHistory({
      stored: [{ id: "1", created_at: at(10, 1).created_at, conclusion: "failure" }],
      incoming: [{ ...at(10, 1), run_attempt: 2 }],
      limit: 5,
      now: NOW,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].run_attempt).toBe(2);
  });

  it("drops runs older than days but always keeps pinned ids", () => {
    const old = at(60 * 24 * 10, 9);
    const res = pruneHistory({ incoming: [at(5, 1), old], limit: 10, days: 3, now: NOW });
    expect(res.kept.map((e: Entry) => e.id)).toEqual(["1"]);
    expect(res.agedOutCount).toBe(1);

    const pinned = pruneHistory({ incoming: [at(5, 1), old], limit: 10, days: 3, pinnedIds: [9], now: NOW });
    expect(pinned.keptIds.has("9")).toBe(true);
  });

  it("ignores entries without id or timestamp", () => {
    const { kept } = pruneHistory({ incoming: [{ id: "1" }, { created_at: "2026-01-01" }], limit: 5, now: NOW });
    expect(kept).toEqual([]);
  });

  it("round-trips through the rendered ledger", () => {
    const { kept, agedOutCount, overLimitCount } = pruneHistory({
      incoming: [at(10, 1), at(20, 2)],
      limit: 5,
      now: NOW,
    });
    const body = renderLedger({
      kept,
      limit: 5,
      days: 0,
      agedOutCount,
      overLimitCount,
      updatedAt: new Date(NOW).toISOString(),
    });
    expect(parseLedger(body)).toEqual(kept);
    expect(parseLedger("no ledger here")).toEqual([]);
    expect(parseLedger("<!-- ci-history-data {broken -->")).toEqual([]);
  });
});
