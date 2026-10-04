/**
 * Parse two merge debug ZIPs and diff them across the three main data sets:
 * effective_windows, timeline_gaps, and timeline_overlaps.
 *
 * Uses `merge-debug-report.json` inside each ZIP as the source of truth (it is
 * a superset of every CSV) so the diff stays lossless.
 */
import JSZip from "jszip";
import type { MergeDebugReport } from "@/lib/merge-debug-report";

export interface LoadedDebugBundle {
  file_name: string;
  report: MergeDebugReport;
}

const EPS = 0.005;

export async function loadDebugBundle(file: File): Promise<LoadedDebugBundle> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("merge-debug-report.json");
  if (!entry) throw new Error(`${file.name}: missing merge-debug-report.json`);
  const text = await entry.async("string");
  let parsed: MergeDebugReport;
  try {
    parsed = JSON.parse(text) as MergeDebugReport;
  } catch (e) {
    throw new Error(`${file.name}: invalid JSON — ${e instanceof Error ? e.message : "parse error"}`);
  }
  return { file_name: file.name, report: parsed };
}

type Window = MergeDebugReport["effective_windows"][number];
type Gap = MergeDebugReport["timeline_gaps"][number];

export interface WindowDiffRow {
  scene_number: number;
  status: "added" | "removed" | "changed" | "unchanged";
  a: Window | null;
  b: Window | null;
  changes: Array<{ field: keyof Window; a: unknown; b: unknown; delta_sec?: number }>;
}

export interface GapDiffRow {
  key: string;
  status: "added" | "removed" | "changed" | "unchanged";
  a: Gap | null;
  b: Gap | null;
  delta_sec?: number;
}

export interface MergeDebugDiff {
  a: { file_name: string; job_id: string | null; generated_at: string };
  b: { file_name: string; job_id: string | null; generated_at: string };
  totals: {
    a: MergeDebugReport["totals"];
    b: MergeDebugReport["totals"];
    delta: Record<keyof MergeDebugReport["totals"], number>;
  };
  windows: {
    added: WindowDiffRow[];
    removed: WindowDiffRow[];
    changed: WindowDiffRow[];
    unchanged_count: number;
  };
  gaps: {
    added: GapDiffRow[];
    removed: GapDiffRow[];
    changed: GapDiffRow[];
    unchanged_count: number;
  };
  overlaps: {
    added: GapDiffRow[];
    removed: GapDiffRow[];
    changed: GapDiffRow[];
    unchanged_count: number;
  };
}

const NUMERIC_WINDOW_FIELDS: Array<keyof Window> = [
  "source_duration_sec",
  "start_offset_sec",
  "end_offset_sec",
  "tail_cut_sec",
  "kept_sec",
  "overflow_sec",
];

function diffWindow(a: Window, b: Window): WindowDiffRow["changes"] {
  const changes: WindowDiffRow["changes"] = [];
  for (const f of NUMERIC_WINDOW_FIELDS) {
    const av = (a[f] ?? null) as number | null;
    const bv = (b[f] ?? null) as number | null;
    if (av === null && bv === null) continue;
    if (av === null || bv === null || Math.abs((av as number) - (bv as number)) > EPS) {
      changes.push({
        field: f,
        a: av,
        b: bv,
        delta_sec: av !== null && bv !== null ? Math.round((bv - av) * 1000) / 1000 : undefined,
      });
    }
  }
  if (a.overflow !== b.overflow) changes.push({ field: "overflow", a: a.overflow, b: b.overflow });
  if (a.is_default !== b.is_default) changes.push({ field: "is_default", a: a.is_default, b: b.is_default });
  if ((a.video_url ?? null) !== (b.video_url ?? null))
    changes.push({ field: "video_url", a: a.video_url, b: b.video_url });
  return changes;
}

function gapKey(g: Gap): string {
  return `${g.kind}:${g.from_scene ?? "-"}→${g.to_scene ?? "-"}`;
}

function diffGapCollection(aRows: Gap[], bRows: Gap[]) {
  const aMap = new Map(aRows.map((r) => [gapKey(r), r]));
  const bMap = new Map(bRows.map((r) => [gapKey(r), r]));
  const added: GapDiffRow[] = [];
  const removed: GapDiffRow[] = [];
  const changed: GapDiffRow[] = [];
  let unchanged = 0;
  const keys = new Set([...aMap.keys(), ...bMap.keys()]);
  for (const key of keys) {
    const a = aMap.get(key) ?? null;
    const b = bMap.get(key) ?? null;
    if (a && !b) removed.push({ key, status: "removed", a, b: null });
    else if (b && !a) added.push({ key, status: "added", a: null, b });
    else if (a && b) {
      const delta = Math.round((b.delta_sec - a.delta_sec) * 1000) / 1000;
      if (Math.abs(delta) > EPS || Math.abs(a.from_sec - b.from_sec) > EPS || Math.abs(a.to_sec - b.to_sec) > EPS) {
        changed.push({ key, status: "changed", a, b, delta_sec: delta });
      } else {
        unchanged++;
      }
    }
  }
  return { added, removed, changed, unchanged_count: unchanged };
}

export function diffMergeDebugReports(a: LoadedDebugBundle, b: LoadedDebugBundle): MergeDebugDiff {
  const aWinMap = new Map(a.report.effective_windows.map((w) => [w.scene_number, w]));
  const bWinMap = new Map(b.report.effective_windows.map((w) => [w.scene_number, w]));
  const added: WindowDiffRow[] = [];
  const removed: WindowDiffRow[] = [];
  const changed: WindowDiffRow[] = [];
  let unchanged = 0;
  const scenes = new Set([...aWinMap.keys(), ...bWinMap.keys()]);
  for (const sn of Array.from(scenes).sort((x, y) => x - y)) {
    const wa = aWinMap.get(sn) ?? null;
    const wb = bWinMap.get(sn) ?? null;
    if (wa && !wb) removed.push({ scene_number: sn, status: "removed", a: wa, b: null, changes: [] });
    else if (wb && !wa) added.push({ scene_number: sn, status: "added", a: null, b: wb, changes: [] });
    else if (wa && wb) {
      const c = diffWindow(wa, wb);
      if (c.length > 0) changed.push({ scene_number: sn, status: "changed", a: wa, b: wb, changes: c });
      else unchanged++;
    }
  }

  const aGaps = a.report.timeline_gaps.filter((g) => g.kind !== "overlap");
  const bGaps = b.report.timeline_gaps.filter((g) => g.kind !== "overlap");
  const aOvers = a.report.timeline_gaps.filter((g) => g.kind === "overlap");
  const bOvers = b.report.timeline_gaps.filter((g) => g.kind === "overlap");

  const totalsDelta = {} as Record<keyof MergeDebugReport["totals"], number>;
  (Object.keys(a.report.totals) as Array<keyof MergeDebugReport["totals"]>).forEach((k) => {
    const av = a.report.totals[k] ?? 0;
    const bv = b.report.totals[k] ?? 0;
    totalsDelta[k] = Math.round((bv - av) * 1000) / 1000;
  });

  return {
    a: { file_name: a.file_name, job_id: a.report.render_job.id, generated_at: a.report.generated_at },
    b: { file_name: b.file_name, job_id: b.report.render_job.id, generated_at: b.report.generated_at },
    totals: { a: a.report.totals, b: b.report.totals, delta: totalsDelta },
    windows: { added, removed, changed, unchanged_count: unchanged },
    gaps: diffGapCollection(aGaps, bGaps),
    overlaps: diffGapCollection(aOvers, bOvers),
  };
}

export function downloadMergeDebugDiffJson(diff: MergeDebugDiff) {
  const json = JSON.stringify(diff, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `merge-debug-diff-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
