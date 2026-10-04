/**
 * Deployment metadata baked in at build time (see `define` in vite.config.ts).
 *
 * Used by the deploy verification exports so every PDF/CSV can be traced back
 * to the exact commit and build that produced the sitemap/canonical output.
 */

declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_COMMIT_SHORT__: string | undefined;
declare const __BUILD_BRANCH__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
declare const __BUILD_MODE__: string | undefined;

export interface BuildInfo {
  /** Full commit SHA, or "unknown" when git metadata was unavailable. */
  commit: string;
  /** First 7 chars of the commit SHA. */
  commitShort: string;
  branch: string;
  /** ISO timestamp of when the bundle was built. */
  builtAt: string;
  /** Vite mode: development | production. */
  mode: string;
}

function safe(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

export const BUILD_INFO: BuildInfo = {
  commit: safe(typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : undefined, "unknown"),
  commitShort: safe(
    typeof __BUILD_COMMIT_SHORT__ === "string" ? __BUILD_COMMIT_SHORT__ : undefined,
    "unknown",
  ),
  branch: safe(typeof __BUILD_BRANCH__ === "string" ? __BUILD_BRANCH__ : undefined, "unknown"),
  builtAt: safe(typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : undefined, ""),
  mode: safe(typeof __BUILD_MODE__ === "string" ? __BUILD_MODE__ : undefined, "unknown"),
};

/** Compact one-line form, e.g. "a1b2c3d (main) · built 2026-08-06 06:19". */
export function formatBuildInfo(info: BuildInfo = BUILD_INFO): string {
  const when = info.builtAt ? new Date(info.builtAt) : null;
  const stamp =
    when && !Number.isNaN(when.getTime()) ? when.toLocaleString() : "build time unknown";
  return `${info.commitShort} (${info.branch}) · ${info.mode} · built ${stamp}`;
}
