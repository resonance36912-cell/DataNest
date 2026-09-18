/**
 * Tiny word-level diff used by the scene prompt preview to highlight
 * how Scene Director edits change the composed prompt sent to the model.
 *
 * Returns a list of segments tagged as equal / added / removed. Uses the
 * classic LCS dynamic-programming algorithm on whitespace-split tokens
 * (punctuation kept attached to its word, which is fine for highlighting).
 */
export type DiffOp = "equal" | "add" | "remove";
export interface DiffSegment {
  op: DiffOp;
  text: string;
}

function tokenize(s: string): string[] {
  // Split on whitespace but keep the whitespace so we can reconstruct the
  // string faithfully when rendering — important so spacing in the preview
  // matches what is actually sent.
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

export function diffWords(a: string, b: string): DiffSegment[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;

  // LCS table — capped to avoid pathological prompts blowing memory.
  // 1500x1500 = 2.25M cells of Uint16 ≈ 4.5MB worst case, which is plenty
  // for any realistic prompt. If we exceed that, fall back to a coarse diff.
  if (n > 1500 || m > 1500) {
    return [
      { op: "remove", text: a },
      { op: "add", text: b },
    ];
  }

  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (A[i - 1] === B[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const segs: DiffSegment[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      segs.push({ op: "equal", text: A[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      segs.push({ op: "remove", text: A[i - 1] });
      i--;
    } else {
      segs.push({ op: "add", text: B[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    segs.push({ op: "remove", text: A[i - 1] });
    i--;
  }
  while (j > 0) {
    segs.push({ op: "add", text: B[j - 1] });
    j--;
  }
  segs.reverse();

  // Merge adjacent same-op segments so rendering is cleaner.
  const merged: DiffSegment[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.op === seg.op) last.text += seg.text;
    else merged.push({ ...seg });
  }
  return merged;
}

export function summarizeDiff(segs: DiffSegment[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const s of segs) {
    if (s.op === "equal") continue;
    // Count non-whitespace tokens only so "added 3 words" is meaningful.
    const tokens = s.text.split(/\s+/).filter(Boolean).length;
    if (s.op === "add") added += tokens;
    else removed += tokens;
  }
  return { added, removed };
}
