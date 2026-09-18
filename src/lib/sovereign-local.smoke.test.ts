import { describe, expect, it } from "vitest";
import { invokeLocalFunction, readLocalRows } from "@/integrations/supabase/client";

describe("Sync Vision sovereign-local compatibility", () => {
  it("exposes the sovereign local identity without a hosted backend", () => {
    const profiles = readLocalRows("profiles");
    expect(profiles.some((row: any) => row.user_id === "resonance-sovereign-local-user")).toBe(true);
  });

  it("reports local health", async () => {
    await expect(invokeLocalFunction("monitor-health")).resolves.toMatchObject({
      success: true,
      mode: "sovereign-local",
      providers: { local: "online", external: "denied" },
    });
  });

  it("denies unwired local video generation instead of falling through to a paid provider", async () => {
    const result = await invokeLocalFunction("submit-video-job", { prompt: "test" });
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/not wired|denied/i);
    expect(result.local).toBe(true);
  });
});
