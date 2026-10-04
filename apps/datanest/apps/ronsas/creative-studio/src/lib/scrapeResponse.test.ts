// Client-side mirror of the server contract: `controlledExitReason` is
// required on ScrapeResponsePayload AND on PipelineState. The
// `@ts-expect-error` directives below double as compile-time tests — if
// anyone makes either field optional again, tsc reports the directive as
// unused and `bun run build` / `vitest` fails before runtime.

import { describe, expect, it } from "vitest";
import {
  type ControlledExitReason,
  type ScrapeResponsePayload,
  type ScrapeStatus,
  reasonFromStatus,
} from "@/lib/scrapeResponse";
import type { PipelineState } from "@/components/studio/PipelineProgress";

const emptyBrief = (url: string) => ({
  sourceUrl: url,
  sourceType: "unknown" as const,
  brandName: "",
  pageTitle: "",
  metaDescription: "",
  heroHeadline: "",
  heroSubheadline: "",
  offer: "",
  products: [],
  services: [],
  audience: "",
  benefits: [],
  proofPoints: [],
  pricing: "",
  callsToAction: [],
  colors: [],
  images: [],
  logo: "",
  links: [],
  rawMarkdown: "",
  screenshot: null,
  confidenceScore: 0,
  extractionWarnings: [],
});

describe("ScrapeResponsePayload contract", () => {
  it("requires controlledExitReason on every payload", () => {
    const ok: ScrapeResponsePayload = {
      success: true,
      cached: false,
      status: "success",
      controlledExitReason: "server_status_success",
      partial: false,
      brief: emptyBrief("https://example.com"),
    };
    expect(ok.controlledExitReason).toBe("server_status_success");

    // @ts-expect-error controlledExitReason is required end-to-end
    const missing: ScrapeResponsePayload = {
      success: true,
      cached: false,
      status: "success",
      partial: false,
      brief: emptyBrief("https://example.com"),
    };
    expect(missing).toBeTruthy();
  });

  it("requires controlledExitReason on diagnostics", () => {
    const bad: ScrapeResponsePayload = {
      success: true,
      cached: false,
      status: "partial",
      controlledExitReason: "server_status_partial",
      partial: true,
      brief: emptyBrief("https://example.com"),
      // @ts-expect-error diagnostics.controlledExitReason is required
      diagnostics: { totalMs: 100 },
    };
    expect(bad).toBeTruthy();
  });

  it("reasonFromStatus is exhaustive over ScrapeStatus", () => {
    const map: Record<ScrapeStatus, ControlledExitReason> = {
      success: "server_status_success",
      partial: "server_status_partial",
      needs_image_upload: "server_status_needs_image_upload",
      failed_fast: "server_status_failed_fast",
    };
    (Object.keys(map) as ScrapeStatus[]).forEach((s) => {
      expect(reasonFromStatus(s)).toBe(map[s]);
    });
  });
});

describe("PipelineState contract", () => {
  it("requires controlledExitReason on the client pipeline state", () => {
    const ok: PipelineState = {
      scrape: "pending",
      analyze: "pending",
      generate: "pending",
      controlledExitReason: null,
    };
    expect(ok.controlledExitReason).toBeNull();

    // @ts-expect-error controlledExitReason is required on PipelineState
    const missing: PipelineState = {
      scrape: "pending",
      analyze: "pending",
      generate: "pending",
    };
    expect(missing).toBeTruthy();
  });

  it("accepts every ControlledExitReason variant — server + client + shortcut", () => {
    const all: ControlledExitReason[] = [
      "server_status_success",
      "server_status_partial",
      "server_status_needs_image_upload",
      "server_status_failed_fast",
      "legacy_scrape_error",
      "client_abort",
      "client_watchdog",
      "direct_image_url",
      "user_upload",
    ];
    expect(all).toHaveLength(9);
  });
});
