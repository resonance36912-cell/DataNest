/**
 * Sanitize lyric / prompt text before sending to provider safety checkers
 * (fal-kling, Runway, etc.) which reject explicit language, drug refs, and
 * violent imagery. Masking keeps the cadence intact for lip-sync while
 * avoiding content_policy_violation errors that block retries.
 */

// Word -> replacement. Replacements preserve syllable count where possible
// so lip-sync timing isn't thrown off.
const REPLACEMENTS: Record<string, string> = {
  // Profanity
  fuck: "love",
  fucking: "loving",
  "fuckin": "lovin",
  "fuckin'": "lovin'",
  fucked: "loved",
  fucker: "lover",
  shit: "stuff",
  bitch: "babe",
  bitches: "babes",
  cunt: "one",
  dick: "guy",
  pussy: "kitty",
  ass: "back",
  asshole: "rascal",
  bastard: "buddy",
  damn: "dang",
  nigga: "fella",
  niggas: "fellas",
  // Drug references
  coke: "soda",
  cocaine: "sugar",
  crack: "snack",
  weed: "herb",
  blunt: "smoke",
  meth: "mint",
  heroin: "honey",
  dope: "hope",
  molly: "candy",
  xan: "tea",
  xans: "teas",
  xanax: "tablet",
  percs: "pills",
  lean: "drink",
  // Weapons / violence
  gun: "one",
  guns: "ones",
  glock: "clock",
  kill: "thrill",
  killing: "thrilling",
  shoot: "shout",
  shooting: "shouting",
  murder: "wonder",
  blood: "love",
};

const ALL_KEYS = Object.keys(REPLACEMENTS).sort((a, b) => b.length - a.length);
// Match whole words case-insensitively. We use a custom right-boundary
// because `\b` fails when the key ends in a non-word char like `'`
// (e.g. `fuckin'` would never match `\bfuckin'\b`). Left side: word boundary.
// Right side: end-of-string, or any non-letter/digit/apostrophe — that way
// `fuckin'` matches, but `fucking` (longer) still wins via length-sorted
// alternation.
const PATTERN = new RegExp(
  `\\b(${ALL_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z0-9'])`,
  "gi",
);

function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase())
    return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function sanitizeForSafetyChecker(text: string): {
  sanitized: string;
  changed: boolean;
  hits: string[];
} {
  if (!text) return { sanitized: text, changed: false, hits: [] };
  const hits: string[] = [];
  const sanitized = text.replace(PATTERN, (match) => {
    const key = match.toLowerCase();
    const repl = REPLACEMENTS[key];
    if (!repl) return match;
    hits.push(key);
    return preserveCase(match, repl);
  });
  return { sanitized, changed: sanitized !== text, hits };
}
