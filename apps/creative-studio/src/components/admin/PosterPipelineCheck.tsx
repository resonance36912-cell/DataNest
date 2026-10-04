import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, PlayCircle, CheckCircle2, AlertTriangle, Clock, Download, FileText, Archive } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function imgSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

async function variantToPdf(dataUrl: string, label: string): Promise<Blob> {
  const { w, h } = await imgSize(dataUrl);
  const orientation = w >= h ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [w, h] });
  const fmt = dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
  pdf.addImage(dataUrl, fmt, 0, 0, w, h);
  pdf.setProperties({ title: label });
  return pdf.output("blob");
}


interface VariantResult {
  variantIndex: number;
  item: { id: string; label: string; storage_path: string; created_at: string };
  signedUrl?: string;
}

interface PipelineResult {
  ok: boolean;
  error?: string;
  totalMs: number;
  scrapeMs?: number;
  posterMs?: number;
  brief?: {
    brandName?: string;
    heroHeadline?: string;
    heroSubheadline?: string;
    colors?: string[];
  };
  variants?: VariantResult[];
}

const fmt = (ms?: number) => (typeof ms === "number" ? `${(ms / 1000).toFixed(1)}s` : "—");

export const PosterPipelineCheck = () => {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState("https://www.resonance-podcast.com/products/resonance-aurum-naturals");
  const [result, setResult] = useState<PipelineResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - t0), 250);
    try {
      const { data, error } = await supabase.functions.invoke<PipelineResult>("e2e-poster-test", {
        body: { url, variantCount: 2 },
      });
      if (error) throw error;
      setResult(data ?? null);
      if (data?.ok) {
        toast.success(`Pipeline complete in ${fmt(data.totalMs)} · ${data.variants?.length ?? 0} variant(s)`);
      } else {
        toast.error(data?.error ?? "Pipeline failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, error: msg, totalMs: Date.now() - t0 });
      toast.error(msg);
    } finally {
      clearInterval(tick);
      setRunning(false);
    }
  };

  return (
    <div className="studio-card p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display font-bold text-foreground flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-primary" />
            Poster Pipeline Test
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            End-to-end proof: scrape URL → generate 2 poster variants → save to Library.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium studio-gradient-bg text-primary-foreground disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_0_20px_-4px_hsl(var(--primary)/0.6)]"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="tabular-nums">{(elapsed / 1000).toFixed(1)}s</span>
            </>
          ) : (
            <>
              <PlayCircle className="w-4 h-4" />
              Run Poster Pipeline Test
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={running}
          className="flex-1 rounded-lg bg-background/60 ring-1 ring-white/[0.08] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-primary/40 focus:outline-none"
          placeholder="URL to scrape"
        />
      </div>

      {result && (
        <div className="space-y-4">
          <div className={`rounded-lg px-3 py-2 ring-1 text-sm flex items-center gap-2 ${
            result.ok
              ? "bg-primary/10 ring-primary/30 text-foreground"
              : "bg-destructive/10 ring-destructive/40 text-destructive"
          }`}>
            {result.ok ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertTriangle className="w-4 h-4" />}
            <span className="font-medium">
              {result.ok ? "Pipeline succeeded" : `Pipeline failed: ${result.error}`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2">
              <div className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Scrape</div>
              <div className="text-foreground font-semibold tabular-nums mt-1">{fmt(result.scrapeMs)}</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2">
              <div className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Posters</div>
              <div className="text-foreground font-semibold tabular-nums mt-1">{fmt(result.posterMs)}</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2">
              <div className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Total</div>
              <div className="text-foreground font-semibold tabular-nums mt-1">{fmt(result.totalMs)}</div>
            </div>
          </div>

          {result.brief && (
            <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2 text-xs">
              <div className="text-muted-foreground uppercase tracking-wider mb-1 text-[10px]">Extracted brief</div>
              <div className="text-foreground"><span className="text-muted-foreground">Brand:</span> {result.brief.brandName ?? "—"}</div>
              <div className="text-foreground"><span className="text-muted-foreground">Headline:</span> {result.brief.heroHeadline ?? "—"}</div>
              <div className="text-foreground"><span className="text-muted-foreground">Subheadline:</span> {result.brief.heroSubheadline ?? "—"}</div>
            </div>
          )}

          {result.variants && result.variants.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {result.variants.length} variant{result.variants.length === 1 ? "" : "s"} — saved to Library
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!result.variants) return;
                    try {
                      toast.loading("Building combined PDF…", { id: "pdf-all" });
                      const pdf = new jsPDF({ unit: "pt", format: "a4" });
                      const pageW = pdf.internal.pageSize.getWidth();
                      const pageH = pdf.internal.pageSize.getHeight();
                      const margin = 24;
                      let first = true;
                      for (const v of result.variants) {
                        if (!v.signedUrl) continue;
                        const blob = await fetchAsBlob(v.signedUrl);
                        const dataUrl = await blobToDataUrl(blob);
                        const { w, h } = await imgSize(dataUrl);
                        const scale = Math.min((pageW - margin * 2) / w, (pageH - margin * 2 - 24) / h);
                        const dw = w * scale, dh = h * scale;
                        const dx = (pageW - dw) / 2;
                        const dy = (pageH - dh) / 2 + 8;
                        if (!first) pdf.addPage();
                        first = false;
                        pdf.setFontSize(11);
                        pdf.text(`Variant ${v.variantIndex} — ${v.item.label}`, margin, margin + 4);
                        pdf.addImage(dataUrl, dataUrl.includes("image/jpeg") ? "JPEG" : "PNG", dx, dy, dw, dh);
                      }
                      triggerBlobDownload(pdf.output("blob"), `poster-variants-${Date.now()}.pdf`);
                      toast.success("PDF downloaded", { id: "pdf-all" });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Export failed", { id: "pdf-all" });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-white/[0.12] hover:bg-white/[0.06] hover:text-foreground transition-colors"
                >
                  <Archive className="w-3 h-3" />
                  Export all as PDF
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.variants.map((v) => (
                  <div key={v.item.id} className="rounded-xl ring-1 ring-white/[0.08] overflow-hidden bg-background/60">
                    <div className="aspect-[3/4] bg-black/40">
                      {v.signedUrl ? (
                        <img
                          src={v.signedUrl}
                          alt={`Variant ${v.variantIndex}`}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">no preview</div>
                      )}
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between text-xs gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">Variant {v.variantIndex}</span>
                      {v.signedUrl && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const blob = await fetchAsBlob(v.signedUrl!);
                                const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
                                triggerBlobDownload(blob, `poster-variant-${v.variantIndex}.${ext}`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Download failed");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-white/[0.12] hover:bg-white/[0.06] hover:text-foreground transition-colors"
                            title="Download image"
                          >
                            <Download className="w-3 h-3" />
                            Image
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                toast.loading("Building PDF…", { id: `pdf-${v.item.id}` });
                                const blob = await fetchAsBlob(v.signedUrl!);
                                const dataUrl = await blobToDataUrl(blob);
                                const pdfBlob = await variantToPdf(dataUrl, v.item.label);
                                triggerBlobDownload(pdfBlob, `poster-variant-${v.variantIndex}.pdf`);
                                toast.success("PDF downloaded", { id: `pdf-${v.item.id}` });
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "PDF export failed", { id: `pdf-${v.item.id}` });
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-white/[0.12] hover:bg-white/[0.06] hover:text-foreground transition-colors"
                            title="Export as PDF"
                          >
                            <FileText className="w-3 h-3" />
                            PDF
                          </button>
                          <a href={v.signedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline px-1">
                            Open
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
