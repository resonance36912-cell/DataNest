export const ROP_OUTBOUND_ALLOWED_ORIGINS_ENV = "ROP_OUTBOUND_ALLOWED_ORIGINS";

export class OutboundOriginPolicyError extends Error {
  constructor(
    public readonly code:
      | "invalid_origin"
      | "insecure_scheme"
      | "embedded_credentials"
      | "non_origin_url"
      | "forbidden_host"
      | "allowlist_unconfigured"
      | "origin_not_allowed",
    message: string,
  ) {
    super(message);
    this.name = "OutboundOriginPolicyError";
  }
}

function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host.includes(":")) return true; // reject all IPv6 literals
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true; // reject all IPv4 literals
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  );
}

export function normalizeOutboundOrigin(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new OutboundOriginPolicyError("invalid_origin", "Outbound destination is not a valid URL.");
  }
  if (url.username || url.password) {
    throw new OutboundOriginPolicyError(
      "embedded_credentials",
      "Outbound destinations must not contain embedded credentials.",
    );
  }
  if (url.protocol !== "https:") {
    throw new OutboundOriginPolicyError("insecure_scheme", "Outbound destinations must use HTTPS.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new OutboundOriginPolicyError(
      "non_origin_url",
      "Outbound destinations must be bare origins without path, query, or fragment.",
    );
  }
  if (isForbiddenHost(url.hostname)) {
    throw new OutboundOriginPolicyError(
      "forbidden_host",
      "Outbound destinations must use a public DNS hostname, not localhost or an IP literal.",
    );
  }
  return url.origin;
}

export function parseAllowedOutboundOrigins(raw: string | undefined | null): Set<string> {
  const allowed = new Set<string>();
  if (!raw?.trim()) return allowed;
  for (const entry of raw.split(/[\s,]+/).filter(Boolean)) {
    allowed.add(normalizeOutboundOrigin(entry));
  }
  return allowed;
}

export function requireAllowedOutboundOrigin(
  input: string,
  rawAllowlist: string | undefined | null,
): string {
  const normalized = normalizeOutboundOrigin(input);
  const allowed = parseAllowedOutboundOrigins(rawAllowlist);
  if (allowed.size === 0) {
    throw new OutboundOriginPolicyError(
      "allowlist_unconfigured",
      `${ROP_OUTBOUND_ALLOWED_ORIGINS_ENV} must contain at least one explicit HTTPS origin.`,
    );
  }
  if (!allowed.has(normalized)) {
    throw new OutboundOriginPolicyError(
      "origin_not_allowed",
      `Outbound destination origin is not present in ${ROP_OUTBOUND_ALLOWED_ORIGINS_ENV}.`,
    );
  }
  return normalized;
}
