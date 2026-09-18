import * as React from "react";
import { Lock, ExternalLink, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hubCheckoutUrl, HUB_URL } from "@/lib/entitlement";
import type { FeatureGateState, GatedFeature } from "@/lib/featureGates";
import { recordFeatureAttempt } from "@/lib/featureAttempts";
import type { EntitlementDenialKind } from "@/lib/tierRequired";

/**
 * Canonical "Upgrade required" surface.
 *
 * Renders the same lock chip / copy / CTA whether the block was determined
 * client-side (Hub cache says the tier is too low) or server-side (an Edge
 * Function returned 402/403/409 via `assertFeatureAllowed`). This keeps the
 * workflow visually consistent no matter which check tripped.
 *
 * Two variants:
 *   - `compact` (default) — inline strip suitable for card headers / scene rows.
 *   - `panel`             — full block for empty states inside a step body.
 */

/**
 * Sanitize a raw server denial reason for user display.
 *
 * The server sometimes includes internal diagnostics in the `error` field
 * (function names, feature keys, quoted tiers, occasional IDs from
 * downstream providers). We never want to render those verbatim: they
 * confuse users and can leak identifiers that belong in audit logs, not
 * UI. This function keeps only human-readable prose and swaps anything
 * that smells like an identifier / URL / token / stack frame for a
 * neutral placeholder.
 *
 * Rules applied in order:
 *   1. Reject empty / non-string input → falls back to the kind template.
 *   2. Drop machine-prefix noise (`tier_required:`, `code=`, `AUTH_ERR:`).
 *   3. Redact:
 *        - URLs / IPs
 *        - Email addresses
 *        - UUIDs and long hex tokens (≥ 16 chars)
 *        - JWT-shaped strings (three base64 segments)
 *        - Bearer / api-key style prefixes
 *        - Filesystem paths, `at Object.<anonymous>` stack frames
 *        - `feature=…`, `user_id=…`, `function_name=…` kv leftovers
 *   4. Collapse whitespace, cap at 160 chars.
 *   5. If nothing meaningful survives, fall back to the kind template.
 *
 * Exported for the accompanying unit tests.
 */
export function sanitizeDenialReason(
  raw: string | null | undefined,
  kind: EntitlementDenialKind | undefined,
  fallback: string,
): string {
  // Keep the denial kind in this public sanitizer contract for callers and tests.
  void kind;
  if (typeof raw !== "string") return fallback;

  let s = raw.trim();
  if (!s) return fallback;

  // 1. Drop leading machine-prefix noise: "tier_required: ...", "ERR_FOO: ..."
  s = s.replace(/^[A-Z_][A-Z0-9_]{2,}\s*[:=]\s*/i, "");
  s = s.replace(/^(code|error|status)\s*[:=]\s*[A-Za-z0-9_-]+[.,;]?\s*/gi, "");

  // 2. Redact obvious secrets / identifiers.
  s = s
    // URLs
    .replace(/\bhttps?:\/\/\S+/gi, "[link]")
    // Emails
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "[email]")
    // JWTs (three base64 segments) — middle segment can be short in some encoders.
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}\b/g, "[token]")
    // UUIDs
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    // Long hex / base64 tokens
    .replace(/\b[A-Fa-f0-9]{16,}\b/g, "[token]")
    .replace(/\bsk_[A-Za-z0-9_-]{8,}\b/g, "[token]")
    // Bearer / api-key style
    .replace(/\b(?:Bearer|Basic|apikey|api_key|token)\s+[A-Za-z0-9._-]+/gi, "[token]")
    // IPv4
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    // Stack frames
    .replace(/\s+at\s+[^\n]+/g, "")
    // Filesystem paths (posix or windows)
    .replace(/(?:\/[\w.-]+){2,}|[A-Za-z]:\\[\w.\\-]+/g, "[path]")
    // Leftover kv pairs with internal keys
    .replace(/\b(?:feature|function_name|user_id|project_id|job_id|request_id)\s*=\s*[^\s,;]+/gi, "")
    // Quoted internal identifiers ('storyboard_video', "generate-scene-image")
    .replace(/['"`][a-z][a-z0-9_-]{2,}['"`]/gi, (m) => {
      // Preserve short prose words that happen to be quoted (e.g. "Creator").
      const inner = m.slice(1, -1);
      return /^[a-z][a-z0-9]*$/.test(inner) && inner.length <= 8 ? inner : "[detail]";
    });

  // 3. Whitespace + length cap.
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 160) s = s.slice(0, 157).trimEnd() + "…";

  // 4. If we've redacted everything meaningful, use the template.
  const alnum = s.replace(/\[[a-z]+\]/g, "").replace(/[^A-Za-z]/g, "");
  if (alnum.length < 4) return fallback;

  // 5. Capitalize first letter for polish.
  return s[0].toUpperCase() + s.slice(1);
}

function kindHeading(kind: EntitlementDenialKind | undefined, requiredTier: string, label: string) {
  switch (kind) {
    case "subscription_inactive":
      return `Buy a pack to use ${label}`;
    case "entitlement_conflict":
      return `Pack limit reached for ${label}`;
    default:
      return (
        <>
          Upgrade to <span className="capitalize">{requiredTier}</span> to use {label}
        </>
      );
  }
}

function kindFallbackReason(
  kind: EntitlementDenialKind | undefined,
  requiredTier: string,
  currentTier: string,
): string {
  switch (kind) {
    case "subscription_inactive":
      return `Your pack isn't active. Buy a pack or upgrade to ${requiredTier} on the Hub to continue.`;
    case "entitlement_conflict":
      return `Your current pack (${currentTier}) can't run this job right now. Upgrade to ${requiredTier} or higher.`;
    default:
      return `Your current pack (${currentTier}) doesn't include this feature. Upgrade to ${requiredTier} or higher.`;
  }
}

function kindCtaLabel(kind: EntitlementDenialKind | undefined): string {
  switch (kind) {
    case "subscription_inactive": return "Buy pack on Resonance Hub";
    case "entitlement_conflict":  return "View hub pricing";
    default:                      return "Upgrade on Resonance Hub";
  }
}

export function TierRequiredState({
  gate,
  feature,
  variant = "compact",
  className = "",
  description,
  extra,
}: {
  gate: FeatureGateState;
  feature?: GatedFeature;
  variant?: "compact" | "panel";
  className?: string;
  /** Optional line explaining WHY this feature is paid. */
  description?: string;
  /** Slot for a secondary action (e.g. <CouponUnlockField />). */
  extra?: React.ReactNode;
}) {
  const href = hubCheckoutUrl(gate.sku);
  const source = gate.denialSource === "server" ? "server-verified" : "pack check";
  const currentTierLabel = String(gate.currentTier ?? "free");
  const requiredTierLabel = String(gate.requiredTier);
  const kind = gate.serverDenied?.kind;

  const fallbackReason = kindFallbackReason(kind, requiredTierLabel, currentTierLabel);
  const safeReason =
    description ??
    sanitizeDenialReason(gate.serverDenied?.message, kind, fallbackReason);

  const heading = kindHeading(kind, requiredTierLabel, gate.label);
  const ctaLabel = kindCtaLabel(kind);

  const handleUpgrade = () => {
    if (feature) recordFeatureAttempt(feature);
  };

  if (variant === "panel") {
    return (
      <div
        className={`flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-4 text-sm text-amber-100 ${className}`}
        role="status"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2">
            <Lock className="h-4 w-4 text-amber-200" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="font-semibold text-amber-50">{heading}</div>
            <div className="text-xs text-amber-100/80">
              You&apos;re currently on <span className="capitalize">{currentTierLabel}</span>. Blocked by {source}.
            </div>
            <div
              className="pt-1 text-xs text-amber-100/70"
              data-testid="tier-required-reason"
            >
              {safeReason}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-2 bg-amber-400 text-amber-950 hover:bg-amber-300">
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleUpgrade}>
              {ctaLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-amber-100/80 hover:text-amber-50 hover:bg-amber-400/10">
            <a href={HUB_URL} target="_blank" rel="noopener noreferrer">
              <Home className="h-3.5 w-3.5" />
              Back to hub
            </a>
          </Button>
          {extra}
        </div>
      </div>
    );
  }

  // compact
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100 ${className}`}
      role="status"
      title={safeReason}
    >
      <Lock className="h-3.5 w-3.5 text-amber-200" />
      <span>
        <span className="font-semibold capitalize">{requiredTierLabel}</span> pack required for{" "}
        <span className="font-medium">{gate.label}</span>{" "}
        <span className="text-amber-100/70">
          (you&apos;re on <span className="capitalize">{currentTierLabel}</span>)
        </span>
      </span>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="ml-auto h-7 gap-1.5 border-amber-300/40 bg-amber-400/10 px-2.5 text-[11px] text-amber-100 hover:bg-amber-400/20"
      >
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleUpgrade}>
          Upgrade
          <ExternalLink className="h-3 w-3" />
        </a>
      </Button>
      {extra}
    </div>
  );
}
