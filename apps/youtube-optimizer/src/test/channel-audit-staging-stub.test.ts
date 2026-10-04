import { afterEach, describe, expect, test, vi } from "vitest";
import {
  premiumReadinessChannelStubEnabled,
  runChannelAuditWithStagingStub,
} from "@/lib/channel-audit.staging";

const oldEnabled = process.env["RONS_YOUTUBE_STAGING_STUB"];
const oldScope = process.env["RONS_YOUTUBE_STUB_SCOPE"];
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (oldEnabled === undefined) delete process.env["RONS_YOUTUBE_STAGING_STUB"];
  else process.env["RONS_YOUTUBE_STAGING_STUB"] = oldEnabled;

  if (oldScope === undefined) delete process.env["RONS_YOUTUBE_STUB_SCOPE"];
  else process.env["RONS_YOUTUBE_STUB_SCOPE"] = oldScope;

  vi.stubGlobal("fetch", originalFetch);
  vi.restoreAllMocks();
});

describe("premium-readiness YouTube channel stub", () => {
  test("is disabled unless both explicit staging switches are present", () => {
    delete process.env["RONS_YOUTUBE_STAGING_STUB"];
    delete process.env["RONS_YOUTUBE_STUB_SCOPE"];
    expect(premiumReadinessChannelStubEnabled()).toBe(false);

    process.env["RONS_YOUTUBE_STAGING_STUB"] = "1";
    expect(premiumReadinessChannelStubEnabled()).toBe(false);

    process.env["RONS_YOUTUBE_STUB_SCOPE"] = "premium-readiness";
    expect(premiumReadinessChannelStubEnabled()).toBe(true);
  });

  test("returns deterministic fixture data without any network fetch", async () => {
    process.env["RONS_YOUTUBE_STAGING_STUB"] = "1";
    process.env["RONS_YOUTUBE_STUB_SCOPE"] = "premium-readiness";

    const fetchSpy = vi.fn(async () => {
      throw new Error(
        "network fetch must not run in premium-readiness stub mode",
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const liveRun = vi.fn(async () => {
      await fetch("https://example.invalid/should-not-run");
      throw new Error("live audit callback must not run in fixture mode");
    });

    const result = await runChannelAuditWithStagingStub(liveRun);

    expect(liveRun).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.channelData.handle).toBe("@ronsas-fixture");
    expect(result.videos).toHaveLength(3);
    expect(result.audit.healthScore).toBe(72);
    expect(result.audit.channelSummary).toContain(
      "Deterministic staging fixture",
    );
    expect(result.audit.postingTimeAnalysis.reasoning).toContain(
      "does not infer private audience timing",
    );
  });
});
