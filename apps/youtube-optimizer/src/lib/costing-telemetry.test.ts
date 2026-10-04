import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async (_row: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert })),
  },
}));

import {
  buildPromotionCostingMetadata,
  classifyPromotionCostingError,
  trackPromotionCosting,
} from "./costing-telemetry";

describe("promotion costing telemetry", () => {
  beforeEach(() => insert.mockClear());

  it("normalizes only fixed operational costing fields", () => {
    expect(
      buildPromotionCostingMetadata({
        operation: "channel_audit",
        source: "useAudit",
        outcome: "success",
        durationMs: 1234.6,
        mode: "creator",
        inputUnits: 1,
        outputUnits: 1,
        retries: -3,
      }),
    ).toEqual({
      schema_version: 1,
      promotion: "free_access_costing",
      operation: "channel_audit",
      source: "useAudit",
      outcome: "success",
      duration_ms: 1235,
      mode: "creator",
      input_units: 1,
      output_units: 1,
      retries: 0,
    });
  });

  it("classifies errors without persisting their message content", () => {
    expect(classifyPromotionCostingError(new Error("Too Many Requests"))).toBe("rate_limit");
    expect(classifyPromotionCostingError(new Error("provider capacity busy"))).toBe("capacity");
    expect(classifyPromotionCostingError(new Error("Sovereign image generation is not configured"))).toBe("unavailable");
  });

  it("writes promotion_costing events to the existing feature_usage table", async () => {
    await trackPromotionCosting({
      operation: "episode_analysis",
      source: "EpisodeAnalysis",
      outcome: "failure",
      durationMs: 42,
      errorKind: "provider",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      feature: "promotion_costing",
      metadata: {
        operation: "episode_analysis",
        outcome: "failure",
        duration_ms: 42,
        error_kind: "provider",
      },
    });
  });

  it("is wired into expensive promotion flows and admin visibility", () => {
    const root = process.cwd();
    const audit = readFileSync(resolve(root, "src/hooks/useAudit.ts"), "utf8");
    const episode = readFileSync(resolve(root, "src/components/EpisodeAnalysis.tsx"), "utf8");
    const score = readFileSync(resolve(root, "src/components/VideoScoreAnalyzer.tsx"), "utf8");
    const admin = readFileSync(resolve(root, "src/pages/Admin.tsx"), "utf8");

    expect(audit).toContain('operation: "channel_audit"');
    expect(audit).not.toContain("Please add funds");
    expect(episode).toContain('operation: "episode_analysis"');
    expect(episode).toContain('operation: "thumbnail_generation"');
    expect(score).toContain('operation: "video_score_analysis"');
    expect(admin).toContain('"feature, metadata"');
    expect(admin).toContain('"Costing Samples"');
    expect(admin).toContain('"Avg Costing Time"');
    expect(admin).toContain('"Costing Failures"');
  });
});
