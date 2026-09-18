import { useRef, useState } from "react";
import { auditChannel } from "@/lib/channel-audit.functions";
import type { AuditResponse } from "@/lib/types";
import { trackAudit } from "@/hooks/useTracking";

type AuditStatus = "pending" | "processing" | "completed" | "failed";

function mapError(message: string): string {
  if (/sign in required/i.test(message)) return "Please sign in to run a channel audit.";
  if (/audit (credit )?limit/i.test(message)) return message;
  if (message.includes("credits exhausted") || message.includes("Not enough credits") || message.includes("payment_required")) {
    return "AI credits exhausted. Please add funds in Settings → Workspace → Usage to continue.";
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
    cancelRef.current = false;
    setIsLoading(true);
    setError(null);
    setData(null);
    setStatus("pending");

    try {
      setStatus("processing");
      const result = await auditChannel({ data: { channelInput } });
      if (cancelRef.current) return;
      setStatus("completed");
      setData(result);
      trackAudit(channelInput, result.channelData?.name, {
        score: result.audit?.healthScore,
      });
    } catch (err: any) {
      setStatus("failed");
      setError(mapError(err?.message || "Something went wrong"));
      setData(null);
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
