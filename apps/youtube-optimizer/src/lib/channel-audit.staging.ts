import type { AuditResponse } from "./types";
import { buildPremiumReadinessChannelAuditFixture } from "./channel-audit.staging-fixture";

export function premiumReadinessChannelStubEnabled(): boolean {
  return (
    process.env["RONS_YOUTUBE_STAGING_STUB"] === "1" &&
    process.env["RONS_YOUTUBE_STUB_SCOPE"] === "premium-readiness"
  );
}

export async function runChannelAuditWithStagingStub(
  liveRun: () => Promise<AuditResponse>,
): Promise<AuditResponse> {
  if (premiumReadinessChannelStubEnabled()) {
    return buildPremiumReadinessChannelAuditFixture();
  }
  return liveRun();
}
