/**
 * Security audit log — local, per-device record of authentication activity.
 *
 * Supabase's auth log is server-side and not readable from the client, so we
 * record sign-in / session-refresh / sign-out events as they happen in this
 * browser, together with a coarse public IP and the user agent.
 * Stored on this device only (localStorage).
 */

const STORAGE_KEY = "syncvision.security.audit.v1";
const IP_CACHE_KEY = "syncvision.security.audit.ip";
export const MAX_AUDIT_ENTRIES = 100;

export type SecurityEventType =
  | "sign_in"
  | "session_refresh"
  | "sign_out"
  | "identity_connect"
  | "identity_relink"
  | "identity_remove"
  | "otp_send"
  | "otp_verify_success"
  | "otp_verify_failure"
  | "otp_timeout";

export interface SecurityAuditEntry {
  id: string;
  at: string;
  type: SecurityEventType;
  userId?: string | null;
  email?: string | null;
  provider?: string | null;
  ip?: string | null;
  userAgent?: string;
  scope?: "local" | "global";
  detail?: string | null;
}

export const EVENT_LABELS: Record<SecurityEventType, string> = {
  sign_in: "Sign-in",
  session_refresh: "Session refresh",
  sign_out: "Sign-out",
  identity_connect: "Identity connected",
  identity_relink: "Identity relinked",
  identity_remove: "Identity removed",
  otp_send: "Email code sent",
  otp_verify_success: "Email code verified",
  otp_verify_failure: "Email code failed",
  otp_timeout: "Email code expired",
};


export function loadSecurityAuditLog(): SecurityAuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SecurityAuditEntry =>
        !!e && typeof e.at === "string" && typeof e.type === "string",
    );
  } catch {
    return [];
  }
}

function persist(list: SecurityAuditEntry[]): SecurityAuditEntry[] {
  const trimmed = list.slice(0, MAX_AUDIT_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new CustomEvent("sv-security-audit"));
  } catch {
    /* non-browser */
  }
  return trimmed;
}

export function clearSecurityAuditLog(): SecurityAuditEntry[] {
  return persist([]);
}

/** Best-effort public IP lookup, cached for the tab session. */
export async function resolvePublicIp(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(IP_CACHE_KEY);
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: string };
    const ip = json?.ip ?? null;
    if (ip) {
      try {
        sessionStorage.setItem(IP_CACHE_KEY, ip);
      } catch {
        /* ignore */
      }
    }
    return ip;
  } catch {
    return null;
  }
}

/** Collapse duplicate events fired by multiple auth clients (hub + spoke). */
function isDuplicate(
  list: SecurityAuditEntry[],
  type: SecurityEventType,
  userId?: string | null,
  detail?: string | null,
) {
  const last = list[0];
  if (!last || last.type !== type) return false;
  if ((last.userId ?? null) !== (userId ?? null)) return false;
  if ((last.detail ?? null) !== (detail ?? null)) return false;
  return Date.now() - new Date(last.at).getTime() < 5000;
}

export async function recordSecurityEvent(input: {
  type: SecurityEventType;
  userId?: string | null;
  email?: string | null;
  provider?: string | null;
  scope?: "local" | "global";
  detail?: string | null;
}): Promise<void> {
  const current = loadSecurityAuditLog();
  if (isDuplicate(current, input.type, input.userId, input.detail ?? null)) return;

  const entry: SecurityAuditEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    type: input.type,
    userId: input.userId ?? null,
    email: input.email ?? null,
    provider: input.provider ?? null,
    scope: input.scope,
    detail: input.detail ?? null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    ip: null,
  };
  persist([entry, ...current]);

  const ip = await resolvePublicIp();
  if (!ip) return;
  persist(loadSecurityAuditLog().map((e) => (e.id === entry.id ? { ...e, ip } : e)));
}

/** Subscribe to log changes (same tab + other tabs). */
export function onSecurityAuditChange(handler: () => void): () => void {
  const onLocal = () => handler();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) handler();
  };
  window.addEventListener("sv-security-audit", onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("sv-security-audit", onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/** Short, readable device label derived from the user agent. */
export function describeDevice(ua?: string): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" :
    /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os =
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iOS" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} · ${os}`;
}
