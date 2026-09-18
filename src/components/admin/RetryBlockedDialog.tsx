import * as React from "react";
import {
  AlertTriangle,
  Check,
  CornerDownRight,
  Copy,
  Download,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LintIssue, LintKind, LintReport } from "@/lib/report-email-template-lint";

const KIND_LABEL: Record<LintKind, string> = {
  unknown: "Unknown placeholder",
  malformed: "Malformed placeholder",
  "missing-braces": "Missing braces",
};

function howToFix(issue: LintIssue): string {
  if (issue.suggestion) {
    return `Replace "${issue.snippet}" with "${issue.suggestion}".`;
  }
  switch (issue.kind) {
    case "unknown":
      return "Remove this token or swap it for one of the supported placeholders listed under the editor.";
    case "malformed":
      return "Placeholders must look like {{key}} — check for stray spaces, single braces, or typos.";
    case "missing-braces":
      return "Close the placeholder with }} so the token is complete.";
  }
}

export interface RetryBlockedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email?: string;
  report: LintReport | null;
  /** Runs the one-click auto-fix flow (opens the diff review). */
  onFixAll?: () => void;
  fixableCount?: number;
  /** Focus + select the offending text in the matching editor. */
  onJump?: (issue: LintIssue) => void;
  /** Apply this issue's suggested replacement and re-lint just this item. */
  onFixIssue?: (issue: LintIssue) => void;
  /** Remove the persisted blocked-retry report from sessionStorage. */
  onClear?: () => void;
  /** Re-run lint against the saved offending placeholder set. */
  onRecheck?: () => void;
  /** Regenerate the full blocked-retry report from the current template and update the saved timestamp. */
  onRegenerate?: () => void;
}

export default function RetryBlockedDialog({
  open,
  onOpenChange,
  email,
  report,
  onFixAll,
  fixableCount = 0,
  onJump,
  onFixIssue,
  onClear,
  onRecheck,
  onRegenerate,
}: RetryBlockedDialogProps) {
  const issues = report?.issues ?? [];
  const [copied, setCopied] = React.useState(false);

  const copyReport = async () => {
    const header = [
      "SyncVision SEO Email Template – Placeholder Failure Report",
      email ? `Recipient: ${email}` : "",
      `Generated: ${new Date().toISOString()}`,
      `Total issues: ${issues.length}`,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const body = issues
      .map((issue, idx) => {
        const location = `${issue.field === "subject" ? "Subject" : "Message body"} · line ${issue.line}, col ${issue.column + 1}`;
        return [
          `Issue #${idx + 1}: ${KIND_LABEL[issue.kind]}`,
          `  Location: ${location}`,
          `  Snippet: "${issue.snippet}"`,
          `  Message: ${issue.message}`,
          `  How to fix: ${howToFix(issue)}`,
          issue.suggestion ? `  Suggested replacement: "${issue.suggestion}"` : "",
          "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    const text = `${header}${body}`.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without clipboard permission.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const exportDiagnostics = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      recipient: email ?? null,
      summary: {
        totalIssues: issues.length,
        counts: report?.counts ?? { unknown: 0, malformed: 0, "missing-braces": 0 },
        ok: report?.ok ?? false,
      },
      issues: issues.map((issue, index) => ({
        index: index + 1,
        field: issue.field,
        line: issue.line,
        column: issue.column + 1,
        snippet: issue.snippet,
        kind: issue.kind,
        message: issue.message,
        suggestion: issue.suggestion ?? null,
        howToFix: howToFix(issue),
      })),
      sourceLines: report?.lines ?? { subject: [], body: [] },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeEmail = email ? email.replace(/[^a-zA-Z0-9._-]/g, "_") : "unknown";
    a.download = `syncvision-template-diagnostics-${safeEmail}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Retry blocked by {issues.length} placeholder issue
            {issues.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {email
              ? `The report to ${email} was not resent because the email template still has placeholder problems.`
              : "The report was not resent because the email template still has placeholder problems."}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-80 space-y-2 overflow-auto">
          {issues.map((issue, idx) => (
            <li
              key={`${issue.field}-${issue.line}-${issue.column}-${idx}`}
              className="rounded-md border border-border/60 bg-muted/30 p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                  {KIND_LABEL[issue.kind]}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {issue.field === "subject" ? "Subject" : "Message body"} · line{" "}
                  {issue.line}, col {issue.column + 1}
                </span>
                {onJump && (
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      onOpenChange(false);
                      onJump(issue);
                    }}
                  >
                    <CornerDownRight className="h-3 w-3" />
                    Go to {issue.field === "subject" ? "subject" : `line ${issue.line}`}
                  </button>
                )}
              </div>
              <p className="mt-1.5 font-mono text-xs">{issue.snippet}</p>
              <p className="mt-1 text-xs text-muted-foreground">{issue.message}</p>
              <p className="mt-1 text-xs">
                <span className="font-medium">How to fix: </span>
                {howToFix(issue)}
              </p>
              {onFixIssue && issue.suggestion && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 px-2 text-[11px]"
                  onClick={() => onFixIssue(issue)}
                >
                  <Wrench className="mr-1.5 h-3 w-3" />
                  Auto-fix this
                </Button>
              )}
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={copyReport}
            className="mr-auto"
            disabled={issues.length === 0 || copied}
          >
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {copied ? "Copied!" : "Copy error details"}
          </Button>
          {onRecheck && (
            <Button variant="outline" onClick={onRecheck}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Re-run lint for these placeholders
            </Button>
          )}
          {onRegenerate && (
            <Button variant="outline" onClick={onRegenerate}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Regenerate report
            </Button>
          )}
          <Button
            variant="outline"
            onClick={exportDiagnostics}
            disabled={issues.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export diagnostics
          </Button>
          {onClear && (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear saved details
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {issues.length === 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              All placeholder issues resolved — retry the send.
            </span>
          )}
          {onFixAll && fixableCount > 0 && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onFixAll();
              }}
            >
              <Wrench className="mr-1.5 h-3.5 w-3.5" />
              Fix all ({fixableCount})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
