import { supabase } from "@/integrations/supabase/client";

export type PromotionCostingOperation =
  | "channel_audit"
  | "episode_analysis"
  | "video_score_analysis"
  | "thumbnail_generation";

export type PromotionCostingOutcome = "success" | "failure" | "cancelled";

export type PromotionCostingErrorKind =
  | "auth"
  | "capacity"
  | "entitlement"
  | "provider"
  | "rate_limit"
  | "unavailable"
  | "validation"
  | "unknown";

export interface PromotionCostingEvent {
  operation: PromotionCostingOperation;
  source: string;
  outcome: PromotionCostingOutcome;
  durationMs: number;
  mode?: "guest" | "creator";
  inputUnits?: number;
  outputUnits?: number;
  inputBytes?: number;
  outputBytes?: number;
  retries?: number;
  errorKind?: PromotionCostingErrorKind;
}

const nonNegativeInt = (value: number | undefined): number | undefined => {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
};

export function buildPromotionCostingMetadata(event: PromotionCostingEvent) {
  const metadata: Record<string, string | number> = {
    schema_version: 1,
    promotion: "free_access_costing",
    operation: event.operation,
    source: event.source,
    outcome: event.outcome,
    duration_ms: nonNegativeInt(event.durationMs) ?? 0,
  };

  if (event.mode) metadata["mode"] = event.mode;
  if (event.errorKind) metadata["error_kind"] = event.errorKind;

  const optionalNumbers: Array<[string, number | undefined]> = [
    ["input_units", event.inputUnits],
    ["output_units", event.outputUnits],
    ["input_bytes", event.inputBytes],
    ["output_bytes", event.outputBytes],
    ["retries", event.retries],
  ];
  for (const [key, value] of optionalNumbers) {
    const normalized = nonNegativeInt(value);
    if (normalized != null) metadata[key] = normalized;
  }

  return metadata;
}

export function classifyPromotionCostingError(error: unknown): PromotionCostingErrorKind {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (/sign in|required|unauthori[sz]ed|forbidden/.test(normalized)) return "auth";
  if (/credit|payment|required tier|entitlement|quota/.test(normalized)) return "entitlement";
  if (/rate limit|too many requests|429/.test(normalized)) return "rate_limit";
  if (/busy|capacity|queue|temporarily overloaded/.test(normalized)) return "capacity";
  if (/invalid|malformed|required field|valid youtube|validation/.test(normalized)) return "validation";
  if (/not configured|disabled|unavailable/.test(normalized)) return "unavailable";
  if (/provider|upstream|gateway|502|503|504/.test(normalized)) return "provider";
  return "unknown";
}

export async function trackPromotionCosting(event: PromotionCostingEvent): Promise<void> {
  try {
    await supabase.from("feature_usage").insert({
      feature: "promotion_costing",
      metadata: buildPromotionCostingMetadata(event),
    });
  } catch {
    // Telemetry must never block the user journey.
  }
}
