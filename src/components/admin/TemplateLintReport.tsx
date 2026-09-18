import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  LintIssue,
  LintReport,
} from "@/lib/report-email-template-lint";

interface TemplateLintReportProps {
  report: LintReport;
  /** Apply a suggested fix by replacing the snippet in the given field. */
  onFix?: (issue: LintIssue) => void;
  /** Apply every suggested fix across subject and message in one click. */
  onFixAll?: () => void;
}


const KIND_LABEL: Record<LintIssue["kind"], string> = {
  unknown: "Unknown",
  malformed: "Malformed",
  "missing-braces": "Braces",
};

function LineHighlight({ issue, line }: { issue: LintIssue; line: string }) {
  const before = line.slice(0, issue.column);
  const hit = line.slice(issue.column, issue.column + issue.snippet.length);
  const after = line.slice(issue.column + issue.snippet.length);
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] leading-5">
      <span className="mr-2 select-none text-muted-foreground/70">
        {issue.field === "subject" ? "subject" : `L${issue.line}`}
      </span>
      <span className="text-muted-foreground">{before}</span>
      <span className="rounded bg-destructive/20 text-destructive underline decoration-destructive decoration-wavy">
        {hit || issue.snippet}
      </span>
      <span className="text-muted-foreground">{after}</span>
    </pre>
  );
}

/** Pre-send lint report listing every placeholder issue with its line. */
export default function TemplateLintReport({
  report,
  onFix,
  onFixAll,

}: TemplateLintReportProps) {
  const fixableCount = report.issues.filter((i) => i.suggestion).length;
  if (report.ok) {

    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <p className="text-xs text-muted-foreground">
          Template lint passed — every placeholder is recognised and correctly
          braced.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <p className="text-xs font-medium text-destructive">
          Template lint — {report.issues.length} issue
          {report.issues.length === 1 ? "" : "s"}
        </p>
        {report.counts.unknown > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {report.counts.unknown} unknown
          </Badge>
        )}
        {report.counts.malformed > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {report.counts.malformed} malformed
          </Badge>
        )}
        {report.counts["missing-braces"] > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {report.counts["missing-braces"]} braces
          </Badge>
        )}
        {onFixAll && fixableCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto h-6 text-[11px]"
            onClick={onFixAll}
          >
            <Wand2 className="mr-1 h-3 w-3" />
            Fix all ({fixableCount})
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {report.issues.map((issue, i) => (
          <li
            key={`${issue.field}-${issue.line}-${issue.column}-${i}`}
            className="rounded-md border border-border/60 bg-background/60 p-2"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {KIND_LABEL[issue.kind]}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {issue.field === "subject"
                  ? "Subject"
                  : `Message body · line ${issue.line}, col ${issue.column + 1}`}
              </span>
            </div>
            <p className="mb-1 text-xs text-foreground/90">{issue.message}</p>
            <LineHighlight
              issue={issue}
              line={report.lines[issue.field][issue.line - 1] ?? issue.snippet}
            />
            {issue.suggestion && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Suggested:{" "}
                  <span className="font-mono">{issue.suggestion}</span>
                </span>
                {onFix && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={() => onFix(issue)}
                  >
                    <Wand2 className="mr-1 h-3 w-3" />
                    Apply fix
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
