/**
 * Identifies which backend (auth) environment the current build is talking to.
 * Preview and production builds can be wired to different backend projects,
 * which means an account created in one will not exist in the other.
 */

export type AuthEnvKind = "production" | "preview" | "local" | "unknown";

export interface AuthEnvironment {
  kind: AuthEnvKind;
  label: string;
  /** Backend project reference derived from the configured backend URL. */
  projectRef: string;
  /** Backend URL the auth client is pointed at. */
  backendUrl: string;
  /** Host serving the current app. */
  host: string;
  /** True when the environment is not the live production one. */
  isNonProduction: boolean;
}

const PRODUCTION_HOSTS = ["syncvision.life", "www.syncvision.life"];

export function deriveProjectRef(url: string | undefined): string {
  if (!url) return "unknown";
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

export function classifyHost(host: string): AuthEnvKind {
  if (!host) return "unknown";
  if (PRODUCTION_HOSTS.includes(host) || host.endsWith(".chatgpt.site")) return "production";
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return "local";
  if (host.includes("preview") || host.endsWith("lovable.app") || host.endsWith("lovableproject.com")) {
    return host.endsWith("lovable.app") && !host.includes("preview") ? "production" : "preview";
  }
  return "unknown";
}

export function getAuthEnvironment(): AuthEnvironment {
  const backendUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const kind = classifyHost(host);

  const label =
    kind === "production"
      ? "Live"
      : kind === "preview"
        ? "Preview"
        : kind === "local"
          ? "Local"
          : "Unknown";

  return {
    kind,
    label,
    projectRef: deriveProjectRef(backendUrl),
    backendUrl,
    host,
    isNonProduction: kind !== "production",
  };
}
