import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export type ExportFinding = {
  level: "high" | "mid" | "low" | string;
  category: string;
  rule: string;
  message: string;
  url: string | null;
  fix_hint: string | null;
};

export type ExportAudit = {
  id: string;
  run_at: string;
  base_url: string;
  total_findings: number;
  totals_by_level: Record<string, number>;
};

const LEVEL_LABEL: Record<string, string> = { high: "Critical", mid: "Warning", low: "Info" };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportFindingsCsv(audit: ExportAudit, findings: ExportFinding[]) {
  const header = ["Severity", "Category", "Rule", "Message", "URL", "Fix Hint"];
  const rows = findings.map((f) => [
    LEVEL_LABEL[f.level] ?? f.level,
    f.category,
    f.rule,
    f.message,
    f.url ?? "",
    f.fix_hint ?? "",
  ]);
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(","));
  const stamp = format(new Date(audit.run_at), "yyyy-MM-dd-HHmm");
  download(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `seo-report-${stamp}.csv`);
}

export function exportFindingsPdf(audit: ExportAudit, findings: ExportFinding[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SEO Audit Report", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Site: ${audit.base_url}`, margin, y); y += 14;
  doc.text(`Scan: ${format(new Date(audit.run_at), "PPpp")}`, margin, y); y += 14;
  doc.text(`Total findings: ${audit.total_findings}`, margin, y); y += 18;

  const totals = audit.totals_by_level ?? {};
  const summary = [
    ["Critical", String(totals.high ?? 0)],
    ["Warning", String(totals.mid ?? 0)],
    ["Info", String(totals.low ?? 0)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Severity", "Count"]],
    body: summary,
    theme: "grid",
    headStyles: { fillColor: [30, 30, 50] },
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    tableWidth: 200,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  const order: Record<string, number> = { high: 0, mid: 1, low: 2 };
  const sorted = [...findings].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));

  autoTable(doc, {
    startY: y,
    head: [["Severity", "Category", "Rule", "Message", "URL", "Fix"]],
    body: sorted.map((f) => [
      LEVEL_LABEL[f.level] ?? f.level,
      f.category,
      f.rule,
      f.message,
      f.url ?? "",
      f.fix_hint ?? "",
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 30, 50] },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 60 },
      2: { cellWidth: 80 },
      3: { cellWidth: 130 },
      4: { cellWidth: 110 },
      5: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const v = String(data.cell.raw);
        if (v === "Critical") data.cell.styles.textColor = [200, 40, 40];
        else if (v === "Warning") data.cell.styles.textColor = [180, 130, 0];
        else data.cell.styles.textColor = [60, 100, 200];
      }
    },
  });

  const stamp = format(new Date(audit.run_at), "yyyy-MM-dd-HHmm");
  doc.save(`seo-report-${stamp}.pdf`);
}
