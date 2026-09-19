import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FeatureGateState, GatedFeature } from "@/lib/featureGates";
import type { EntitlementDenialKind } from "@/lib/tierRequired";

export function sanitizeDenialReason(
  raw: string | null | undefined,
  kind: EntitlementDenialKind | undefined,
  fallback: string,
): string {
  void kind;
  if (typeof raw !== "string") return fallback;
  let s = raw.trim();
  if (!s) return fallback;
  s = s
    .replace(/^[A-Z_][A-Z0-9_]{2,}\s*[:=]\s*/i, "")
    .replace(/^(code|error|status)\s*[:=]\s*[A-Za-z0-9_-]+[.,;]?\s*/gi, "")
    .replace(/\bhttps?:\/\/\S+/gi, "[link]")
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}\b/g, "[token]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b[A-Fa-f0-9]{16,}\b/g, "[token]")
    .replace(/\bsk_[A-Za-z0-9_-]{8,}\b/g, "[token]")
    .replace(/\b(?:Bearer|Basic|apikey|api_key|token)\s+[A-Za-z0-9._-]+/gi, "[token]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\s+at\s+[^\n]+/g, "")
    .replace(/(?:\/[\w.-]+){2,}|[A-Za-z]:\\[\w.\\-]+/g, "[path]")
    .replace(/\b(?:feature|function_name|user_id|project_id|job_id|request_id)\s*=\s*[^\s,;]+/gi, "")
    .replace(/['"`][a-z][a-z0-9_-]{2,}['"`]/gi, (m) => {
      const inner = m.slice(1, -1);
      return /^[a-z][a-z0-9]*$/.test(inner) && inner.length <= 8 ? inner : "[detail]";
    });
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 160) s = s.slice(0, 157).trimEnd() + "…";
  const alnum = s.replace(/\[[a-z]+\]/g, "").replace(/[^A-Za-z]/g, "");
  if (alnum.length < 4) return fallback;
  return s[0].toUpperCase() + s.slice(1);
}

export function TierRequiredState({
  gate,
  variant = "compact",
  className = "",
  extra,
}: {
  gate: FeatureGateState;
  feature?: GatedFeature;
  variant?: "compact" | "panel";
  className?: string;
  description?: string;
  extra?: React.ReactNode;
}) {
  const panel = variant === "panel";
  return (
    <div
      className={`flex ${panel ? "flex-col" : "flex-wrap items-center"} gap-2 rounded-xl border border-primary/25 bg-primary/5 ${panel ? "p-4" : "px-3 py-2"} text-sm ${className}`}
      role="status"
    >
      <Sparkles className="h-4 w-4 text-primary" />
      <div className="flex-1">
        <div className="font-semibold text-foreground">{gate.label} is included during the promotion</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          If this feature appears blocked, refresh your session or sign in again. No purchase or upgrade is required.
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href="/login">Refresh free access</a>
      </Button>
      {extra}
    </div>
  );
}
