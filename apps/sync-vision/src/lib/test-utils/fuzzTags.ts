/**
 * Test-suite tagging for the fuzz / round-trip CI gate.
 *
 * Vitest does not have first-class metadata on describe blocks that survives
 * the JSON reporter, but it DOES match -t against the full concatenated test
 * name. So the simplest robust label system is to prefix the describe name
 * with stable bracketed tokens like `[@fuzzCritical]`. The tokens become
 * part of every nested test's fullName and can be selected via:
 *
 *   bunx vitest run -t '@fuzzCritical'
 *   bunx vitest run -t '@jsonRoundTrip'
 *   bunx vitest run -t '@jsonRoundTripIntegrity'
 *   bunx vitest run -t '@jsonReplacerReviver'
 *
 * Adding/renaming a fuzz suite then only requires using `taggedDescribe` with
 * the right tag — the CI gate selector never has to change.
 *
 * Tag inventory (keep this list authoritative):
 *
 *   @fuzzCritical            — RNG-driven, exhaustive, or shrinking suites
 *                              that the fuzz CI gate runs N times under tight
 *                              wall-clock and variance thresholds. Add ONLY
 *                              suites that draw from an RNG, enumerate ≥100
 *                              input shapes, or run a shrinker.
 *
 *   @jsonRoundTrip           — UMBRELLA tag covering all deterministic JSON
 *                              serialization guardrails. Every suite carrying
 *                              `@jsonRoundTripIntegrity` OR `@jsonReplacerReviver`
 *                              ALSO carries this umbrella so legacy `-t
 *                              '@jsonRoundTrip'` selectors keep working.
 *
 *   @jsonRoundTripIntegrity  — Deterministic round-trip integrity:
 *                              undefined ↔ null ↔ absent never leaks override
 *                              sentinels through plain JSON.stringify/parse
 *                              cycles. Run by its own dedicated sub-gate.
 *
 *   @jsonReplacerReviver     — Caller-supplied JSON replacer/reviver hook
 *                              guardrails (sentinel-avoidance invariants
 *                              survive custom serialization hooks). Run by
 *                              its own dedicated sub-gate so a regression
 *                              points at the EXACT surface area, separately
 *                              from the plain round-trip suite.
 */
import { describe } from "vitest";

export const FUZZ_TAG = {
  fuzzCritical: "@fuzzCritical",
  jsonRoundTrip: "@jsonRoundTrip",
  jsonRoundTripIntegrity: "@jsonRoundTripIntegrity",
  jsonReplacerReviver: "@jsonReplacerReviver",
} as const;

export type FuzzTag = (typeof FUZZ_TAG)[keyof typeof FUZZ_TAG];

/**
 * Wrap a describe block with one or more tag tokens. The tokens are emitted
 * verbatim at the start of the describe name so that vitest's -t regex matcher
 * can select suites by tag without depending on the human-readable suffix.
 *
 * Example:
 *   taggedDescribe(
 *     [FUZZ_TAG.jsonRoundTrip, FUZZ_TAG.jsonReplacerReviver],
 *     "custom JSON replacer/reviver: ...",
 *     () => { ... },
 *   );
 *
 * Resulting describe name:
 *   "[@jsonRoundTrip] [@jsonReplacerReviver] custom JSON replacer/reviver: ..."
 */
export function taggedDescribe(
  tags: readonly FuzzTag[],
  name: string,
  fn: () => void,
): void {
  if (tags.length === 0) {
    throw new Error("taggedDescribe requires at least one tag");
  }
  const prefix = tags.map((t) => `[${t}]`).join(" ");
  describe(`${prefix} ${name}`, fn);
}
