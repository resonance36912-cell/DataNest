import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logHubEntitlementFailure,
  __resetHubDiagDedup,
} from "./hubDiagLogger";
import type { EntitlementDiagnostic } from "./entitlement";

function diag(
  overrides: Partial<EntitlementDiagnostic> = {},
): EntitlementDiagnostic {
  return {
    endpoint: "https://reson8.life/api/public/entitlement?app=creative_studio",
    httpStatus: 503,
    reason: "http",
    lastCheckedAt: "2026-05-29T00:00:00.000Z",
    message: "boom",
    ...overrides,
  };
}

beforeEach(() => {
  __resetHubDiagDedup();
  vi.restoreAllMocks();
  // Clean any Sentry pollution from previous tests.
  delete (globalThis as { Sentry?: unknown }).Sentry;
  // Ensure no custom endpoint by default.
  vi.stubEnv("VITE_HUB_DIAG_ENDPOINT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("logHubEntitlementFailure", () => {
  it("warns to console with full payload on http failure", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 500 }));

    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, payload] = warn.mock.calls[0];
    expect(tag).toBe("[hub-entitlement] failure");
    expect(payload).toMatchObject({
      app: "creative_studio",
      endpoint: expect.stringContaining("reson8.life"),
      httpStatus: 500,
      reason: "http",
      lastCheckedAt: "2026-05-29T00:00:00.000Z",
      message: "boom",
    });
  });

  it("warns on network failure too", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logHubEntitlementFailure(
      "creative_studio",
      diag({ reason: "network", httpStatus: null }),
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("skips ok and unauthenticated diagnostics", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logHubEntitlementFailure("creative_studio", diag({ reason: "ok" }));
    logHubEntitlementFailure(
      "creative_studio",
      diag({ reason: "unauthenticated", httpStatus: null }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("dedupes repeat failures with the same failureKey", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 500 }));
    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 500 }));
    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 500 }));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("treats different statuses as distinct failures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 500 }));
    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 502 }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("forwards to window.Sentry when present", () => {
    const captureMessage = vi.fn();
    (globalThis as { Sentry?: unknown }).Sentry = { captureMessage };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 503 }));

    expect(captureMessage).toHaveBeenCalledWith(
      "hub-entitlement failure",
      expect.objectContaining({
        level: "warning",
        tags: expect.objectContaining({
          app: "creative_studio",
          reason: "http",
          status: "503",
        }),
        extra: expect.objectContaining({ httpStatus: 503 }),
      }),
    );
  });

  it("POSTs to VITE_HUB_DIAG_ENDPOINT when configured", () => {
    vi.stubEnv("VITE_HUB_DIAG_ENDPOINT", "https://logs.example/ingest");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 504 }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://logs.example/ingest");
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(true);
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      app: "creative_studio",
      httpStatus: 504,
      reason: "http",
      lastCheckedAt: "2026-05-29T00:00:00.000Z",
    });
  });

  it("does not POST when VITE_HUB_DIAG_ENDPOINT is empty", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    logHubEntitlementFailure("creative_studio", diag({ httpStatus: 500 }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
