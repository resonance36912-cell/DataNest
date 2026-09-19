import { useRef, useState } from "react";
import { auditChannel } from "@/lib/channel-audit.functions";
import type { AuditResponse } from "@/lib/types";
import { trackAudit } from "@/hooks/useTracking";
import { classifyPromotionCostingError, trackPromotionCosting } from "@/lib/costing-telemetry";

type AuditStatus = "pending" | "processing" | "completed" | "failed";

function mapError(message: string): string {
  if (/sign in required/i.test(message)) return "Please sign in to run a channel audit.";
  if (/audit (credit )?limit/i.test(message)) return message;
  if (message.includes("credits exhausted") || message.includes("Not enough credits") || message.includes("payment_required")) {
    return "AI provider capacity is temporarily unavailable during the free promotion. No payment is required; please try again shortly.";
  }
  if (message.includes("rate limit") || message.includes("Too Many Requests")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  return message;
}

export function useAudit() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<AuditStatus | "idle">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const cancelRef = useRef(false);

  const analyze = async (channelInput: string) => {
    const startedAt = performance.now();
    cancelRef.current = false;
    setIsLoading(true);
    setError(null);
    setData(null);
    setStatus("pending");

    try {
      setStatus("processing");
      const result = await auditChannel({ data: { channelInput } });
      if (cancelRef.current) {
        void trackPromotionCosting({
          operation: "channel_audit",
          source: "useAudit",
          outcome: "cancelled",
          durationMs: performance.now() - startedAt,
          inputUnits: 1,
        });
        return;
      }
      setStatus("completed");
      setData(result);
      trackAudit(channelInput, result.channelData?.name, {
        score: result.audit?.healthScore,
      });
      void trackPromotionCosting({
        operation: "channel_audit",
        source: "useAudit",
        outcome: "success",
        durationMs: performance.now() - startedAt,
        inputUnits: 1,
        outputUnits: 1,
      });
    } catch (err: any) {
      setStatus("failed");
      setError(mapError(err?.message || "Something went wrong"));
      setData(null);
      void trackPromotionCosting({
        operation: "channel_audit",
        source: "useAudit",
        outcome: "failure",
        durationMs: performance.now() - startedAt,
        inputUnits: 1,
        errorKind: classifyPromotionCostingError(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const cancel = () => {
    cancelRef.current = true;
    setIsLoading(false);
    setStatus("idle");
  };

  return { isLoading, status, error, data, analyze, cancel };
}
