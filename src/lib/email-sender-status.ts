/**
 * Sender-domain readiness for report delivery.
 *
 * The sender domain itself is provisioned by the platform (DNS delegation),
 * not by app code. What the app *can* verify is whether the send pipeline is
 * reachable: the `send-transactional-email` function must be deployed before
 * any report email can leave the system.
 */

const STORAGE_KEY = "syncvision.email.sender.config.v1";

export type SenderCheckState = "unknown" | "checking" | "ready" | "pending" | "error";

export interface SenderConfig {
  /** Sender subdomain shown in the From header, e.g. notify.syncvision.life */
  senderDomain: string;
  /** Display name used in the From header. */
  fromName: string;
  /** Reply-to address for report deliveries. */
  replyTo: string;
  /** ISO timestamp of the last successful readiness check. */
  lastVerifiedAt: string | null;
}

export const DEFAULT_SENDER_CONFIG: SenderConfig = {
  senderDomain: "",
  fromName: "SyncVision Reports",
  replyTo: "",
  lastVerifiedAt: null,
};

export function loadSenderConfig(): SenderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SENDER_CONFIG };
    return { ...DEFAULT_SENDER_CONFIG, ...(JSON.parse(raw) as Partial<SenderConfig>) };
  } catch {
    return { ...DEFAULT_SENDER_CONFIG };
  }
}

export function saveSenderConfig(config: SenderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable — config stays in-memory for this session */
  }
}

export function clearSenderConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

export function isValidDomain(value: string): boolean {
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  return value.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface SenderCheck {
  id: string;
  label: string;
  state: Exclude<SenderCheckState, "checking">;
  detail: string;
}

function functionsBase(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return url ? `${url.replace(/\/$/, "")}/functions/v1` : null;
}

/**
 * Probes the delivery pipeline. Never throws — every failure is reported as a
 * check row so the UI can render a stable status board.
 */
export async function runSenderChecks(config: SenderConfig): Promise<SenderCheck[]> {
  const checks: SenderCheck[] = [];

  const domain = config.senderDomain.trim();
  checks.push({
    id: "domain",
    label: "Sender domain configured",
    state: domain === "" ? "pending" : isValidDomain(domain) ? "ready" : "error",
    detail:
      domain === ""
        ? "No sender domain saved yet. Complete the email domain setup, then save it here."
        : isValidDomain(domain)
          ? `Reports will be sent from ${config.fromName || "SyncVision"} <reports@${domain}>.`
          : `"${domain}" is not a valid domain name.`,
  });

  checks.push({
    id: "reply-to",
    label: "Reply-to address",
    state: config.replyTo.trim() === "" ? "pending" : isValidEmail(config.replyTo) ? "ready" : "error",
    detail:
      config.replyTo.trim() === ""
        ? "Optional, but recommended so recipients can respond to report emails."
        : isValidEmail(config.replyTo)
          ? `Replies route to ${config.replyTo.trim()}.`
          : "Not a valid email address.",
  });

  const base = functionsBase();
  if (!base) {
    checks.push({
      id: "pipeline",
      label: "Delivery pipeline reachable",
      state: "error",
      detail: "Backend URL is not available in this environment.",
    });
    return checks;
  }

  try {
    const res = await fetch(`${base}/send-transactional-email`, {
      method: "OPTIONS",
      headers: { "Content-Type": "application/json" },
    });
    const deployed = res.status !== 404;
    checks.push({
      id: "pipeline",
      label: "Delivery pipeline reachable",
      state: deployed ? "ready" : "pending",
      detail: deployed
        ? "The send function responded — report emails can be queued."
        : "The send function is not deployed yet. Email delivery is set up once the sender domain is verified.",
    });
  } catch (err) {
    checks.push({
      id: "pipeline",
      label: "Delivery pipeline reachable",
      state: "error",
      detail: err instanceof Error ? err.message : "Network error while probing the send function.",
    });
  }

  return checks;
}

export function overallState(checks: SenderCheck[]): Exclude<SenderCheckState, "checking"> {
  if (checks.length === 0) return "unknown";
  if (checks.some((c) => c.state === "error")) return "error";
  if (checks.some((c) => c.state === "pending")) return "pending";
  return "ready";
}
