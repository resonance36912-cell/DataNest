import { describe, expect, test } from "bun:test";
import { memoizeRequest } from "../../src/lib/request-memo.server";

describe("request-scoped GitHub query deduplication", () => {
  test("concurrent releases with the same target share one lookup", async () => {
    let calls = 0;
    const load = memoizeRequest(async (target) => {
      calls++;
      await Promise.resolve();
      return [target];
    });
    const first = load("main");
    const second = load("main");
    expect(second).toBe(first);
    expect(await Promise.all([first, second])).toEqual([["main"], ["main"]]);
    expect(calls).toBe(1);
  });

  test("different targets remain independent", async () => {
    const seen: string[] = [];
    const load = memoizeRequest(async (target) => {
      seen.push(target);
      return target;
    });
    expect(await Promise.all([load("main"), load("release")])).toEqual(["main", "release"]);
    expect(seen).toEqual(["main", "release"]);
  });

  test("a new request fetches fresh results rather than reusing another request", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    expect(await memoizeRequest(loader)("main")).toBe(1);
    expect(await memoizeRequest(loader)("main")).toBe(2);
  });

  test("one failed lookup is shared, while the next request can recover", async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      if (calls === 1) throw new Error("GitHub unavailable");
      return "recovered";
    };
    const load = memoizeRequest(loader);
    const results = await Promise.allSettled([load("main"), load("main")]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    expect(await memoizeRequest(loader)("main")).toBe("recovered");
  });
});
