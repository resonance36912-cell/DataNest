import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LintIssue, LintReport } from "@/lib/report-email-template-lint";

interface Props {
  report: LintReport;
  /** DOM id of the subject input. */
  subjectId: string;
  /** DOM id of the message body textarea. */
  bodyId: string;
}

type Field = HTMLInputElement | HTMLTextAreaElement | null;

/** Absolute character offset of an issue inside the field's text. */
export function issueOffset(text: string, issue: LintIssue): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < issue.line - 1 && i < lines.length; i += 1) {
    offset += lines[i].length + 1;
  }
  return offset + issue.column;
}

/**
 * Prev/next navigation across placeholder lint issues. Focuses the matching
 * editor and selects the offending text so it can be corrected in place.
 */
export default function LintIssueNavigator({
  report,
  subjectId,
  bodyId,
}: Props) {
  const [cursor, setCursor] = useState(0);
  const total = report.issues.length;

  useEffect(() => {
    setCursor((c) => (total === 0 ? 0 : Math.min(c, total - 1)));
  }, [total]);

  const reveal = useCallback(
    (index: number) => {
      const issue = report.issues[index];
      if (!issue) return;
      const el = document.getElementById(
        issue.field === "subject" ? subjectId : bodyId,
      ) as Field;
      if (!el) return;
      const start = issueOffset(el.value, issue);
      const end = Math.min(start + issue.snippet.length, el.value.length);
      el.focus();
      el.setSelectionRange(start, end);
      if (el instanceof HTMLTextAreaElement) {
        // Scroll the offending line roughly into view.
        const lineHeight = 18;
        el.scrollTop = Math.max(0, (issue.line - 3) * lineHeight);
      }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [report.issues, subjectId, bodyId],
  );

  const go = (delta: number) => {
    if (total === 0) return;
    const next = (cursor + delta + total) % total;
    setCursor(next);
    reveal(next);
  };

  if (total === 0) return null;

  const current = report.issues[Math.min(cursor, total - 1)];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <CircleAlert className="h-3.5 w-3.5 text-destructive" />
      <span className="text-[11px] text-muted-foreground">
        Issue {Math.min(cursor + 1, total)} of {total}
        {current && (
          <>
            {" · "}
            <span className="font-mono">{current.snippet}</span>
            {" in "}
            {current.field === "subject"
              ? "subject"
              : `message line ${current.line}`}
          </>
        )}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={() => go(-1)}
          aria-label="Previous placeholder issue"
        >
          <ChevronUp className="mr-1 h-3 w-3" />
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={() => go(1)}
          aria-label="Next placeholder issue"
        >
          <ChevronDown className="mr-1 h-3 w-3" />
          Next
        </Button>
      </div>
    </div>
  );
}
