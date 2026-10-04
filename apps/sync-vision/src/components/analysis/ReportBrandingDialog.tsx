import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ImagePlus, Palette, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WATERMARK_DEFAULTS, LOGO_DEFAULTS, PAGE_SIZE_DEFAULT, PAGE_DIMENSIONS, PDF_PAGE_MARGIN, PDF_LOGO_Y_OFFSET, type ReportBranding } from "@/lib/confidenceReport";

const STORAGE_KEY = "syncvision.report-branding.v1";
const MAX_LOGO_BYTES = 512 * 1024; // 512 KB

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function loadStoredBranding(): ReportBranding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReportBranding;
    return {
      projectName: parsed.projectName ?? null,
      watermarkText: parsed.watermarkText ?? null,
      logoDataUrl: parsed.logoDataUrl ?? null,
      watermarkOpacity: parsed.watermarkOpacity ?? null,
      watermarkFontSize: parsed.watermarkFontSize ?? null,
      watermarkRotation: parsed.watermarkRotation ?? null,
      logoSize: parsed.logoSize ?? null,
      logoPadding: parsed.logoPadding ?? null,
      pageSize: parsed.pageSize === "letter" || parsed.pageSize === "a4" ? parsed.pageSize : null,
    };
  } catch {
    return {};
  }
}

/** Persist a branding block (e.g. when restoring it from a loaded JSON report). */
export function saveStoredBranding(b: ReportBranding): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projectName: b.projectName ?? null,
      watermarkText: b.watermarkText ?? null,
      logoDataUrl: b.logoDataUrl ?? null,
      watermarkOpacity: b.watermarkOpacity ?? null,
      watermarkFontSize: b.watermarkFontSize ?? null,
      watermarkRotation: b.watermarkRotation ?? null,
      logoSize: b.logoSize ?? null,
      logoPadding: b.logoPadding ?? null,
      pageSize: b.pageSize ?? null,
    }));
  } catch { /* quota exceeded — ignore */ }
}

interface Props {
  /** Notified whenever branding is saved so the parent can use it for the next export. */
  onChange?: (branding: ReportBranding) => void;
}

export default function ReportBrandingDialog({ onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [watermarkText, setWatermarkText] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState<number>(WATERMARK_DEFAULTS.opacity);
  const [fontSize, setFontSize] = useState<number>(WATERMARK_DEFAULTS.fontSize);
  const [rotation, setRotation] = useState<number>(WATERMARK_DEFAULTS.rotation);
  const [logoSize, setLogoSize] = useState<number>(LOGO_DEFAULTS.size);
  const [logoPadding, setLogoPadding] = useState<number>(LOGO_DEFAULTS.padding);
  const [pageSize, setPageSize] = useState<"a4" | "letter">(PAGE_SIZE_DEFAULT);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const b = loadStoredBranding();
    setProjectName(b.projectName ?? "");
    setWatermarkText(b.watermarkText ?? "");
    setLogoDataUrl(b.logoDataUrl ?? null);
    setOpacity(clamp(b.watermarkOpacity ?? WATERMARK_DEFAULTS.opacity, 0.02, 0.5));
    setFontSize(clamp(b.watermarkFontSize ?? WATERMARK_DEFAULTS.fontSize, 24, 160));
    setRotation(clamp(b.watermarkRotation ?? WATERMARK_DEFAULTS.rotation, -90, 90));
    setLogoSize(clamp(b.logoSize ?? LOGO_DEFAULTS.size, 20, 160));
    setLogoPadding(clamp(b.logoPadding ?? LOGO_DEFAULTS.padding, 0, 80));
    setPageSize(b.pageSize === "letter" ? "letter" : "a4");
    onChange?.(b);
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = (file: File) => {
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      toast.error("Logo must be a PNG or JPEG image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be smaller than 512 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => toast.error("Could not read logo file");
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const branding: ReportBranding = {
      projectName: projectName.trim() || null,
      watermarkText: watermarkText.trim() || null,
      logoDataUrl: logoDataUrl ?? null,
      watermarkOpacity: opacity,
      watermarkFontSize: fontSize,
      watermarkRotation: rotation,
      logoSize,
      logoPadding,
      pageSize,
    };
    try {
      saveStoredBranding(branding);
    } catch {
      toast.error("Could not save branding (storage full?)");
      return;
    }
    onChange?.(branding);
    toast.success("Branding saved", { description: "Applied to PDF report exports." });
    setOpen(false);
  };

  const resetWatermarkStyle = () => {
    setOpacity(WATERMARK_DEFAULTS.opacity);
    setFontSize(WATERMARK_DEFAULTS.fontSize);
    setRotation(WATERMARK_DEFAULTS.rotation);
  };

  const resetLogoStyle = () => {
    setLogoSize(LOGO_DEFAULTS.size);
    setLogoPadding(LOGO_DEFAULTS.padding);
  };

  const resetTextOnly = () => {
    setProjectName("");
    setWatermarkText("");
    resetWatermarkStyle();
    toast.success("Cleared project name and watermark", { description: "Logo kept." });
  };

  const resetLogoOnly = () => {
    setLogoDataUrl(null);
    resetLogoStyle();
    if (fileRef.current) fileRef.current.value = "";
    toast.success("Cleared logo", { description: "Project name and watermark kept." });
  };

  const resetAll = () => {
    setProjectName("");
    setWatermarkText("");
    setLogoDataUrl(null);
    resetWatermarkStyle();
    resetLogoStyle();
    if (fileRef.current) fileRef.current.value = "";
    toast.success("All branding fields cleared");
  };

  const watermarkPreview = watermarkText.trim() || "WATERMARK";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-border text-foreground hover:bg-secondary"
          title="Configure PDF report branding"
        >
          <Palette className="h-3.5 w-3.5" /> Branding
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report branding</DialogTitle>
          <DialogDescription>
            Customize the project name, watermark, and logo applied to exported PDF reports. Saved locally to this browser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand-project">Project name</Label>
            <Input id="brand-project" value={projectName} maxLength={80}
              placeholder="e.g. Resonance SyncVision"
              onChange={(e) => setProjectName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-watermark">Watermark text</Label>
            <Input id="brand-watermark" value={watermarkText} maxLength={60}
              placeholder="e.g. CONFIDENTIAL"
              onChange={(e) => setWatermarkText(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Drawn across every page.</p>
          </div>

          {/* Page size — A4 vs Letter (logo top-right inset stays the same in both) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Page size</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["a4", "letter"] as const).map((sz) => {
                const dim = PAGE_DIMENSIONS[sz];
                const active = pageSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setPageSize(sz)}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-semibold uppercase tracking-wide">{sz === "a4" ? "A4" : "Letter"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {Math.round(dim.width)} × {Math.round(dim.height)} pt
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Logo top-right inset is identical in absolute pt across both, so placement stays consistent.
            </p>
          </div>

          {/* Watermark style controls */}
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Watermark style</Label>
              <button
                type="button"
                onClick={() => {
                  setOpacity(WATERMARK_DEFAULTS.opacity);
                  setFontSize(WATERMARK_DEFAULTS.fontSize);
                  setRotation(WATERMARK_DEFAULTS.rotation);
                }}
                className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
              >
                Reset
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Opacity</span>
                <span className="tabular-nums">{Math.round(opacity * 100)}%</span>
              </div>
              <Slider min={2} max={50} step={1} value={[Math.round(opacity * 100)]}
                onValueChange={([v]) => setOpacity(v / 100)} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Font size</span>
                <span className="tabular-nums">{fontSize}pt</span>
              </div>
              <Slider min={24} max={160} step={2} value={[fontSize]}
                onValueChange={([v]) => setFontSize(v)} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Rotation</span>
                <span className="tabular-nums">{rotation}°</span>
              </div>
              <Slider min={-90} max={90} step={5} value={[rotation]}
                onValueChange={([v]) => setRotation(v)} />
            </div>

            {/* Live preview */}
            <div className="relative h-24 overflow-hidden rounded border border-border bg-background">
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="select-none whitespace-nowrap font-bold text-foreground"
                  style={{
                    opacity,
                    fontSize: `${Math.max(12, fontSize / 4)}px`,
                    transform: `rotate(${rotation}deg)`,
                  }}
                >
                  {watermarkPreview}
                </span>
              </div>
              <span className="absolute bottom-1 right-2 text-[9px] uppercase tracking-wide text-muted-foreground">Preview</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-border bg-muted/50 overflow-hidden">
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="Report logo preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {logoDataUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"
                    onClick={() => { setLogoDataUrl(null); if (fileRef.current) fileRef.current.value = ""; }}>
                    <Trash2 className="h-3 w-3" /> Remove logo
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">PNG or JPEG, up to 512 KB. Shown top-right of the first page.</p>

            {logoDataUrl && (
              <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Logo size & position</Label>
                  <button
                    type="button"
                    onClick={resetLogoStyle}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Size</span>
                    <span className="tabular-nums">{logoSize}pt</span>
                  </div>
                  <Slider min={20} max={160} step={2} value={[logoSize]}
                    onValueChange={([v]) => setLogoSize(v)} />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Padding from top-right</span>
                    <span className="tabular-nums">{logoPadding}pt</span>
                  </div>
                  <Slider min={0} max={80} step={1} value={[logoPadding]}
                    onValueChange={([v]) => setLogoPadding(v)} />
                </div>

                {/* Live position preview — pt-accurate to the PDF render. */}
                {(() => {
                  const dim = PAGE_DIMENSIONS[pageSize];
                  // Show the top header band of the page (enough to comfortably contain the largest logo + padding).
                  const previewBandPt = Math.min(dim.height, Math.max(220, PDF_PAGE_MARGIN + 160 + 80 + 40));
                  // Exact PDF coordinates (pt), translated to % of the preview band.
                  const logoXPt = dim.width - PDF_PAGE_MARGIN - logoSize - logoPadding; // left edge in pt
                  const logoYPt = PDF_PAGE_MARGIN + PDF_LOGO_Y_OFFSET + logoPadding;     // top edge in pt
                  const widthPct = (logoSize / dim.width) * 100;
                  const heightPct = (logoSize / previewBandPt) * 100;
                  const leftPct = (logoXPt / dim.width) * 100;
                  const topPct = (logoYPt / previewBandPt) * 100;
                  // Page-margin guides (faint) so the user can see the safe area.
                  const marginTopPct = (PDF_PAGE_MARGIN / previewBandPt) * 100;
                  const marginRightPct = (PDF_PAGE_MARGIN / dim.width) * 100;
                  return (
                    <div
                      className="relative overflow-hidden rounded border border-border bg-background"
                      style={{ aspectRatio: `${dim.width} / ${previewBandPt}` }}
                    >
                      {/* margin guides */}
                      <div
                        className="pointer-events-none absolute border-r border-dashed border-border/50"
                        style={{ top: 0, bottom: 0, right: `${marginRightPct}%` }}
                      />
                      <div
                        className="pointer-events-none absolute border-b border-dashed border-border/50"
                        style={{ left: 0, right: 0, top: `${marginTopPct}%` }}
                      />
                      {/* logo at exact pt-derived coordinates */}
                      <div
                        className="absolute overflow-hidden rounded-sm border border-border/60 bg-muted/40"
                        style={{
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                        }}
                      >
                        <img src={logoDataUrl} alt="Logo position preview" className="h-full w-full object-contain" />
                      </div>
                      <span className="absolute bottom-1 left-2 text-[9px] uppercase tracking-wide text-muted-foreground">
                        {pageSize === "a4" ? "A4" : "Letter"} • header band ({Math.round(previewBandPt)}pt)
                      </span>
                      <span className="absolute bottom-1 right-2 text-[9px] tabular-nums text-muted-foreground">
                        {logoSize}×{logoSize}pt @ {logoPadding}pt
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-[11px]">Choose what to reset</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={resetTextOnly}>
                Clear project name &amp; watermark <span className="ml-1 text-muted-foreground">(keep logo)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={resetLogoOnly}>
                Clear logo <span className="ml-1 text-muted-foreground">(keep text)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  resetLogoStyle();
                  toast.success("Reset logo size & padding", { description: "Logo image kept." });
                }}
                disabled={!logoDataUrl}
              >
                Reset logo size &amp; padding <span className="ml-1 text-muted-foreground">(keep image)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  resetWatermarkStyle();
                  toast.success("Reset watermark style", { description: "Watermark text kept." });
                }}
              >
                Reset watermark style <span className="ml-1 text-muted-foreground">(keep text)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={resetAll} className="text-destructive focus:text-destructive">
                Clear everything
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleSave}>Save branding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
