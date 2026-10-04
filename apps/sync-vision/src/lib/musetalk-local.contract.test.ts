import { describe, expect, it } from "vitest";
import { VIDEO_PROVIDER_OPTIONS } from "@/lib/providers";
import { PROVIDER_ESTIMATES } from "@/components/JobEstimateBadge";
import { DEFAULT_PROVIDER_TIMEOUTS_MS } from "@/types/storyboard";
import {
  LOCAL_MUSETALK_BRIDGE,
  LOCAL_MUSETALK_MODEL,
  LOCAL_MUSETALK_REVISION,
  isSovereignMediaUrl,
} from "@/lib/sovereign-local";

describe("R5B MuseTalk local contract", () => {
  it("registers the pinned localhost-only provider", () => {
    const option = VIDEO_PROVIDER_OPTIONS.find((item) => item.value === LOCAL_MUSETALK_MODEL);
    expect(option?.provider).toBe("local-musetalk");
    expect(option?.label).toContain("MuseTalk 1.5");
    expect(LOCAL_MUSETALK_BRIDGE).toBe("http://127.0.0.1:7863");
    expect(LOCAL_MUSETALK_REVISION).toBe("0a89dec45a0192b824e3cf4daf96c239440c5ed8");
  });

  it("declares zero provider cost and a bounded local timeout", () => {
    expect(PROVIDER_ESTIMATES[LOCAL_MUSETALK_MODEL]?.costGbp).toBe(0);
    expect(PROVIDER_ESTIMATES[LOCAL_MUSETALK_MODEL]?.execution).toBe("local");
    expect(DEFAULT_PROVIDER_TIMEOUTS_MS[LOCAL_MUSETALK_MODEL]).toBe(30 * 60 * 1000);
  });

  it("rejects non-local media inputs before the bridge is invoked", () => {
    expect(isSovereignMediaUrl("blob:http://127.0.0.1:3301/example")).toBe(true);
    expect(isSovereignMediaUrl("data:video/mp4;base64,AA==")).toBe(true);
    expect(isSovereignMediaUrl("http://127.0.0.1:7863/api/jobs/a/output")).toBe(true);
    expect(isSovereignMediaUrl("https://example.com/video.mp4")).toBe(false);
  });
});
