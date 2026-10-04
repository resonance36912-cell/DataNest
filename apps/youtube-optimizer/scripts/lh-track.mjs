/**
 * Lighthouse baseline tracks.
 *
 * Scores differ systematically between machines: a laptop and a GitHub runner
 * are not comparable, so they must not share one baseline. A "track" is a named
 * baseline lane — `ci` (runner numbers, the one the PR gate enforces) and
 * `local` (developer machine) by default — each with its own baseline file.
 *
 * Resolution order: explicit LH_TRACK  >  CI ? "ci" : "local".
 * The `ci` track keeps the historical `.lighthouse/baseline.json` path so the
 * committed baseline and its provenance stay untouched.
 */
import process from "node:process";

export const DEFAULT_TRACKS = ["ci", "local"];
const TRACK_RE = /^[a-z0-9][a-z0-9-]*$/;

export function inCI(env = process.env) {
  return env["CI"] === "true" || env["CI"] === "1";
}

/** Resolve the active track name, validating its shape. */
export function resolveTrack(env = process.env) {
  const explicit = (env["LH_TRACK"] ?? "").trim().toLowerCase();
  const track = explicit || (inCI(env) ? "ci" : "local");
  if (!TRACK_RE.test(track)) {
    throw new Error(
      `invalid track "${track}" — use lowercase letters, digits and dashes (e.g. ${DEFAULT_TRACKS.join(", ")})`,
    );
  }
  return track;
}

/** Baseline file for a track; `ci` keeps the legacy unsuffixed path. */
export function baselinePath(track) {
  return track === "ci" ? ".lighthouse/baseline.json" : `.lighthouse/baseline.${track}.json`;
}

/** Human note used in logs and the PR comment. */
export function describeTrack(track) {
  return track === "ci"
    ? "ci (CI runner baseline — enforced by the PR gate)"
    : `${track} (separate baseline lane, not enforced in CI)`;
}
