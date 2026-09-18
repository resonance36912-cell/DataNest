/**
 * Deterministic pruning of the triage issue's retry history.
 *
 * The escalation script appends one comment per failing run, and each of those
 * comments carries a Metrics block. Without pruning, an issue that stays red for
 * days accumulates unbounded stale run data and the ledger drifts away from the
 * currently configured retention.
 *
 * `pruneHistory` is pure and deterministic: same inputs -> same output, no clock
 * reads beyond the `now` you pass in, no ordering surprises. It is the single
 * source of truth for what "the latest HISTORY_LIMIT runs" means, used both for
 * the stored ledger and for deciding which per-run comments to drop.
 */

/**
 * @typedef {object} HistoryEntry
 * @property {string|number} id           workflow run id
 * @property {string} created_at          ISO timestamp
 * @property {string} [conclusion]        success | failure | cancelled | ...
 * @property {number} [run_attempt]
 * @property {string} [html_url]
 * @property {string} [head_sha]
 */

const KEEP_FIELDS = ["id", "created_at", "conclusion", "run_attempt", "html_url", "head_sha"];

/** Normalise to the compact stored shape; unknown fields are dropped on purpose. */
export function normalizeEntry(entry) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const f of KEEP_FIELDS) {
    if (entry?.[f] !== undefined && entry[f] !== null) out[f] = f === "id" ? String(entry[f]) : entry[f];
  }
  return out;
}

/**
 * Merge, dedupe, sort and cap history entries.
 *
 * Rules (in order):
 *  1. newer entries for the same run id win (later `run_attempt` / fresher data);
 *  2. sort newest-first by `created_at`, tie-broken by descending numeric id so
 *     the result never depends on input order;
 *  3. drop anything older than `days` (0 = no age limit), except `pinnedIds`
 *     (the current run) which are always retained;
 *  4. keep at most `limit` entries.
 *
 * @param {object} args
 * @param {HistoryEntry[]} [args.stored]   previously persisted entries
 * @param {HistoryEntry[]} [args.incoming] entries observed on this run
 * @param {number} args.limit              HISTORY_LIMIT (>= 1)
 * @param {number} [args.days]             HISTORY_DAYS (0 = no age limit)
 * @param {(string|number)[]} [args.pinnedIds]
 * @param {number} [args.now]              epoch ms, injected for tests
 */
export function pruneHistory({ stored = [], incoming = [], limit, days = 0, pinnedIds = [], now = Date.now() }) {
  const pinned = new Set(pinnedIds.map(String));
  /** @type {Map<string, Record<string, any>>} */
  const byId = new Map();
  for (const raw of [...stored, ...incoming]) {
    const entry = normalizeEntry(raw);
    if (!entry.id || !entry.created_at) continue;
    const prev = byId.get(entry.id);
    // Later writer wins, but never lose a field the earlier record had.
    byId.set(entry.id, prev ? { ...prev, ...entry } : entry);
  }

  const cutoff = days > 0 ? now - days * 86_400_000 : null;
  const all = [...byId.values()].sort((a, b) => {
    const dt = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (dt !== 0) return dt;
    return Number(b.id) - Number(a.id);
  });

  const agedOut = [];
  const withinAge = all.filter((e) => {
    if (!cutoff || pinned.has(e.id) || new Date(e.created_at).getTime() >= cutoff) return true;
    agedOut.push(e);
    return false;
  });

  const kept = withinAge.slice(0, limit);
  const overLimit = withinAge.slice(limit);
  const keptIds = new Set(kept.map((e) => e.id));

  return {
    kept,
    keptIds,
    // Everything the caller should forget: aged out first, then over the cap.
    pruned: [...agedOut, ...overLimit],
    agedOutCount: agedOut.length,
    overLimitCount: overLimit.length,
  };
}

const DATA_OPEN = "<!-- ci-history-data";
const DATA_CLOSE = "-->";

/** Extract the stored entries from a ledger comment body (tolerant of garbage). */
export function parseLedger(body) {
  if (!body) return [];
  const start = body.indexOf(DATA_OPEN);
  if (start === -1) return [];
  const end = body.indexOf(DATA_CLOSE, start + DATA_OPEN.length);
  if (end === -1) return [];
  try {
    const parsed = JSON.parse(body.slice(start + DATA_OPEN.length, end).trim());
    return Array.isArray(parsed?.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

/** Render the ledger comment: human-readable table + machine-readable payload. */
export function renderLedger({ kept, limit, days, agedOutCount, overLimitCount, updatedAt }) {
  const glyph = (e) =>
    e.conclusion === "success" ? "✓" : e.conclusion === "failure" ? "✗" : e.conclusion === "cancelled" ? "∅" : "·";
  const rows = kept
    .map((e) => {
      const attempt = (e.run_attempt ?? 1) > 1 ? ` (attempt ${e.run_attempt})` : "";
      const runCell = e.html_url ? `[run ${e.id}](${e.html_url})` : `run ${e.id}`;
      return `| ${glyph(e)} | ${e.created_at} | ${e.conclusion ?? "unknown"}${attempt} | \`${(e.head_sha ?? "").slice(0, 7)}\` | ${runCell} |`;
    })
    .join("\n");

  return [
    "<!-- ci-history -->",
    "#### Retry history (pruned)",
    "",
    `Latest **${kept.length}** of at most ${limit} runs${days ? `, max age ${days}d` : ", no age limit"}.` +
      ` Pruned on this update: ${agedOutCount} aged out, ${overLimitCount} over the limit.`,
    "",
    "| | When | Outcome | Commit | Run |",
    "| --- | --- | --- | --- | --- |",
    rows || "| | _no history retained_ | | | |",
    "",
    `_Rebuilt deterministically on every update (${updatedAt}); older runs are dropped, not accumulated._`,
    "",
    `${DATA_OPEN}`,
    JSON.stringify({ version: 1, limit, days, updatedAt, runs: kept }),
    DATA_CLOSE,
  ].join("\n");
}
