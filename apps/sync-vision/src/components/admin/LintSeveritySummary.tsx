import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LintKind, LintReport } from "@/lib/report-email-template-lint";

interface LintSeveritySummaryProps {
  report: LintReport;
}

const KIND_META: Record<
  LintKind,
  { label: string; color: "destructive" | "secondary" | "outline" }
> = {
  unknown: { label: "Unknown", color: "destructive" },
  malformed: { label: "Malformed", color: "secondary" },
  "missing-braces": { label: "Missing braces", color: "secondary" },
};

export default function LintSeveritySummary({ report }: LintSeveritySummaryProps) {
  const total = report.issues.length;

  return (
    <div
      className={`rounded-md border p-3 ${
        report.ok
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        {report.ok ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-emerald-600">Ready to send</p>
              <p className="text-xs text-muted-foreground">
                No placeholder issues found.
              </p>
            </div>
          </>
        ) : (
          <>
            <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Blocked · {total} issue{total === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Fix the problems below before sending the report.
              </p>
            </div>
          </>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {(Object.keys(KIND_META) as LintKind[]).map((kind) => {
            const count = report.counts[kind];
            const meta = KIND_META[kind];
            return (
              <Badge
                key={kind}
                variant={count === 0 ? "outline" : meta.color}
                className="text-[10px]"
              >
                {meta.label}: {count}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
