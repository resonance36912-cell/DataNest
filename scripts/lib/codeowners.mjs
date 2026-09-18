/**
 * Minimal CODEOWNERS parser + path matcher, used to route repeated-failure
 * triage issues to the people who own the failing code.
 *
 * Lookup order matches GitHub: .github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS.
 * Rules are gitignore-style patterns; the LAST matching rule for a path wins.
 *
 * Owners come back split into individual users (assignable via the issues API)
 * and teams (`@org/team` — not assignable, so they get @-mentioned in the body).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CANDIDATE_FILES = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

/** Compile a CODEOWNERS pattern into a RegExp over repo-relative POSIX paths. */
export function compileOwnerPattern(pattern) {
  let p = pattern.trim();
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);

  let src = "";
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i];
    if (ch === "*") {
      if (p[i + 1] === "*") {
        // `**/` matches any number of leading directories, `**` matches anything.
        if (p[i + 2] === "/") {
          src += "(?:.*/)?";
          i += 2;
        } else {
          src += ".*";
          i += 1;
        }
      } else {
        src += "[^/]*";
      }
    } else if (ch === "?") src += "[^/]";
    else src += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  // A bare pattern without a slash matches at any depth (gitignore semantics).
  const prefix = anchored || p.includes("/") ? "" : "(?:.*/)?";
  // Directory patterns match everything beneath them.
  const suffix = dirOnly || pattern.trim().endsWith("/") ? "/.*" : "(?:/.*)?";
  return new RegExp(`^${prefix}${src}${suffix}$`);
}

/**
 * Parse CODEOWNERS text into ordered rules.
 * @returns {{ pattern: string, owners: string[], test: RegExp }[]}
 */
export function parseCodeowners(text) {
  const rules = [];
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || owners.length === 0) continue;
    try {
      rules.push({ pattern, owners, test: compileOwnerPattern(pattern) });
    } catch {
      // A pattern we cannot compile is skipped rather than breaking escalation.
    }
  }
  return rules;
}

/** Locate and read the repo's CODEOWNERS file. */
export function loadCodeowners(cwd = process.cwd(), explicitPath) {
  const candidates = explicitPath ? [explicitPath] : CANDIDATE_FILES;
  for (const rel of candidates) {
    const abs = resolve(cwd, rel);
    if (!existsSync(abs)) continue;
    try {
      return { path: rel, rules: parseCodeowners(readFileSync(abs, "utf8")) };
    } catch (err) {
      console.log(`[codeowners] could not read ${rel}: ${err.message}`);
    }
  }
  return { path: null, rules: [] };
}

/** Owners for a single path — last matching rule wins, like GitHub. */
export function ownersForPath(rules, filePath) {
  const p = String(filePath ?? "").replace(/^\.?\//, "");
  let owners = [];
  for (const rule of rules) {
    if (rule.test.test(p)) owners = rule.owners;
  }
  return owners;
}

/**
 * Resolve owners for a set of paths.
 *
 * @param {{ path: string|null, rules: any[] }} codeowners
 * @param {string[]} paths
 * @param {{ maxUsers?: number, maxTeams?: number, exclude?: string[] }} [opts]
 * @returns {{ users: string[], teams: string[], byPath: Record<string, string[]>, matchedPaths: string[] }}
 */
export function resolveOwners(codeowners, paths, opts = {}) {
  const maxUsers = opts.maxUsers ?? 10;
  const maxTeams = opts.maxTeams ?? 5;
  const exclude = new Set((opts.exclude ?? []).map((s) => s.toLowerCase().replace(/^@/, "")));

  const byPath = {};
  const userHits = new Map();
  const teamHits = new Map();

  for (const p of [...new Set(paths.filter(Boolean))]) {
    const owners = ownersForPath(codeowners.rules, p);
    if (!owners.length) continue;
    byPath[p] = owners;
    for (const owner of owners) {
      // Email owners cannot be assigned or mentioned; skip them.
      if (!owner.startsWith("@")) continue;
      const handle = owner.slice(1);
      if (exclude.has(handle.toLowerCase())) continue;
      const bucket = handle.includes("/") ? teamHits : userHits;
      bucket.set(handle, (bucket.get(handle) ?? 0) + 1);
    }
  }

  // Most-implicated owners first: whoever owns the largest share of the failures.
  const rank = (map, limit) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([handle]) => handle);

  return {
    users: rank(userHits, maxUsers),
    teams: rank(teamHits, maxTeams),
    byPath,
    matchedPaths: Object.keys(byPath),
  };
}
