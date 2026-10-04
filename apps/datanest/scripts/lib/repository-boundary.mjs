import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      source += ".*";
      i += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(char);
    }
  }
  return new RegExp("^" + source + "$");
}

export function loadBoundary(contractPath = resolve("config/repository-boundary.json")) {
  return JSON.parse(readFileSync(contractPath, "utf8"));
}

export function classifyPath(path, boundary) {
  const normalized = path.replace(/^\.\//, "");
  for (const rule of boundary.pathRules ?? []) {
    for (const pattern of rule.patterns ?? []) {
      if (globToRegExp(pattern).test(normalized)) {
        return { path: normalized, policy: rule.policy, pattern };
      }
    }
  }
  return { path: normalized, policy: boundary.defaultPolicy ?? "unclassified", pattern: null };
}

export function classifyPaths(paths, boundary) {
  return paths.filter(Boolean).map((path) => classifyPath(path, boundary));
}
