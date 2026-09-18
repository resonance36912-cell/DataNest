export interface VideoPromptSection {
  text: string | null | undefined | false;
  maxChars: number;
}

function clipAtBoundary(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const candidate = clean.slice(0, Math.max(0, maxChars - 1));
  const boundary = candidate.lastIndexOf(" ");
  const clipped = boundary >= Math.floor(maxChars * 0.65)
    ? candidate.slice(0, boundary)
    : candidate;
  return `${clipped.trimEnd()}…`;
}

/**
 * Compose a provider-safe video prompt without chopping off the final safety,
 * continuity, and camera instructions. Each caller-supplied budget is applied
 * before the overall provider limit.
 */
export function composeBoundedVideoPrompt(
  sections: VideoPromptSection[],
  maxChars = 2400,
): string {
  const parts = sections
    .filter((section) => Boolean(section.text) && section.maxChars > 0)
    .map((section) => clipAtBoundary(String(section.text), section.maxChars));
  const composed = parts.join(" ");
  if (composed.length <= maxChars) return composed;

  // Defensive fallback for future callers whose section budgets exceed the
  // provider limit. Preserve both the opening direction and the final safety
  // instructions instead of blindly truncating the tail.
  const tail = parts.at(-1) || "";
  const tailBudget = Math.min(tail.length, Math.floor(maxChars * 0.25));
  const headBudget = Math.max(0, maxChars - tailBudget - 1);
  return `${clipAtBoundary(parts.slice(0, -1).join(" "), headBudget)} ${clipAtBoundary(tail, tailBudget)}`.trim();
}
