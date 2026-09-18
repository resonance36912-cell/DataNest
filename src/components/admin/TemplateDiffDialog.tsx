import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DiffRow = { type: "same" | "add" | "del"; text: string };

/** Line-level diff via longest-common-subsequence. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: "del", text: a[i] });
      i++;
    } else {
      rows.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ type: "del", text: a[i++] });
  while (j < m) rows.push({ type: "add", text: b[j++] });
  return rows;
}

function DiffBlock({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  const rows = useMemo(() => diffLines(before, after), [before, after]);
  const changed = rows.some((r) => r.type !== "same");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{label}</p>
        {!changed && (
          <span className="text-[10px] text-muted-foreground">unchanged</span>
        )}
      </div>
      <div className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className={
              r.type === "add"
                ? "whitespace-pre-wrap rounded-sm bg-emerald-500/15 px-1 text-emerald-600 dark:text-emerald-400"
                : r.type === "del"
                  ? "whitespace-pre-wrap rounded-sm bg-destructive/15 px-1 text-destructive line-through"
                  : "whitespace-pre-wrap px-1 text-muted-foreground"
            }
          >
            {r.type === "add" ? "+ " : r.type === "del" ? "- " : "  "}
            {r.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface TemplateDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  before: { subject: string; body: string };
  after: { subject: string; body: string };
  onConfirm: () => void;
}

export default function TemplateDiffDialog({
  open,
  onOpenChange,
  title,
  description,
  before,
  after,
  onConfirm,
}: TemplateDiffDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <DiffBlock label="Subject" before={before.subject} after={after.subject} />
          <DiffBlock label="Message body" before={before.body} after={after.body} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Apply changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
