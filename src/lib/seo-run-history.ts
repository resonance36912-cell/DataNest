/**
 * Local history of deploy verification runs (see src/lib/seo-live-checks.ts).
 *
 * Kept in localStorage on the ops machine — this is an internal runbook aid,
 * not shared state. Each run snapshots every check's status + detail so the
 * next run can be diffed against it ("what changed since the last deploy").
 */

import type { SeoCheckResult, SeoCheckStatus } from "./seo-live-checks";

const KEY = "seo-deploy-checklist:runs:v1";
const MAX_RUNS = 20;

export interface SeoRun {
  at: string;
  results: { id: string; label: string; status: SeoCheckStatus; detail: string }[];
}

export function loadRuns(): SeoRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SeoRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(results: SeoCheckResult[], at = new Date().toISOString()): SeoRun[] {
  const run: SeoRun = {
    at,
    results: results.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      detail: r.detail,
    })),
  };
  const next = [run, ...loadRuns()].slice(0, MAX_RUNS);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — history stays in-memory for this session */
  }
  return next;
}

export function clearRuns(): SeoRun[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}

export type DiffKind = "fixed" | "regressed" | "unchanged" | "added" | "removed" | "detail";

export interface SeoDiffEntry {
  id: string;
  label: string;
  kind: DiffKind;
  before?: SeoCheckStatus;
  after?: SeoCheckStatus;
  beforeDetail?: string;
  afterDetail?: string;
}

/** Compare the newest run against the one before it. */
export function diffRuns(current: SeoRun, previous: SeoRun | undefined): SeoDiffEntry[] {
  const prevById = new Map((previous?.results ?? []).map((r) => [r.id, r]));
  const out: SeoDiffEntry[] = [];

  for (const c of current.results) {
    const p = prevById.get(c.id);
    if (!p) {
      out.push({ id: c.id, label: c.label, kind: "added", after: c.status, afterDetail: c.detail });
      continue;
    }
    prevById.delete(c.id);
    if (p.status !== c.status) {
      out.push({
        id: c.id,
        label: c.label,
        kind: c.status === "pass" ? "fixed" : "regressed",
        before: p.status,
        after: c.status,
        beforeDetail: p.detail,
        afterDetail: c.detail,
      });
    } else if (p.detail !== c.detail) {
      out.push({
        id: c.id,
        label: c.label,
        kind: "detail",
        before: p.status,
        after: c.status,
        beforeDetail: p.detail,
        afterDetail: c.detail,
      });
    } else {
      out.push({ id: c.id, label: c.label, kind: "unchanged", before: p.status, after: c.status });
    }
  }

  for (const p of prevById.values()) {
    out.push({ id: p.id, label: p.label, kind: "removed", before: p.status, beforeDetail: p.detail });
  }

  const order: Record<DiffKind, number> = {
    regressed: 0,
    fixed: 1,
    detail: 2,
    added: 3,
    removed: 4,
    unchanged: 5,
  };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** True when nothing meaningful moved between the two runs. */
export function isNoChange(entries: SeoDiffEntry[]): boolean {
  return entries.every((e) => e.kind === "unchanged");
}
